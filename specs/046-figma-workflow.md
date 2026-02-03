# 046: Figma Workflow Documentation

## Overview

This document comprehensively describes how Figma data flows through the primary MCP tools. It covers expansion logic, comment handling, spatial association, context passing, recency/cache checks, and caching strategies.

**Target Tools:**
- `write-story` (via `review-work-item/context-loader.ts`)
- `write-shell-stories` (via `figma-screen-setup.ts` + `screen-analysis-regenerator.ts`)
- `write-next-story` (uses same pipeline as `write-shell-stories`)
- `figma-review-design` (via `figma-review-design/core-logic.ts`)

---

## 1. Entry Points & Data Sources

### Where Figma URLs Come From

| Tool | Source | How URLs are Extracted |
|------|--------|----------------------|
| `write-shell-stories` | Jira Epic description | `extractFigmaUrlsFromADF(description)` |
| `write-next-story` | Jira Epic description | Same - uses `setupFigmaScreens()` |
| `write-story` | Target story + parent hierarchy | `extractLinksFromHierarchy()` → `links.figma[]` |
| `figma-review-design` | Direct tool input | `input.figmaUrls` array |

---

## 2. Expansion: From URLs to Frames

### What "Expansion" Means

Given a Figma URL pointing to a node (could be CANVAS, SECTION, or FRAME), expand it to find all individual frames that need analysis.

### Expansion Logic (Shared via `getFramesAndNotesForNode`)

Located in: `server/providers/figma/figma-helpers.ts`

```
URL → parseFigmaUrl → { fileKey, nodeId }
                         ↓
fetchFigmaNode(figmaClient, fileKey, apiNodeId)
                         ↓
getFramesAndNotesForNode(nodeData, nodeId) → FigmaNodeMetadata[]
```

**Node Type Handling:**
- **CANVAS** (page): Returns all direct child FRAME nodes (one level of recursion)
- **SECTION**: Returns all direct child FRAME nodes, tags each with `sectionName` and `sectionId`
- **FRAME**: Returns that single frame
- **Notes**: INSTANCE nodes with `name === "Note"` extracted at any level

### Implementation Differences

| Tool Group | Function Used | Key Differences |
|------------|--------------|-----------------|
| `write-shell-stories`, `write-next-story`, `figma-review-design` | `processFigmaUrls()` | Batches URLs by fileKey, uses `fetchFigmaNodesBatch()` for efficiency |
| `write-story` | Inline in `loadFigmaScreens()` | Sequential `fetchFigmaNode()` per URL |

### Batching Optimization (write-shell-stories path)

```typescript
// In figma-screen-setup.ts → fetchFigmaMetadataFromUrls()

// Phase 1: Group URLs by fileKey
const urlsByFileKey = new Map<string, Array<{ url, nodeId, index }>>()

// Phase 2: Single batch request per fileKey
const nodesMap = await fetchFigmaNodesBatch(figmaClient, fileKey, nodeIds);

// Phase 3: Process each node to extract frames/notes
```

Benefits: Reduces N requests to 1-3 requests (depending on file key distribution)

---

## 3. Deduplication

### Why Deduplication is Needed

Epic descriptions may contain:
- A CANVAS/SECTION URL AND individual frame URLs pointing to frames within
- Multiple URLs pointing to the same frame

### Deduplication Logic

Located in: `figma-screen-setup.ts → separateFramesAndNotes()`

```typescript
const frameMap = new Map<string, FigmaNodeMetadata>();  // keyed by frame.id
const noteMap = new Map<string, FigmaNodeMetadata>();   // keyed by note.id

// Only add if not already present
if (!frameMap.has(frame.id)) {
  frameMap.set(frame.id, frame);
}
```

**Note:** `context-loader.ts` also has inline deduplication in `loadFigmaScreens()`:
```typescript
if (!allFrames.some(existing => existing.id === node.id)) {
  allFrames.push(node);
}
```

---

## 4. Notes and Spatial Association

### What Notes Are

Figma "Note" components are INSTANCE nodes with `name === "Note"`. They contain designer annotations like:
- Design rationale
- Edge case descriptions
- Implementation hints

