# Write-Story: Parallelize Project Description Loading

## Problem

Currently, the `write-story` tool fetches the Jira issue hierarchy sequentially in 4 steps:

1. Fetch target issue
2. Recursively fetch parents (while loop)
3. Fetch blockers/blocking issues
4. Fetch project description

**Bottleneck:** The project description fetch (step 4) waits for steps 1-3 to complete, even though it only depends on the project key, which can be extracted immediately from the issue key itself.

**Example:** Issue key `TF-101` → Project key is `TF` (everything before the hyphen)

## Current Timing

From logs analysis:
- CloudId resolution: ~1 second
- Target issue fetch: ~0.5-1 second
- Parent fetches: ~0.5 seconds each (varies by depth)
- Blocker fetches: ~0.5 seconds each (varies by count)
- Project fetch: ~0.5-1 second
- Comments fetch: ~0.5-1 second (currently sequential after hierarchy)

**Total Phase 1-2 time:** ~2-4 seconds

## Proposed Optimization

Extract the project key from the issue key immediately (no API call needed), then parallelize three batches of API calls:

### New Flow

```
IMMEDIATE (synchronous):
  projectKey = issueKey.split('-')[0]  // "TF" from "TF-101"

PARALLEL BATCH 1:
  Promise.all([
    resolveCloudId(siteName),
    fetchTargetIssue(issueKey),
    fetchProject(projectKey),     // ← Start immediately!
    fetchAllComments(issueKey)    // ← Already identified as parallelizable
  ])

PARALLEL BATCH 2 (after target issue returns):
  Promise.all([
    fetchParents(target.fields.parent),
    fetchBlockers(target.fields.issuelinks)
  ])
```

**Expected savings:** ~1-2 seconds (project and comments no longer wait for hierarchy)

## Code Changes

### 1. Add Project Key Extraction Utility

**File:** `server/providers/atlassian/jira-issue-helpers.ts`

**Add function:**
```typescript
/**
 * Extract project key from issue key
 * @param issueKey - Full issue key (e.g., "TF-101", "PROJ-1234")
 * @returns Project key (e.g., "TF", "PROJ")
 */
export function extractProjectKeyFromIssueKey(issueKey: string): string {
  const parts = issueKey.split('-');
  if (parts.length < 2) {
    throw new Error(`Invalid issue key format: ${issueKey}. Expected format: PROJECT-123`);
  }
  return parts[0];
}
```

**Verification:**
- Add unit test in `jira-issue-helpers.test.ts`:
  ```typescript
  test('extractProjectKeyFromIssueKey', () => {
    expect(extractProjectKeyFromIssueKey('TF-101')).toBe('TF');
    expect(extractProjectKeyFromIssueKey('PROJ-1234')).toBe('PROJ');
    expect(extractProjectKeyFromIssueKey('ABC-1')).toBe('ABC');
    expect(() => extractProjectKeyFromIssueKey('INVALID')).toThrow();
  });
  ```

### 2. Refactor `fetchJiraIssueHierarchy()` for Parallelization

**File:** `server/providers/combined/tools/review-work-item/jira-hierarchy-fetcher.ts`

**Current structure (lines 82-190):**
```typescript
export async function fetchJiraIssueHierarchy(...) {
  // Step 1: Fetch target issue
  const target = await getJiraIssue(client, cloudId, issueKey, HIERARCHY_FIELDS);
  
  // Step 2: Recursively fetch parents
  const parents = [];
  let currentItem = target;
  while (currentItem.fields.parent?.key && depth < maxDepth) {
    const parent = await getJiraIssue(...);
    parents.push(parent);
  }
  
  // Step 3: Fetch blockers/blocking
  const allLinks = [target, ...parents].flatMap(...);
  for (const link of allLinks) {
    const blocker = await getJiraIssue(...);
  }
  
  // Step 4: Fetch project description
  const projectKey = target.fields.project?.key;
  const project = await getJiraProject(client, cloudId, projectKey);
}
```

