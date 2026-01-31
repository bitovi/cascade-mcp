# Write-Story Parallel Loading Analysis

## Current Loading Flow

The `write-story` tool loads context through several phases, with some operations already parallelized and others running sequentially.

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Initial Setup (Sequential)                             │
├─────────────────────────────────────────────────────────────────┤
│ 1. Resolve cloudId from siteName                                │
│    └─> Fetch accessible-resources from Atlassian API            │
│                                                                  │
│ 2. Fetch target issue (hierarchy)                               │
│    └─> GET /rest/api/3/issue/{issueKey}                        │
│    └─> Returns: target + parents + blockers + blocking          │
│                                                                  │
│ 3. Parse existing description for timestamp                     │
│    └─> Determine if first run or update                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: Fetch Comments (Sequential)                            │
├─────────────────────────────────────────────────────────────────┤
│ fetchAllComments() - paginated                                   │
│    └─> GET /rest/api/3/issue/{key}/comment (multiple pages)    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: Change Detection (Sequential, if not first run)        │
├─────────────────────────────────────────────────────────────────┤
│ • Filter changed comments (since lastUpdated)                    │
│ • Filter changed issues (parents, blockers)                      │
│ • Detect inline answers in description                           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4: Extract Links (Sequential)                             │
├─────────────────────────────────────────────────────────────────┤
│ extractLinksFromHierarchy()                                      │
│    └─> Figma URLs, Confluence URLs, Google Docs URLs            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4b: Load Linked Resources (PARALLEL) ✅                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Promise.all([                                                   │
│    ┌──────────────────────────────────────────────┐            │
│    │ 1. loadConfluenceDocuments()                  │            │
│    │    • setupConfluenceContext()                 │            │
│    │    • Fetch pages via Atlassian API            │            │
│    │    • Cache markdown                            │            │
│    │    • Score relevance with LLM                 │            │
│    └──────────────────────────────────────────────┘            │
│    ┌──────────────────────────────────────────────┐            │
│    │ 2. loadGoogleDocs()                           │            │
│    │    • setupGoogleDocsContext()                 │            │
│    │    • Fetch from Google Drive API              │            │
│    │    • Cache markdown                            │            │
│    │    • Score relevance with LLM                 │            │
│    └──────────────────────────────────────────────┘            │
│    ┌──────────────────────────────────────────────┐            │
│    │ 3. loadFigmaScreens()                         │            │
│    │    • Group URLs by file key                   │            │
│    │    • For each file:                           │            │
│    │      - ensureValidCacheForFigmaFile()         │            │
│    │      - fetchFigmaNode() (metadata)            │            │
│    │      - fetchCommentsForFile()                 │            │
│    │      - downloadFigmaImagesBatch()             │            │
│    │      - For each screen (PARALLEL with AI SDK):│            │
│    │        * Check cache for analysis             │            │
│    │        * If not cached: LLM analysis          │            │
│    │        * Save to cache                        │            │
│    │      Note: MCP sampling uses queued sequential│            │
│    └──────────────────────────────────────────────┘            │
│    ┌──────────────────────────────────────────────┐            │
│    │ 4. loadAdditionalJiraIssues()                 │            │
│    │    • Fetch referenced Jira issues in parallel │            │
│    │    • Convert descriptions to markdown         │            │
│    └──────────────────────────────────────────────┘            │
│  ])                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 5: Generate Scope Analysis (if Figma screens exist)       │
├─────────────────────────────────────────────────────────────────┤
│ generateScopeAnalysis()                                          │
│    └─> LLM call with all screen analyses                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 6: Generate Story Content                                 │
├─────────────────────────────────────────────────────────────────┤
│ generateStoryContentPrompt() + LLM call                          │
│    └─> Single large prompt with all context                     │
└─────────────────────────────────────────────────────────────────┘
```

## Performance Characteristics

### ✅ Already Parallelized
- **Resource Loading** (Phase 4b): Confluence, Google Docs, Figma, and additional Jira issues load in parallel
- **Figma Optimizations**: 
  - URLs grouped by file key for batch operations
  - Images downloaded in batch per file
  - Caching prevents redundant LLM analyses

### 🐌 Sequential Bottlenecks
1. **Initial Setup** (Phase 1): 
   - CloudId resolution → Issue fetch → Description parse (must be sequential)
   - ~2-3 seconds typically

2. **Comments Fetch** (Phase 2):
   - Paginated, but runs after hierarchy fetch
   - Could potentially run in parallel with Phase 1

3. **MCP Sampling Screen Analysis** (Phase 4b.3):
   - When using MCP sampling (browser client), screens analyzed sequentially
   - With 3 screens × 30-60s each = 90-180s
   - **Note**: Already parallelized when using direct LLM calls (AI SDK)!

4. **Scope Analysis** (Phase 5):
   - Single LLM call after all screens analyzed
   - ~15-20s for large analysis

## Timing Example (from logs)

From `write-shell-stories` execution on TF-101:
```
00:00 - Start
00:02 - CloudId resolved, issue fetched
00:03 - Figma metadata fetched, comments loaded
00:05 - Images downloaded (batch)
00:05 - Start screen analyses (sequential)
02:00 - Screen 1 analysis complete (55s)
03:30 - Screen 2 analysis complete (90s)  
04:50 - Screen 3 analysis complete (80s)
05:06 - Scope analysis complete (16s)
```

**Total: ~5 minutes, with 3m45s spent on sequential screen analyses**

## Parallelization Opportunities

### 1. Screen Analyses Already Parallelized! ✅
**Status**: Already implemented in `regenerateScreenAnalyses()`

The code uses `Promise.all()` to analyze screens in parallel:
```typescript
// From screen-analysis-regenerator.ts lines 185-220
// Queue wrapper handles parallel vs sequential automatically:
// - AI SDK: actual parallel execution  ← ALREADY PARALLEL!
// - MCP sampling: queued sequential execution

