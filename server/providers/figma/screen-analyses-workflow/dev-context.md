# Screen Analyses Workflow

Consolidated Figma screen analysis workflow that transforms Figma URLs into AI-documented frames with annotations.

## Main Entry Point: `analyzeScreens()`

```typescript
import { analyzeScreens } from './screen-analyses-workflow';

const result = await analyzeScreens(
  ['https://figma.com/file/abc/Test?node-id=1:2'],
  figmaClient,
  generateText
);

for (const frame of result.frames) {
  console.log(`${frame.name}: ${frame.analysis}`);
}
```

## Execution Flow

```
analyzeScreens(urls, figmaClient, generateText, options)
  │
  ├─ 1. parseFigmaUrls(urls)
  │     └─ Extract fileKey and nodeId from each URL
  │     └─ Validate URL format
  │     └─ Returns: { valid: ParsedUrl[], invalid: string[] }
  │
  ├─ 2. validateCache(figmaClient, fileKey)                 ← CACHE CHECK FIRST
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
  │     │     ├─ saveNodesToCache(fileKey, nodesDataMap)
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
  ├─ 6. fetchAndAssociateAnnotations(figmaClient, fileKey, frames, notes)
  │     ├─ fetchCommentsForFile(figmaClient, fileKey)
  │     │     └─ API call: GET /v1/files/:key/comments
  │     ├─ groupCommentsIntoThreads(comments)
  │     │     └─ Group replies under parent comments
  │     ├─ formatCommentsForContext(threads, frames)
  │     │     └─ Spatially match comments to frames
  │     ├─ associateNotesWithFrames(frames, notes, maxDistance=500)
  │     │     ├─ calculateRectangleDistance(frame, note)
  │     │     └─ Assign each note to closest frame within threshold
  │     └─ Returns: { frames: AnalyzedFrame[], unassociatedNotes: string[] }
  │
  ├─ 6.5. checkCommentsForInvalidation(frames, cacheMetadata)     ← NEW
  │     ├─ For each frame with associated comments:
  │     │     └─ If any comment.created_at > cacheMetadata.cachedAt:
  │     │           └─ Mark frame for re-analysis
  │     └─ Returns: { invalidatedFrames: string[] }
  │
  ├─ 7. analyzeFrames(inputs, generateText, options)
  │     ├─ For each frame (parallel):
  │     │     ├─ Check if frame invalidated by new comments
  │     │     ├─ If not invalidated: Check cache: loadCachedAnalysis(fileKey, frame)
  │     │     │     └─ Read from cache/figma-files/:key/:filename.analysis.md
  │     │     ├─ If cache miss OR invalidated:
  │     │     │     ├─ generateSemanticXml(nodeData)
  │     │     │     │     └─ Build XML representation of Figma component tree
  │     │     │     ├─ generateScreenAnalysisPrompt(frame, image, xml, context)
  │     │     │     │     └─ Build LLM prompt with image and metadata
  │     │     │     ├─ generateText(prompt)
  │     │     │     │     └─ LLM call with vision capability
  │     │     │     └─ saveAnalysisToCache(fileKey, frame, analysis)
  │     │     └─ Return { frame, success, cached }
  │     └─ Returns: AnalysisResult[]
  │
  ├─ 8. calculateFrameOrder(frames)
  │     └─ Sort frames by position (Y primary, X secondary)
  │     └─ Assign order: 1, 2, 3, ...
  │
  └─ Return: FrameAnalysisResult { frames, figmaFileUrl }
```

## Modules

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| `types.ts` | Core type definitions | `AnalyzedFrame`, `FrameAnnotation`, `FrameAnalysisResult` |
| `url-processor.ts` | URL parsing and batching | `parseFigmaUrls`, `fetchFrameNodesFromUrls` |
| `frame-expander.ts` | Container expansion | `expandNode`, `expandNodes` |
| `annotation-associator.ts` | Comment + note association | `fetchAndAssociateAnnotations`, `associateNotesWithFrames` |
| `cache-validator.ts` | Cache freshness checking | `validateCache`, `saveCacheMetadata` |
| `image-downloader.ts` | Batch image downloading | `downloadImages` |
| `screen-analyzer.ts` | AI analysis generation | `analyzeFrames`, `analyzeFrame` |
| `analysis-orchestrator.ts` | Main workflow entry | `analyzeScreens` |

