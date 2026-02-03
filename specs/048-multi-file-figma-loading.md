# Spec 048: Multi-File Figma Loading Support

## Overview

Currently, the `screen-analyses-workflow` module requires all Figma URLs to be from the **same file**. This limitation is enforced in `url-processor.ts` (lines 116-120):

```typescript
if (fileKeys.size > 1) {
  throw new Error(
    `URLs from multiple Figma files detected (${fileKeys.size} files). ` +
    `Currently only single-file batches are supported.`
  );
}
```

This spec defines how to add support for analyzing screens from **multiple Figma files** in a single workflow invocation.

## Motivation

Real-world design systems often span multiple Figma files:
- **Component library file** - Design system components
- **Product-specific files** - Feature designs that reference components
- **Prototype files** - User flow prototypes across features
- **Hand-off files** - Developer-ready screens from multiple products

Forcing users to call `analyzeScreens()` separately per file adds friction and prevents cross-file analysis context.

## Current Architecture Analysis

### What Already Exists

The codebase already anticipated multi-file support:

1. **`groupUrlsByFileKey()` function** (url-processor.ts, lines 205-218) - Groups parsed URLs by file key, but is currently unused
2. **TODO comment** - `// TODO: Support multiple file keys (Gap #2)` at line 122

### What Needs to Change

| Module | Current | Multi-File Change |
|--------|---------|-------------------|
| `url-processor.ts` | Returns single `figmaFileKey` | Returns `Map<fileKey, ParsedUrls>` |
| `cache-validator.ts` | Validates one file | Validates each file, returns `Map<fileKey, CacheResult>` |
| `image-downloader.ts` | Downloads from one file | Downloads per-file, returns `Map<fileKey, ImageMap>` |
| `annotation-associator.ts` | Fetches comments from one file | Fetches per-file, merges results |
| `analysis-orchestrator.ts` | Single fileKey in result | Multiple file keys in result |
| `types.ts` | `figmaFileKey: string` | `figmaFileKeys: string[]` or per-frame |

## Proposed Design

### Option A: Per-File Grouping (Recommended)

Process each file independently, then merge results. This approach:
- Maintains existing per-file batching efficiency
- Keeps each file's cache independent
- Allows partial failures (one file fails, others succeed)

```typescript
// New ProcessedUrlsResult type
interface ProcessedUrlsResult {
  /** Map of file key to parsed URLs and node data */
  fileGroups: Map<string, FileGroup>;
  
  /** Validation errors across all files */
  errors: Array<{ url: string; error: string }>;
}

interface FileGroup {
  fileKey: string;
  parsedUrls: Array<{ url: string; nodeId: string }>;
  nodesDataMap: Map<string, FigmaNodeMetadata>;
}
```

```typescript
// Updated FrameAnalysisResult
interface FrameAnalysisResult {
  frames: AnalyzedFrame[];
  
  /** BREAKING: Now returns array of file keys */
  figmaFileKeys: string[];
  
  /** BREAKING: Now returns array of file URLs */
  figmaFileUrls: string[];
  
  stats: {
    totalFrames: number;
    analyzedFrames: number;
    cachedFrames: number;
    totalAnnotations: number;
    usedCache: boolean;
    /** NEW: Per-file breakdown */
    perFile: Map<string, {
      frames: number;
      analyzedFrames: number;
      cachedFrames: number;
    }>;
  };
}
```

### Option B: Per-Frame File Reference

Each frame carries its own file reference. Simpler type changes, but less efficient batching visibility.

```typescript
interface AnalyzedFrame {
  // ... existing fields ...
  
  /** File key this frame belongs to */
  figmaFileKey: string;
  
  /** Full URL to the Figma file */
  figmaFileUrl: string;
}

// Result still has single fields, but they become arrays
interface FrameAnalysisResult {
  frames: AnalyzedFrame[];
  
  /** All unique file keys */
  figmaFileKeys: string[];
  
  /** All unique file URLs */
  figmaFileUrls: string[];
  
  stats: { /* unchanged */ };
}
```

### Recommendation

**Option B (Per-Frame File Reference)** is recommended because:
1. Simpler result structure
2. Frame is already the unit of analysis
3. Consumers can easily group by `frame.figmaFileKey` if needed
4. Less breaking change to stats structure

## Implementation Plan

### Phase 1: Type Updates (Non-Breaking)