### Spatial Association Algorithm

Located in: `screen-analyzer.ts → associateNotesWithFrames()`

```typescript
// For each note, find the closest frame (edge-to-edge distance)
function calculateRectangleDistance(rect1, rect2): number {
  // Uses absoluteBoundingBox coordinates
  // Returns 0 if rectangles overlap
  // Otherwise, minimum distance between edges
}

// Association rules:
// - Each note assigned to closest frame within maxDistance (default 500px)
// - Notes beyond maxDistance become "unassociatedNotes"
```

**Input:**
- `frames: FigmaNodeMetadata[]` - All expanded frames
- `notes: FigmaNodeMetadata[]` - All extracted notes
- `baseUrl: string` - For constructing full URLs

**Output:**
```typescript
interface AssociationResult {
  screens: Screen[];          // Frames with their notes[] arrays
  unassociatedNotes: string[];  // Note URLs too far from any frame
}
```

### The `Screen` Type

```typescript
interface Screen {
  name: string;           // Sanitized kebab-case name
  nodeId: string;         // Figma node ID (e.g., "1106:9254")
  url: string;            // Full Figma URL
  notes: string[];        // Associated note text content
  frameName?: string;     // Human-readable name
  sectionName?: string;   // Parent SECTION name if expanded from section
  sectionId?: string;     // Parent SECTION ID
  filename?: string;      // Cache filename without extension
}
```

---

## 5. Comment Fetching

### When Comments Are Fetched

| Tool | Fetches Comments? | Used For |
|------|------------------|----------|
| `write-shell-stories` | ✅ Phase 3.8 | Context for shell story generation |
| `write-next-story` | ✅ (via shared pipeline) | Context for story writing |
| `write-story` | ✅ In `loadFigmaScreens()` | Context for review questions |
| `figma-review-design` | ✅ Step 2 | Context + avoid duplicate questions |

### Comment Processing Pipeline

Located in: `figma-review-design/figma-comment-utils.ts`

```
fetchCommentsForFile(figmaClient, fileKey)
           ↓
groupCommentsIntoThreads(comments) → CommentThread[]
           ↓
formatCommentsForContext(threads, frames, documentTree) → ScreenAnnotation[]
```

**Key Operations:**
1. **Fetch**: `figmaClient.fetchComments(fileKey)` - gets all comments on file
2. **Thread Grouping**: Groups replies under parent comments
3. **Spatial Matching**: Associates threads with frames using:
   - Direct frame reference (`client_meta.node_id`)
   - Spatial containment (comment position inside frame bounds)
   - Document tree traversal for child node comments

### Comment Output Format

```typescript
interface ScreenAnnotation {
  screenName: string;     // Frame name this comment belongs to
  screenUrl: string;      // Figma URL to the frame
  nodeId: string;         // Frame node ID
  content: string;        // Formatted comment thread content
  author?: string;        // Original commenter
  type: 'comment' | 'note';  // Distinguishes from design notes
}
```

---

## 6. Cache Strategy

### Cache Location

```
cache/figma-files/{fileKey}/
├── .figma-metadata.json    # Stores lastTouchedAt timestamp
├── {screen-name}.png       # Downloaded screen image
├── {screen-name}.analysis.md  # AI-generated analysis
└── {screen-name}.notes.md  # Extracted note content
```

### Cache Validation (Recency Check)

Located in: `figma-cache.ts → ensureValidCacheForFigmaFile()`

```typescript
// Tier 3 validation: Uses Figma's /meta endpoint
const fileMetadata = await fetchFigmaFileMetadata(figmaClient, figmaFileKey);
const cacheValid = await isCacheValid(figmaFileKey, fileMetadata.lastTouchedAt);

if (!cacheValid) {
  // Figma file has been modified since cache was created
  await clearFigmaCache(figmaFileKey);
}
```

**Validation Logic:**
1. Fetch current `lastTouchedAt` from Figma API (`/meta` endpoint)
2. Compare to stored timestamp in `.figma-metadata.json`
3. If Figma timestamp > cached timestamp → invalidate entire cache folder

### Per-Screen Cache Check

Located in: `screen-analysis-regenerator.ts → regenerateScreenAnalyses()`

