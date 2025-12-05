# Batch Figma Requests to Optimize Rate Limits

## Problem Statement

The `identify-features` tool (and `write-shell-stories`) currently makes **sequential Figma API requests**, which is inefficient and can hit rate limits quickly. Based on the rate limit analysis:

- **Dev/Full seats**: 10-20 requests/minute (Tier 1 endpoints)
- **View/Collab seats**: Up to 6 requests/month (severely restricted)

For a typical epic with 10 Figma URLs pointing to different pages/sections, the current implementation makes:
1. **10 sequential `/files/{fileKey}/nodes` requests** (one per URL) to fetch metadata
2. **10-50+ sequential `/images/{fileKey}` requests** (one per screen/frame) to download images

This quickly exhausts rate limits, especially for View/Collab users.

## Current Request Pattern Analysis

### Phase 1-3: Figma Screen Setup (`figma-screen-setup.ts`)

**Current implementation:**
```typescript
// In setupFigmaScreens() - loops through figmaUrls sequentially
for (let i = 0; i < figmaUrls.length; i++) {
  const figmaUrl = figmaUrls[i];
  const urlInfo = parseFigmaUrl(figmaUrl);
  const apiNodeId = convertNodeIdToApiFormat(urlInfo.nodeId);
  
  // ❌ Sequential request per URL
  const nodeData = await fetchFigmaNode(figmaClient, urlInfo.fileKey, apiNodeId);
  const framesAndNotes = getFramesAndNotesForNode({ document: nodeData }, apiNodeId);
}
```

**Requests made:**
- **Endpoint**: `GET /v1/files/{fileKey}/nodes?ids={nodeId}`
- **Count**: 1 request per Figma URL (typically 3-15 URLs per epic)
- **Rate Limit Tier**: Tier 1
- **Optimization potential**: ✅ **High** - Figma supports comma-separated node IDs in a single request

### Phase 4: Download Images and Analyze (`screen-analysis-regenerator.ts`)

**Current implementation:**
```typescript
// In regenerateScreenAnalyses() - uses pipeline but still sequential
for (let i = 0; i < screensToAnalyze.length; i++) {
  const screen = screensToAnalyze[i];
  
  // ❌ One request per screen (with pipeline for next image)
  const imageResult = await downloadFigmaImage(
    figmaClient,
    figmaFileKey,
    frame.id,
    { format: 'png', scale: 1 }
  );
}
```

**Requests made:**
- **Endpoint**: `GET /v1/images/{fileKey}?ids={nodeId}&format=png&scale=1`
- **Count**: 1 request per screen (typically 5-30 screens per epic)
- **Rate Limit Tier**: Tier 1
- **Optimization potential**: ✅ **High** - Figma supports comma-separated node IDs in a single request

## Figma API Batching Capabilities

According to Figma's documentation:

### 1. GET /v1/files/{fileKey}/nodes
**Supports batching**: ✅ Yes
```
GET /v1/files/:key/nodes?ids=1:2,1:3,1:4
```
- Parameter: `ids` - **Comma separated list of node IDs**
- Returns: `{ nodes: { "1:2": {...}, "1:3": {...}, "1:4": {...} } }`

### 2. GET /v1/images/{fileKey}
**Supports batching**: ✅ Yes
```
GET /v1/images/:key?ids=1:2,1:3,1:4&format=png&scale=1
```
- Parameter: `ids` - **Comma separated list of node IDs**
- Returns: `{ images: { "1:2": "url1", "1:3": "url2", "1:4": "url3" } }`
- Note: Image URLs expire after 30 days

## Implementation Plan

### Step 1: Create Batch Node Fetcher

**Goal**: Reduce N node requests to 1-2 batch requests

**Location**: `server/providers/figma/figma-helpers.ts`

**New function**: `fetchFigmaNodesBatch()`

```typescript
/**
 * Fetch multiple nodes from a Figma file in a single request
 * @param client - Figma API client
 * @param fileKey - The Figma file key
 * @param nodeIds - Array of node IDs to fetch (in API format with colon)
 * @param timeoutMs - Timeout in milliseconds
 * @returns Map of node IDs to node data
 */
export async function fetchFigmaNodesBatch(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  timeoutMs: number = 60000
): Promise<Map<string, any>>
```

**Implementation details:**
- Accept array of node IDs: `["123:456", "789:012", ...]`
- Build comma-separated query: `?ids=123:456,789:012`
- Parse response: `{ nodes: { "123:456": {...}, "789:012": {...} } }`
- Return `Map<nodeId, nodeData>` for easy lookup
- Handle errors same as `fetchFigmaNode()` (403, 429, timeouts)
- Include same error logging and rate limit handling

