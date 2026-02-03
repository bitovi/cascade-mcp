# Spec 047: Figma Screen Analyses Workflow Module

## Overview

This spec defines how to create a consolidated `server/providers/figma/screen-analyses-workflow/` folder containing semantically organized, testable modules for the Figma screen analysis workflow. 

The goal is to:
1. Consolidate duplicated screen analysis code (from spec 045)
2. Organize modules by semantic responsibility
3. Enable easy unit testing via **dependency injection pattern** (no mocking frameworks needed)
4. Provide a single `index.ts` entry point for consumers

## Workflow Overview

The complete workflow transforms Figma URLs into AI-analyzed frames with annotations. Here's the execution flow:

### Entry Point: `analyzeFrames()`

The main orchestrator function that coordinates the entire workflow. It accepts either:
- **Raw Figma URLs** (will process internally), OR
- **Pre-processed frames** (skips to cache validation)

### Execution Flow (when starting from URLs)

```
analyzeFrames()
  ↓
  1. fetchFrameNodesFromUrls() - Phase 1: Get metadata
     ├─ parseFigmaUrl()              // Extract fileKey and nodeId from each URL
     ├─ convertNodeIdToApiFormat()   // Convert "123-456" to "123:456"
     └─ fetchFigmaNodesBatch()       // Batch API call per file for METADATA only
  ↓
  2. expandNodes()                   // Identify which frames need full data
     └─ getFramesAndNotesForNode()   // Collect frame IDs and note IDs from metadata
  ↓
  3. fetchFrameNodesFromUrls() - Phase 2: Load full frame data
     └─ fetchFigmaNodesBatch()       // Batch API call to get frames WITH children
                                     // This provides data for both comments AND semantic XML
  ↓
  4. fetchAndAssociateAnnotations()  // Associate comments and notes with frames
     ├─ fetchCommentsForFile()       // Fetch Figma comment threads
     ├─ groupCommentsIntoThreads()   // Group comments by parent/replies
     ├─ formatCommentsForContext()   // Spatially match comments to frames (needs full tree)
     └─ associateNotesWithFrames()   // Spatially match sticky notes to frames
  ↓
  5. validateCache()                 // Check if Figma file has been updated
     ├─ fetchFigmaFileMetadata()     // Get last modified timestamp from /meta
     ├─ isCacheValid()               // Compare timestamps
     └─ clearFigmaCache()            // Delete stale cache if needed
  ↓
  6. Check cached analyses            // Load existing analyses for frames
     └─ (File system reads)           // Check for .md files with frame analyses
  ↓
  7. downloadImages()                // Download images for uncached frames only
     └─ downloadFigmaImagesBatch()   // Single API call for all images
  ↓
  8. analyzeFrame()                    // AI analysis for each uncached frame (parallel)
     ├─ generateSemanticXml()          // Uses full node data from Phase 2 batch fetch
     ├─ generateScreenAnalysisPrompt() // Build prompt with image, XML, context
     └─ generateText()                 // LLM call with vision
  ↓
  9. Return FrameAnalysisResult        // Frames with analyses and metadata
```

### Key Design Decisions

1. **Two-Phase Fetching**: 
   - Phase 1: Fetch metadata for URL-specified nodes to discover frames
   - Phase 2: Batch fetch full frame data (with children) for semantic XML + comment association
2. **Batching**: API calls are batched per file (nodes, images, metadata) to minimize requests
3. **Caching**: Only re-analyze frames when Figma file timestamp changes
4. **Parallel Analysis**: Multiple frames can be analyzed concurrently (LLM allows it)
5. **Progressive Setup**: Each step builds on previous results, allowing mid-workflow entry
6. **Flexible Entry**: Can start with URLs (full workflow) or pre-processed frames (skip to cache check)

### Function Call Order (Typical Usage)

```typescript
// User provides URLs
const result = await analyzeFrames({
  generateText: llmClient,
  figmaClient: client,
  figmaUrls: ['https://figma.com/file/abc?node-id=123-456'],
// Internally calls (in order):
// 1. fetchFrameNodesFromUrls() Phase 1 → URL nodes metadata
// 2. expandNodes() → identify frame IDs
// 3. fetchFrameNodesFromUrls() Phase 2 → full frame data with children (for semantic XML + comments)
// 4. fetchAndAssociateAnnotations() → frames with comments + notes
// 5. validateCache() → cache status
// 6. Load cached analyses from disk
// 7. downloadImages() → images for uncached frames
// 8. analyzeFrame() × N → AI analyses (parallel, using full node data from Phase 2)
// 9. Save analyses to cache
// 10. Return result with all frames uncached frames
// 7. analyzeFrame() × N → AI analyses (parallel)
// 8. Save analyses to cache
// 9. Return result with all frames
```

## Related Specs

- [045-consolidate-screen-analyses.md](./045-consolidate-screen-analyses.md) - Identifies the duplication problem and proposes unified types
- [046-figma-workflow.md](./046-figma-workflow.md) - Documents the complete Figma workflow for reference

## Dependency Injection Pattern

### The Pattern

Instead of importing dependencies directly at module scope, functions accept optional dependency overrides with sensible defaults:

```typescript
// In url-processor.ts
import { fetchFigmaNode as defaultFetchFigmaNode } from '../figma-helpers.js';
import { parseFigmaUrl as defaultParseFigmaUrl } from '../figma-helpers.js';

export interface UrlProcessorDeps {
  fetchFigmaNode?: typeof defaultFetchFigmaNode;
  parseFigmaUrl?: typeof defaultParseFigmaUrl;
}

export async function processFigmaUrls(
  urls: string[],
  figmaClient: FigmaClient,
  {
    fetchFigmaNode = defaultFetchFigmaNode,
    parseFigmaUrl = defaultParseFigmaUrl,
  }: UrlProcessorDeps = {}
): Promise<ProcessedUrlsResult> {
  // Use injected functions instead of direct imports
  for (const url of urls) {
    const parsed = parseFigmaUrl(url);
    if (parsed) {
      const node = await fetchFigmaNode(figmaClient, parsed.fileKey, parsed.nodeId);
      // ...
    }
  }
}
```

### Testing Without Mocks