**New structure:**
```typescript
export async function fetchJiraIssueHierarchy(
  issueKey: string,
  client: AtlassianClient,
  options: FetchHierarchyOptions
): Promise<JiraIssueHierarchy> {
  const { maxDepth = 5, cloudId, siteName, notify = async () => {} } = options;
  
  console.log(`📋 Fetching issue hierarchy for ${issueKey}`);
  console.log(`  Max depth: ${maxDepth}, cloudId: ${cloudId}`);
  
  // Track fetched items to avoid duplicates
  const fetchedKeys = new Set<string>();
  
  // IMMEDIATE: Extract project key from issue key (no API call)
  const projectKey = extractProjectKeyFromIssueKey(issueKey);
  console.log(`  Extracted project key: ${projectKey}`);
  
  // PARALLEL BATCH 1: Fetch target issue and project simultaneously
  await notify(`Fetching ${issueKey} and project ${projectKey}...`);
  
  const [targetResponse, projectResponse] = await Promise.all([
    getJiraIssue(client, cloudId, issueKey, HIERARCHY_FIELDS),
    getJiraProject(client, cloudId, projectKey)
  ]);
  
  const target = await targetResponse.json() as JiraIssue;
  fetchedKeys.add(target.key);
  
  const projectData = await projectResponse.json() as { key: string; name: string; description?: string | null };
  const project: JiraProject = {
    key: projectData.key,
    name: projectData.name,
    description: projectData.description || null
  };
  
  console.log(`  ✅ Target and project fetched in parallel`);
  
  // PARALLEL BATCH 2: Fetch parents and initial blockers simultaneously
  await notify(`Fetching parents and blockers...`);
  
  const [parents, initialBlockers, initialBlocking] = await fetchParentsAndBlockers(
    target,
    client,
    cloudId,
    maxDepth,
    fetchedKeys,
    notify
  );
  
  // Combine all items
  const allItems = [target, ...parents, ...initialBlockers, ...initialBlocking];
  
  console.log(`  ✅ Fetched ${allItems.length} items (${parents.length} parents, ${initialBlockers.length} blockers, ${initialBlocking.length} blocking)`);
  
  return {
    target,
    parents,
    blockers: initialBlockers,
    blocking: initialBlocking,
    project,
    allItems,
    siteName
  };
}
```

### 3. Extract Parent/Blocker Logic into Helper

**File:** `server/providers/combined/tools/review-work-item/jira-hierarchy-fetcher.ts`

**Add helper function:**
```typescript
/**
 * Fetch parents and blockers in parallel where possible
 * 
 * Strategy:
 * 1. Fetch all parents recursively (must be sequential due to parent chain)
 * 2. Extract blocker links from target only (initial blockers)
 * 3. Fetch initial blockers in parallel
 * 4. Extract blocker links from parents (additional blockers)
 * 5. Fetch additional blockers in parallel
 * 
 * @returns Tuple of [parents, blockers, blocking]
 */
async function fetchParentsAndBlockers(
  target: JiraIssue,
  client: AtlassianClient,
  cloudId: string,
  maxDepth: number,
  fetchedKeys: Set<string>,
  notify: (message: string) => Promise<void>
): Promise<[JiraIssue[], JiraIssue[], JiraIssue[]]> {
  
  // Step 1: Recursively fetch parents (must be sequential)
  const parents: JiraIssue[] = [];
  let currentItem = target;
  let depth = 0;
  
  while (currentItem.fields.parent?.key && depth < maxDepth) {
    const parentKey = currentItem.fields.parent.key;
    
    if (fetchedKeys.has(parentKey)) {
      console.log(`  ⚠️ Circular reference detected at ${parentKey}, stopping`);
      break;
    }
    
    await notify(`Fetching parent ${parentKey}...`);
    const parentResponse = await getJiraIssue(client, cloudId, parentKey, HIERARCHY_FIELDS);
    const parent = await parentResponse.json() as JiraIssue;
    parents.push(parent);
    fetchedKeys.add(parent.key);
    
    currentItem = parent;
    depth++;
  }
  
  console.log(`  ✅ Fetched ${parents.length} parents`);
  
  // Step 2: Extract blocker links from target AND parents
  const allLinks = [target, ...parents].flatMap(item => parseIssueLinks(item.fields.issuelinks));
  
  // Step 3: Group links by type and fetch in parallel
  const blockerLinks = allLinks.filter(link => 
    link.type.toLowerCase().includes('block') && 
    link.direction === 'inward' &&
    !fetchedKeys.has(link.linkedIssueKey)
  );
  
  const blockingLinks = allLinks.filter(link => 
    link.type.toLowerCase().includes('block') && 
    link.direction === 'outward' &&
    !fetchedKeys.has(link.linkedIssueKey)
  );
  
  // Fetch all blockers in parallel
  const blockerPromises = blockerLinks.map(async (link) => {
    await notify(`Fetching blocker ${link.linkedIssueKey}...`);
    const response = await getJiraIssue(client, cloudId, link.linkedIssueKey, HIERARCHY_FIELDS);
    const blocker = await response.json() as JiraIssue;
    fetchedKeys.add(blocker.key);
    return blocker;
  });
  
  // Fetch all blocking in parallel
  const blockingPromises = blockingLinks.map(async (link) => {
    await notify(`Fetching blocked item ${link.linkedIssueKey}...`);
    const response = await getJiraIssue(client, cloudId, link.linkedIssueKey, HIERARCHY_FIELDS);
    const blocked = await response.json() as JiraIssue;
    fetchedKeys.add(blocked.key);
    return blocked;
  });
  
  const [blockers, blocking] = await Promise.all([
    Promise.all(blockerPromises),
    Promise.all(blockingPromises)
  ]);
  
  console.log(`  ✅ Fetched ${blockers.length} blockers, ${blocking.length} blocking`);
  
  return [parents, blockers, blocking];
}
```

