# Spec 050: Integrate screen-analyses-workflow into write-story

## Overview

This spec defines how to migrate `write-story` (and `review-work-item`) to use the consolidated `server/providers/figma/screen-analyses-workflow/` module instead of the inline implementation in `context-loader.ts`.

The goal is to:
1. Replace ~200 lines of duplicated Figma analysis code in `context-loader.ts` with a call to `analyzeScreens()`
2. Gain feature parity with `write-shell-stories` (semantic XML, better caching, node caching)
3. Prepare for future migration of other tools (`write-shell-stories`, `write-next-story`)

## Current State

### Tools Using Screen Analysis

| Tool | Current Implementation | Location |
|------|----------------------|----------|
| **write-story** / **review-work-item** | Inline `loadFigmaScreens()` | `context-loader.ts` |
| **write-shell-stories** | `regenerateScreenAnalyses()` | `screen-analysis-regenerator.ts` |
| **write-next-story** | `regenerateScreenAnalyses()` | `screen-analysis-regenerator.ts` |
| **figma-review-design** | ✅ **Uses `analyzeScreens()`** | `screen-analyses-workflow/` |

### Key Differences

| Feature | `context-loader.ts` (write-story) | `screen-analyses-workflow/` |
|---------|-----------------------------------|----------------------------|
| Semantic XML | ❌ No | ✅ Yes |
| Node caching | ❌ No | ✅ Yes (spec 049) |
| Meta-first caching | ❌ No (ensureValidCacheForFigmaFile) | ✅ Yes |
| Comment association | ✅ Yes (inline) | ✅ Yes |
| Sticky note association | ✅ Yes | ✅ Yes |
| Dependency injection | ❌ No | ✅ Yes |
| Unit tests | ❌ No | ✅ Yes |

### Files to Modify

```
server/providers/combined/tools/review-work-item/
├── context-loader.ts        # Main changes here
├── core-logic.ts            # May need type updates
```

## Target Flow

After migration, `loadFigmaScreens()` in `context-loader.ts` will call `analyzeScreens()` from the workflow module:

```
loadFigmaScreens(figmaUrls, figmaClient, generateText, epicContext, notify)
  │
  └─ analyzeScreens(figmaUrls, figmaClient, generateText, options)
       │
       ├─ parseFigmaUrls()
       ├─ validateCache()
       ├─ fetchFrameNodesFromUrls()
       ├─ expandNodes()
       ├─ downloadImages()
       ├─ fetchAndAssociateAnnotations()
       ├─ analyzeFrames()
       └─ Returns: FrameAnalysisResult { frames, figmaFileUrl }
```

## Type Mapping

The workflow uses `AnalyzedFrame` while `context-loader.ts` uses `AnalyzedScreen`. Here's the mapping:

```typescript
// screen-analyses-workflow/types.ts
interface AnalyzedFrame {
  name: string;              // Sanitized kebab-case name
  nodeId: string;            // Figma node ID
  url: string;               // Full Figma URL
  annotations: FrameAnnotation[];
  analysis?: string;
  cached?: boolean;
  frameName?: string;
  sectionName?: string;
  position?: { x, y, width, height };
  order?: number;
  cacheFilename?: string;
}

// context-loader.ts (current)
interface AnalyzedScreen {
  name: string;     // Frame name from Figma
  url: string;      // Original Figma URL
  analysis: string; // AI-generated analysis
  notes: string[];  // Design notes
}
```

### Conversion Helper

```typescript
function convertToAnalyzedScreen(frame: AnalyzedFrame): AnalyzedScreen {
  return {
    name: frame.frameName || frame.name,
    url: frame.url,
    analysis: frame.analysis || '',
    notes: frame.annotations
      .filter(a => a.type === 'note')
      .map(a => a.content)
  };
}
```

## Implementation Steps

### Step 1: Add analyzeScreens to workflow index (if not exported)

**File:** `server/providers/figma/screen-analyses-workflow/index.ts`

Verify that `analyzeScreens` is exported. Currently exported:
- ✅ `analyzeScreens`
- ✅ `AnalyzedFrame`
- ✅ `FrameAnnotation`
- ✅ `FrameAnalysisResult`