```typescript
// In url-processor.test.ts
import { processFigmaUrls } from './url-processor.js';

describe('processFigmaUrls', () => {
  it('should batch URLs by file key', async () => {
    const mockFetchFigmaNode = jest.fn().mockResolvedValue({
      id: '123:456',
      type: 'FRAME',
      name: 'Test Frame'
    });

    const result = await processFigmaUrls(
      ['https://figma.com/file/abc?node-id=123-456'],
      mockFigmaClient,
      { fetchFigmaNode: mockFetchFigmaNode }
    );

    expect(mockFetchFigmaNode).toHaveBeenCalledWith(
      mockFigmaClient,
      'abc',
      '123:456'
    );
  });
});
```

### Benefits

1. **No `jest.mock()` needed** - Tests are explicit about what's mocked
2. **Better TypeScript support** - Dependency types are checked at compile time
3. **Self-documenting** - Interface shows what dependencies a function needs
4. **Easier refactoring** - Changing dependencies is explicit
5. **Works in all test runners** - Not tied to Jest's module system

---

## Proposed Folder Structure

```
server/providers/figma/screen-analyses-workflow/
├── index.ts                        # Re-exports main functions and types
├── types.ts                        # Unified types (Screen, ScreenAnalysisResult, etc.)
├── url-processor.ts                # URL parsing, batching, metadata fetching
├── url-processor.test.ts
├── frame-expander.ts               # CANVAS/SECTION/FRAME expansion logic
├── frame-expander.test.ts
├── annotation-associator.ts        # Spatial association of comments + notes to frames
├── annotation-associator.test.ts
├── cache-validator.ts              # Recency check via /meta endpoint
├── cache-validator.test.ts
├── image-downloader.ts             # Batch image downloading
├── image-downloader.test.ts
├── screen-analyzer.ts              # AI analysis with semantic XML
├── screen-analyzer.test.ts
├── analysis-orchestrator.ts        # High-level orchestration (main entry point)
└── analysis-orchestrator.test.ts
```

---

## Module Specifications

### 1. `types.ts` - Unified Types

All types used across the screen analysis workflow:

```typescript
/**
 * An annotation associated with a Figma frame - either a sticky note
 * placed near the frame or a comment thread on the frame.
 */
export interface FrameAnnotation {
  content: string;        // The annotation text content
  type: 'note' | 'comment';
  author?: string;        // Who wrote it (comments have authors, notes may not)
  nodeId?: string;        // Figma node ID of the annotation itself
}

/**
 * A Figma frame that will be (or has been) analyzed by the AI.
 * 
 * Represents a single design artifact - typically a screen, component,
 * or state variant - that gets documented as part of the workflow.
 * 
 * Lifecycle:
 * 1. Created during URL processing with identity fields populated
 * 2. Annotations associated during spatial matching
 * 3. Analysis populated by AI (or loaded from cache)
 */
export interface AnalyzedFrame {
  // Identity (always present)
  name: string;           // Sanitized kebab-case name for caching/referencing
  nodeId: string;         // Figma node ID (e.g., "1234:5678")
  url: string;            // Full Figma URL to this frame
  
  // Annotations (populated during setup)
  annotations: FrameAnnotation[];  // Sticky notes and comments associated with this frame
  
  // Analysis (populated after AI analysis or cache load)
  analysis?: string;      // AI-generated documentation
  cached?: boolean;       // True if loaded from cache, false if freshly generated
  
  // Figma hierarchy context (optional, for enhanced analysis)
  frameName?: string;     // Original Figma frame name (before sanitization)
  sectionName?: string;   // Parent SECTION name (if frame is in a section)
  sectionId?: string;     // Parent SECTION node ID
  
  // Spatial positioning (optional, for ordering context)
  position?: {            // Bounding box from Figma absoluteBoundingBox
    x: number;            // X coordinate
    y: number;            // Y coordinate
    width: number;        // Width in pixels
    height: number;       // Height in pixels
  };
  order?: number;         // Calculated order index (top-to-bottom, left-to-right)
  
  // Internal (used by caching system)
  cacheKey?: string;      // Cache filename (e.g., "login-screen_1234-5678")
}

export interface FrameAnalysisResult {
  frames: AnalyzedFrame[];
  figmaFileUrl: string;   // Base URL to the Figma file
}

// Helper functions for deriving stats (not on the type - callers use as needed)
export function countAnalyzedFrames(frames: AnalyzedFrame[]): number {
  return frames.filter(f => f.cached === false).length;
}

export function countCachedFrames(frames: AnalyzedFrame[]): number {
  return frames.filter(f => f.cached === true).length;
}

export function countTotalAnnotations(frames: AnalyzedFrame[]): number {
  return frames.reduce((sum, f) => sum + f.annotations.length, 0);
}
```

**No dependencies** - Pure type definitions.

---
### 2. `url-processor.ts` - URL Processing

Handles URL parsing, validation, and two-phase batching by file key.

```typescript
import { 
  parseFigmaUrl as defaultParseFigmaUrl,
  convertNodeIdToApiFormat as defaultConvertNodeId,
  fetchFigmaNodesBatch as defaultFetchBatch
} from '../figma-helpers.js';
import type { FigmaClient } from '../figma-api-client.js';
import type { FigmaNodeMetadata } from '../figma-helpers.js';

export interface UrlProcessorDeps {
  parseFigmaUrl?: typeof defaultParseFigmaUrl;
  convertNodeIdToApiFormat?: typeof defaultConvertNodeId;
  fetchFigmaNodesBatch?: typeof defaultFetchBatch;
}

export interface ProcessedUrlsResult {
  figmaFileKey: string;
  framesAndNotes: Array<{ url: string; metadata: FigmaNodeMetadata[] }>;
  nodesDataMap: Map<string, any>;  // Full node data with children (from Phase 2)
}

export async function fetchFrameNodesFromUrls(
  urls: string[],
  figmaClient: FigmaClient,
  {
    parseFigmaUrl = defaultParseFigmaUrl,
    convertNodeIdToApiFormat = defaultConvertNodeId,
    fetchFigmaNodesBatch = defaultFetchBatch,
  }: UrlProcessorDeps = {}
): Promise<ProcessedUrlsResult> {
  // Implementation:
  // Phase 1: Batch fetch URL-specified nodes for metadata (CANVAS/SECTION/FRAME detection)
  // Phase 2: After expansion, batch fetch discovered frame IDs WITH children
  // This gives us full node structure for both semantic XML and comment association
}
```

**Dependencies injected:** `parseFigmaUrl`, `convertNodeIdToApiFormat`, `fetchFigmaNodesBatch`