**Testing approach:**
- Verify with existing test script that has multiple node IDs
- Compare response structure to single-node requests
- Ensure error handling works for partial failures (some nodes not found)

### Step 2: Update Figma Screen Setup to Use Batching

**Goal**: Replace sequential node fetches in `fetchFigmaMetadataFromUrls()` with batched requests per file key

**Location**: `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts`

**Current helper structure** (sequential fetches):
```typescript
async function fetchFigmaMetadataFromUrls(
  figmaUrls: string[],
  figmaClient: FigmaClient
): Promise<{ allFramesAndNotes: Array<{ url: string; metadata: FigmaNodeMetadata[] }>; figmaFileKey: string }> {
  const allFramesAndNotes: Array<{ url: string; metadata: FigmaNodeMetadata[] }> = [];
  let figmaFileKey = '';
  
  for (let i = 0; i < figmaUrls.length; i++) {
    const figmaUrl = figmaUrls[i];
    const urlInfo = parseFigmaUrl(figmaUrl);
    const apiNodeId = convertNodeIdToApiFormat(urlInfo.nodeId);
    
    // ❌ Sequential request per URL
    const nodeData = await fetchFigmaNode(figmaClient, urlInfo.fileKey, apiNodeId);
    
    // Semi-recursive extraction: getFramesAndNotesForNode() extracts:
    // - For CANVAS nodes: all direct child FRAME nodes (one level recursion)
    // - For FRAME nodes: just that single frame
    // - Notes at any level within the node
    const framesAndNotes = getFramesAndNotesForNode({ document: nodeData }, apiNodeId);
    
    allFramesAndNotes.push({ url: figmaUrl, metadata: framesAndNotes });
  }
  
  return { allFramesAndNotes, figmaFileKey };
}
```

**New batched helper structure**:
```typescript
async function fetchFigmaMetadataFromUrls(
  figmaUrls: string[],
  figmaClient: FigmaClient
): Promise<{ allFramesAndNotes: Array<{ url: string; metadata: FigmaNodeMetadata[] }>; figmaFileKey: string }> {
  const allFramesAndNotes: Array<{ url: string; metadata: FigmaNodeMetadata[] }> = [];
  let figmaFileKey = '';
  
  // Phase 1: Group URLs by fileKey and validate
  const urlsByFileKey = new Map<string, Array<{ url: string; nodeId: string; index: number }>>();
  
  for (let i = 0; i < figmaUrls.length; i++) {
    const figmaUrl = figmaUrls[i];
    console.log(`  Processing Figma URL ${i + 1}/${figmaUrls.length}: ${figmaUrl}`);
    
    const urlInfo = parseFigmaUrl(figmaUrl);
    if (!urlInfo) {
      console.log('    ⚠️  Invalid Figma URL format, skipping');
      continue;
    }
    
    if (!urlInfo.nodeId) {
      console.log('    ⚠️  Figma URL missing nodeId, skipping');
      continue;
    }
    
    const apiNodeId = convertNodeIdToApiFormat(urlInfo.nodeId);
    
    // Store first valid file key for image downloads later
    if (!figmaFileKey) {
      figmaFileKey = urlInfo.fileKey;
    }
    
    // Group by file key for batching
    if (!urlsByFileKey.has(urlInfo.fileKey)) {
      urlsByFileKey.set(urlInfo.fileKey, []);
    }
    urlsByFileKey.get(urlInfo.fileKey)!.push({ url: figmaUrl, nodeId: apiNodeId, index: i });
  }
  
  // Phase 2: Batch fetch per fileKey
  for (const [fileKey, urlInfos] of urlsByFileKey) {
    try {
      console.log(`  📦 Batch fetching ${urlInfos.length} nodes from file ${fileKey}...`);
      
      // ✅ Single batch request for all nodes in this file
      const nodeIds = urlInfos.map(u => u.nodeId);
      const nodesMap = await fetchFigmaNodesBatch(figmaClient, fileKey, nodeIds);
      
      console.log(`    ✅ Fetched ${nodesMap.size}/${nodeIds.length} nodes`);
      
      // Phase 3: Process each node in original order
      for (const { url, nodeId } of urlInfos) {
        const nodeData = nodesMap.get(nodeId);
        
        if (!nodeData) {
          console.log(`    ⚠️  Node ${nodeId} not found in response`);
          continue;
        }
        
        // Semi-recursive extraction: getFramesAndNotesForNode() extracts:
        // - For CANVAS nodes: all direct child FRAME nodes (one level recursion)
        // - For FRAME nodes: just that single frame
        // - Notes at any level within the node
        const framesAndNotes = getFramesAndNotesForNode({ document: nodeData }, nodeId);
        console.log(`    Found ${framesAndNotes.length} frames/notes`);
        
        // Accumulate into array (maintains same structure as before)
        allFramesAndNotes.push({ url, metadata: framesAndNotes });
      }
      
    } catch (error: any) {
      console.log(`    ⚠️  Error fetching batch from ${fileKey}: ${error.message}`);
      
      // Unrecoverable errors (403, 429) should be immediately re-thrown
      if (error instanceof FigmaUnrecoverableError) {
        throw error;
      }
      
      // For other errors, continue with remaining file keys
    }
  }
  
  return { allFramesAndNotes, figmaFileKey };
}
```