```typescript
for (const screen of screens) {
  const analysisPath = path.join(fileCachePath, `${screen.filename}.analysis.md`);
  
  try {
    await fs.access(analysisPath);
    // File exists - skip analysis for this screen
    cachedScreens.push(screen.name);
  } catch {
    // File doesn't exist - need to analyze
    screensToAnalyze.push(screen);
  }
}
```

### context-loader.ts Cache Check (Inline)

```typescript
const analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);

try {
  analysis = await fs.readFile(analysisPath, 'utf-8');
  // Cache hit - use existing analysis
  cachedCount++;
} catch {
  // Cache miss - download image and run AI analysis
  analyzedCount++;
}
```

---

## 7. Context Passing to AI Analysis

### Epic Context

All Figma analysis includes epic/story context for better AI understanding:

| Tool | Context Source | Content |
|------|---------------|---------|
| `write-shell-stories` | Epic description | `epicWithoutShellStoriesMarkdown` (excludes Shell Stories section) |
| `write-next-story` | Epic description | Same |
| `write-story` | Target story + parents | `buildIssueContextFromHierarchy()` result |
| `figma-review-design` | Tool input | `contextDescription` parameter |

### Context Used in Analysis Prompt

Located in: `prompt-screen-analysis.ts → generateScreenAnalysisPrompt()`

```typescript
function generateScreenAnalysisPrompt(
  screenName: string,
  figmaUrl: string,
  screenPosition: string,      // "3 of 7"
  notesContent?: string,       // Associated design notes
  epicContext?: string,        // Epic/story description
  semanticXml?: string         // Figma component structure (optional)
): string
```

---

## 8. Semantic XML Generation

### What It Is

Generates an XML representation of the Figma component hierarchy for better AI understanding of UI structure.

### When It's Generated

Located in: `screen-analysis-regenerator.ts → analyzeScreen()`

```typescript
if (nodesDataMap) {
  const nodeData = nodesDataMap.get(frameId);
  if (nodeData) {
    semanticXml = generateSemanticXml(nodeData);
    // Truncated to 200KB if too large
  }
}
```

### nodesDataMap Source

Built during expansion in `fetchFigmaMetadataFromUrls()`:
```typescript
const nodesDataMap = new Map<string, any>();

// Store full node data for each extracted frame
framesAndNotes.forEach(item => {
  if (item.type === 'FRAME') {
    nodesDataMap.set(item.id, nodeData);
  }
});
```

**Note:** `context-loader.ts` does NOT currently pass `nodesDataMap` to its analysis, so semantic XML is not available in `write-story`.

---

## 9. Image Download

### Batch Download Strategy

Located in: `figma-helpers.ts → downloadFigmaImagesBatch()`

**Write-shell-stories path (batched):**
```typescript
// Step 1: Get all image URLs in one request
const imageUrls = await figmaClient.getImageUrls(fileKey, nodeIds);

// Step 2: Download from CDN in parallel
const results = await Promise.all(
  nodeIds.map(async (nodeId) => {
    const imageUrl = imageUrls[nodeId];
    // Download and convert to base64
  })
);
```

**Context-loader path:**
```typescript
// Same batching for all frames in a file
const imagesMap = await downloadFigmaImagesBatch(figmaClient, fileKey, frameIds);
```

---

## 10. Complete Workflow Diagrams

### write-shell-stories / write-next-story

```
Jira Epic
    ↓
extractFigmaUrlsFromADF()
    ↓
processFigmaUrls()
├── fetchFigmaMetadataFromUrls() → Group by fileKey, batch fetch
├── separateFramesAndNotes() → Deduplicate
└── associateNotesWithFrames() → Spatial matching
    ↓
ensureValidCacheForFigmaFile() → Recency check via /meta
    ↓
fetchCommentsForFile() → Get Figma comments (Phase 3.8)
groupCommentsIntoThreads() → Thread grouping
formatCommentsForContext() → Spatial matching to frames
    ↓
notesToScreenAnnotations() → Convert notes to annotations (Phase 3.9)
    ↓
regenerateScreenAnalyses() (Phase 4)
├── Check per-screen cache
├── downloadFigmaImagesBatch() → Batch image download
├── generateSemanticXml() → Component structure
└── generateText() → AI analysis with image + context
    ↓
{ screens, comments, analysisFiles }
```