**Verification:**
- TypeScript compiles when importing from `'../../../figma/screen-analyses-workflow/index.js'`

### Step 2: Create adapter function in context-loader.ts

Create a thin wrapper that calls `analyzeScreens()` and converts the result.

**File:** `server/providers/combined/tools/review-work-item/context-loader.ts`

**Changes:**
1. Add import for `analyzeScreens` and types
2. Create `loadFigmaScreensViaWorkflow()` function
3. Keep old `loadFigmaScreens()` temporarily for comparison

```typescript
import {
  analyzeScreens,
  type AnalyzedFrame,
  type FrameAnnotation,
} from '../../../figma/screen-analyses-workflow/index.js';

/**
 * Load and analyze Figma screens using the consolidated workflow
 * (New implementation using screen-analyses-workflow module)
 */
async function loadFigmaScreensViaWorkflow(
  figmaUrls: string[],
  figmaClient: FigmaClient,
  generateText: GenerateTextFn,
  epicContext: string,
  notify: (message: string) => Promise<void>
): Promise<{ screens: AnalyzedScreen[]; comments: ScreenAnnotation[] }> {
  if (figmaUrls.length === 0) {
    return { screens: [], comments: [] };
  }

  // Call the consolidated workflow
  const result = await analyzeScreens(
    figmaUrls,
    figmaClient,
    generateText,
    {
      analysisOptions: {
        contextMarkdown: epicContext, // Map caller's epicContext to workflow's contextMarkdown
      }
    }
  );

  // Convert AnalyzedFrame[] to AnalyzedScreen[]
  const screens: AnalyzedScreen[] = result.frames.map(frame => ({
    name: frame.frameName || frame.name,
    url: frame.url,
    analysis: frame.analysis || '',
    notes: frame.annotations
      .filter(a => a.type === 'note')
      .map(a => a.content)
  }));

  // Extract comments from annotations
  const comments: ScreenAnnotation[] = result.frames.flatMap(frame =>
    frame.annotations
      .filter(a => a.type === 'comment')
      .map(a => ({
        screenName: frame.frameName || frame.name,
        screenUrl: frame.url,
        annotation: a.content,
        author: a.author,
      }))
  );

  return { screens, comments };
}
```

**Verification:**
- Function compiles without type errors
- Can be tested manually by temporarily swapping in `loadLinkedResources()`

### Step 3: Wire up epicContext to screen-analyzer.ts

The current `analyzeScreens()` doesn't accept `epicContext` in options. Add support.

**File:** `server/providers/figma/screen-analyses-workflow/screen-analyzer.ts`

**Changes:**
1. Add `epicContext?: string` to `ScreenAnalysisOptions`
2. Pass to `buildAnalysisPrompt()` function