**Verification:**
- Existing hierarchy tests should pass
- Add timing assertions to verify parallel execution (project + target fetch < 2x single fetch time)

### 4. Parallelize Comments Fetch in Core Logic

**File:** `server/providers/combined/tools/write-story/core-logic.ts`

**Current code (lines 119-157):**
```typescript
const { cloudId: resolvedCloudId, siteName: resolvedSiteName } = await resolveCloudId(
  atlassianClient, 
  cloudId, 
  siteName
);

const hierarchy = await fetchJiraIssueHierarchy(issueKey, atlassianClient, {
  maxDepth,
  cloudId: resolvedCloudId,
  siteName: resolvedSiteName,
  notify,
});

const allComments = await fetchAllComments(atlassianClient, resolvedCloudId, issueKey);
```

**New code:**
```typescript
// PARALLEL BATCH 1: Resolve cloudId, fetch hierarchy (which now fetches project in parallel), and fetch comments
const [{ cloudId: resolvedCloudId, siteName: resolvedSiteName }, hierarchy, allComments] = await Promise.all([
  resolveCloudId(atlassianClient, cloudId, siteName),
  fetchJiraIssueHierarchy(issueKey, atlassianClient, {
    maxDepth,
    cloudId: cloudId || undefined, // Pass through if provided
    siteName,
    notify,
  }),
  fetchAllComments(atlassianClient, cloudId, issueKey)
]);

console.log(`  Resolved: cloudId=${resolvedCloudId}, siteName=${resolvedSiteName}`);
console.log(`  Fetched ${allComments.length} total comments`);
```

**Note:** If `cloudId` is not provided, `fetchJiraIssueHierarchy` and `fetchAllComments` will need cloudId from resolution. Alternative approach:

```typescript
// Step 1: Resolve cloudId first (if needed)
const { cloudId: resolvedCloudId, siteName: resolvedSiteName } = await resolveCloudId(
  atlassianClient, 
  cloudId, 
  siteName
);

console.log(`  Resolved: cloudId=${resolvedCloudId}, siteName=${resolvedSiteName}`);

// Step 2: Fetch hierarchy (with parallel project fetch) and comments in parallel
const [hierarchy, allComments] = await Promise.all([
  fetchJiraIssueHierarchy(issueKey, atlassianClient, {
    maxDepth,
    cloudId: resolvedCloudId,
    siteName: resolvedSiteName,
    notify,
  }),
  fetchAllComments(atlassianClient, resolvedCloudId, issueKey)
]);

console.log(`  Fetched ${allComments.length} total comments`);
```

**Verification:**
- Log timestamps show comments and hierarchy fetch overlapping
- Total Phase 1-2 time reduced by 1-2 seconds