const analysisPromises = screensToAnalyze.map(async (screen) => {
  const result = await analyzeScreen(screen, { ... });
  return result;
});

const analysisResults = await Promise.all(analysisPromises);
```

**Impact**: When using direct LLM calls (REST API, AI SDK):
- 3 screens × 60s = 180s → 60s (saves 120s = 2 minutes) ✅ Already done!
### 2. Parallelize Comments with Hierarchy (High Impact - Easy Win)
**Note**: MCP sampling uses queued sequential execution due to protocol limitations (only affects browser client)

### 2. Parallelize Comments with Hierarchy (Medium Impact)
**Current**: Comments fetched after hierarchy
```typescript
const hierarchy = await fetchJiraIssueHierarchy(...);
const comments = await fetchAllComments(...);
```

**Proposed**: Fetch in parallel
```typescript
const [hierarchy, comments] = await Promise.all([
  fetchJiraIssueHierarchy(...),
  fetchAllComments(...)
]);
```

**Impact**: Save ~1-2 seconds (comments are fast, but why wait?)

### 3. Early CloudId Resolution (Low Impact)
If `cloudId` is already provided, skip the resolution step entirely.

**Impact**: Save ~1 second when cloudId provided

## Implementation Considerations

### Screen Analysis Parallelization ✅ Already Done!
**Current Status**: Already parallelized for direct LLM calls (AI SDK, REST API)

**How it works**:
- `regenerateScreenAnalyses()` uses `Promise.all()` for parallel execution
- Queue wrapper (`createQueuedGenerateText`) handles MCP sampling sequencing
- Direct LLM providers (Anthropic, OpenAI) execute truly in parallel

**Why MCP sampling is sequential**:
- MCP protocol limitation: Only one sampling request per session at a time
- Applies only to browser client using MCP transport
- REST API and direct SDK usage are fully parallel

### Comments Parallelization
**Pros**:
- Simple change, no downsides
- Clean separation of concerns

**Cons**:
- Minimal time savings

**Recommendation**: Implement - it's a free optimization

## Code Location Reference

**Main Flow**: `server/providers/combined/tools/write-story/core-logic.ts`
- Phase 1-4: Lines 100-260
- Phase 5: Lines 280-315
- Phase 6: Lines 320-350

**Context Loader**: `server/providers/combined/tools/review-work-item/context-loader.ts`
- `loadLinkedResources()`: Line 160 (Promise.all)
- `loadFigmaScreens()`: Lines 318-550 (sequential screen loop)

**Figma Screen Analysis**: Lines 490-545
```typescript
**Screen Analysis (Already Parallel)**: `screen-analysis-regenerator.ts` Lines 185-220
```typescript
// Already uses Promise.all for parallelization!
const analysisPromises = screensToAnalyze.map(async (screen) => {
  const result = await analyzeScreen(screen, { ... });
  return result;
});

const analysisResults = await Promise.all(analysisPromises);
// ✅ Parallel when using AI SDK (direct LLM calls)
// ⏸️ Sequential when using MCP sampling (protocol limitation)
```