**Key aspects of this approach:**
- ✅ **Preserves function signature**: Input/output unchanged, drop-in replacement
- ✅ **Maintains accumulator pattern**: Still builds `allFramesAndNotes` array in same format
- ✅ **Handles multiple file keys**: Groups URLs by file key, batches per file
- ✅ **Preserves semi-recursive behavior**: `getFramesAndNotesForNode()` still extracts child frames from CANVAS nodes
- ✅ **Same data flow**: Caller still uses `separateFramesAndNotes(allFramesAndNotes)` unchanged
- ✅ **Error resilience**: One file key failure doesn't stop processing of others

**Expected improvement:**
- **Before**: 10 URLs (same fileKey) = 10 sequential requests
- **After**: 10 URLs (same fileKey) = 1 batch request
- **Before**: 10 URLs (3 different files: 5+3+2) = 10 sequential requests  
- **After**: 10 URLs (3 different files: 5+3+2) = 3 batch requests (one per file)
- **Rate limit impact**: 70-90% reduction in requests for this phase (depends on URL distribution)

**Testing approach:**
- Run identify-features with multi-URL epic (all same file)
- Verify same screens.yaml output as before
- Check console logs show "📦 Batch fetching N nodes" instead of multiple individual fetches
- Test with multiple file keys (e.g., 2 URLs from fileA, 3 from fileB) - should see 2 batch requests
- Test error handling: one invalid node ID in batch shouldn't fail entire batch

### Step 3: Create Batch Image Download Helper

**Goal**: Reduce N image downloads to 1 batch request + N CDN downloads

**Location**: `server/providers/figma/figma-helpers.ts`

**New function**: `downloadFigmaImagesBatch()`

```typescript
/**
 * Download multiple images from Figma in a single API request
 * @param client - Figma API client
 * @param fileKey - Figma file key
 * @param nodeIds - Array of node IDs in API format
 * @param options - Download options (format, scale)
 * @returns Map of node IDs to image data
 */
export async function downloadFigmaImagesBatch(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  options: FigmaImageDownloadOptions = {}
): Promise<Map<string, FigmaImageDownloadResult>>
```

**Implementation approach:**

**Phase A: Get all image URLs in one request**
```typescript
// Single API request for all node IDs
const params = new URLSearchParams({
  ids: nodeIds.join(','),  // "123:456,789:012,..."
  format: options.format || 'png',
  scale: (options.scale || 1).toString()
});
const response = await client.fetch(`${baseUrl}/images/${fileKey}?${params}`);
const data = await response.json();
// data.images = { "123:456": "cdn-url-1", "789:012": "cdn-url-2", ... }
```

**Phase B: Download images from CDN in parallel**
```typescript
// Parallel CDN downloads (these don't count against Figma API rate limits)
const downloadPromises = Object.entries(data.images).map(async ([nodeId, imageUrl]) => {
  if (!imageUrl) return [nodeId, null]; // Node couldn't be rendered
  
  const imageResponse = await fetch(imageUrl);
  const imageBlob = await imageResponse.blob();
  const buffer = Buffer.from(await imageBlob.arrayBuffer());
  const base64Data = buffer.toString('base64');
  
  return [nodeId, {
    base64Data,
    mimeType: imageBlob.type || 'image/png',
    byteSize: imageBlob.size,
    imageUrl
  }];
});

const results = await Promise.all(downloadPromises);
return new Map(results);
```