**Key Pattern:** Two-phase fetching strategy
1. **Phase 1 (Metadata)**: Fetch nodes specified in URLs to explore structure (CANVAS/SECTION/FRAME)
2. **Phase 2 (Full Data)**: After identifying actual frames, batch fetch those frames WITH their children
   - Provides complete component tree for semantic XML generation
   - Provides spatial data for comment/note association
**Dependencies injected:** `parseFigmaUrl`, `convertNodeIdToApiFormat`, `fetchFigmaNodesBatch`

---

### 3. `frame-expander.ts` - Frame Expansion

Expands CANVAS/SECTION nodes to individual frames and extracts notes.

```typescript
import { getFramesAndNotesForNode as defaultGetFramesAndNotes } from '../figma-helpers.js';
import type { FigmaNodeMetadata } from '../figma-helpers.js';

export interface FrameExpanderDeps {
  getFramesAndNotesForNode?: typeof defaultGetFramesAndNotes;
}

export interface ExpandedFrames {
  frames: FigmaNodeMetadata[];
  notes: FigmaNodeMetadata[];
}

export function expandNodes(
  nodeData: any,
  nodeId: string,
  { getFramesAndNotesForNode = defaultGetFramesAndNotes }: FrameExpanderDeps = {}
): ExpandedFrames {
  // Implementation: expand CANVAS/SECTION/FRAME, collect notes
}
```

**Dependencies injected:** `getFramesAndNotesForNode`

---

### 4. `annotation-associator.ts` - Annotation Association

Fetches Figma comments and associates both comments and sticky notes with frames based on spatial proximity.

```typescript
import { 
  fetchCommentsForFile as defaultFetchComments,
  groupCommentsIntoThreads as defaultGroupComments,
  formatCommentsForContext as defaultFormatComments
} from '../tools/figma-review-design/figma-comment-utils.js';
import type { FigmaClient } from '../figma-api-client.js';
import type { FigmaNodeMetadata } from '../figma-helpers.js';
import type { AnalyzedFrame, FrameAnnotation } from './types.js';

export interface AnnotationAssociatorDeps {
  fetchCommentsForFile?: typeof defaultFetchComments;
  groupCommentsIntoThreads?: typeof defaultGroupComments;
  formatCommentsForContext?: typeof defaultFormatComments;
}

export interface AnnotationResult {
  frames: AnalyzedFrame[];  // Frames with both comments and notes
  unassociatedNotes: string[];
}

export async function fetchAndAssociateAnnotations(
  figmaClient: FigmaClient,
  fileKey: string,
  frames: FigmaNodeMetadata[],
  notes: FigmaNodeMetadata[],
  baseUrl: string,
  {
    fetchCommentsForFile = defaultFetchComments,
    groupCommentsIntoThreads = defaultGroupComments,
    formatCommentsForContext = defaultFormatComments,
  }: AnnotationAssociatorDeps = {}
): Promise<AnnotationResult> {
  // Implementation:
  // 1. Fetch Figma comments for the file
  // 2. Group comments into threads
  // 3. Associate comments with frames spatially
  // 4. Associate notes with frames spatially
  // 5. Merge both into FrameAnnotation[] on each frame
}

// Pure helper functions - easily unit tested
export function associateNotesWithFrames(
  frames: FigmaNodeMetadata[],
  notes: FigmaNodeMetadata[],
  baseUrl: string,
  maxDistance: number = 500
): { frames: AnalyzedFrame[]; unassociatedNotes: string[] } {
  // Implementation: spatial matching algorithm for notes
}

export function calculateRectangleDistance(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): number {
  // Implementation
}
```

**Dependencies injected:** `fetchCommentsForFile`, `groupCommentsIntoThreads`, `formatCommentsForContext`

---

### 5. `cache-validator.ts` - Cache Validation

Validates cache freshness via Figma's `/meta` endpoint.

```typescript
import { fetchFigmaFileMetadata as defaultFetchMetadata } from '../figma-helpers.js';
import { 
  getFigmaFileCachePath as defaultGetCachePath,
  isCacheValid as defaultIsCacheValid,
  clearFigmaCache as defaultClearCache,
  saveFigmaMetadata as defaultSaveMetadata
} from '../figma-cache.js';
import type { FigmaClient } from '../figma-api-client.js';

export interface CacheValidatorDeps {
  fetchFigmaFileMetadata?: typeof defaultFetchMetadata;
  getFigmaFileCachePath?: typeof defaultGetCachePath;
  isCacheValid?: typeof defaultIsCacheValid;
  clearFigmaCache?: typeof defaultClearCache;
  saveFigmaMetadata?: typeof defaultSaveMetadata;
}

export interface CacheValidationResult {
  cachePath: string;
  wasInvalidated: boolean;
  lastTouchedAt: string;
}

export async function validateCache(
  figmaClient: FigmaClient,
  fileKey: string,
  {
    fetchFigmaFileMetadata = defaultFetchMetadata,
    getFigmaFileCachePath = defaultGetCachePath,
    isCacheValid = defaultIsCacheValid,
    clearFigmaCache = defaultClearCache,
  }: CacheValidatorDeps = {}
): Promise<CacheValidationResult> {
  // Implementation: check /meta, invalidate if stale
}
```

**Dependencies injected:** `fetchFigmaFileMetadata`, `getFigmaFileCachePath`, `isCacheValid`, `clearFigmaCache`

---

### 6. `image-downloader.ts` - Image Downloading

Batch downloads frame images from Figma CDN.

```typescript
import { downloadFigmaImagesBatch as defaultDownloadBatch } from '../figma-helpers.js';
import type { FigmaClient } from '../figma-api-client.js';

export interface ImageDownloaderDeps {
  downloadFigmaImagesBatch?: typeof defaultDownloadBatch;
}

export interface DownloadedImage {
  nodeId: string;
  base64Data: string;
  mimeType: string;
}

export async function downloadImages(
  figmaClient: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  { downloadFigmaImagesBatch = defaultDownloadBatch }: ImageDownloaderDeps = {}
): Promise<Map<string, DownloadedImage>> {
  // Implementation: batch download, return map
}
```

**Dependencies injected:** `downloadFigmaImagesBatch`

---

### 7. `screen-analyzer.ts` - AI Screen Analysis

Analyzes individual screens with LLM, including semantic XML generation.

