# write-story Tool

A new tool that generates/refines a Jira story by gathering comprehensive context and always writing the best possible story with inline questions for missing information.

## Overview

**Problem:** We have `write-shell-stories` (epic → shell stories) and `write-next-story` (shell story → Jira story from an epic), but no tool to write/refine an **individual story** that:
- Isn't necessarily derived from an epic's shell stories
- Can be run iteratively with a feedback loop
- Gathers all available context (parent hierarchy, blockers, Confluence, Figma, Google Docs)
- Embeds questions inline for easy answering, then incorporates answers on re-run
- Efficiently processes only changed context on subsequent runs

**Solution:** Create `write-story` tool that:
1. Takes a story issue key (e.g., `PROJ-123`)
2. Checks for a `Last Updated by write-story` timestamp in the description
3. Gathers **changed context** since that timestamp (new/edited comments, updated parents/blockers)
4. Extracts and loads linked resources (Confluence, Figma, Google Docs)
5. **Always writes the best possible story** with available context
6. Includes a **Scope Analysis** section with ❓ markers for unanswered questions
7. On re-run, detects inline answers and flips ❓ → 💬, refining the story

### Story Format

This tool uses the standard story format from `story-writing-guidelines.md`, but **replaces the "Out of Scope" section with "Scope Analysis"**:

| Section | Purpose |
|---------|---------|
| User Story Statement | Plain text describing the work |
| Supporting Artifacts | Figma links, doc references |
| **Scope Analysis** | Scope boundaries (in/out) + clarifying questions (❓/💬) |
| Non-Functional Requirements | Performance, security, etc. |
| Developer Notes | Implementation hints, dependencies |
| Acceptance Criteria | Nested Gherkin format with **GIVEN/WHEN/THEN** |

The **Scope Analysis** section serves dual purposes:
1. **Scope boundaries** - What's explicitly in or out of scope (☐ checkboxes)
2. **Clarifying questions** - Gaps in requirements (❓ unanswered, 💬 answered)

## Incremental Context Strategy