### write-story (via context-loader)

```
Target Story + Parent Hierarchy
    ↓
extractLinksFromHierarchy() → { figma: string[] }
    ↓
loadFigmaScreens()
├── parseFigmaUrl() per URL
├── fetchFigmaNode() per URL (NOT batched)
├── getFramesAndNotesForNode() → Expand
└── Inline deduplication
    ↓
ensureValidCacheForFigmaFile() → Recency check
    ↓
fetchCommentsForFile() → Get Figma comments
groupCommentsIntoThreads()
formatCommentsForContext()
    ↓
Inline analysis loop:
├── Check per-screen cache
├── downloadFigmaImagesBatch() → Batch per fileKey
└── generateText() → AI analysis (NO semantic XML)
    ↓
{ screens: AnalyzedScreen[], comments: ScreenAnnotation[] }
```

### figma-review-design

```
Tool Input: figmaUrls[]
    ↓
parseFigmaUrls() → Validate URLs
getUniqueFileKeys() → Group by file
    ↓
fetchFigmaFile() → Get file structure
figmaClient.fetchComments() → Get existing comments (fresh, no cache per FR-007)
    ↓
processFigmaUrls() → Same as write-shell-stories
├── Batch fetch metadata
├── Separate frames/notes
└── Spatial association
    ↓
regenerateScreenAnalyses() → Uses shared regenerator
├── Cache check
├── Batch image download
├── Semantic XML
└── AI analysis
    ↓
Load analysis files from cache
    ↓
generateFigmaQuestionsPrompt() → Build prompt with:
├── Screen analyses
├── Existing comments (as context)
└── contextDescription
    ↓
generateText() → LLM generates questions
parseFigmaQuestions() → Extract ❓ markers
    ↓
postQuestionsToFigma() → Post comments to Figma
    ↓
{ analysis, questions, postingResults }
```

---

## 11. Key Data Types Summary

### Input Types

| Type | Location | Used By |
|------|----------|---------|
| `FigmaNodeMetadata` | `figma-helpers.ts` | All tools - raw Figma API response |
| Raw URLs `string[]` | N/A | `context-loader`, `figma-review-design` |

### Processing Types

| Type | Location | Purpose |
|------|----------|---------|
| `Screen` | `screen-analyzer.ts` | Frame with spatial note association |
| `ScreenWithNotes` | `figma-screen-setup.ts` | Alias for Screen (extends it) |
| `ScreenToAnalyze` | `screen-analysis-regenerator.ts` | Similar to Screen, for regenerator input |

### Output Types

| Type | Location | Purpose |
|------|----------|---------|
| `AnalyzedScreen` | `context-loader.ts` | Screen with AI analysis attached |
| `ScreenAnnotation` | `screen-annotation.ts` | Comment/note associated with a screen |

---

## 12. Consolidation Opportunities

See [045-consolidate-screen-analyses.md](./045-consolidate-screen-analyses.md) for the consolidation plan addressing:

1. **Duplicate analysis loops**: `context-loader.ts` has inline analysis vs shared `regenerateScreenAnalyses()`
2. **Similar types**: `Screen`, `ScreenWithNotes`, `ScreenToAnalyze`, `AnalyzedScreen`
3. **Missing features in context-loader**: No semantic XML, no batched URL fetching

---

## 13. Feature Matrix

| Feature | write-shell-stories | write-next-story | write-story | figma-review-design |
|---------|-------------------|-----------------|-------------|-------------------|
| URL batching by fileKey | ✅ | ✅ | ❌ | ✅ |
| Frame deduplication | ✅ | ✅ | ✅ (inline) | ✅ |
| SECTION expansion | ✅ | ✅ | ✅ | ✅ |
| Note spatial association | ✅ | ✅ | ✅ | ✅ |
| Comment fetching | ✅ | ✅ | ✅ | ✅ |
| Comment thread grouping | ✅ | ✅ | ✅ | ✅ |
| Recency check (/meta) | ✅ | ✅ | ✅ | ✅ |
| Per-screen cache check | ✅ | ✅ | ✅ | ✅ |
| Batch image download | ✅ | ✅ | ✅ | ✅ |
| Semantic XML | ✅ | ✅ | ❌ | ✅ |
| Epic context in prompt | ✅ | ✅ | ✅ | Optional |
| Shared regenerator | ✅ | ✅ | ❌ (inline) | ✅ |