```typescript
import { generateSemanticXml as defaultGenerateXml } from '../semantic-xml-generator.js';
import { 
  generateScreenAnalysisPrompt as defaultGeneratePrompt,
  SCREEN_ANALYSIS_SYSTEM_PROMPT,
  SCREEN_ANALYSIS_MAX_TOKENS
} from '../../combined/tools/writing-shell-stories/prompt-screen-analysis.js';
import type { GenerateTextFn } from '../../../llm-client/types.js';
import type { AnalyzedFrame } from './types.js';

export interface FrameAnalyzerDeps {
  generateSemanticXml?: typeof defaultGenerateXml;
  generateScreenAnalysisPrompt?: typeof defaultGeneratePrompt;
}

export interface AnalyzeFrameParams {
  frame: AnalyzedFrame;
  imageData: { base64Data: string; mimeType: string };
  nodeData?: any;  // For semantic XML generation
  epicContext?: string;
  framePosition: string;  // e.g., "3 of 7"
}

export async function analyzeFrame(
  generateText: GenerateTextFn,
  params: AnalyzeFrameParams,
  {
    generateSemanticXml = defaultGenerateXml,
    generateScreenAnalysisPrompt = defaultGeneratePrompt,
  }: FrameAnalyzerDeps = {}
): Promise<string> {
  // Implementation: generate prompt, call LLM, return analysis
}
```

**Dependencies injected:** `generateSemanticXml`, `generateScreenAnalysisPrompt`

---

### 8. `analysis-orchestrator.ts` - Main Entry Point

Orchestrates the complete screen analysis workflow.

```typescript
import { fetchFrameNodesFromUrls as defaultFetchFrameNodesFromUrls } from './url-processor.js';
import { expandNodes as defaultExpandNodes } from './frame-expander.js';
import { fetchAndAssociateAnnotations as defaultAssociateAnnotations } from './annotation-associator.js';
import { validateCache as defaultValidateCache } from './cache-validator.js';
import { downloadImages as defaultDownloadImages } from './image-downloader.js';
import { analyzeScreen as defaultAnalyzeScreen } from './screen-analyzer.js';
import type { FigmaClient } from '../figma-api-client.js';
import type { GenerateTextFn } from '../../../llm-client/types.js';
import type { AnalyzedFrame, FrameAnalysisResult } from './types.js';

export interface OrchestratorDeps {
  fetchFrameNodesFromUrls?: typeof defaultFetchFrameNodesFromUrls;
  expandNodes?: typeof defaultExpandNodes;
  fetchAndAssociateAnnotations?: typeof defaultAssociateAnnotations;
  validateCache?: typeof defaultValidateCache;
  downloadImages?: typeof defaultDownloadImages;
  analyzeFrame?: typeof defaultAnalyzeFrame;
}

export interface AnalyzeFramesParams {
  // Required
  generateText: GenerateTextFn;
  figmaClient: FigmaClient;
  
  // Input - ONE of these required
  figmaUrls?: string[];   // Raw URLs (will process internally)
  frames?: AnalyzedFrame[];  // Pre-processed frames
  figmaFileKey?: string;  // Required if frames provided
  
  // Optional metadata (required if screens provided)
  allFrames?: FigmaNodeMetadata[];
  allNotes?: FigmaNodeMetadata[];
  nodesDataMap?: Map<string, any>;
  
  // Optional context
  epicContext?: string;
  notify?: (message: string) => Promise<void>;
}

export async function analyzeFrames(
  params: AnalyzeFramesParams,
  {
    fetchFrameNodesFromUrls = defaultFetchFrameNodesFromUrls,
    expandNodes = defaultExpandNodes,
    fetchAndAssociateAnnotations = defaultAssociateAnnotations,
    validateCache = defaultValidateCache,
    downloadImages = defaultDownloadImages,
    analyzeFrame = defaultAnalyzeFrame,
  }: OrchestratorDeps = {}
): Promise<FrameAnalysisResult> {
  // Step 1: Process URLs if needed
  // Step 2: Validate cache
  // Step 3: Check which frames need analysis
  // Step 4: Download images for uncached frames
  // Step 5: Analyze each frame
  // Step 6: Return results with stats
}
```

**Dependencies injected:** All sub-modules

---

### 9. `index.ts` - Public API

```typescript
// Types
export type { 
  AnalyzedFrame, 
  FrameAnalysisResult, 
  FrameAnnotation 
} from './types.js';

// Stat helpers (derive from frames as needed)
export {
  countAnalyzedFrames,
  countCachedFrames,
  countTotalAnnotations
} from './types.js';

// Main entry point
export { 
  analyzeFrames,
  type AnalyzeFramesParams,
  type OrchestratorDeps
} from './analysis-orchestrator.js';

// Individual modules (for advanced use or testing)
export { fetchFrameNodesFromUrls, type UrlProcessorDeps } from './url-processor.js';
export { expandNodes, type FrameExpanderDeps } from './frame-expander.js';
export { 
  fetchAndAssociateAnnotations,
  associateNotesWithFrames,
  calculateRectangleDistance,
  type AnnotationAssociatorDeps
} from './annotation-associator.js';
export { validateCache, type CacheValidatorDeps } from './cache-validator.js';
export { downloadImages, type ImageDownloaderDeps } from './image-downloader.js';
export { analyzeFrame, type FrameAnalyzerDeps } from './screen-analyzer.js';
```

---

## Implementation Plan

### Step 1: Create Folder and Types

**Task:** Create `screen-analyses-workflow/` folder with `types.ts` and `index.ts`

**Files:**
- `server/providers/figma/screen-analyses-workflow/types.ts`
- `server/providers/figma/screen-analyses-workflow/index.ts`

**Verification:**
- TypeScript compiles
- Types are importable from `index.ts`

---

### Step 2: Migrate `annotation-associator.ts` (Comments + Notes)

**Task:** Combine comment fetching/association with note association logic

**Why first:** Core context-gathering step that other modules depend on

**Files:**
- `server/providers/figma/screen-analyses-workflow/annotation-associator.ts`
- `server/providers/figma/screen-analyses-workflow/annotation-associator.test.ts`