**Error handling:**
- Handle 429 rate limits same as single download
- Handle partial failures (some nodes can't be rendered)
- Include null entries in map for failed renders
- Propagate FigmaUnrecoverableError for auth/rate limit issues

**Testing approach:**
- Test with 3-5 node IDs at once
- Verify all images download correctly
- Test partial failure case (one invalid node ID)
- Measure performance improvement vs sequential

### Step 4: Update Screen Analysis to Use Batch Downloads

**Goal**: Replace sequential image downloads with batch request

**Location**: `server/providers/combined/tools/writing-shell-stories/screen-analysis-regenerator.ts`

**Changes in `regenerateScreenAnalyses()` function:**

Current pipeline structure:
```typescript
// Downloads one image, analyzes it, starts next download
for (let i = 0; i < screensToAnalyze.length; i++) {
  const imageResult = await downloadScreenImage(screen, frame.id);
  // analyze with AI...
  // start next download in background
}
```

New batch structure:
```typescript
// Phase A: Batch download ALL images upfront
console.log(`  📥 Batch downloading ${screensToAnalyze.length} images...`);
const frameIds = screensToAnalyze.map(screen => {
  const frame = allFrames.find(f => screen.url.includes(f.id.replace(/:/g, '-')));
  return frame?.id;
}).filter(Boolean);

const imagesMap = await downloadFigmaImagesBatch(
  figmaClient,
  figmaFileKey,
  frameIds,
  { format: 'png', scale: 1 }
);

// Phase B: Analyze screens with pre-downloaded images
for (let i = 0; i < screensToAnalyze.length; i++) {
  const screen = screensToAnalyze[i];
  const frame = allFrames.find(f => screen.url.includes(f.id.replace(/:/g, '-')));
  
  const imageResult = imagesMap.get(frame.id);
  if (!imageResult) {
    console.log(`  ⚠️  No image for ${screen.name}`);
    continue;
  }
  
  // Save image to temp directory
  const imagePath = path.join(tempDirPath, `${screen.name}.png`);
  await fs.writeFile(imagePath, Buffer.from(imageResult.base64Data, 'base64'));
  
  // Analyze with AI (sequential - AI can't be parallelized)
  const analysisResponse = await generateText({...});
  // ... save analysis
}
```

**Expected improvement:**
- **Before**: 20 screens = 20 sequential Figma API requests + 20 CDN downloads
- **After**: 20 screens = 1 Figma API request + 20 parallel CDN downloads
- **Rate limit impact**: 95% reduction in Figma API requests
- **Performance**: Faster overall (parallel CDN downloads)

**Trade-off considerations:**
- ❌ **Removed pipeline optimization**: Can no longer start next download while analyzing current screen
- ✅ **Better rate limit usage**: 20x fewer API requests
- ✅ **Simpler code**: Clearer separation of download vs analysis phases
- ✅ **Better error handling**: All download errors surface before AI analysis starts
- ✅ **Memory usage**: Acceptable - holding 10-30 base64 images in memory temporarily

**Testing approach:**
- Run identify-features end-to-end with 5+ screens
- Verify all images download and analyze correctly
- Check console logs show single batch request
- Measure total execution time (should be similar or faster)
- Test with cache enabled (should skip batch download)

### Step 5: Add Batch Size Limits and Chunking

**Goal**: Handle large batches that might timeout or hit URL length limits

**Location**: `server/providers/figma/figma-helpers.ts`

**Implementation:**

```typescript
// Add batch size configuration
const MAX_BATCH_SIZE = 50; // Conservative limit (URLs have ~2000 char limit)

/**
 * Fetch multiple nodes from a Figma file in a single request (or multiple chunked requests)
 * 
 * @param client - Figma API client
 * @param fileKey - The Figma file key
 * @param nodeIds - Array of node IDs to fetch (in API format with colon)
 * @param options - Optional configuration
 * @returns Map of node IDs to node data
 */
export async function fetchFigmaNodesBatch(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  options: { timeoutMs?: number; maxBatchSize?: number } = {}
): Promise<Map<string, any>> {
  const timeoutMs = options.timeoutMs || 60000;
  const maxBatchSize = options.maxBatchSize || MAX_BATCH_SIZE;
  
  // Handle empty array
  if (nodeIds.length === 0) {
    return new Map();
  }
  
  // Chunk large requests (iterative, not recursive)
  if (nodeIds.length > maxBatchSize) {
    console.log(`  📦 Chunking ${nodeIds.length} nodes into batches of ${maxBatchSize}...`);
    
    const allResults = new Map<string, any>();
    const chunks: string[][] = [];
    
    // Create chunks
    for (let i = 0; i < nodeIds.length; i += maxBatchSize) {
      chunks.push(nodeIds.slice(i, i + maxBatchSize));
    }
    
    console.log(`    Processing ${chunks.length} chunks...`);
    
    // Fetch each chunk sequentially (to avoid overwhelming API)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`    Fetching chunk ${i + 1}/${chunks.length} (${chunk.length} nodes)...`);
      
      // Make single batch request for this chunk
      const chunkResults = await fetchSingleBatch(client, fileKey, chunk, timeoutMs);
      
      // Merge into combined results
      for (const [nodeId, nodeData] of chunkResults.entries()) {
        allResults.set(nodeId, nodeData);
      }
    }
    
    console.log(`    ✅ Fetched ${allResults.size}/${nodeIds.length} nodes across ${chunks.length} chunks`);
    return allResults;
  }
  
  // Single batch request (no chunking needed)
  return fetchSingleBatch(client, fileKey, nodeIds, timeoutMs);
}

/**
 * Internal helper: Fetch a single batch of nodes (no chunking)
 */
async function fetchSingleBatch(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  timeoutMs: number
): Promise<Map<string, any>> {
  const figmaApiUrl = `${client.getBaseUrl()}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeIds.join(','))}`;
  
  console.log(`  Fetching ${nodeIds.length} nodes from ${fileKey}...`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await client.fetch(figmaApiUrl, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Extract headers for debugging
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      // Handle rate limiting
      if (response.status === 429) {
        const message = await createRateLimitErrorMessage(figmaApiUrl, response, errorText);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      // Handle 403 Forbidden
      if (response.status === 403) {
        throw new FigmaUnrecoverableError(create403ErrorMessage(figmaApiUrl, response), response.status);
      }
      
      throw new Error(`Figma API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Parse response: { nodes: { "123:456": { document: {...} }, "789:012": { document: {...} } } }
    const nodesMap = new Map<string, any>();
    
    if (data.nodes) {
      for (const [nodeId, nodeInfo] of Object.entries(data.nodes)) {
        // nodeInfo could be null if node not found
        if (nodeInfo && typeof nodeInfo === 'object' && 'document' in nodeInfo) {
          nodesMap.set(nodeId, (nodeInfo as any).document);
        } else {
          // Node not found or invalid - store null
          nodesMap.set(nodeId, null);
        }
      }
    }
    
    console.log(`  ✅ Batch fetch complete: ${nodesMap.size}/${nodeIds.length} nodes retrieved`);
    return nodesMap;
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error(`Figma API request timed out after ${timeoutMs}ms`);
    }
    
    throw error;
  }
}

