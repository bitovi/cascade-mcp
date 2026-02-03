# Spec 049: Meta-First Cache Validation and Node Caching

## Problem

The current `analyzeScreens()` workflow makes unnecessary API calls:

1. **`/nodes` always called first** - We fetch node data before checking if the cache is valid
2. **Node data not cached** - Even when the file hasn't changed, we re-fetch the full node tree every time

This wastes API quota and adds latency, especially for files with complex node hierarchies.

## Current Flow

```
analyzeScreens(urls, figmaClient, generateText, options)
  │
  ├─ 1. parseFigmaUrls(urls)
  │     └─ Extract fileKey and nodeId from each URL
  │     └─ Validate URL format
  │     └─ Returns: { valid: ParsedUrl[], invalid: string[] }
  │
  ├─ 2. fetchFrameNodesFromUrls(urls, figmaClient)          ← ALWAYS CALLED
  │     ├─ groupUrlsByFileKey(parsedUrls)
  │     │     └─ Group URLs by Figma file for batch API calls
  │     ├─ fetchFigmaNodesBatch(figmaClient, fileKey, nodeIds)
  │     │     └─ Single API call: GET /v1/files/:key/nodes?ids=...
  │     │     └─ Returns full node data WITH children
  │     └─ Returns: { figmaFileKey, parsedUrls, nodesDataMap, errors }
  │
  ├─ 3. expandNodes(nodesDataMap)
  │     ├─ For each node in map:
  │     │     └─ expandNode(nodeData)
  │     │           ├─ FRAME → return as-is
  │     │           ├─ CANVAS → collect first-level FRAME children
  │     │           ├─ SECTION → collect FRAME children with section context
  │     │           └─ Extract "Note" INSTANCE nodes as sticky notes
  │     └─ Returns: { frames: FigmaNodeMetadata[], notes: FigmaNodeMetadata[] }
  │
  ├─ 4. validateCache(figmaClient, fileKey)                 ← TOO LATE
  │     ├─ fetchFigmaFileMetadata(figmaClient, fileKey)
  │     │     └─ API call: GET /v1/files/:key/meta
  │     │     └─ Returns: { lastTouchedAt: string }
  │     ├─ isCacheValid(fileKey, lastTouchedAt)
  │     │     └─ Compare stored timestamp vs current
  │     ├─ If stale: clearFigmaCache(fileKey)
  │     │     └─ Delete cache folder
  │     └─ Returns: { cachePath, wasInvalidated, fileMetadata }
  │
  ├─ 5. downloadImages(...)
  ├─ 6. fetchAndAssociateAnnotations(...)
  ├─ 7. analyzeFrames(...)
  ├─ 8. calculateFrameOrder(...)
  │
  └─ Return: FrameAnalysisResult { frames, figmaFileUrl }
```

**Issues:**
- Step 2 (`/nodes`) runs before Step 4 (`/meta` for cache check)
- Node data is never cached - always re-fetched from Figma API
- When cache is valid, we still make the `/nodes` call unnecessarily

## Proposed Flow