1. Add optional `figmaFileKey` and `figmaFileUrl` to `AnalyzedFrame` interface
2. Add `figmaFileKeys: string[]` and `figmaFileUrls: string[]` to `FrameAnalysisResult` (alongside existing singular fields)
3. Populate per-frame file references in orchestrator

### Phase 2: url-processor.ts Changes

1. Remove the multi-file error throwing (lines 116-120)
2. Return grouped result using `groupUrlsByFileKey()`:

```typescript
export async function fetchFrameNodesFromUrls(
  urls: string[],
  figmaClient: FigmaClient,
  deps: UrlProcessorDeps = {}
): Promise<MultiFileProcessedResult> {
  // ... parse URLs ...
  
  // Group by file key
  const grouped = groupUrlsByFileKey(parsedUrls);
  
  // Fetch nodes per file (can be parallel)
  const fileGroups = new Map<string, FileGroup>();
  
  await Promise.all(
    Array.from(grouped.entries()).map(async ([fileKey, urls]) => {
      const nodeIds = urls.map(u => u.nodeId);
      const nodesDataMap = await fetchFigmaNodesBatch(figmaClient, fileKey, nodeIds);
      
      fileGroups.set(fileKey, {
        fileKey,
        parsedUrls: urls,
        nodesDataMap,
      });
    })
  );
  
  return { fileGroups, errors };
}
```

### Phase 3: Per-File Operations

Update these modules to iterate over file groups:

#### cache-validator.ts

```typescript
export async function validateCacheMultiFile(
  figmaClient: FigmaClient,
  fileKeys: string[],
  deps: CacheValidatorDeps = {}
): Promise<Map<string, CacheValidationResult>> {
  const results = new Map();
  
  // Parallel validation per file
  await Promise.all(
    fileKeys.map(async (fileKey) => {
      const result = await validateCache(figmaClient, fileKey, deps);
      results.set(fileKey, result);
    })
  );
  
  return results;
}
```

#### image-downloader.ts

```typescript
export async function downloadImagesMultiFile(
  figmaClient: FigmaClient,
  fileNodeIds: Map<string, string[]>, // fileKey -> nodeIds
  options: ImageDownloadOptions = {},
  deps: ImageDownloaderDeps = {}
): Promise<Map<string, ImageDownloadResult>> {
  const results = new Map();
  
  // Parallel download per file
  await Promise.all(
    Array.from(fileNodeIds.entries()).map(async ([fileKey, nodeIds]) => {
      const result = await downloadImages(figmaClient, fileKey, nodeIds, options, deps);
      results.set(fileKey, result);
    })
  );
  
  return results;
}
```

#### annotation-associator.ts

```typescript
export async function fetchAnnotationsMultiFile(
  figmaClient: FigmaClient,
  fileFrames: Map<string, { frames: FigmaNodeMetadata[]; notes: FigmaNodeMetadata[] }>,
  deps: AnnotationDeps = {}
): Promise<Map<string, AnnotationResult>> {
  const results = new Map();
  
  await Promise.all(
    Array.from(fileFrames.entries()).map(async ([fileKey, { frames, notes }]) => {
      const result = await fetchAndAssociateAnnotations(
        figmaClient, fileKey, frames, notes, deps
      );
      results.set(fileKey, result);
    })
  );
  
  return results;
}
```

### Phase 4: analysis-orchestrator.ts Refactor

Update the main orchestrator to:
1. Accept multi-file URL inputs
2. Coordinate per-file operations
3. Merge results with per-frame file references
4. Populate new array fields in result