---

## 14. Method Reference

### URL Parsing & Validation

| Method | Location | Purpose |
|--------|----------|---------|
| `parseFigmaUrl(url)` | `server/providers/figma/figma-helpers.ts` | Parse Figma URL into `{ fileKey, nodeId }` |
| `parseFigmaUrls(urls)` | `server/providers/figma/tools/figma-review-design/url-parser.ts` | Batch parse + validate multiple URLs |
| `getUniqueFileKeys(parsedUrls)` | `server/providers/figma/tools/figma-review-design/url-parser.ts` | Extract unique file keys from parsed URLs |
| `convertNodeIdToApiFormat(nodeId)` | `server/providers/figma/figma-helpers.ts` | Convert URL format `123-456` to API format `123:456` |
| `extractFigmaUrlsFromADF(adfDoc)` | `server/providers/atlassian/adf-utils.ts` | Extract Figma URLs from Jira/Confluence ADF content |

### Figma API Fetching

| Method | Location | Purpose |
|--------|----------|---------|
| `fetchFigmaNode(client, fileKey, nodeId)` | `server/providers/figma/figma-helpers.ts` | Fetch single node data |
| `fetchFigmaNodesBatch(client, fileKey, nodeIds)` | `server/providers/figma/figma-helpers.ts` | Batch fetch multiple nodes (single API call) |
| `fetchFigmaFile(client, fileKey)` | `server/providers/figma/figma-helpers.ts` | Fetch entire file structure |
| `fetchFigmaFileMetadata(client, fileKey)` | `server/providers/figma/figma-helpers.ts` | Fetch file metadata (for cache validation) |
| `getFramesAndNotesForNode(nodeData, nodeId)` | `server/providers/figma/figma-helpers.ts` | Extract frames/notes from node (handles CANVAS/SECTION/FRAME expansion) |

### Figma URL Processing (High-Level)

| Method | Location | Purpose |
|--------|----------|---------|
| `processFigmaUrls(urls, client)` | `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts` | Full pipeline: batch fetch → separate → associate |
| `fetchFigmaMetadataFromUrls(urls, client)` | `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts` | Batch fetch with fileKey grouping |
| `separateFramesAndNotes(allFramesAndNotes)` | `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts` | Deduplicate and separate frames from notes |

### Spatial Association

| Method | Location | Purpose |
|--------|----------|---------|
| `associateNotesWithFrames(frames, notes, baseUrl, maxDistance)` | `server/providers/combined/tools/writing-shell-stories/screen-analyzer.ts` | Spatially associate notes with nearest frames |
| `calculateRectangleDistance(rect1, rect2)` | `server/providers/combined/tools/writing-shell-stories/screen-analyzer.ts` | Edge-to-edge distance between bounding boxes |
| `calculateDistance(x1, y1, x2, y2)` | `server/providers/combined/tools/writing-shell-stories/screen-analyzer.ts` | Euclidean distance between points |

### Cache Management

| Method | Location | Purpose |
|--------|----------|---------|
| `getFigmaFileCachePath(fileKey)` | `server/providers/figma/figma-cache.ts` | Get cache directory path for file |
| `ensureValidCacheForFigmaFile(client, fileKey)` | `server/providers/figma/figma-cache.ts` | Validate cache via `/meta` timestamp check |
| `isCacheValid(fileKey, currentTimestamp)` | `server/providers/figma/figma-cache.ts` | Compare cached vs current `lastTouchedAt` |
| `clearFigmaCache(fileKey)` | `server/providers/figma/figma-cache.ts` | Delete and recreate cache folder |
| `saveFigmaMetadata(fileKey, metadata)` | `server/providers/figma/figma-cache.ts` | Save `.figma-metadata.json` after analysis |