**Tests:**
```typescript
describe('calculateRectangleDistance', () => {
  it('should return 0 for overlapping rectangles', () => {
    const result = calculateRectangleDistance(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 50, width: 100, height: 100 }
    );
    expect(result).toBe(0);
  });

  it('should calculate edge-to-edge distance', () => {
    const result = calculateRectangleDistance(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 0, width: 100, height: 100 }
    );
    expect(result).toBe(100);
  });
});

describe('fetchAndAssociateAnnotations', () => {
  it('should fetch comments and associate with frames', async () => {
    const mockFetchComments = jest.fn().mockResolvedValue([
      { id: 'c1', message: 'Comment 1', client_meta: { node_id: 'frame1' } },
    ]);
    const mockGroupComments = jest.fn().mockReturnValue([{ id: 'c1', message: 'Comment 1' }]);
    const mockFormatComments = jest.fn().mockReturnValue({
      contexts: [{ screenName: 'Frame 1', markdown: 'Comment 1' }],
      matchedThreadCount: 1
    });

    const frames = [
      { id: 'frame1', name: 'Frame 1', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 } },
    ];
    const notes = [
      { id: 'note1', name: 'Note', absoluteBoundingBox: { x: 50, y: 110, width: 20, height: 20 } },
    ];

    const result = await fetchAndAssociateAnnotations(
      mockFigmaClient,
      'fileKey',
      frames,
      notes,
      'https://figma.com/file/abc',
      {
        fetchCommentsForFile: mockFetchComments,
        groupCommentsIntoThreads: mockGroupComments,
        formatCommentsForContext: mockFormatComments,
      }
    );
    
    expect(mockFetchComments).toHaveBeenCalledWith(mockFigmaClient, 'fileKey');
    expect(result.frames[0].annotations).toHaveLength(2); // 1 comment + 1 note
    expect(result.frames[0].annotations[0].type).toBe('comment');
    expect(result.frames[0].annotations[1].type).toBe('note');
  });
});

describe('associateNotesWithFrames', () => {
  it('should associate notes with closest frame', () => {
    const frames = [
      { id: 'frame1', name: 'Frame 1', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 } },
      { id: 'frame2', name: 'Frame 2', absoluteBoundingBox: { x: 200, y: 0, width: 100, height: 100 } },
    ];
    const notes = [
      { id: 'note1', name: 'Note', absoluteBoundingBox: { x: 50, y: 110, width: 20, height: 20 } },
    ];

    const result = associateNotesWithFrames(frames, notes, 'https://figma.com/file/abc');
    
    expect(result.frames[0].annotations).toHaveLength(1);
    expect(result.unassociatedNotes).toHaveLength(0);
  });
});
```

**Verification:**
- `npm test -- --testPathPattern="annotation-associator"`
- All tests pass

---

### Step 3: Migrate `cache-validator.ts`

**Task:** Extract cache validation logic from `figma-cache.ts` and `screen-analysis-regenerator.ts`

**Files:**
- `server/providers/figma/screen-analyses-workflow/cache-validator.ts`
- `server/providers/figma/screen-analyses-workflow/cache-validator.test.ts`

**Tests:**
```typescript
describe('validateCache', () => {
  it('should invalidate cache when Figma file is newer', async () => {
    const mockFetchMetadata = jest.fn().mockResolvedValue({
      lastTouchedAt: '2026-01-26T15:00:00Z'
    });
    const mockIsCacheValid = jest.fn().mockResolvedValue(false);
    const mockClearCache = jest.fn().mockResolvedValue(undefined);

    const result = await validateCache(mockClient, 'abc123', {
      fetchFigmaFileMetadata: mockFetchMetadata,
      isCacheValid: mockIsCacheValid,
      clearFigmaCache: mockClearCache,
    });

    expect(result.wasInvalidated).toBe(true);
    expect(mockClearCache).toHaveBeenCalledWith('abc123');
  });

  it('should keep valid cache', async () => {
    const mockFetchMetadata = jest.fn().mockResolvedValue({
      lastTouchedAt: '2026-01-25T15:00:00Z'
    });
    const mockIsCacheValid = jest.fn().mockResolvedValue(true);

    const result = await validateCache(mockClient, 'abc123', {
      fetchFigmaFileMetadata: mockFetchMetadata,
      isCacheValid: mockIsCacheValid,
    });

    expect(result.wasInvalidated).toBe(false);
  });
});
```

**Verification:**
- `npm test -- --testPathPattern="cache-validator"`
- All tests pass

---

### Step 4: Migrate `url-processor.ts`

**Task:** Extract URL processing and batching logic from `figma-screen-setup.ts`

**Files:**
- `server/providers/figma/screen-analyses-workflow/url-processor.ts`
- `server/providers/figma/screen-analyses-workflow/url-processor.test.ts`

**Tests:**
```typescript
describe('fetchFrameNodesFromUrls', () => {
  it('should group URLs by file key for batching', async () => {
    const mockFetchBatch = jest.fn().mockResolvedValue(new Map([
      ['123:456', { id: '123:456', type: 'FRAME', name: 'Screen 1' }],
    ]));

    const result = await fetchFrameNodesFromUrls(
      [
        'https://figma.com/file/abc?node-id=123-456',
        'https://figma.com/file/abc?node-id=789-012',
      ],
      mockClient,
      { fetchFigmaNodesBatch: mockFetchBatch }
    );

    // Should make ONE batch call for same file key
    expect(mockFetchBatch).toHaveBeenCalledTimes(1);
    expect(mockFetchBatch).toHaveBeenCalledWith(
      mockClient, 
      'abc', 
      ['123:456', '789:012']
    );
  });

  it('should handle multiple file keys', async () => {
    const mockFetchBatch = jest.fn().mockResolvedValue(new Map());

    await fetchFrameNodesFromUrls(
      [
        'https://figma.com/file/abc?node-id=123-456',
        'https://figma.com/file/xyz?node-id=789-012',
      ],
      mockClient,
      { fetchFigmaNodesBatch: mockFetchBatch }
    );

    // Should make two batch calls (one per file key)
    expect(mockFetchBatch).toHaveBeenCalledTimes(2);
  });
});
```

**Verification:**
- `npm test -- --testPathPattern="url-processor"`
- All tests pass

---

### Step 5: Migrate `frame-expander.ts`

**Task:** Extract CANVAS/SECTION/FRAME expansion logic

**Files:**
- `server/providers/figma/screen-analyses-workflow/frame-expander.ts`
- `server/providers/figma/screen-analyses-workflow/frame-expander.test.ts`