```typescript
export async function analyzeScreens(
  urls: string[],
  figmaClient: FigmaClient,
  generateText: GenerateTextFn,
  options: AnalysisWorkflowOptions = {},
  deps: OrchestratorDeps = {}
): Promise<FrameAnalysisResult> {
  // Step 1: Parse and group URLs by file
  const { fileGroups, errors } = await d.fetchFrameNodesFromUrls(urls, figmaClient);
  
  const fileKeys = Array.from(fileGroups.keys());
  
  // Step 2: Expand nodes per file
  const expandedPerFile = new Map<string, ExpandedFrames>();
  for (const [fileKey, group] of fileGroups) {
    expandedPerFile.set(fileKey, d.expandNodes(group.nodesDataMap));
  }
  
  // Step 3: Validate cache per file (parallel)
  const cacheResults = await d.validateCacheMultiFile(figmaClient, fileKeys);
  
  // Step 4: Download images per file (parallel)
  const imageInputs = new Map<string, string[]>();
  for (const [fileKey, expanded] of expandedPerFile) {
    imageInputs.set(fileKey, expanded.frames.map(f => f.id));
  }
  const imageResults = await d.downloadImagesMultiFile(figmaClient, imageInputs);
  
  // Step 5: Fetch annotations per file (parallel)
  const annotationInputs = new Map();
  for (const [fileKey, expanded] of expandedPerFile) {
    annotationInputs.set(fileKey, { frames: expanded.frames, notes: expanded.notes });
  }
  const annotationResults = await d.fetchAnnotationsMultiFile(figmaClient, annotationInputs);
  
  // Step 6: Merge frames with file references
  const allFrames: AnalyzedFrame[] = [];
  for (const [fileKey, annotationResult] of annotationResults) {
    for (const frame of annotationResult.frames) {
      allFrames.push({
        ...frame,
        figmaFileKey: fileKey,
        figmaFileUrl: `https://www.figma.com/file/${fileKey}`,
      });
    }
  }
  
  // Step 7: AI analysis (same as before, operates on merged frame list)
  // ... existing analysis code ...
  
  // Step 8: Build multi-file result
  return {
    frames: orderedFrames,
    figmaFileKey: fileKeys[0], // Deprecated, for backwards compat
    figmaFileUrl: `https://www.figma.com/file/${fileKeys[0]}`, // Deprecated
    figmaFileKeys: fileKeys,
    figmaFileUrls: fileKeys.map(k => `https://www.figma.com/file/${k}`),
    stats: { /* ... */ },
  };
}
```

## Testing Strategy

### Unit Tests

1. **url-processor.test.ts** - Add tests for multi-file grouping
2. **cache-validator.test.ts** - Add tests for `validateCacheMultiFile()`
3. **image-downloader.test.ts** - Add tests for `downloadImagesMultiFile()`
4. **annotation-associator.test.ts** - Add tests for `fetchAnnotationsMultiFile()`
5. **analysis-orchestrator.test.ts** - Add tests for multi-file orchestration

### Integration Tests

1. Two files, one URL each
2. Three files, mixed URL counts (1, 3, 2)
3. One invalid file, others succeed (partial failure)
4. All files cached vs all invalidated vs mixed

## Breaking Changes

### Type Changes

| Field | Before | After | Migration |
|-------|--------|-------|-----------|
| `FrameAnalysisResult.figmaFileKey` | `string` | `string` (deprecated) | Use `figmaFileKeys[0]` |
| `FrameAnalysisResult.figmaFileUrl` | `string` | `string` (deprecated) | Use `figmaFileUrls[0]` |
| NEW: `FrameAnalysisResult.figmaFileKeys` | N/A | `string[]` | New field |
| NEW: `FrameAnalysisResult.figmaFileUrls` | N/A | `string[]` | New field |
| `AnalyzedFrame.figmaFileKey` | N/A | `string` (optional) | New field |
| `AnalyzedFrame.figmaFileUrl` | N/A | `string` (optional) | New field |

### Backwards Compatibility

The existing singular fields (`figmaFileKey`, `figmaFileUrl`) will remain but be deprecated. They will contain the first file key for backwards compatibility.

## Estimated Effort

| Task | Effort |
|------|--------|
| Type updates | 0.5 day |
| url-processor.ts changes | 0.5 day |
| Multi-file helper functions | 1 day |
| Orchestrator refactor | 1 day |
| Test updates | 1 day |
| Documentation | 0.5 day |
| **Total** | **4.5 days** |

## Questions

1. **Partial Failure Handling**: If one file fails (API error, 404), should we:
   - Fail the entire operation?
   - Return partial results with error info for failed files?
   - Continue silently, logging the failure?

2. **Cross-File Ordering**: How should frames be ordered when spanning multiple files?
   - Per-file ordering, then concatenate?
   - Alphabetically by file name, then spatial order within?
   - Let caller specify ordering strategy?

3. **Rate Limiting**: With multiple files, should we:
   - Process files in parallel (faster, higher rate limit risk)?
   - Process files sequentially (safer, slower)?
   - Add configurable concurrency limit?

4. **Cache Granularity**: Should cache be validated:
   - All-or-nothing (if any file changed, re-analyze all)?
   - Per-file (only re-analyze frames from changed files)?

5. **Deprecation Timeline**: How long should we maintain backwards compatibility for singular `figmaFileKey`/`figmaFileUrl` fields?