```typescript
// screen-analyzer.ts
export interface ScreenAnalysisOptions {
  includeImage?: boolean;
  systemPrompt?: string;
  maxTokens?: number;
  contextMarkdown?: string; // NEW: Contextual info for analysis (from Jira issue, epic, or user description)
}

// In buildAnalysisPrompt():
function buildAnalysisPrompt(
  frame: AnalyzedFrame,
  semanticXml: string,
  contextMarkdown?: string
): string {
  let prompt = `## Screen: ${frame.frameName || frame.name}\n\n`;
  
  if (contextMarkdown) {
    prompt += `## Context\n\n${contextMarkdown}\n\n`;
  }
  
  prompt += `## Semantic Structure\n\n${semanticXml}\n\n`;
  
  // ... rest of prompt building
}
```

**Verification:**
- Test that context markdown appears in LLM prompts
- Screen analyses reference context information when available

### Step 4: Pass epicContext through analyzeScreens orchestrator

**File:** `server/providers/figma/screen-analyses-workflow/analysis-orchestrator.ts`

**Changes:**
1. Pass `analysisOptions` (including `epicContext`) to `analyzeFrames()`

The current code already passes `analysisOptions` to `analyzeFrames()`. Verify it propagates correctly.

**Verification:**
- Add console.log in `analyzeFrame()` to confirm contextMarkdown arrives
- Run write-story tool and verify analysis includes context

### Step 5: Replace loadFigmaScreens with workflow implementation

**File:** `server/providers/combined/tools/review-work-item/context-loader.ts`

**Changes:**
1. Replace call to inline `loadFigmaScreens()` with `loadFigmaScreensViaWorkflow()`
2. Delete the old ~200 line `loadFigmaScreens()` function
3. Delete helper functions no longer needed (`sanitizeFilename`, etc.)

```typescript
// In loadLinkedResources():
const [confluenceResult, googleDocsResult, figmaResult, jiraResults] = await Promise.all([
  loadConfluenceDocuments(...),
  loadGoogleDocs(...),
  loadFigmaScreensViaWorkflow(  // Changed from loadFigmaScreens
    links.figma, 
    figmaClient, 
    generateText, 
    issueContext.markdown, 
    notify
  ),
  loadAdditionalJiraIssues(...)
]);
```

**Verification:**
- Run write-story tool end-to-end
- Verify screen analyses include semantic XML (new feature!)
- Verify Figma comments still work
- Verify cache behavior (stale cache invalidated, valid cache reused)

### Step 6: Add notify callback support to analyzeScreens

The current `analyzeScreens()` doesn't have a notify callback for progress updates.

**File:** `server/providers/figma/screen-analyses-workflow/analysis-orchestrator.ts`

**Changes:**
1. Add `notify?: (message: string) => Promise<void>` to `AnalysisWorkflowOptions`
2. Add progress notifications at key points

```typescript
export interface AnalysisWorkflowOptions {
  imageOptions?: { format?: 'png' | 'jpg' | 'svg'; scale?: number };
  analysisOptions?: ScreenAnalysisOptions;
  notify?: (message: string) => Promise<void>;  // NEW
}