// Similar implementation for downloadFigmaImagesBatch() with chunking...
```

**Key aspects:**
- ✅ **Iterative chunking, not recursive**: Splits large arrays into chunks, processes sequentially
- ✅ **Separate helper for single batch**: `fetchSingleBatch()` does actual API call
- ✅ **Maintains accumulation pattern**: Merges chunk results into single Map
- ✅ **Preserves error handling**: Rate limits, 403s, timeouts handled same as single requests
- ✅ **Handles partial failures**: Null entries for nodes not found

**Testing approach:**
- Test with artificially low limit (maxBatchSize: 3) on 10-node request
- Verify correct chunking: 10 nodes → 4 chunks (3+3+3+1)
- Verify merging of results: all 10 nodes in final Map
- Test with edge cases (empty array, single node, exact multiple of batch size)

### Step 6: Update Progress Notifications

**Goal**: Provide accurate progress feedback for batch operations

**Location**: `screen-analysis-regenerator.ts` and `figma-screen-setup.ts`

**Changes:**

```typescript
// In setupFigmaScreens() after batch fetch:
if (notify) {
  await notify(`Fetched metadata for ${totalNodes} nodes in ${batchCount} batch request(s)`);
}

// In regenerateScreenAnalyses():
if (notify) {
  await notify(`📥 Batch downloading ${screensToAnalyze.length} images...`);
}
// ... after download completes:
if (notify) {
  await notify(`✅ Downloaded ${downloadedImages} images. Starting AI analysis...`, screensToAnalyze.length);
}