## Implementation Steps

### Step 1: Add Project Key Extraction
1. Add `extractProjectKeyFromIssueKey()` function to `server/providers/atlassian/jira-issue-helpers.ts`
2. Add unit tests for project key extraction
3. Run tests: `npm test -- --testPathPattern=jira-issue-helpers`

**Success criteria:**
- Tests pass
- Function correctly extracts project key from various formats

### Step 2: Refactor Hierarchy Fetcher (Project Parallel)
1. Extract project key at start of `fetchJiraIssueHierarchy()`
2. Fetch target and project in `Promise.all()`
3. Update logs to show parallel fetch
4. Keep parent/blocker fetch unchanged initially

**Success criteria:**
- Existing hierarchy tests pass
- Logs show "Target and project fetched in parallel"
- Manual test shows project fetch no longer waits for target

### Step 3: Extract Parent/Blocker Helper
1. Create `fetchParentsAndBlockers()` helper function
2. Move parent recursion logic into helper
3. Move blocker fetch logic into helper (parallel within batches)
4. Update `fetchJiraIssueHierarchy()` to call helper

**Success criteria:**
- All hierarchy tests pass
- No change in returned data structure
- Logs show correct fetch counts

### Step 4: Parallelize Comments Fetch
1. Update `executeWriteStory()` to fetch hierarchy and comments in parallel
2. Update logs/notifications appropriately
3. Test with multiple issues (with/without comments)

**Success criteria:**
- All write-story tests pass
- Logs show parallel fetch timing
- Comments + hierarchy complete faster than sequential

### Step 5: Integration Testing
1. Test write-story on real issues (TF-101, etc.)
2. Verify timing improvements via logs
3. Test edge cases (missing project, no parents, no blockers)
4. Test error handling (invalid project key, network errors)

**Success criteria:**
- Phase 1-2 time reduced by 1-2 seconds
- No regressions in functionality
- Graceful error handling maintained

## Expected Performance Impact

**Before:**
```
00:00 - Start
00:01 - CloudId resolved
00:02 - Target issue fetched
00:02 - Parent fetched (if any)
00:03 - Blockers fetched (if any)
00:04 - Project fetched
00:05 - Comments fetched
```

**After:**
```
00:00 - Start
00:01 - CloudId resolved
00:02 - [Target + Project + Comments] fetched in parallel
00:03 - [Parents + Blockers] fetched in parallel (if any)
```

**Savings:** ~2 seconds for typical stories (50% reduction in Phase 1-2)

## Risks & Mitigations

### Risk 1: Project Key Extraction Fails
**Mitigation:** Validate format before extracting. Fallback to original `target.fields.project?.key` approach if extraction fails.

### Risk 2: Parallel Requests Overwhelm API
**Mitigation:** Jira API handles concurrent requests well. Current code already has Promise.all() in resource loading (Phase 4b). Monitor rate limits.

### Risk 3: CloudId Dependency
**Mitigation:** Keep cloudId resolution as first step (not parallelized) since both hierarchy and comments need it when not provided.

### Risk 4: Error Handling Complexity
**Mitigation:** Wrap parallel fetches in try-catch. Preserve existing error messages. Test error scenarios explicitly.

## Questions

1. Should we parallelize cloudId resolution with initial fetches? (Currently cloudId is needed by both hierarchy and comments fetchers)
   - **Proposed answer:** No - keep cloudId resolution first since it's needed by both other fetches and is fast (~1s). Simplifies error handling.

2. Should blocker fetching be fully parallelized across target + parents? (Currently we can only parallelize after parent chain is complete)
   - **Proposed answer:** Yes - extract links from target immediately, fetch those blockers in parallel with parent recursion, then fetch additional blockers from parents afterward. This is covered in Step 3.

3. Should we add timing metrics/logging to measure actual performance gains?
   - **Proposed answer:** Yes - add timing logs at start/end of parallel batches to validate the optimization. Use `console.time()` / `console.timeEnd()`.

4. Should this optimization be configurable (e.g., `--parallel=false` flag)?
   - **Proposed answer:** No - parallelization is a pure optimization with no user-facing behavior change. Keep implementation simple.