```
analyzeScreens(urls, figmaClient, generateText, options)
  │
  ├─ 1. parseFigmaUrls(urls)
  │     └─ Extract fileKey and nodeId from each URL
  │     └─ Validate URL format
  │     └─ Returns: { valid: ParsedUrl[], invalid: string[] }
  │
  ├─ 2. validateCache(figmaClient, fileKey)                 ← MOVED UP
  │     ├─ fetchFigmaFileMetadata(figmaClient, fileKey)
  │     │     └─ API call: GET /v1/files/:key/meta
  │     │     └─ Returns: { lastTouchedAt: string }
  │     ├─ isCacheValid(fileKey, lastTouchedAt)
  │     │     └─ Compare stored timestamp vs current
  │     ├─ If stale: clearFigmaCache(fileKey)
  │     │     └─ Delete cache folder
  │     └─ Returns: { cachePath, wasInvalidated, fileMetadata }
  │
  ├─ 3. fetchFrameNodesFromUrls(urls, figmaClient, cacheValid)  ← NOW CACHE-AWARE
  │     ├─ If cacheValid AND cachedNodesExist(fileKey, nodeIds):
  │     │     └─ loadCachedNodes(fileKey, nodeIds)
  │     │     └─ Returns cached node data (no API call)
  │     ├─ Else:
  │     │     ├─ groupUrlsByFileKey(parsedUrls)
  │     │     ├─ fetchFigmaNodesBatch(figmaClient, fileKey, nodeIds)
  │     │     │     └─ Single API call: GET /v1/files/:key/nodes?ids=...
  │     │     │     └─ Returns full node data WITH children
  │     │     ├─ saveNodesToCache(fileKey, nodesDataMap)        ← NEW: CACHE NODES
  │     │     │     └─ Write to cache/figma-files/:key/.nodes-cache.json
  │     │     └─ Returns: { figmaFileKey, parsedUrls, nodesDataMap, errors }
  │
  ├─ 4. expandNodes(nodesDataMap)
  │     ├─ For each node in map:
  │     │     └─ expandNode(nodeData)
  │     │           ├─ FRAME → return as-is
  │     │           ├─ CANVAS → collect first-level FRAME children
  │     │           ├─ SECTION → collect FRAME children with section context
  │     │           └─ Extract "Note" INSTANCE nodes as sticky notes
  │     └─ Returns: { frames: FigmaNodeMetadata[], notes: FigmaNodeMetadata[] }
  │
  ├─ 5. downloadImages(figmaClient, fileKey, nodeIds, options)
  │     ├─ If cacheValid AND imagesCached(fileKey, nodeIds):
  │     │     └─ Load from cache/figma-files/:key/:filename.png
  │     ├─ Else:
  │     │     ├─ downloadFigmaImagesBatch(figmaClient, fileKey, nodeIds, options)
  │     │     │     ├─ API call: GET /v1/images/:key?ids=...
  │     │     │     └─ Fetch images from Figma CDN URLs
  │     │     └─ saveImageToCache(fileKey, nodeId, imageData)
  │     └─ Returns: { images: Map<nodeId, ImageData>, totalBytes }
  │
  ├─ 6. fetchAndAssociateAnnotations(figmaClient, fileKey, frames, notes, cacheMetadata)
  │     ├─ fetchCommentsForFile(figmaClient, fileKey)
  │     │     └─ API call: GET /v1/files/:key/comments  (always fetched)
  │     ├─ groupCommentsIntoThreads(comments)
  │     ├─ formatCommentsForContext(threads, frames)
  │     ├─ associateNotesWithFrames(frames, notes, maxDistance=500)
  │     ├─ checkCommentsForInvalidation(frames, cacheMetadata)     ← NEW
  │     │     ├─ For each frame with associated comments:
  │     │     │     └─ If any comment.created_at > cacheMetadata.cachedAt:
  │     │     │           └─ Mark frame for re-analysis
  │     │     └─ Returns: { invalidatedFrames: string[] }
  │     └─ Returns: { frames: AnalyzedFrame[], unassociatedNotes: string[], invalidatedFrames }
  │
  ├─ 7. analyzeFrames(inputs, generateText, options, invalidatedFrames)  ← UPDATED
  │     ├─ For each frame (parallel):
  │     │     ├─ If frame.nodeId in invalidatedFrames:
  │     │     │     └─ Skip cache, force re-analysis
  │     │     ├─ Else: Check cache: loadCachedAnalysis(fileKey, frame)
  │     │     ├─ If cache miss OR invalidated:
  │     │     │     ├─ generateSemanticXml(nodeData)
  │     │     │     ├─ generateScreenAnalysisPrompt(frame, image, xml, context)
  │     │     │     ├─ generateText(prompt)
  │     │     │     └─ saveAnalysisToCache(fileKey, frame, analysis)
  │     │     └─ Return { frame, success, cached, invalidatedByComment }
  │     └─ Returns: AnalysisResult[]
  │
  ├─ 8. calculateFrameOrder(frames)
  │     └─ Sort frames by position (Y primary, X secondary)
  │     └─ Assign order: 1, 2, 3, ...
  │
  └─ Return: FrameAnalysisResult { frames, figmaFileUrl }
```