// In analyzeScreens():
if (options.notify) {
  await options.notify(`🎨 Analyzing ${urls.length} Figma screens...`);
}
// ... later
if (options.notify) {
  const cachedCount = countCachedFrames(orderedFrames);
  const newCount = countAnalyzedFrames(orderedFrames);
  await options.notify(`Screen analysis complete: ${cachedCount} cached, ${newCount} new`);
}
```

**Verification:**
- Progress notifications appear in MCP client
- Notifications match existing pattern from `loadFigmaScreens()`

### Step 7: Update unit tests

**Files:**
- `server/providers/figma/screen-analyses-workflow/analysis-orchestrator.test.ts`
- New: `server/providers/combined/tools/review-work-item/context-loader.test.ts`

**Changes:**
1. Add tests for `loadFigmaScreensViaWorkflow()` conversion logic
2. Add integration test that verifies end-to-end flow

**Verification:**
- All existing tests pass
- New tests cover type conversion
- Coverage maintained or improved

### Step 8: Cleanup and remove dead code

**File:** `server/providers/combined/tools/review-work-item/context-loader.ts`

**Remove:**
- Old `loadFigmaScreens()` function
- `sanitizeFilename()` helper
- Inline imports no longer needed:
  - `parseFigmaUrl`
  - `fetchFigmaNode`
  - `getFramesAndNotesForNode`
  - `downloadFigmaImagesBatch`
  - `convertNodeIdToApiFormat`
  - `getFigmaFileCachePath`
  - `ensureValidCacheForFigmaFile`
  - `generateScreenAnalysisPrompt`
  - `SCREEN_ANALYSIS_SYSTEM_PROMPT`
  - `SCREEN_ANALYSIS_MAX_TOKENS`
  - `associateNotesWithFrames`

**Verification:**
- No unused imports
- Code compiles cleanly
- File size reduced significantly (~200 lines removed)

## Completed Migrations

### ✅ figma-review-design (Completed)

**Date:** February 1, 2026

**Changes Made:**
- Replaced `processFigmaUrls()` + `regenerateScreenAnalyses()` workflow with `analyzeScreens()`
- Removed dependencies on:
  - `processFigmaUrls` from `figma-screen-setup.ts`
  - `getFigmaFileCachePath`, `ensureValidCacheForFigmaFile` from `figma-cache.ts`
  - `regenerateScreenAnalyses` from `screen-analysis-regenerator.ts`
  - `notesToScreenAnnotations` from `note-text-extractor.ts`
- Now uses `analyzeScreens()` directly with `contextMarkdown` option
- Annotations (comments + notes) are now extracted from `AnalyzedFrame.annotations[]`
- ~100 lines of code removed

**Benefits Gained:**
- ✅ Semantic XML support for better AI analysis
- ✅ Meta-first cache validation (Tier 3 API)
- ✅ Node caching optimization
- ✅ Unified annotation association logic
- ✅ Better notification messages showing "X of Y comment threads"
- ✅ Testable dependency injection pattern

**Testing:**
- All 354 tests passing
- No TypeScript errors
- Integration verified with existing `figma-review-design` tool flows

### ✅ write-shell-stories (Completed)

**Date:** February 2, 2026

**Changes Made:**
- Replaced `regenerateScreenAnalyses()` workflow with `analyzeScreens()`
- Removed dependency on `screen-analysis-regenerator.ts`
- Now uses `analyzeScreens()` directly with `contextMarkdown` option
- Maintained cache status reporting (cached vs new analyses)

**Benefits Gained:**
- ✅ Semantic XML support for better AI analysis
- ✅ Meta-first cache validation (Tier 3 API)
- ✅ Node caching optimization
- ✅ Unified annotation association logic
- ✅ Consistent caching behavior across all tools

### ✅ write-next-story (Completed)

**Date:** February 2, 2026

**Changes Made:**
- Replaced `regenerateScreenAnalyses()` workflow with `analyzeScreens()`
- Updated to pass Figma URLs instead of screen objects
- Simplified missing analysis file regeneration logic
- Now uses `analyzeScreens()` directly with `contextMarkdown` option

**Benefits Gained:**
- ✅ Semantic XML support for better AI analysis
- ✅ Meta-first cache validation (Tier 3 API)
- ✅ Node caching optimization
- ✅ Simplified regeneration logic
- ✅ Consistent with write-shell-stories approach

### ✅ screen-analysis-pipeline (Completed)

**Date:** February 2, 2026

**Changes Made:**
- Replaced `regenerateScreenAnalyses()` workflow with `analyzeScreens()`
- Updated `executeScreenAnalysisPipeline()` to use the consolidated workflow
- Used by `analyze-feature-scope` tool

**Benefits Gained:**
- ✅ All shared pipeline tools now use the consolidated workflow
- ✅ Consistent behavior across identify-features and write-shell-stories
- ✅ Ready for `screen-analysis-regenerator.ts` deletion

## Next Steps

The `screen-analysis-regenerator.ts` file can now be safely deleted as all consumers have been migrated to use `analyzeScreens()` from the consolidated workflow module. This completes the consolidation effort outlined in this spec.

**Files that can be deleted:**
- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts` (425 lines)

**Testing:**
- All 354 tests passing

## Questions (Resolved)

1. ~~The `ScreenAnnotation` type in `context-loader.ts` has a different shape than `FrameAnnotation` in the workflow. Should we:~~
   
   **Answer:** Option B - Update callers to use `FrameAnnotation` directly. When all tools use `analyzeScreens()`, they get `AnalyzedFrame[]` with embedded annotations. Prompt generators can accept `AnalyzedFrame[]` directly instead of separate `screens` + `annotations` arrays. Migration scope: Update prompt generators incrementally as each tool migrates.

2. ~~The workflow module uses `console.log` for debugging. Should we add a `debug` option to suppress these in production?~~
   
   **Answer:** Keep only the most useful console.logs. No debug flag needed - just audit and reduce logging.

3. ~~The `ScreenAnalysisOptions.epicContext` field name - should this be `contextMarkdown` or `issueContext`?~~
   
   **Answer:** Use `contextMarkdown`. Most generic name that works for all callers:
   - `write-story` passes issue context markdown
   - `write-shell-stories` passes epic context markdown
   - `figma-review-design` passes user-provided `contextDescription` (no Jira at all)

4. ~~Should we add integration tests that hit real Figma API?~~
   
   **Answer:** No. Mock-based unit tests are sufficient.

5. ~~Should `analyzeScreens()` throw on errors or return partial results with an errors array?~~
   
   **Answer:** Throw on errors (matching existing `loadFigmaScreens()` behavior). 