**Tests:**
```typescript
describe('expandNodes', () => {
  it('should return single frame for FRAME node', () => {
    const nodeData = { id: '123:456', type: 'FRAME', name: 'Login Screen' };
    
    const result = expandNodes(nodeData, '123:456');
    
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].name).toBe('Login Screen');
  });

  it('should expand CANVAS to child frames', () => {
    const nodeData = {
      id: '0:1',
      type: 'CANVAS',
      name: 'Page 1',
      children: [
        { id: '1:1', type: 'FRAME', name: 'Screen A' },
        { id: '1:2', type: 'FRAME', name: 'Screen B' },
        { id: '1:3', type: 'INSTANCE', name: 'Note', children: [] },
      ],
    };
    
    const result = expandNodes(nodeData, '0:1');
    
    expect(result.frames).toHaveLength(2);
    expect(result.notes).toHaveLength(1);
  });

  it('should add section context for SECTION node', () => {
    const nodeData = {
      id: '2:1',
      type: 'SECTION',
      name: 'Login Flow',
      children: [
        { id: '2:2', type: 'FRAME', name: 'Login' },
      ],
    };
    
    const result = expandNodes(nodeData, '2:1');
    
    expect(result.frames[0].sectionName).toBe('Login Flow');
    expect(result.frames[0].sectionId).toBe('2:1');
  });
});
```

**Verification:**
- `npm test -- --testPathPattern="frame-expander"`
- All tests pass

---

### Step 6: Migrate `image-downloader.ts`

**Task:** Extract batch image downloading logic

**Files:**
- `server/providers/figma/screen-analyses-workflow/image-downloader.ts`
- `server/providers/figma/screen-analyses-workflow/image-downloader.test.ts`

**Tests:**
```typescript
describe('downloadImages', () => {
  it('should batch download images', async () => {
    const mockDownloadBatch = jest.fn().mockResolvedValue(
      new Map([
        ['123:456', { base64Data: 'abc123...', mimeType: 'image/png' }],
      ])
    );

    const result = await downloadImages(
      mockClient,
      'fileKey',
      ['123:456'],
      { downloadFigmaImagesBatch: mockDownloadBatch }
    );

    expect(result.get('123:456')).toBeDefined();
    expect(result.get('123:456')?.mimeType).toBe('image/png');
  });
});
```

**Verification:**
- `npm test -- --testPathPattern="image-downloader"`
- All tests pass

---

### Step 7: Migrate `screen-analyzer.ts`

**Task:** Extract AI analysis logic with semantic XML

**Files:**
- `server/providers/figma/screen-analyses-workflow/screen-analyzer.ts`
- `server/providers/figma/screen-analyses-workflow/screen-analyzer.test.ts`

**Tests:**
```typescript
describe('analyzeScreen', () => {
  it('should generate semantic XML when nodeData provided', async () => {
    const mockGenerateXml = jest.fn().mockReturnValue('<Screen>...</Screen>');
    const mockGeneratePrompt = jest.fn().mockReturnValue('Analyze this screen...');
    const mockGenerateText = jest.fn().mockResolvedValue({ text: '# Analysis...' });

    const result = await analyzeFrame(
      mockGenerateText,
      {
        frame: { name: 'login', nodeId: '123:456', url: 'https://...', annotations: [] },
        imageData: { base64Data: 'abc...', mimeType: 'image/png' },
        nodeData: { id: '123:456', type: 'FRAME', children: [] },
        framePosition: '1 of 3',
      },
      { generateSemanticXml: mockGenerateXml, generateScreenAnalysisPrompt: mockGeneratePrompt }
    );

    expect(mockGenerateXml).toHaveBeenCalled();
    expect(mockGeneratePrompt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      '<Screen>...</Screen>'  // Semantic XML passed to prompt
    );
  });

  it('should skip semantic XML when nodeData not provided', async () => {
    const mockGenerateXml = jest.fn();
    const mockGeneratePrompt = jest.fn().mockReturnValue('Analyze...');
    const mockGenerateText = jest.fn().mockResolvedValue({ text: '# Analysis' });

    await analyzeFrame(
      mockGenerateText,
      {
        frame: { name: 'login', nodeId: '123:456', url: 'https://...', annotations: [] },
        imageData: { base64Data: 'abc...', mimeType: 'image/png' },
        framePosition: '1 of 1',
      },
      { generateSemanticXml: mockGenerateXml, generateScreenAnalysisPrompt: mockGeneratePrompt }
    );

    expect(mockGenerateXml).not.toHaveBeenCalled();
  });
});
```

**Verification:**
- `npm test -- --testPathPattern="screen-analyzer"`
- All tests pass

---

### Step 8: Create `analysis-orchestrator.ts`

**Task:** Create main orchestration function that ties everything together

**Files:**
- `server/providers/figma/screen-analyses-workflow/analysis-orchestrator.ts`
- `server/providers/figma/screen-analyses-workflow/analysis-orchestrator.test.ts`

**Tests:**
```typescript
describe('analyzeFrames', () => {
  it('should process URLs when figmaUrls provided', async () => {
    const mockFetchFrameNodesFromUrls = jest.fn().mockResolvedValue({
      figmaFileKey: 'abc',
      framesAndNotes: [{ url: '...', metadata: [] }],
      nodesDataMap: new Map(),
    });
    const mockValidateCache = jest.fn().mockResolvedValue({ cachePath: '/cache', wasInvalidated: false });
    const mockDownloadImages = jest.fn().mockResolvedValue(new Map());
    const mockAnalyzeFrame = jest.fn().mockResolvedValue('# Analysis');

    const result = await analyzeFrames(
      {
        generateText: mockGenerateText,
        figmaClient: mockClient,
        figmaUrls: ['https://figma.com/file/abc?node-id=123-456'],
      },
      {
        fetchFrameNodesFromUrls: mockFetchFrameNodesFromUrls,
        validateCache: mockValidateCache,
        downloadImages: mockDownloadImages,
        analyzeFrame: mockAnalyzeFrame,
      }
    );

    expect(mockFetchFrameNodesFromUrls).toHaveBeenCalled();
    expect(result.frames).toBeDefined();
  };

  it('should use pre-processed frames when provided', async () => {
    const mockFetchFrameNodesFromUrls = jest.fn();
    const mockValidateCache = jest.fn().mockResolvedValue({ cachePath: '/cache', wasInvalidated: false });
    
    await analyzeFrames(
      {
        generateText: mockGenerateText,
        figmaClient: mockClient,
        frames: [{ name: 'login', nodeId: '123:456', url: '...', annotations: [] }],
        figmaFileKey: 'abc',
      },
      { fetchFrameNodesFromUrls: mockFetchFrameNodesFromUrls, validateCache: mockValidateCache }
    );

    // Should NOT call fetchFrameNodesFromUrls when frames provided
    expect(mockFetchFrameNodesFromUrls).not.toHaveBeenCalled();
  };

  it('should skip analysis for cached frames', async () => {
    const mockAnalyzeFrame = jest.fn();
    // Setup: frame already in cache
    
    await analyzeFrames(
      { /* ... */ },
      { analyzeFrame: mockAnalyzeFrame }
    );

    expect(mockAnalyzeFrame).not.toHaveBeenCalled();
  };
});
```