## Changes Required

### 1. Reorder Steps in `analysis-orchestrator.ts`

Move `validateCache()` call before `fetchFrameNodesFromUrls()`.

### 2. Add Node Caching to `url-processor.ts`

```typescript
// New cache file structure
interface CachedNodesData {
  requestedNodeIds: string[];  // Original node IDs requested
  nodesDataMap: Record<string, FigmaNodeData>;  // Full node data with children
  cachedAt: string;  // ISO timestamp (for debugging)
}

// Cache location
// cache/figma-files/{fileKey}/.nodes-cache.json

export async function loadCachedNodes(
  fileKey: string, 
  nodeIds: string[]
): Promise<Record<string, FigmaNodeData> | null> {
  // Check if cache file exists
  // Verify all requested nodeIds are in cache
  // Return cached data or null if any are missing
}

export async function saveNodesToCache(
  fileKey: string,
  nodeIds: string[],
  nodesDataMap: Record<string, FigmaNodeData>
): Promise<void> {
  // Write to .nodes-cache.json
}
```

### 3. Update `fetchFrameNodesFromUrls()` Signature

```typescript
export async function fetchFrameNodesFromUrls(
  urls: string[],
  figmaClient: FigmaClient,
  options?: {
    cacheValid?: boolean;  // NEW: Skip API if cache is valid
  },
  deps?: UrlProcessorDeps
): Promise<FetchResult>
```

### 4. Update Cache Structure

```
cache/figma-files/{fileKey}/
├── .figma-metadata.json       # lastTouchedAt timestamp
├── .nodes-cache.json          # NEW: Cached node data with children
├── {frame-name}_nodeId.png    # Downloaded screen image
├── {frame-name}_nodeId.analysis.md   # AI-generated analysis
└── {frame-name}_nodeId.semantic.xml  # Debug: semantic XML (optional)
```

## API Call Optimization

### Before (Current)

| Scenario | API Calls |
|----------|-----------|
| Cold cache | `/nodes` + `/meta` + `/images` + `/comments` = 4 calls |
| Warm cache (file unchanged) | `/nodes` + `/meta` = 2 calls (images/analysis cached) |
| Warm cache (file changed) | `/nodes` + `/meta` + `/images` + `/comments` = 4 calls |

### After (Proposed)

| Scenario | API Calls |
|----------|-----------|
| Cold cache | `/meta` + `/nodes` + `/images` + `/comments` = 4 calls |
| Warm cache (file unchanged) | `/meta` = 1 call ✅ |
| Warm cache (file changed) | `/meta` + `/nodes` + `/images` + `/comments` = 4 calls |

**Savings:** When file is unchanged, we go from 2 API calls to 1.

## Comment-Triggered Analysis Invalidation

Comments can change independently of the file's `lastTouchedAt` timestamp. Since comments are used as context for screen analysis, we need to invalidate cached analyses when relevant comments change.

### The Problem

- Figma's `/meta` `lastTouchedAt` does NOT update when comments are added/edited
- Comments provide important context for screen analyses (e.g., designer notes like "This button should be blue")
- If a new comment is added to a frame, the cached analysis is stale

### Solution: Compare Comment Timestamps to Cache Time

Since we already fetch `/comments` on every run, we can detect new comments by comparing timestamps:

1. **During Step 6** (`fetchAndAssociateAnnotations`): After associating comments with frames
2. **For each frame**: Check if any associated comment has `created_at` > cached analysis timestamp
3. **If newer comments exist**: Delete that frame's `.analysis.md` file before Step 7