## Key Types

```typescript
interface AnalyzedFrame {
  // Identity
  name: string;              // Sanitized kebab-case name
  nodeId: string;            // Figma node ID (e.g., "1234:5678")
  url: string;               // Full Figma URL to this frame
  
  // Annotations
  annotations: FrameAnnotation[];  // Comments + sticky notes
  
  // Analysis
  analysis?: string;         // AI-generated documentation
  cached?: boolean;          // True if loaded from cache
  
  // Hierarchy context
  frameName?: string;        // Original Figma frame name
  sectionName?: string;      // Parent SECTION name
  sectionId?: string;        // Parent SECTION node ID
  
  // Positioning
  position?: { x, y, width, height };
  order?: number;            // Calculated order index
  
  // Cache
  cacheFilename?: string;    // Cache filename without extension
}

interface FrameAnalysisResult {
  frames: AnalyzedFrame[];
  figmaFileUrl: string;
}
```

## Helper Functions

For deriving statistics from results (callers use as needed):

```typescript
import { 
  countAnalyzedFrames,   // Frames where cached === false
  countCachedFrames,     // Frames where cached === true
  countTotalAnnotations, // Sum of all annotations
  formatFramePosition,   // "3 of 7" string
} from './screen-analyses-workflow';
```

## Dependency Injection

All modules accept optional dependency overrides for testing:

```typescript
// Production - uses real implementations
const result = await analyzeScreens(urls, client, generateText);

// Testing - inject mocks
const result = await analyzeScreens(
  urls, 
  mockClient, 
  mockGenerateText,
  {},
  {
    validateCache: jest.fn().mockResolvedValue({ wasInvalidated: false }),
    downloadImages: jest.fn().mockResolvedValue({ images: new Map() }),
  }
);
```

## Cache Structure

```
cache/figma-files/{fileKey}/
├── .figma-metadata.json      # lastTouchedAt + cachedAt timestamps
├── .nodes-cache.json         # Cached node data with children
├── {frame-name}_nodeId.png   # Downloaded screen image
├── {frame-name}_nodeId.analysis.md  # AI-generated analysis
└── {frame-name}_nodeId.semantic.xml # Debug: semantic XML (optional)
```

## API Calls Made

| Step | Endpoint | Purpose |
|------|----------|---------|
| 2 | `GET /v1/files/:key/meta` | Check file lastTouchedAt for cache (runs FIRST) |
| 3 | `GET /v1/files/:key/nodes?ids=...` | Fetch node metadata with children (skipped if cached) |
| 5 | `GET /v1/images/:key?ids=...` | Get image render URLs (skipped if cached) |
| 6 | `GET /v1/files/:key/comments` | Fetch all comment threads (always fetched) |

## Design Decisions

1. **Single File Key**: Current implementation assumes all URLs are from the same Figma file. Multi-file support planned for spec 048.

2. **Batching**: All API calls are batched per file to minimize request count.

3. **Meta-First Cache Validation** (Spec 049): Cache validation happens BEFORE fetching nodes. This optimization reduces unnecessary API calls when the file hasn't changed.

4. **Node Data Caching** (Spec 049): Node metadata is cached in `.nodes-cache.json`. When the file is unchanged, node data is loaded from cache instead of calling the Figma API.

5. **Comment-Triggered Invalidation** (Spec 049): New comments can invalidate cached analyses even when the file's `lastTouchedAt` hasn't changed. The workflow compares comment timestamps to the cache timestamp to detect this.

6. **Parallel Analysis**: Multiple frames are analyzed concurrently for faster processing.

7. **Semantic XML**: Full node data (with children) is fetched once and reused for both comment association and semantic XML generation.