**Verification:**
- `npm test -- --testPathPattern="analysis-orchestrator"`
- All tests pass

---

### Step 9: Update Callers to Use New Module

**Task:** Migrate existing callers to use `analyzeFrames` from new module

**Files to modify:**
- `server/providers/combined/tools/writing-shell-stories/core-logic.ts`
- `server/providers/combined/tools/write-next-story/core-logic.ts`
- `server/providers/combined/tools/review-work-item/context-loader.ts`
- `server/providers/figma/tools/figma-review-design/core-logic.ts`

**Verification:**
- Run each tool manually against a test epic
- Confirm frame analysis still works
- Confirm caching still works
- Confirm notifications still appear

---

### Step 10: Remove Old Code

**Task:** Remove duplicated code from old locations

**Files to delete/modify:**
- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts` (delete or keep as re-export)
- `server/providers/combined/tools/writing-shell-stories/screen-analyzer.ts` (move to new location)
- Inline analysis loop in `context-loader.ts` (remove)

**Verification:**
- TypeScript compiles
- All tests pass
- `npm run build` succeeds

---

## Questions

1. Should we keep `screen-analysis-regenerator.ts` as a thin re-export for backward compatibility, or update all imports immediately?

2. The current `context-loader.ts` handles multiple Figma file keys. Should `analyzeScreens` support this natively, or should callers loop?

3. ~~Should comment fetching be part of this module?~~ **RESOLVED**: Yes, comments are now integrated via `annotation-associator.ts` which fetches and associates both comments and sticky notes.

4. The dependency injection pattern adds verbosity. Should we create a `createAnalyzer(deps)` factory for frequently-used dependency sets in tests?

---

## Spec Gaps

The following features from the existing figma-workflow (spec 046) are **not covered** in this consolidation spec. These may need to be addressed separately or explicitly marked as out-of-scope:

### 1. Note Text File Storage

**Gap:** The spec doesn't include saving notes to `.notes.md` files alongside analysis files.

**From 046:**
- `writeNotesForScreen(screen, allNotes, cachePath)` writes `{screen-name}.notes.md` files
- `notesToScreenAnnotations(screens, allNotes)` converts notes to `ScreenAnnotation[]` format

**Impact:** Notes are converted to `FrameAnnotation[]` in memory but not persisted as separate files for later reference.

**Recommendation:** Out of scope - notes are already captured in the `AnalyzedFrame.annotations` array. File persistence is a caching detail that can remain in caller-specific logic.

---

### 2. Multiple File Key Support

**Gap:** `ProcessedUrlsResult` returns a single `figmaFileKey: string`, but existing tools handle URLs from multiple Figma files.

**From 046:**
- `context-loader.ts` processes multiple file keys, batching per file
- Epic descriptions often contain URLs from different Figma files

**Current design:** `processUrls()` assumes all URLs are from the same file.

**Impact:** Workflow won't handle cross-file scenarios without caller looping.

**Recommendation:** **In scope** - `fetchFrameNodesFromUrls()` should return `Map<string, ProcessedUrlData>` keyed by fileKey, and `analyzeFrames()` should loop internally.

---

### 4. Screen Ordering Context

**Gap:** Existing tools generate `screens.yaml` to provide screen ordering context to LLMs.

**From 046:**
- `write-shell-stories` generates `screens.yaml` with frame metadata and ordering description
- LLM uses this for screen naming and understanding flow (top-to-bottom, left-to-right)
- Functions: `generateScreensYaml(screens, unassociatedNotes)`, `generateScreenFilename(frameName, nodeId)`

**Solution:** `AnalyzedFrame` type includes `position` and `order` fields derived from Figma's `absoluteBoundingBox`. Callers can:
- Use `order` field for sequential numbering ("Screen 1 of 5")
- Use `position` data to generate any format they need (YAML, markdown list, prose description)
- Sort frames using existing algorithm: Y primary (top-to-bottom with 50px tolerance), X secondary (left-to-right)

**Recommendation:** In scope - Add `position` and `order` fields to `AnalyzedFrame`. Keep YAML generation as caller-specific formatting (tool layer responsibility).

---

### 5. Progress Notifications

**Gap:** `notify` parameter exists in `AnalyzeFramesParams` but isn't threaded through all modules.

**From 046:** Various phases log progress messages for user visibility.

**Impact:** Users won't see progress during long-running operations.

**Recommendation:** **In scope** - Thread `notify?: (message: string) => Promise<void>` through module interfaces and call at key workflow steps.

---

### 6. Cache File Writing

**Gap:** Spec mentions "Save analyses to cache" but doesn't specify which module handles file writing.

**From 046:** `regenerateScreenAnalyses()` saves `.analysis.md` files to disk.

**Impact:** Analyses generated but not persisted.

**Recommendation:** **In scope** - `screen-analyzer.ts` should write analysis files after generation. Add `saveAnalysisToCache(frame, cachePath)` helper function.

---

### 7. Document Tree for Comment Matching

**Gap:** `formatCommentsForContext()` requires a `documentTree` parameter for child node traversal.

**From 046:** Comment spatial matching uses document tree to find comments on child nodes.

**In spec:** `annotation-associator` signature doesn't show document tree handling.

**Impact:** Comments on child nodes won't be matched correctly.

**Recommendation:** **In scope** - `fetchAndAssociateAnnotations()` should fetch ancestor chains for comment target nodes. **Optimization opportunity:** Use `GET /v1/files/:key?ids=node1,node2,...` which returns "everything between the root node and the listed nodes" (ancestor chains) instead of fetching the entire file tree. This is more efficient than `fetchFigmaFile()` when comments reference only a few child nodes. Only fall back to full tree if needed for other reasons.

---

### 8. Full File Structure Fetching

**Gap:** `figma-review-design` calls `fetchFigmaFile()` for complete file structure.

**From 046:** Used for document tree and file-level validation.

**Impact:** Comment matching and validation won't work properly.

**Recommendation:** **In scope** - Add to `annotation-associator.ts` dependencies.

---

### 9. Batch URL Validation

**Gap:** Only singular `parseFigmaUrl()` mentioned, not `parseFigmaUrls()` (plural).

**From 046:** `figma-review-design` uses batch validation from `url-parser.ts`.

**Impact:** Won't catch invalid URLs early in batch operations.

**Recommendation:** **In scope** - Add `parseFigmaUrls()` to `url-processor.ts` for upfront validation.

---

### 10. Question Generation & Posting

**Gap:** No mention of `postQuestionsToFigma()` or question generation.

**From 046:** `figma-review-design` generates and posts questions as comments.

**Functions:** `generateFigmaQuestionsPrompt()`, `parseFigmaQuestions()`, `postQuestionsToFigma()`

**Impact:** Workflow is analysis-only, doesn't support review-design's question posting.

**Recommendation:** Out of scope - Question generation/posting is tool-specific behavior. The consolidated workflow provides frame analyses that `figma-review-design` can use to generate questions separately.

---

### 11. Cache Metadata Saving

**Gap:** `saveFigmaMetadata()` listed in deps but usage not clear.

**From 046:** Called after successful analysis to store `lastTouchedAt` timestamp in `.figma-metadata.json`.

**Impact:** Cache timestamps won't be updated after fresh analyses.

**Recommendation:** **In scope** - `cache-validator.ts` should call `saveFigmaMetadata()` after successful analysis completion (in orchestrator).

**Current implementation:** The workflow uses a two-phase fetching strategy:
1. **Phase 1**: Fetch metadata for URL-specified nodes to discover frames (CANVAS/SECTION expansion)
2. **Phase 2**: Batch fetch the discovered frames WITH children using `GET /v1/files/:key/nodes?ids=...`
   - This endpoint returns complete node structure including all children
   - Same data serves both semantic XML generation AND comment association
   - Stored in `nodesDataMap` for use by `generateSemanticXml()` during analysis

This is confirmed by existing code:
- `fetchFigmaNodesBatch()` returns `Map<string, any>` where each value has `.children` property
- Code recursively searches `node.children` to find nested frames (see `figma-screen-setup.ts` lines 138-145)
- `generateSemanticXml()` accesses `nodeData.children` to traverse component tree (see `semantic-xml-generator.ts` line 32)

**Recommendation:** **In scope** - Add size check and truncation to `screen-analyzer.ts` in `generateSemanticXml()` wrapper. Note: The two-phase approach means we fetch full node data (with children) once and reuse it for both semantic XML and comment association.
**Impact:** Could send too-large prompts to LLM, causing failures or high costs.

**Current implementation:** The Figma REST API's `GET /v1/files/:key/nodes?ids=...` endpoint returns the complete node structure (including all children) for each requested node ID. This is confirmed by:
1. `fetchFigmaNodesBatch()` returns `Map<string, any>` where each value is a full node with `.children` property
2. The code recursively searches `node.children` to find nested frames (see `figma-screen-setup.ts` lines 138-145)
3. `generateSemanticXml()` accesses `nodeData.children` to traverse the component tree (see `semantic-xml-generator.ts` line 32)

The node data from batch fetching is stored in `nodesDataMap` during URL processing and passed to `generateSemanticXml()` during analysis.

**Recommendation:** **In scope** - Add size check and truncation to `screen-analyzer.ts` in `generateSemanticXml()` wrapper. Note: `nodesDataMap` is already populated by `fetchFrameNodesFromUrls()` via `fetchFigmaNodesBatch()`, so semantic XML generation doesn't require additional API calls beyond what's needed for frame metadata.

---

### 13. Type Field Differences

**Gap:** `AnalyzedFrame` has `annotations: FrameAnnotation[]` (structured), but existing code uses `notes: string[]` (text).

**From 046:** `Screen` type has `notes: string[]` containing note text content.

**Impact:** Type incompatibility with existing code.

**Recommendation:** **In scope** - Design decision to use structured annotations is correct. Migration will require converting `notes` arrays to `annotations` arrays with `type: 'note'`.

---

### 14. Cache Filename Field

**Gap:** `AnalyzedFrame` has `cacheKey?: string`, but existing code uses `filename?: string`.

**From 046:** `Screen` has `filename` for cache file operations.

**Impact:** Naming inconsistency.

**Recommendation:** **In scope** - Use `filename` instead of `cacheKey` for consistency. Update `AnalyzedFrame` type definition.

---

### 15. Deduplication Module

**Gap:** `separateFramesAndNotes()` from 046 is a distinct step, but not clearly assigned to a module.

**From 046:** Located in `figma-screen-setup.ts`, deduplicates frames by ID.

**Impact:** Important deduplication step could be missed.

**Recommendation:** **In scope** - Add deduplication logic to `frame-expander.ts` after expansion, or as separate step in `fetchFrameNodesFromUrls()` after batch fetching.

---

### 16. Epic/Jira Integration Entry Point

**Gap:** No equivalent to `setupFigmaScreens()` which combines epic fetching + URL extraction + processing.

**From 046:** High-level entry point that starts from Jira epic and handles full pipeline.

**Impact:** Tools starting from Jira won't have a clear single entry point.

**Recommendation:** Out of scope - This is Jira-specific orchestration that should remain in the `combined` tools layer. The consolidated workflow starts from URLs, which is the correct abstraction boundary.

---

### Summary by Priority

**Must Address (In Scope):**
1. Multiple file key support (#2)
2. Progress notifications (#5)
3. Cache file writing (#6)
4. Document tree for comments (#7) - Use optimized ancestor chain fetch
5. Cache metadata saving (#11)
6. Semantic XML size limits (#12) - Already have node data from batch fetch
7. Deduplication logic (#15)

**Design Clarifications Needed:**
1. Type field names (#13, #14) - Use existing names or new ones?
2. Batch URL validation (#9) - Add or rely on single-URL validation?

**Explicitly Out of Scope (Caller Responsibility):**
1. Note file storage (#1) - Tool-specific caching
2. ADF extraction (#3) - Atlassian-specific
3. YAML generation (#4) - Tool-specific output
4. Question generation (#10) - Tool-specific feature
5. Epic integration (#16) - Higher-level orchestration

The core analysis workflow is well-designed, but needs these additions to fully replace existing implementations.