// Then in analysis loop:
for (let i = 0; i < screensToAnalyze.length; i++) {
  if (notify) {
    await notify(`Analyzing screen ${i + 1}/${screensToAnalyze.length}: ${screen.name}`);
  }
  // ... analysis
}
```

**Testing approach:**
- Run tool through MCP client (Copilot)
- Verify progress messages show batch operations clearly
- Ensure progress bar updates correctly for analysis phase

## Performance & Rate Limit Impact Summary

### Before Batching

**Typical epic** (10 Figma URLs, 20 screens):
- **Phase 1-3 (metadata)**: 10 sequential requests (10-60 seconds)
- **Phase 4 (images)**: 20 sequential requests (20-120 seconds)
- **Total Figma API requests**: 30
- **Rate limit usage** (Dev/Full at 10/min): 3 minutes of quota

### After Batching

**Same epic** (10 Figma URLs, 20 screens):
- **Phase 1-3 (metadata)**: 1 batch request (1-6 seconds)
- **Phase 4 (images)**: 1 batch request + 20 parallel CDN downloads (5-15 seconds)
- **Total Figma API requests**: 2
- **Rate limit usage** (Dev/Full at 10/min): ~12 seconds of quota

### Improvements

- **93% reduction** in Figma API requests (30 → 2)
- **80-90% faster** metadata and image download phases
- **15x better rate limit efficiency**
- **Enables larger epics**: Can handle 50+ screens within rate limits

## Edge Cases to Handle

1. **Multiple file keys**: Epic contains URLs from different Figma files
   - Solution: Already handled in Step 2 (group by fileKey)

2. **Invalid node IDs**: Some URLs point to deleted/moved nodes
   - Solution: Batch API returns `null` for missing nodes, handle gracefully

3. **Partial render failures**: Some nodes can't be rendered as images
   - Solution: Batch images API returns `null` for failed renders, skip those screens

4. **Cache interaction**: Dev cache should work with batch downloads
   - Solution: Check for existing analysis files BEFORE batch download (current behavior)

5. **Rate limit hit during batch**: 429 during batch request affects all nodes
   - Solution: Already handled - throw FigmaUnrecoverableError, tool stops gracefully

6. **Very large batches**: 100+ screens could timeout or hit URL length limits
   - Solution: Step 5 handles chunking large batches

## Backward Compatibility

- ✅ Keep existing single-node functions (`fetchFigmaNode`, `downloadFigmaImage`)
- ✅ MCP tool signatures remain unchanged
- ✅ Output format (screens.yaml, analysis files) identical
- ✅ Error handling behavior consistent
- ✅ Cache behavior unchanged

## Testing Strategy

### Unit Tests
- Test `fetchFigmaNodesBatch()` with mock responses
- Test `downloadFigmaImagesBatch()` with mock responses
- Test chunking logic with various batch sizes
- Test error handling (429, 403, timeout)

### Integration Tests
- Run identify-features on real epic with 5+ URLs and 10+ screens
- Compare output to pre-batching implementation
- Verify console logs show batch requests
- Test with DEV_CACHE_DIR enabled/disabled
- Test with rate limit simulation (mock 429 responses)

### Performance Tests
- Measure execution time before vs after for 20-screen epic
- Verify parallel CDN downloads work correctly
- Check memory usage doesn't spike with large batches

## Questions

1. **Should we add configuration for batch size limits?** Currently proposing hardcoded 50-node limit. Should this be configurable via environment variable?

2. **Should we add metrics/logging for batch efficiency?** For example: "Batch saved 28 API requests (30 → 2)" in console output to show the improvement?

3. **Should parallel CDN downloads have a concurrency limit?** Currently proposing unlimited parallel downloads. Should we limit to N concurrent CDN requests to avoid overwhelming the network?

4. **Should we keep the pipeline optimization as a fallback?** The current pipeline (download next while analyzing current) could be kept as a "sequential mode" if batch downloads fail. Is this worth the added complexity?

5. **Should batch functions be exported from figma-helpers.ts?** They're generic utilities that could be used by future tools. Should they be public exports or internal helpers?

6. **Should we add retry logic for batch requests?** Individual requests already retry on transient errors. Should batch requests have additional retry logic if the entire batch fails?

7. **Should we parallelize batch requests across different file keys?** When an epic has URLs from multiple Figma files (e.g., 5 URLs from fileA, 3 from fileB), should we:
   - **Option A**: Sequential batches - fetch fileA batch, then fileB batch (simpler, easier to debug)
   - **Option B**: Parallel batches - `Promise.all()` on both file key batches (faster, but more complex error handling)
   
   Current plan uses Option A (sequential). Option B would save ~2-5 seconds for multi-file epics.