### The Problem with Full Re-processing
Re-reading all comments, parent descriptions, and linked docs on every run is:
- Wasteful (most context hasn't changed)
- Expensive (LLM tokens for unchanged content)
- Noisy (harder to see what's new)

### Timestamp-Based Change Detection

**On each run, write-story will:**

1. **Read the timestamp marker** from the story description:
   ```
   ---
   *Last updated by write-story: 2026-01-28T15:30:00Z*
   ```

2. **Fetch only changed context:**
   - Comments where `created > lastUpdated` OR `updated > lastUpdated`
   - Parent/blocker issues where `fields.updated > lastUpdated`
   - (Linked docs are harder to track changes - may need full re-fetch)

3. **Build a focused prompt:**
   - Full existing story description (the "current truth")
   - Only the **changed** comments/context since last update
   - Clear indication of what's new: "The following context has changed since last update..."

4. **Write updated timestamp** when saving:
   ```
   ---
   *Last updated by write-story: 2026-01-28T16:45:00Z*
   ```

### First Run Behavior
If no timestamp marker exists, treat as first run:
- Fetch ALL comments and context
- Generate story from scratch
- Write initial timestamp marker

### Data Available for Change Detection

| Source | Change Detection Field | API |
|--------|----------------------|-----|
| Jira comments | `created`, `updated` | Issue fields or `/issue/{key}/comment` |
| Parent issues | `fields.updated` | Already fetched via hierarchy |
| Blocker issues | `fields.updated` | Already fetched via hierarchy |
| Confluence pages | `version.when` | Page metadata |
| Google Docs | `modifiedTime` | Drive API metadata |
| Figma files | `lastModified` | File meta endpoint |
| Figma comments | `created_at` | `/v1/files/{key}/comments` (always fetch - not reflected in file `lastModified`) |

### Benefits

1. **Efficiency**: Only process deltas, not full context
2. **Clarity**: LLM sees "here's what changed" vs "here's everything"
3. **Token savings**: Smaller prompts on subsequent runs
4. **Auditability**: Timestamp shows when story was last machine-updated

## Reusable Components from Existing Tools

### From `review-work-item`
- `jira-hierarchy-fetcher.ts` - Fetches issue hierarchy (target, parents, blockers, blocking, project description)
- `link-extractor.ts` - Extracts URLs from hierarchy (including comments)
- `context-loader.ts` - Loads Confluence docs, Figma screens, additional Jira issues
- Question generation pattern (posting questions as comments)

### From `write-shell-stories` / `write-next-story`
- Scope analysis pattern (`decideSelfHealingAction`, question threshold logic)
- Story content generation prompt structure
- Jira description update pattern (PUT to `/rest/api/3/issue/{key}`)
- Documentation context setup (Confluence, Google Docs)

## Tool Behavior

### Inputs
```typescript
interface WriteStoryParams {
  issueKey: string;      // Story to write (e.g., "PROJ-123")
  cloudId?: string;      // Optional cloud ID
  siteName?: string;     // Alternative to cloudId (e.g., "bitovi")
  maxDepth?: number;     // Parent traversal depth (default: 5)
}
```

### Decision Logic

```
1. Fetch story and parse timestamp marker from description
2. Fetch hierarchy + comments (paginated)
3. Filter to changed context (if timestamp exists)
4. If timestamp exists AND no changes detected:
   → Return { action: 'no-changes', message: 'Story is up to date' }
5. Parse existing description for ❓ markers and check for inline answers
6. ALWAYS generate/update story content with:
   → Story sections (Description, Acceptance Criteria, etc.)
   → Scope Analysis section with ❓ (unanswered) and 💬 (answered) markers
7. Write description with timestamp marker
8. Return { action: 'wrote', storyContent, questionCount, answeredCount }
```

### Question Emoji Pattern (same as write-shell-stories)

- **❓** = Unanswered question (needs clarification)
- **💬** = Answered question (answer found in context or added inline)

On subsequent runs, the LLM:
1. Checks if text was added after ❓ questions (inline answers)
2. Checks new comments for answer context
3. Flips ❓ → 💬 for answered questions and includes the answer
4. Refines story content based on newly answered questions

### Iterative Flow Example

```
Run 1: write-story PROJ-123
  → No timestamp marker found (first run)
  → Fetches ALL context (parents, comments, linked docs)
  → Generates story with best available context
  → Includes Scope Analysis section:
      "## Scope Analysis
      - ☐ User can submit form with validation
      - ☐ Success message displays after submission
      - ❓ What happens on validation error? (no error states in designs)
      - ❓ Should the form auto-save drafts?"
  → Writes description with timestamp
  → Returns: { action: 'wrote', questionCount: 2, answeredCount: 0 }

User edits description, adding answer inline:
  "- ❓ What happens on validation error? Show inline error below field"

Run 2: write-story PROJ-123
  → Finds timestamp, fetches changed context
  → Detects inline answer after first ❓
  → Regenerates story incorporating error handling requirement
  → Updates Scope Analysis:
      "- 💬 What happens on validation error? → Show inline error below field
      - ❓ Should the form auto-save drafts?"
  → Returns: { action: 'wrote', questionCount: 1, answeredCount: 1 }

Later, user adds comment: "No auto-save needed, form is simple"

Run 3: write-story PROJ-123
  → Finds timestamp, detects 1 new comment
  → LLM recognizes comment answers the auto-save question
  → Updates Scope Analysis:
      "- 💬 What happens on validation error? → Show inline error below field
      - 💬 Should the form auto-save drafts? → No, form is simple"
  → All questions answered, story is complete
  → Returns: { action: 'wrote', questionCount: 0, answeredCount: 2 }

Run 4: write-story PROJ-123 (no changes)
  → Finds timestamp
  → No new comments since timestamp
  → No parent/blocker updates
  → Returns: { action: 'no-changes', message: 'Story is up to date' }
```

## Implementation Plan

### Phase 1: Tool Scaffolding

Create the folder structure following project conventions:

```
server/providers/combined/tools/write-story/
├── index.ts                 # Export tool registration
├── write-story.ts           # MCP tool wrapper (uses OAuth context)
├── core-logic.ts            # Main business logic (shared by MCP + REST API)
├── prompt-story-content.ts  # LLM prompts for story generation
└── README.md                # Tool documentation

server/api/
└── write-story.ts           # REST API wrapper (uses PAT headers)
```

**Dual Interface Pattern:** Following `copilot-instructions.md`, the tool supports both:
- **MCP**: `write-story.ts` uses OAuth context from `ToolDependencies`
- **REST API**: `server/api/write-story.ts` uses PAT headers (`X-Atlassian-Token`)
- **Shared**: `core-logic.ts` contains `executeWriteStory()` called by both wrappers

**Verification:** Files exist with correct exports, tool registers without error, REST API endpoint responds.

### Phase 2: Context Gathering (with Change Detection)

Reuse `jira-hierarchy-fetcher` and `link-extractor` from `review-work-item`, but add change detection:

1. **Parse timestamp marker** from existing description:
   - Look for `*Last updated by write-story: {ISO8601}*` pattern
   - If not found, `lastUpdated = null` (first run)

2. Call `fetchJiraIssueHierarchy()` to get:
   - Target story with **summary** (issue title), existing description, and comments
   - Parent items (epic, initiative, etc.)
   - Blockers and blocking issues
   - Project description

3. **Filter to changed context** (if `lastUpdated` exists):
   - Comments: `created > lastUpdated` OR `updated > lastUpdated`
   - Parents/blockers: `fields.updated > lastUpdated`
   - Track: `hasChanges = changedComments.length > 0 || changedIssues.length > 0`

4. Call `extractLinksFromHierarchy()` to get linked URLs

5. Call `loadLinkedResources()` to fetch:
   - Confluence page content (check `version.when` for changes)
   - Figma screen analyses (check file `lastModified`)
   - Figma comments (check `created_at` for new comments since last update)
   - Google Docs content (check `modifiedTime`)

**Key context elements:**
- `target.fields.summary` - The story's title/summary (critical for understanding intent)
- `target.fields.description` - Existing description content (the "current truth")
- `target.fields.comment.comments` - All comments (filtered to changed if not first run)
- `lastUpdatedTimestamp` - Parsed from description, used for filtering

**Comment Pagination:**
Jira's REST API paginates comments (default ~20 per request). The `comment` field returns:
- `total` - Total comment count
- `maxResults` - Page size returned
- `comments[]` - The actual comments

**Decision:** Fetch ALL comments via pagination loop. Rationale:
- Q&A feedback loop relies on reading previous question/answer comments
- Missing comments could cause tool to re-ask already-answered questions
- Most stories won't have 100+ comments (performance acceptable)
- Filter to changed comments AFTER fetching all (for accurate change detection)

**Implementation:** Add helper `fetchAllComments(client, cloudId, issueKey)` in `atlassian-helpers.ts` that:
1. Checks `comment.total` vs `comment.comments.length`
2. If more exist, paginate via `GET /rest/api/3/issue/{key}/comment?startAt={n}`
3. Return merged array

This utility is placed in `atlassian-helpers.ts` as a general utility, but called from `jira-hierarchy-fetcher.ts` when loading the issue hierarchy.

**Verification:** Tool logs show hierarchy fetched, change detection applied. On subsequent runs, logs show "X comments changed since {timestamp}".

### Phase 3: Scope Analysis & Question Detection

Implement scope analysis parsing and answer detection (reuse from `write-shell-stories`):

1. Import `countUnansweredQuestions` from `scope-analysis-helpers.ts`
2. Parse existing story description for Scope Analysis section
3. Detect inline answers: text added after ❓ markers
4. Detect comment answers: new comments that address questions
5. Track: `{ unansweredCount, answeredCount, questions[] }`

**Answer Detection Patterns:**
- Inline: `❓ Question text? Answer text here` → flip to `💬 Question text? → Answer text here`
- Comment: New comment content matches/addresses a ❓ question
- Context: Linked docs, parent issues, or Figma comments contain answer

**Verification:** Tool correctly detects inline answers and flips emoji.

### Phase 4: Story Content Generation (Always Write)

**Always generate the best possible story**, even with incomplete context:

1. **Build story generation prompt** with incremental context awareness:

   **First run (no timestamp):**
   - Story summary (the issue title - defines the core intent)
   - All parent context (epic description, etc.)
   - All linked documentation (Confluence, Google Docs)
   - All Figma screen analyses
   - All comments
   
   **Subsequent runs (has timestamp):**
   - Story summary
   - **Existing story description** (the "current truth" to refine)
   - **Existing Scope Analysis** with current ❓/💬 markers
   - **Changed context section**: "The following has changed since {lastUpdated}:"
     - New/edited Jira comments (with timestamps)
     - New Figma comments (with timestamps and screen context)
     - Updated parent/blocker summaries (if changed)
     - Updated linked docs (if detected)
     - Inline answers detected (text added after ❓ markers)
   - Instruction: "Incorporate the new information. Flip ❓ → 💬 for answered questions."

2. Generate story sections:
   - Description (User Story Statement)
   - Supporting Artifacts (Figma links, doc references)
   - **Scope Analysis** (replaces "Out of Scope" - includes scope boundaries AND questions with ❓/💬 markers)
   - Non-Functional Requirements (if applicable)
   - Developer Notes (if applicable)
   - Acceptance Criteria (nested Gherkin format)

3. **Append timestamp marker** to generated content:
   ```markdown
   ---
   *Last updated by write-story: 2026-01-28T16:45:00Z*
   ```

4. Update story description via Jira API:
   - Convert markdown to ADF
   - PUT to `/rest/api/3/issue/{issueKey}`

5. Return `{ action: 'wrote', storyContent, questionCount, answeredCount, changesIncorporated: [...] }`

**Verification:** 
- First run creates story with Scope Analysis section containing ❓ markers
- Subsequent runs detect answers and flip ❓ → 💬
- Story content improves as questions are answered

### Phase 5: REST API Endpoint

Add REST API wrapper following `write-shell-stories` pattern:

```typescript
// server/api/write-story.ts
import { executeWriteStory } from '../providers/combined/tools/write-story/core-logic';
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client';
import { createProviderFromHeaders } from '../llm-client';

export function registerWriteStoryEndpoint(router: Router) {
  router.post('/api/write-story', async (req, res) => {
    // Extract PAT credentials from headers
    const atlassianCredentials = {
      email: req.headers['x-atlassian-email'],
      token: req.headers['x-atlassian-token'],
      siteName: req.body.siteName
    };
    const client = createAtlassianClientWithPAT(atlassianCredentials);
    
    // LLM client from headers (X-Anthropic-Token, etc.)
    const llmClient = createProviderFromHeaders(req.headers);
    
    // Call shared business logic
    const result = await executeWriteStory({
      issueKey: req.body.issueKey,
      cloudId: req.body.cloudId,
      siteName: req.body.siteName,
      atlassianClient: client,
      llmClient
    });
    
    res.json(result);
  });
}
```

**Verification:** POST to `/api/write-story` with PAT auth works.

### Phase 6: Documentation & Tests

1. Update `server/readme.md` with new tool documentation
2. Add tool to tools index
3. Create basic test for answer detection logic
4. Update `IssueComment` type in `server/providers/atlassian/types.ts` to include `updated?: string`
5. Update `parseComments()` to preserve the `updated` field

**Verification:** Documentation accurate, tool appears in MCP tool list, `IssueComment` includes `updated` field.

## Key Design Decisions

### Always Write Approach
Unlike `write-shell-stories` which gates on question count, `write-story` always writes:
- Generates the best possible story with available context
- Includes Scope Analysis section with ❓ markers for gaps
- Makes it easy for users to add inline answers directly in description
- Subsequent runs detect answers and refine the story

**Note:** In a future iteration, `write-shell-stories` will be updated to follow this same "always write" philosophy.

### Error Handling
**Fail hard on partial failures.** If any linked resource fails to load (Figma, Google Docs, Confluence), the tool should throw an error rather than proceeding with incomplete context. This follows the same pattern as `write-shell-stories`.

Rationale: Generating stories with missing context leads to lower quality output and potential rework.

### Progress Notifications
Follow the patterns established in `specs/040-improved-progress.md`:
- Emit progress notifications at key phases (fetching hierarchy, loading linked docs, generating content)
- Use `notify()` callback for MCP clients
- Provide meaningful progress messages for long-running operations (Figma analysis, LLM calls)

### Questions in Description (not Comments)
- **Questions** → Embedded in Scope Analysis section of description
- **Why**: Enables inline answering (user types answer after ❓)
- **Pattern**: Same ❓/💬 markers as `write-shell-stories`

### Handling Existing Description Content
When writing story content:
1. Parse existing description for Scope Analysis section
2. Detect inline answers (text added after ❓ markers)
3. Generate updated story with:
   - Refined content based on new answers
   - Updated Scope Analysis with ❓ → 💬 flips
4. Replace entire description (prompt includes full history for context)

### Answer Detection Heuristics

**Inline answers** (in description):
- Pattern: `❓ Question text? Answer added here`
- Detection: Text exists after `?` on same line or next line
- Result: Flip to `💬 Question text? → Answer added here`

**Comment answers**:
- New comments since last timestamp may contain answers
- LLM evaluates if comment content addresses a ❓ question
- Result: Flip to `💬 Question text? → (answered in comments)`

**Context answers**:
- Linked docs, Figma comments, or parent issues may contain answers
- LLM evaluates all context sources for each ❓ question
- Result: Flip to `💬 Question text? → (from {source})`

**Note:** The raw `JiraCommentRaw` type includes `updated?: string`, but the normalized `IssueComment` currently omits it. **This spec includes updating `IssueComment` to add `updated?: string` for edit detection.**

## Questions

1. Should this tool work on any issue type (story, task, bug, etc.) or only specific types?

Any issue type. 

2. For the `no-changes` case, should the tool still validate the story is complete, or trust that no new context means no update needed?

No new context means no update.  That's how the tool works. 

3. Should there be a `--force-full` flag to ignore the timestamp and re-process all context from scratch?

Not now. 


4. How should linked doc changes be detected? Options:
   - Fetch metadata on every run (API calls but accurate)
   - Only re-process linked docs on first run or if comments reference them
   - Store doc version/modifiedTime in the timestamp marker section

Fetch metadata on every run.  

5. ~~Should the Scope Analysis section be at the top or bottom of the generated description?~~

**Decided:** Scope Analysis replaces the "Out of Scope" section in the standard story format (3rd section). It includes both scope boundaries (what's in/out) AND clarifying questions with ❓/💬 markers.

---

## Review Notes

### Overall Assessment

The spec is well-structured and clearly defines the problem, solution, and implementation plan. The incremental context strategy is thoughtful and should work well. However, there are some areas that need clarification or alignment with the existing codebase.

### Consistency with Existing Codebase

**✅ Good alignment:**
- Reuses existing components: `jira-hierarchy-fetcher.ts`, `link-extractor.ts`, `context-loader.ts`
- Uses established patterns: `scope-analysis-helpers.ts` with `countUnansweredQuestions`, `SelfHealingDecision`
- Follows folder structure conventions from `.github/copilot-instructions.md`
- Properly references Google Docs `modifiedTime` and Confluence `version.when` for change detection

**⚠️ Minor inconsistency:**
- The spec says the tool folder should be `write-story/`, but the existing folder is `writing-shell-stories/` (with "-ing" prefix). The existing `write-next-story/` uses the shorter naming though, so `write-story/` is fine.

### Potential Issues Identified (All Resolved)

1. **Section Naming Conflict**: ✅ `write-story` uses its own modified prompt (not updating `story-writing-guidelines.md`).

2. **"Always Write" vs. `write-shell-stories` Gating**: ✅ Intentional difference. `write-shell-stories` will be updated later to follow the same "always write" philosophy.

3. **Remaining Questions Section**: ✅ Scope Analysis fully replaces both "Out of Scope" and "Remaining Questions" sections.

4. **IssueComment Missing `updated` Field**: ✅ Part of this spec - update `IssueComment` type and `parseComments()`.



### Redundancy Check

- The "Iterative Flow Example" is helpful but slightly verbose; it clearly demonstrates the workflow though
- Phases 2-3 in the implementation plan overlap somewhat in describing context gathering, but they're distinct enough (Phase 2 = fetch, Phase 3 = analyze)

### Missing Details

1. **LLM Client Usage**: The spec doesn't explicitly show which LLM integration pattern to use. Per `copilot-instructions.md`, follow the dual interface pattern:
   - **MCP**: Use `ToolDependencies.generateText` (abstracts MCP sampling vs direct LLM calls)
   - **REST API**: Use `createProviderFromHeaders()` with `X-Anthropic-Token` header
   - **Shared logic**: Put business logic in `core-logic.ts`, called by both MCP wrapper and REST API wrapper



2. **Progress Notifications**: ✅ Yes, follow patterns from `specs/040-improved-progress.md`.

3. **Error Handling**: ✅ Fail hard on partial failures (same as `write-shell-stories`).

## Questions (All Answered)

1. **Scope Analysis vs. Out of Scope**: ✅ `write-story` uses its own modified prompt (not updating `story-writing-guidelines.md`).

2. **Remaining Questions Section**: ✅ Scope Analysis fully replaces both "Out of Scope" and "Remaining Questions" sections.

3. **Comment Pagination Implementation**: ✅ `fetchAllComments()` goes in `atlassian-helpers.ts`, called from `jira-hierarchy-fetcher.ts`.

4. **IssueComment Type Update**: ✅ Part of this spec - add `updated?: string` to `IssueComment` and update `parseComments()`.

5. **REST API Endpoint Path**: ✅ Follow existing `write-shell-stories` pattern for `/api/write-story`.

6. **Figma Change Detection**: ✅ Figma comments must always be fetched and checked - they don't update `lastModified` on the file.

7. **"No Changes" Early Exit**: ✅ Do nothing (no validation). A `--force` option will be added in a later spec.