### Image Download

| Method | Location | Purpose |
|--------|----------|---------|
| `downloadFigmaImagesBatch(client, fileKey, nodeIds, options)` | `server/providers/figma/figma-helpers.ts` | Batch download images (get URLs + parallel fetch) |

### Screen Analysis

| Method | Location | Purpose |
|--------|----------|---------|
| `regenerateScreenAnalyses(params)` | `server/providers/combined/tools/shared/screen-analysis-regenerator.ts` | Shared: cache check → download → analyze |
| `analyzeScreen(screen, params)` | `server/providers/combined/tools/shared/screen-analysis-regenerator.ts` | Analyze single screen with AI |
| `generateScreenAnalysisPrompt(...)` | `server/providers/combined/tools/writing-shell-stories/prompt-screen-analysis.ts` | Build prompt for screen analysis |
| `generateSemanticXml(nodeData)` | `server/providers/figma/semantic-xml-generator.ts` | Generate XML component hierarchy |

### Note Extraction

| Method | Location | Purpose |
|--------|----------|---------|
| `writeNotesForScreen(screen, allNotes, cachePath)` | `server/providers/combined/tools/writing-shell-stories/note-text-extractor.ts` | Write notes to `.notes.md` file |
| `notesToScreenAnnotations(screens, allNotes)` | `server/providers/combined/tools/writing-shell-stories/note-text-extractor.ts` | Convert notes to `ScreenAnnotation[]` format |

### Comment Handling

| Method | Location | Purpose |
|--------|----------|---------|
| `fetchCommentsForFile(client, fileKey)` | `server/providers/figma/tools/figma-review-design/figma-comment-utils.ts` | Fetch all comments from Figma file |
| `groupCommentsIntoThreads(comments)` | `server/providers/figma/tools/figma-review-design/figma-comment-utils.ts` | Group replies under parent comments |
| `formatCommentsForContext(threads, frames, docTree)` | `server/providers/figma/tools/figma-review-design/figma-comment-utils.ts` | Associate threads with frames → `ScreenAnnotation[]` |
| `postQuestionsToFigma(questions, fileKey, client, frames)` | `server/providers/figma/tools/figma-review-design/figma-comment-utils.ts` | Post generated questions as Figma comments |

### Epic/Story Context Building

| Method | Location | Purpose |
|--------|----------|---------|
| `buildIssueContext(issues, options)` | `server/providers/combined/tools/shared/issue-context-builder.ts` | Build context from Jira issues (excludes sections) |
| `buildIssueContextFromHierarchy(hierarchy, options)` | `server/providers/combined/tools/shared/issue-context-builder.ts` | Build context from issue hierarchy |
| `setupFigmaScreens(params)` | `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts` | Full setup: fetch epic → extract URLs → process Figma |

### Tool Entry Points

| Method | Location | Purpose |
|--------|----------|---------|
| `executeWriteShellStories(input, deps)` | `server/providers/combined/tools/writing-shell-stories/core-logic.ts` | Main entry for write-shell-stories |
| `executeWriteNextStory(input, deps)` | `server/providers/combined/tools/write-next-story/core-logic.ts` | Main entry for write-next-story |
| `executeAnalyzeFigmaScope(input, deps)` | `server/providers/figma/tools/figma-review-design/core-logic.ts` | Main entry for figma-review-design |
| `loadLinkedResources(hierarchy, links, options)` | `server/providers/combined/tools/review-work-item/context-loader.ts` | Load all linked resources for write-story |
| `loadFigmaScreens(urls, client, generateText, context, notify)` | `server/providers/combined/tools/review-work-item/context-loader.ts` | Inline Figma analysis for write-story |

### YAML Generation

| Method | Location | Purpose |
|--------|----------|---------|
| `generateScreensYaml(screens, unassociatedNotes)` | `server/providers/combined/tools/writing-shell-stories/yaml-generator.ts` | Generate `screens.yaml` content |
| `generateScreenFilename(frameName, nodeId)` | `server/providers/figma/figma-helpers.ts` | Generate sanitized filename from frame name + ID |