```typescript
// In annotation-associator.ts or new module

interface CommentInvalidationResult {
  invalidatedFrames: string[];  // Frame nodeIds whose analyses were invalidated
  reason: Map<string, string>;  // nodeId -> "new comment from 2026-01-27T10:30:00Z"
}

export function checkCommentsForInvalidation(
  frames: AnalyzedFrame[],
  cacheMetadata: { cachedAt: string }  // From .figma-metadata.json
): CommentInvalidationResult {
  const cachedAt = new Date(cacheMetadata.cachedAt);
  const invalidatedFrames: string[] = [];
  const reason = new Map<string, string>();
  
  for (const frame of frames) {
    for (const annotation of frame.annotations) {
      if (annotation.type === 'comment') {
        const commentDate = new Date(annotation.createdAt);
        if (commentDate > cachedAt) {
          invalidatedFrames.push(frame.nodeId);
          reason.set(frame.nodeId, `new comment from ${annotation.createdAt}`);
          break;  // One newer comment is enough to invalidate
        }
      }
    }
  }
  
  return { invalidatedFrames, reason };
}
```

### Updated Flow (Step 6)

```
├─ 6. fetchAndAssociateAnnotations(figmaClient, fileKey, frames, notes, cacheMetadata)
│     ├─ fetchCommentsForFile(figmaClient, fileKey)
│     │     └─ API call: GET /v1/files/:key/comments  (always fetched)
│     ├─ groupCommentsIntoThreads(comments)
│     ├─ formatCommentsForContext(threads, frames)
│     ├─ associateNotesWithFrames(frames, notes, maxDistance=500)
│     ├─ checkCommentsForInvalidation(frames, cacheMetadata)     ← NEW
│     │     ├─ For each frame with associated comments:
│     │     │     └─ If any comment.created_at > cacheMetadata.cachedAt:
│     │     │           └─ Delete frame's .analysis.md file
│     │     └─ Returns: { invalidatedFrames, reason }
│     └─ Returns: { frames: AnalyzedFrame[], unassociatedNotes: string[], invalidatedFrames }
```

### Cache Metadata Update

```typescript
// .figma-metadata.json
interface CacheMetadata {
  lastTouchedAt: string;   // Figma file timestamp (existing)
  cachedAt: string;        // When we last ran analysis (NEW - for comment comparison)
}
```

### Logging

```
  💬 Checking comments for cache invalidation...
     Frame "login-screen_1234-5678": new comment from 2026-01-27T10:30:00Z
     🗑️  Invalidated 1 frame analysis (will re-analyze)
```

### Edge Cases

1. **Comment replies**: Use the reply's `created_at`, not the parent thread date
2. **Edited comments**: Figma doesn't expose edit timestamps, so edits won't trigger re-analysis (acceptable limitation)
3. **Deleted comments**: Won't trigger invalidation (comment no longer exists to check)

## Implementation Notes

1. **Node ID Matching**: The cache must track which node IDs were requested. If a new URL requests a different node ID, we need to fetch it.

2. **Partial Cache Hits**: If cache has some but not all requested nodes, we could:
   - Option A: Fetch all nodes fresh (simpler)
   - Option B: Fetch only missing nodes (more complex, saves API quota)
   
   Recommend Option A for initial implementation.

3. **Cache Invalidation**: When `lastTouchedAt` changes, the entire cache folder is deleted (existing behavior), so node cache is automatically invalidated.

4. **Error Handling**: If cached nodes fail to parse, fall back to fresh fetch.

## Testing

1. **Unit tests for new cache functions**:
   - `loadCachedNodes()` - returns data when valid, null when missing
   - `saveNodesToCache()` - writes correct format

2. **Integration tests**:
   - Cold cache: verify `/nodes` is called
   - Warm cache (unchanged): verify `/nodes` is NOT called
   - Warm cache (changed): verify `/nodes` IS called after cache clear

3. **Update existing tests**:
   - Mock `validateCache` to run before `fetchFrameNodesFromUrls`
   - Verify step order in orchestrator tests
