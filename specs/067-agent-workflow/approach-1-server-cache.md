# 067 — Server-Side Cache + Per-Frame Subagent Processing

**Date:** March 7, 2026  
**Status:** 📝 Design / Research  
**Builds on:** [058-agent-workflow.md](./058-agent-workflow.md), [059-context-tools-with-embedded-prompts.md](./059-context-tools-with-embedded-prompts.md), [060-get-analysis.md](./060-get-analysis.md), [061-prompt-context-tool-pairs.md](./061-prompt-context-tool-pairs.md), [062-workflow-patterns.md](./062-workflow-patterns.md), [063-questions-subagents.md](./063-questions-subagents.md)

## Problem Statement

The current `figma-ask-scope-questions-for-page` tool (implementing the 063 hybrid pattern) returns a massive multi-part MCP response containing base64 images (~500KB each), semantic XML (~5–20KB each, sometimes ~1MB for complex frames), annotations, and embedded prompts — all at once. This causes two critical failures in practice:

1. **Images can't be reliably consumed.** When images are returned as `ImageContent` (type: `image`) in an MCP tool response, agents like VS Code Copilot and Claude Desktop can't "download" them to the filesystem from that context. The workflow instructions tell the agent to save `image.png` from the response, but the agent can't extract base64 image data from a tool response content block and write it as a binary file. The image data is effectively stranded in the response.

2. **Semantic XML overwhelms the agent.** A single frame's `structure://frame/{id}` block can be ~1MB of XML. For a 5-frame page, that's potentially 5MB of XML in one response. Even with compact semantic XML (~5–20KB typical, per spec 038), complex frames with deep component trees blow up. Agents hit context window limits, truncate the response, or simply fail to process it meaningfully.

3. **Agent can't incrementally process.** The 063 pattern assumes the agent receives ALL data, saves it to temp files, then spawns subagents from the filesystem. But the "save to files" step is itself the failure point — the agent must parse a multi-megabyte tool response, extract heterogeneous content blocks (text, image, resource), decode base64, and write files. Most agents can't do this reliably.

### What We Really Need

A pattern where:
- The **MCP server** does the heavy lifting (fetch, cache, organize)
- The **tool response** is lightweight (manifest + instructions, not raw data)
- **Subagents** analyze one frame at a time via a focused tool call
- The per-frame tool **works standalone** (no prior caching step required)
- **Images** are consumed in a way that actually works for the agent's LLM
- **XML** is sized appropriately per-frame, not dumped in bulk

---

## Approach: Server-Side Cache + Per-Frame Analysis Tool

### Architecture

**Orchestrated workflow** (via `figma-ask-scope-questions-for-page`):
```
Agent                                   MCP Server                        Server Filesystem
  │                                         │                                  │
  │─ figma-ask-scope-questions-for-page ───►│                                  │
  │   { url, context? }                     │                                  │
  │                                         ├─ Fetch from Figma API            │
  │                                         │  (batched: 2 T1 + 1 T2 + 1 T3)  │
  │                                         │                                  │
  │                                         ├─ Write to cache/ ───────────────►│
  │                                         │  cache/figma-scope/{fileKey}/     │
  │                                         │                                  │
  │◄─ Lightweight manifest response ────────┤                                  │
  │   (JSON: frame list, cache token,       │                                  │
  │    prompt names, workflow instructions)  │                                  │
  │                                         │                                  │
  │─ Spawn subagent per frame ──────────────┤                                  │
  │                                         │                                  │
  │─ figma-frame-analysis ────────────────►│                                  │
  │   { url, cacheToken }                   │                                  │
  │                                         ├─ Read from cache/ ◄──────────────┤
  │◄─ Single frame:                         │                                  │
  │   image (ImageContent) +                │                                  │
  │   context (text) +                      │                                  │
  │   structure (text, truncated) +         │                                  │
  │   analysis prompt + save instructions   │                                  │
  │                                         │                                  │
  │─ [Subagent: LLM analysis] ─────────────┤                                  │
  │─ [Write analysis.md to local temp/] ────┤                                  │
  │                                         │                                  │
  │─ [Repeat for each frame] ──────────────►│                                  │
  │                                         │                                  │
  │─ [Main agent: scope synthesis] ─────────┤                                  │
  │─ [Main agent: generate questions] ──────┤                                  │
  │                                         │                                  │
  └─ Present to user                        │                                  │
```

**Standalone workflow** (using `figma-frame-analysis` directly):
```
Agent                                   MCP Server                        Figma API
  │                                         │                                  │
  │─ figma-frame-analysis ────────────────►│                                  │
  │   { url (with frame node ID) }          │                                  │
  │                                         ├─ Check cache → miss              │
  │                                         ├─ Fetch single frame data ────────►│
  │                                         │  (image, nodes, comments)         │
  │                                         ├─ Generate XML, build context     │
  │                                         ├─ Cache for 10 min               │
  │◄─ Single frame:                         │                                  │
  │   image (ImageContent) +                │                                  │
  │   context (text) +                      │                                  │
  │   structure (text) +                    │                                  │
  │   analysis prompt + save instructions   │                                  │
  │                                         │                                  │
  │─ [Agent: LLM analysis] ────────────────┤                                  │
  │─ [Write analysis.md to local file] ─────┤                                  │
  │                                         │                                  │
  └─ Present to user                        │                                  │
```

### Key Design Principles

1. **Server owns the data.** All Figma data is fetched once, stored in a server-side cache. The agent never handles raw base64 bulk transfers.
2. **Manifest is the contract.** The orchestration tool returns a JSON manifest (~2KB) describing what's available, not the data itself.
3. **`figma-frame-analysis` is standalone.** It always takes a Figma URL (which contains the frame node ID). An optional `cacheToken` reads from pre-populated cache instead of hitting the Figma API. When called without a `cacheToken`, it fetches the frame data itself and populates the cache automatically.
4. **Per-frame responses.** Each `figma-frame-analysis` call returns ONE frame's data, sized for a single LLM context window, along with the analysis prompt and instructions to save the result.
5. **TTL-based cache.** Cache entries expire after 10 minutes (configurable). Designed for the duration of a single design review session.
6. **Graceful degradation.** If cache expires mid-workflow, `figma-frame-analysis` can re-fetch on the fly (no need to re-run the orchestration tool).

---

## 1. Cache Architecture

### Directory Structure

```
cache/figma-scope/{fileKey}/
├── .cache-metadata.json          # TTL tracking, creation time, file metadata
├── manifest.json                 # Frame list, page info, prompt references
├── prompts/
│   ├── frame-analysis.md         # Analysis instructions (from FRAME_ANALYSIS_PROMPT_TEXT)
│   ├── scope-synthesis.md        # Synthesis instructions (from SCOPE_SYNTHESIS_PROMPT_TEXT)
│   └── generate-questions.md     # Questions instructions (from QUESTIONS_GENERATION_PROMPT_TEXT)
└── frames/
    ├── {nodeId-safe}/            # e.g., "123-456" (colons replaced with dashes)
    │   ├── image.png             # Raw PNG (NOT base64 — binary on disk)
    │   ├── image-base64.txt      # Base64-encoded PNG (for fast retrieval without re-encoding)
    │   ├── context.md            # Annotations, comments, connections
    │   ├── structure.xml         # Semantic XML (full)
    │   └── structure-summary.md  # Truncated/summarized XML (if full > threshold)
    ├── {nodeId-safe}/
    │   └── ...
    └── ...
```

**Why `cache/figma-scope/` instead of `cache/figma-files/`?**

The existing `cache/figma-files/{fileKey}/` cache (in `figma-cache.ts`) is designed for long-lived caching (7-day TTL) with `lastTouchedAt`-based invalidation. It stores node data, images, and analyses for the story-writing workflow. The scope questions workflow has different characteristics:

- **Short-lived** — data is only needed for the current review session (10 minutes)
- **Different data shape** — includes prompts, context markdown, structure summaries
- **Different invalidation** — TTL-based, not timestamp-based
- **No cross-workflow reuse** — scope review cache doesn't benefit story-writing and vice versa

Keeping them separate avoids cache conflicts and simplifies cleanup.

### Cache Metadata File (`.cache-metadata.json`)

```json
{
  "fileKey": "abc123DEF",
  "createdAt": "2026-03-07T14:30:00.000Z",
  "expiresAt": "2026-03-07T14:40:00.000Z",
  "ttlMs": 600000,
  "figmaLastTouchedAt": "2026-03-06T10:15:00.000Z",
  "fileName": "My Design File",
  "pageName": "Page 1",
  "pageId": "0:1",
  "frameCount": 5,
  "cacheToken": "abc123DEF-1709822400000"
}
```

The `cacheToken` is `{fileKey}-{Date.now()}` — a unique identifier for THIS cache session. When used in the orchestrated workflow, this is what the agent passes back to `figma-frame-analysis`. When `figma-frame-analysis` is called standalone (with a URL, no cacheToken), it creates or reuses a cache entry automatically.

### TTL and Cleanup Strategy

**10-minute TTL** — chosen to cover a typical design review session:
- Initial fetch: ~10s
- Subagent frame analysis (5 frames parallel): ~30–60s per frame
- Scope synthesis: ~20s
- Question generation: ~15s
- User review: ~5 minutes
- Total: ~7 minutes typical, 10 minutes generous

**Cleanup mechanism: Lazy cleanup on access (not cron).**

Rationale:
- **Cron/interval** requires a background timer, adds complexity, and runs even when no reviews are happening. The existing `CLEANUP_INTERVAL_MS` in `temp-directory-manager.ts` is 1 hour — far too coarse for 10-minute TTL.
- **Lazy cleanup** checks TTL when a cache is accessed (read or create). If expired, delete and return a cache-miss error. On cache creation, also scan for and delete other expired entries in `cache/figma-scope/`.

```typescript
// Pseudocode for lazy cleanup
async function getOrValidateCache(fileKey: string, cacheToken: string): Promise<CacheEntry | null> {
  const cacheDir = path.join(getBaseCacheDir(), 'figma-scope', fileKey);
  const metadataPath = path.join(cacheDir, '.cache-metadata.json');
  
  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    
    // Check token match
    if (metadata.cacheToken !== cacheToken) {
      return null; // Different cache session
    }
    
    // Check TTL
    if (new Date(metadata.expiresAt).getTime() < Date.now()) {
      await fs.rm(cacheDir, { recursive: true, force: true });
      return null; // Expired
    }
    
    return metadata;
  } catch {
    return null; // Missing or corrupt
  }
}

// On cache creation, clean up other expired entries
async function cleanupExpiredCaches(): Promise<void> {
  const scopeDir = path.join(getBaseCacheDir(), 'figma-scope');
  try {
    const entries = await fs.readdir(scopeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(scopeDir, entry.name, '.cache-metadata.json');
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
        if (new Date(meta.expiresAt).getTime() < Date.now()) {
          await fs.rm(path.join(scopeDir, entry.name), { recursive: true, force: true });
        }
      } catch {
        // Corrupt entry — remove it
        await fs.rm(path.join(scopeDir, entry.name), { recursive: true, force: true });
      }
    }
  } catch {
    // scopeDir doesn't exist yet — fine
  }
}
```

### Integration with Existing Cache Infrastructure

The existing `getBaseCacheDir()` from `temp-directory-manager.ts` returns `cache/` (or `DEV_CACHE_DIR` if set). The new scope cache lives alongside the existing structure:

```
cache/
├── figma-files/     # Existing: long-lived Figma data cache (7-day TTL)
├── figma-scope/     # NEW: short-lived scope review cache (10-min TTL)
├── google-docs/     # Existing: Google Docs cache
└── logs.txt         # Existing: debug logs
```

### Cache File Implementation

**New file:** `server/providers/figma/scope-cache.ts`

Exports:
- `createScopeCache(fileKey, data)` — writes all cache files, returns cacheToken
- `getScopeCacheEntry(cacheToken, fileKey)` — validates TTL, returns metadata or null
- `readCachedFrameData(cacheToken, fileKey, nodeId)` — returns frame image/context/structure
- `readCachedPrompt(cacheToken, fileKey, promptName)` — returns prompt text
- `cleanupExpiredScopeCaches()` — removes expired entries

---

## 2. The Manifest Response

### What `figma-ask-scope-questions-for-page` Returns (New Behavior)

The tool **no longer returns raw data**. Instead, it:
1. Fetches all Figma data (same batched API calls as today)
2. Writes everything to the server-side scope cache
3. Returns a lightweight manifest + workflow instructions

### Manifest JSON Schema

```json
{
  "cacheToken": "abc123DEF-1709822400000",
  "fileKey": "abc123DEF",
  "fileName": "My Design File",
  "pageName": "Home Page",
  "pageId": "0:1",
  "cacheExpiresAt": "2026-03-07T14:40:00.000Z",
  "frameCount": 5,
  "frames": [
    {
      "id": "123:456",
      "name": "Login Screen",
      "url": "https://www.figma.com/design/abc123DEF/My-Design-File?node-id=123:456",
      "order": 1,
      "section": null,
      "annotationCount": 3,
      "hasImage": true,
      "structureSize": 15234,
      "structureTruncated": false
    },
    {
      "id": "789:012",
      "name": "Dashboard",
      "url": "https://www.figma.com/design/abc123DEF/My-Design-File?node-id=789:012",
      "order": 2,
      "section": "Main Flow",
      "annotationCount": 1,
      "hasImage": true,
      "structureSize": 1048576,
      "structureTruncated": true
    }
  ],
  "featureContext": "E-commerce checkout flow redesign",
  "availablePrompts": [
    "frame-analysis",
    "scope-synthesis",
    "generate-questions"
  ],
  "retrievalTool": "figma-frame-analysis",
  "promptRetrievalTool": "figma-get-cached-prompt"
}
```

### Full Tool Response Structure

```typescript
{
  content: [
    // 1. MANIFEST (lightweight JSON)
    {
      type: "text",
      text: JSON.stringify(manifest, null, 2)
    },
    
    // 2. WORKFLOW INSTRUCTIONS (tells agent what to do)
    {
      type: "text",
      text: `# Design Review Scope Questions — Workflow Instructions

You have received a manifest describing ${frameCount} Figma frames cached on the server.
The actual frame data (images, structure, annotations) is NOT in this response — 
it's stored server-side and must be retrieved one frame at a time.

## Step 1: Analyze each frame

> **⚡ PARALLEL**: Spawn one subagent per frame.

For each frame in the manifest, call \`figma-frame-analysis\` with:
- \`url\`: the frame's \`url\` from the manifest
- \`cacheToken\`: "${cacheToken}" (optional — speeds up by reading from server cache)

That tool returns the frame's image, context, structure, analysis prompt,
and instructions for saving your analysis — everything needed to analyze 
one frame and save the result.

### Subagent Task (per frame)

\`\`\`
Call \`figma-frame-analysis\` with url="{frameUrl}" and 
cacheToken="${cacheToken}". The response contains:
- An image of the frame (use as vision input)
- Context markdown with annotations and connections
- Semantic XML structure of the component tree
- Analysis prompt with detailed instructions
- Instructions for where to save your analysis

Follow the analysis prompt to analyze this frame. Save your analysis
to the path specified in the response instructions.
\`\`\`

## Step 2: Synthesize scope

After ALL frame analyses are complete, retrieve the synthesis prompt:

Call \`figma-get-cached-prompt\` with:
- \`cacheToken\`: "${cacheToken}" 
- \`promptName\`: "scope-synthesis"

Then synthesize all frame analyses into a cross-screen scope analysis.

## Step 3: Generate questions

Call \`figma-get-cached-prompt\` with:
- \`cacheToken\`: "${cacheToken}"
- \`promptName\`: "generate-questions"

Generate frame-specific clarifying questions.

## Step 4: Present to user

Present the questions. User may answer or ask you to post to Figma.

## Cache Expiration

The cached data expires at ${cacheExpiresAt} (10 minutes from now).
If you get a cache expiration error, call \`figma-ask-scope-questions-for-page\` 
again with the same URL to refresh.

## Writing Analyses

Save frame analyses and scope analysis to your local workspace:
\`\`\`
temp/cascade/${fileKey}/
├── frames/
│   ├── {frame-name}/
│   │   └── analysis.md
│   └── ...
├── scope-analysis.md
└── questions.md
\`\`\`
`
    }
  ]
}
```

### Why This Manifest Design

**What the agent needs to orchestrate subagents:**
- Frame count and URLs → knows how many subagents to spawn, each with a URL
- Frame names → meaningful subagent task descriptions
- Cache token → passes as optimization hint to the retrieval tool
- Expiration time → can warn user if running slow
- Workflow instructions → step-by-step plan
- `retrievalTool` name → explicit tool to call next

**What the agent does NOT need in this response:**
- Actual images (500KB each) — retrieved per-frame via `figma-frame-analysis`
- Semantic XML (5KB–1MB each) — retrieved per-frame
- Annotations text — retrieved per-frame
- Prompt text — retrieved via `figma-get-cached-prompt`

**Response size estimate:** ~3–5KB total (manifest JSON + workflow text). Compare to current: ~3–8MB (with images and XML).

---

## 3. Per-Frame Analysis Tool: `figma-frame-analysis`

This tool takes a Figma URL pointing to a specific frame and returns everything needed to analyze it. The `cacheToken` is an optional optimization — when provided, the tool reads from the server cache instead of hitting the Figma API.

- **Standalone**: Just pass the URL. The tool fetches from Figma, caches the result, and returns it.
- **Orchestrated**: Pass the URL + `cacheToken` (from `figma-ask-scope-questions-for-page`). The tool reads from cache (fast, 0 API calls) and falls back to Figma if the cache expired.

Either way, the response is identical: one frame's image + context + structure + analysis prompt + save instructions.

### Tool Interface

```typescript
{
  name: "figma-frame-analysis",
  description: 
    "Analyze a single Figma frame. Returns the frame's image, context annotations, " +
    "semantic XML structure, and an analysis prompt with instructions for saving results. " +
    "Pass a Figma URL pointing to a frame. Optionally include a cacheToken from " +
    "figma-ask-scope-questions-for-page to skip the Figma API call (reads from server cache).",
  inputSchema: {
    url: z.string()
      .describe("Figma URL pointing to a specific frame (e.g., 'https://www.figma.com/design/ABC/file?node-id=123:456'). " +
        "The frame node ID is extracted from the URL."),
    
    cacheToken: z.string().optional()
      .describe("Cache session token from figma-ask-scope-questions-for-page manifest. " +
        "When provided, reads from server cache instead of calling the Figma API. " +
        "Falls back to live fetch if the cache has expired."),
    
    context: z.string().optional()
      .describe("Optional feature context to include in the analysis prompt (e.g., 'E-commerce checkout flow')"),
    outputDir: z.string().optional()
      .describe("Directory where the agent should save the analysis result. Defaults to './temp/cascade/{fileKey}/frames/{frame-name}/'"),
    includeStructure: z.boolean().optional().default(true)
      .describe("Include semantic XML structure. Set false to reduce response size."),
    maxStructureSize: z.number().optional().default(50000)
      .describe("Max characters of semantic XML to include. Larger structures are truncated with a summary.")
  }
}
```

### Why `url` Is Always Required

The URL is the **canonical identifier** for a frame. It contains both the file key and node ID. Making it required means:
- **No separate `frameId` parameter** — parsed from the URL
- **Cache miss always has a fallback** — the tool can always re-fetch from Figma
- **One input path, not two** — simpler for agents to understand
- **Manifest includes URLs per frame** — the orchestrated workflow passes URLs, not opaque IDs

The `cacheToken` is purely an optimization hint. The tool works identically with or without it.

### Data Resolution Logic

```typescript
async function resolveFrameData(params: { url: string; cacheToken?: string }, figmaClient: FigmaClient): Promise<FrameData> {
  const { fileKey, nodeId } = parseFigmaUrl(params.url);
  
  // 1. Try cache first (if cacheToken provided)
  if (params.cacheToken) {
    const cached = await readCachedFrameData(params.cacheToken, nodeId);
    if (cached) return cached;
    // Cache miss/expired — fall through to live fetch
  }
  
  // 2. Check for any existing cache for this fileKey + nodeId (even without cacheToken)
  const existingCache = await findExistingFrameCache(fileKey, nodeId);
  if (existingCache) return existingCache;
  
  // 3. Fetch from Figma API
  const frameData = await fetchSingleFrameData(fileKey, nodeId, figmaClient);
  
  // 4. Cache for future calls (same 10-min TTL)
  await cacheSingleFrame(fileKey, nodeId, frameData);
  
  return frameData;
}
```

### `fetchSingleFrameData` — Standalone Fetch

When `figma-frame-analysis` is called standalone (no cache), it fetches just enough data for one frame:

```typescript
async function fetchSingleFrameData(
  fileKey: string, 
  nodeId: string, 
  figmaClient: FigmaClient
): Promise<FrameData> {
  // Parallel fetch: node data + image + comments
  const [nodeData, imageResult, comments] = await Promise.all([
    // T1: Get node tree for this specific node
    figmaClient.getFileNodes(fileKey, [nodeId]),
    // T1: Get image for this specific node  
    figmaClient.getImage(fileKey, [nodeId], { format: 'png', scale: 1 }),
    // T2: Get comments for the file (cached internally)
    figmaClient.getComments(fileKey),
  ]);
  
  // Generate semantic XML from the node tree
  const semanticXml = generateSemanticXml(nodeData.nodes[nodeId].document);
  
  // Build context markdown (annotations, comments near this frame)
  const contextMd = buildFrameContext(nodeData, nodeId, comments);
  
  // Download the image
  const imageUrl = imageResult.images[nodeId];
  const imageBase64 = await downloadImageAsBase64(imageUrl);
  
  return { nodeId, nodeData, semanticXml, contextMd, imageBase64, imageMimeType: 'image/png' };
}
```

**Figma API budget for standalone:** 2 T1 calls + 1 T2 call (3 total). Compare to orchestrated: 0 calls (reads from cache populated by the page-level fetch).

### Response Structure

The response is the same regardless of whether data came from cache or live fetch:

```typescript
{
  content: [
    // 1. Frame metadata (JSON)
    {
      type: "text",
      text: JSON.stringify({
        frameId: "123:456",
        frameName: "Login Screen",
        fileKey: "abc123DEF",
        order: 1,
        section: null,
        cacheToken: "abc123DEF-1709822400000", // present if using cache
        structureTruncated: false,
        structureOriginalSize: 15234,
      })
    },
    
    // 2. Frame image (MCP ImageContent — standard way)
    {
      type: "image",
      data: "<base64-png>",      // ~500KB at scale:1
      mimeType: "image/png"
    },
    
    // 3. Frame context (annotations, comments, connections)
    {
      type: "text",
      text: "# Login Screen (Frame 123:456)\n\n## Comments\n- @designer: Use primary button style..."
    },
    
    // 4. Semantic XML structure (truncated if needed)
    {
      type: "text", 
      text: "<Frame name=\"Login Screen\" width=\"1440\" height=\"900\">..."
    },
    
    // 5. Analysis prompt + save instructions
    {
      type: "text",
      text: `# Frame Analysis Instructions

You are analyzing a single UI frame from a Figma design.

${FRAME_ANALYSIS_PROMPT_TEXT}

${context ? `## Feature Context\n\n${context}\n\n` : ''}## Save Your Analysis

Write your complete analysis as markdown to:

\`${outputDir}/analysis.md\`

The analysis should follow the format above. This file will be collected
by the orchestrating agent for scope synthesis across all frames.

If the directory doesn't exist, create it first.`
    }
  ]
}
```

### Why These Design Choices

**`url` always required, `cacheToken` optional**: The URL is the canonical identifier — it always works. The `cacheToken` is a performance optimization that avoids Figma API calls when the data was pre-fetched. This means:
- Subagents get the simplest possible instructions: "Call `figma-frame-analysis` with this URL"
- Cache expiration is invisible — the tool silently re-fetches from Figma
- The tool is useful OUTSIDE the orchestrated workflow (an agent can analyze any frame by URL)
- No `CACHE_EXPIRED` error handling needed — the URL is always the fallback
- No separate `frameId` parameter — parsed from the URL

**Image as `ImageContent` (type: `image`)**: One image per response (~500KB at scale:1) is manageable. The LLM processes it inline as vision input.

**Analysis prompt included in response**: The subagent receives everything it needs in one call — no separate prompt retrieval step. The prompt includes the feature context and explicit save path.

**Save instructions included**: The response tells the agent exactly where to write the analysis result. The directory path is deterministic (`temp/cascade/{fileKey}/frames/{frame-name}/analysis.md`) so the orchestrating agent knows where to find it later.

### Implementation

```typescript
export async function executeFrameAnalysis(
  params: { 
    url: string; cacheToken?: string;
    context?: string; outputDir?: string;
    includeStructure?: boolean; maxStructureSize?: number 
  },
  figmaClient: FigmaClient
): Promise<ToolResponse> {
  const { includeStructure = true, maxStructureSize = 50000 } = params;

  // 1. Resolve frame data (cache or live fetch)
  const frameData = await resolveFrameData(params, figmaClient);
  
  // 2. Determine output directory
  const frameName = sanitizeFrameName(frameData.frameName || frameData.nodeId);
  const defaultOutputDir = `./temp/cascade/${frameData.fileKey}/frames/${frameName}`;
  const outputDir = params.outputDir || defaultOutputDir;

  // 3. Truncate structure if needed
  let structureContent = frameData.semanticXml;
  let structureTruncated = false;
  if (includeStructure && structureContent.length > maxStructureSize) {
    structureTruncated = true;
    structureContent = truncateSemanticXml(structureContent, maxStructureSize);
  }

  // 4. Build response
  const content: ContentBlock[] = [];
  
  // Metadata
  content.push({
    type: 'text',
    text: JSON.stringify({
      frameId: frameData.nodeId,
      frameName: frameData.frameName,
      fileKey: frameData.fileKey,
      order: frameData.order || 0,
      section: frameData.section || null,
      cacheToken: frameData.cacheToken || null,
      structureTruncated,
      structureOriginalSize: frameData.semanticXml.length,
    }),
  });

  // Image
  if (frameData.imageBase64) {
    content.push({
      type: 'image',
      data: frameData.imageBase64,
      mimeType: frameData.imageMimeType || 'image/png',
    });
  }

  // Context
  content.push({ type: 'text', text: frameData.contextMd });

  // Structure
  if (includeStructure && structureContent) {
    content.push({ type: 'text', text: structureContent });
  }

  // Analysis prompt + save instructions
  const analysisPrompt = buildAnalysisPromptWithSaveInstructions(
    params.context, 
    outputDir, 
    frameData.frameName
  );
  content.push({ type: 'text', text: analysisPrompt });

  return { content };
}

function buildAnalysisPromptWithSaveInstructions(
  featureContext: string | undefined,
  outputDir: string,
  frameName: string
): string {
  return `# Frame Analysis Instructions

You are analyzing a single UI frame from a Figma design: **${frameName}**

${FRAME_ANALYSIS_PROMPT_TEXT}

${featureContext ? `## Feature Context\n\n${featureContext}\n\n` : ''}## Save Your Analysis

Write your complete analysis as markdown to:

\`${outputDir}/analysis.md\`

The analysis should follow the format specified above. If the output directory 
doesn't exist, create it first.

This file will be collected by the orchestrating agent for scope synthesis 
across all frames. If you are working standalone (not part of a multi-frame 
workflow), the analysis is still saved for reference and re-use.`;
}
```

---

## 4. Prompt Retrieval Tool: `figma-get-cached-prompt`

### Tool Interface

```typescript
{
  name: "figma-get-cached-prompt",
  description:
    "Retrieve a cached prompt for a design review workflow step. " +
    "Use after frame analyses are complete to get scope synthesis or question generation prompts.",
  inputSchema: {
    cacheToken: z.string()
      .describe("Cache session token from the figma-ask-scope-questions-for-page manifest"),
    promptName: z.enum(["scope-synthesis", "generate-questions"])
      .describe("Which prompt to retrieve. 'scope-synthesis' for combining analyses, 'generate-questions' for generating review questions.")
  }
}
```

### Response

```typescript
{
  content: [
    {
      type: "text",
      text: "# Scope Synthesis Instructions\n\nYou are combining individual frame analyses..."
    }
  ]
}
```

Simple — just returns the prompt text. The frame-analysis prompt is bundled with `figma-frame-analysis` so subagents get it automatically.

---

## 5. Subagent Coordination Pattern

### How the Main Agent Orchestrates

After receiving the manifest, the main agent:

1. **Spawns one subagent per frame**, passing each:
   - The frame's `url` from the manifest (and optionally the `cacheToken`)
   - A task description: "Call `figma-frame-analysis` with this URL, analyze the frame following the included prompt, save your analysis as instructed"
   - An output path: `temp/cascade/{fileKey}/frames/{frame-name}/analysis.md` (the tool includes the exact save path in its response)

2. **Waits for all subagents to complete.** Agent platforms (VS Code Copilot, Claude Code) have their own subagent completion mechanisms:
   - VS Code Copilot: Uses `#new_task` / tool result collection
   - Claude Code: Subagent tool returns when the sub-task completes
   - Generic: Agent polls for analysis.md files in the expected locations

3. **Collects results** by reading `temp/cascade/{fileKey}/frames/*/analysis.md`

4. **Runs synthesis** using `figma-get-cached-prompt` to get the synthesis prompt, then feeds all analyses to its LLM

5. **Runs question generation** using `figma-get-cached-prompt` similarly

### Subagent Output Location

Subagents write to the agent's local filesystem (NOT the server cache):

```
temp/cascade/{fileKey}/
├── frames/
│   ├── login-screen/
│   │   └── analysis.md          # Written by subagent
│   ├── dashboard/
│   │   └── analysis.md          # Written by subagent
│   └── ...
├── scope-analysis.md             # Written by main agent after Step 2
└── questions.md                  # Written by main agent after Step 3
```

**Why local filesystem, not server cache?**

- Subagents have filesystem access (that's how they operate in VS Code Copilot and Claude Code)
- Local files are inspectable by the user
- Resumability: if the workflow is interrupted, re-running skips frames with existing `analysis.md`
- Server cache is ephemeral (10 min TTL) — analyses should persist longer
- Separates concerns: server caches raw Figma data, agent stores analyses

### What If Subagents Don't Have MCP Access?

Some subagent implementations may not forward MCP tool access to the child agent. The workflow instructions address this:

```markdown
> If your subagents cannot call MCP tools, call `figma-frame-analysis` 
> yourself for each frame URL BEFORE spawning subagents. Save the returned data 
> to local files, then spawn subagents that read from the filesystem instead.
```

This is a fallback — it means the main agent makes N sequential tool calls (one per frame) but then spawns subagents that only need filesystem access. The cost is N sequential tool round-trips, but each is fast (reading from server cache, not calling Figma API).

### What If the Agent Doesn't Support Subagents?

The workflow instructions include:

```markdown
> **Without subagents:** Process frames sequentially. For each frame:
> 1. Call `figma-frame-analysis` with the frame's URL from the manifest
> 2. Analyze the frame following the included prompt
> 3. Save your analysis to the path specified in the response
> Then proceed to scope synthesis.
```

Same result, just slower. The tool response is still lightweight, and the agent processes one frame at a time — never overwhelmed by bulk data.

---

## 6. Image Delivery Analysis

### Options Evaluation

| Option | How It Works | Pros | Cons |
|--------|-------------|------|------|
| **A. ImageContent (type: 'image')** | Base64 in MCP tool response as standard ImageContent | MCP-native; LLM vision support; no extra infrastructure | Doesn't work well in bulk (current problem); ~500KB per image |
| **B. HTTP endpoint serving cached images** | Server adds `GET /api/cache/{cacheToken}/frame/{nodeId}/image.png` | Agent can use URL directly; supports large images | Requires auth on the endpoint; agents may not follow URLs; extra HTTP infrastructure |
| **C. Local file path reference** | Tell agent the image is at `path/to/image.png` on the server | Zero transfer overhead | Agent can't access server filesystem; doesn't work for remote MCP servers |
| **D. Server-side analysis (no image to agent)** | Server runs LLM analysis internally, returns text results | Avoids image problem entirely | Requires server-side LLM (sampling); defeats the purpose of agent-driven workflow |
| **E. Figma CDN URL** | Return the temporary Figma image URL (from `/images` API) | Tiny response; agent fetches when needed | URLs expire (~30 min); requires agent to handle HTTP; may not work with MCP LLM integration |

### Recommendation: Option A (ImageContent) — Per Frame

The problem with ImageContent was never "it doesn't work" — it was "returning 5 images at once in a 3MB response overwhelms the agent." With the per-frame analysis tool, each `figma-frame-analysis` call returns exactly **one** image. This is the canonical use case for MCP `ImageContent`:

- The image goes directly to the LLM's vision model as part of the tool response
- One ~500KB image per response is within normal MCP payload sizes
- No extra HTTP endpoints, no URL expiration, no filesystem access issues
- Works identically for local and remote MCP servers

**Supplementary: Option B as Enhancement**

For agents that can fetch URLs (or for future use), the manifest could optionally include Figma CDN URLs. But this is NOT the primary path — ImageContent covers the core use case.

### Image Sizing

The current tool fetches images at `scale: 2` (retina). For a 1440×900 frame, that's a 2880×1800 PNG — potentially 1–2MB before base64. Consider:

- **Default scale: 1** for the scope cache (reduces image size by ~75%)
- **Option to request higher res** in `figma-frame-analysis` (but the cache only stores one resolution)
- LLM vision models work well with 1x resolution — retina detail isn't needed for UI analysis

**Recommendation:** Cache at `scale: 1`. If the analysis prompt needs fine detail, the agent can call `figma-get-image-download` directly (existing tool) for a specific frame at higher resolution.

---

## 7. Semantic XML Sizing Strategy

### The Problem

Semantic XML is typically 5–20KB per frame (per spec 038 — 99% reduction from raw JSON). But complex frames with deep component trees (design system components with many variants, data tables, etc.) can balloon to 200KB–1MB+.

When returned inside a per-frame tool response alongside an image (~500KB) and context (~2KB), a 1MB XML blob pushes the response to ~1.5MB. While technically deliverable, the LLM that receives this spends most of its context window on XML tokens that provide diminishing returns.

### Strategy: Tiered XML Delivery

```
XML Size          | Action
< 50KB            | Include full XML in tool response (typical case)
50KB – 200KB      | Truncate: keep top 2 levels of the tree, summarize deeper levels
> 200KB           | Aggressive truncation: top-level components only + statistics
```

### Truncation Algorithm

```typescript
function truncateSemanticXml(xml: string, maxSize: number): string {
  if (xml.length <= maxSize) return xml;
  
  // Strategy: Parse the XML tree and progressively remove depth
  // 1. Keep all Level 0 and Level 1 nodes fully
  // 2. For Level 2+ nodes, replace children with a summary comment
  // 3. If still too large, collapse Level 1 children too
  
  // Append a note about truncation
  const truncationNote = `\n<!-- TRUNCATED: Original XML was ${xml.length.toLocaleString()} characters. ` +
    `Showing top-level structure only. Key component types and counts preserved. -->`;
  
  // ... tree truncation logic ...
  
  return truncatedXml + truncationNote;
}
```

### Alternative: Structured Summary Instead of XML

For very large frames, instead of truncated XML, generate a **structured markdown summary**:

```markdown
# Component Structure: Dashboard

## Top-Level Layout
- **Header** (FRAME): Navigation bar with 5 items
- **Sidebar** (FRAME): 3 menu sections, 12 total items
- **Main Content** (FRAME): Contains DataTable + 2 Charts
- **Footer** (FRAME): Links and copyright

## Component Inventory
| Component Type | Count | Notable Variants |
|---------------|-------|------------------|
| Button        | 14    | Primary (3), Secondary (8), Icon-only (3) |
| Input         | 6     | Text (4), Search (1), Select (1) |
| DataTable     | 1     | 5 columns, sortable headers |
| Chart         | 2     | Bar chart, Line chart |
| Avatar        | 3     | Small (2), Large (1) |

## Interactive Elements
- 14 clickable buttons
- 6 form inputs
- 1 sortable table
- 5 navigation links

## Total Nodes: 347 (showing top 2 levels of 7)
```

This summary is ~500 bytes vs ~500KB of XML and gives the LLM the same actionable information for analysis purposes.

### Recommendation: Hybrid

1. **< 50KB**: Full XML (default for `maxStructureSize: 50000`)
2. **50KB–200KB**: Truncated XML (top 2 levels + depth comments)
3. **> 200KB**: Markdown summary generated at cache creation time, stored as `structure-summary.md`

The `figma-frame-analysis` response includes whichever representation fits. The metadata block indicates `structureTruncated: true` and `structureOriginalSize` so the agent knows.

For agents that want the full XML regardless (rare), they can call the existing `figma-get-metadata-for-layer` tool + `generateSemanticXml()` pattern directly.

---

## 8. Failure Modes and Recovery

### Cache Expires Mid-Workflow

**Scenario:** Agent starts a 5-frame review. Frames 1–3 analyzed successfully. Frame 4's subagent calls `figma-frame-analysis` with `url + cacheToken` but the cache expired (10-minute TTL exceeded).

**Handling — automatic recovery (transparent):**

Because `url` is always provided, cache expiration is **invisible to the caller**. The tool silently falls back to a live Figma fetch:

```typescript
// Inside resolveFrameData():
// 1. Try cache (cacheToken provided) → miss (expired)
// 2. Fetch from Figma using the URL → re-cache → return data
// The subagent never sees an error
```

No error handling needed. No retry logic. The tool always works as long as the Figma API is reachable — the `cacheToken` just makes it faster.

**Mitigation: TTL Extension on Access**

To reduce unnecessary re-fetches, `figma-frame-analysis` **extends the TTL** each time it reads from cache successfully:

```typescript
// On successful cache read, bump expiration by 5 minutes
metadata.expiresAt = new Date(Math.max(
  new Date(metadata.expiresAt).getTime(),
  Date.now() + 5 * 60 * 1000
)).toISOString();
await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
```

This means the cache stays alive as long as it's being actively used. The 10-minute TTL only triggers if the cache goes 10 minutes without any reads.

### Subagent Fails

**Scenario:** Subagent for frame 3 crashes or returns garbage.

**Handling:** The main agent detects missing/invalid `analysis.md` for that frame and can:
1. Retry by spawning a new subagent for the same frame
2. Skip the frame and note it in the scope synthesis
3. Process it sequentially (fallback from parallel)

The cached data is still available (not consumed by the failed attempt), so retries are free.

### Figma API Failure During Initial Fetch

**Scenario:** `figma-ask-scope-questions-for-page` fails partway through Figma API calls.

**Handling:** Same as today — the tool returns an error result. No cache is created. The agent can retry.

Partial failures (e.g., images for 3/5 frames fetched, then rate limit) should still create the cache but mark failed frames:

```json
{
  "frames": [
    { "id": "123:456", "name": "Login", "hasImage": true },
    { "id": "789:012", "name": "Dashboard", "hasImage": false, "error": "Rate limited" }
  ]
}
```

The agent can still analyze frames with data and retry failed frames later.

### Network Error During Cached Frame Retrieval

**Scenario:** `figma-frame-analysis` fails due to server restart or filesystem issue.

**Handling:** Standard MCP error. Since `url` is always provided, the agent can simply retry the same call — the tool will re-fetch from Figma if the cache is gone.

### Concurrent Reviews of Same File

**Scenario:** Two agents (or the same agent twice) start a review of the same Figma file simultaneously.

**Handling:** The `cacheToken` includes a timestamp, making each session unique. However, both sessions write to `cache/figma-scope/{fileKey}/`, which is the same directory.

**Solution:** Include the timestamp in the directory name:

```
cache/figma-scope/{fileKey}-{timestamp}/
```

Or simpler: the second call overwrites the first cache (last-write-wins). Since both fetched the same Figma data, the content is identical. The cacheToken of the first session becomes invalid, and that agent gets a `CACHE_EXPIRED` error and re-fetches.

**Recommendation:** Last-write-wins is simplest and correct. Concurrent reviews of the same file return the same data, so cache collisions are benign.

---

## 9. Comparison with Prior Approaches (Specs 058–063)

### Evolution of the Design

| Spec | Pattern | What It Solved | What Failed |
|------|---------|---------------|-------------|
| **058** | Decomposed tools + orchestration prompts | Agents can use their own LLM; no sampling needed | Too many sequential tool calls (3+ per frame × N frames); agents lose track |
| **059** | Context tools with embedded prompts | Reduced tool calls to 3–5 sequential | Still multi-step; embedded `prompt://` URIs caused confusion |
| **060** | Single "super tool" returns everything | One tool call gets all data + prompts | Massive response (~3–8MB); images stranded in response; XML overwhelms |
| **061** | Prompt + Context Tool pairs | Clean discovery via MCP prompts; self-contained context tools | Same payload problem as 060 — context tool returns ALL data at once |
| **062** | MCP Resources as prompt library + subagent patterns | Resources for stable prompt URIs; subagent fork/join for parallelism | Hybrid pattern (062b) still relies on agent parsing mega-response and saving to files |
| **063** | Server batch + local files + subagents | Optimal API efficiency; filesystem coordination | **The "save to files" step is the failure point** — agent can't reliably extract and save images from multi-MB tool response |
| **067** (this spec) | Server-side cache + per-frame retrieval | Server does all heavy lifting; agent gets lightweight manifest; one frame per tool call | Adds a second tool call layer; 10-min TTL requires management |

### What 067 Solves That Prior Specs Didn't

1. **The image delivery problem.** Prior specs returned 5+ images in one response (ImageContent or embedded resources). Agents couldn't extract and save them. 067 returns ONE image per `figma-frame-analysis` call, using standard `ImageContent` — exactly how MCP tools are supposed to deliver images to LLMs.

2. **The XML sizing problem.** Prior specs returned all frames' XML in one response. 067 delivers XML per-frame with configurable truncation (`maxStructureSize`), keeping each response under ~600KB.

3. **The "parse mega-response" problem.** 063 assumed the agent could parse a multi-part response with heterogeneous content types, extract base64 images, and write them as binary files. 067 removes this requirement — the agent only parses a small JSON manifest.

4. **The cache ownership problem.** Prior specs had agents manage their own cache or relied on the Figma file cache (7-day TTL, `lastTouchedAt`-based). 067 introduces a purpose-built scope cache with session-scoped TTL (10 minutes) that automatically cleans up.

5. **The subagent MCP access problem.** 062/063 had subagents calling MCP tools (resources, frame data tools). 067's subagents can call ONE MCP tool (`figma-frame-analysis`) which returns everything they need — image, context, structure, analysis prompt, AND save instructions. Alternatively, subagents can work from local files if the main agent pre-fetches.

6. **The standalone usability problem.** Prior specs required running a page-level tool first (cache population was mandatory). 067's `figma-frame-analysis` works standalone — give it a Figma URL and it fetches, analyzes, and instructs where to save. The orchestrated workflow is an optimization, not a requirement.

### What 067 Trades Off

| Gain | Cost |
|------|------|
| Lightweight manifest response | Extra tool calls (N+2 for N frames: N frame retrievals + 2 prompt retrievals) |
| Per-frame image delivery (works with LLMs) | Server-side cache management (new code, TTL, cleanup) |
| XML truncation per-frame | May lose detail in very complex frames |
| Clean subagent task | Additional round-trip latency (each subagent makes an MCP tool call) |
| Session-scoped cache | 10-minute TTL requires management (extension on access helps) |

### API Call Budget Comparison

For a 5-frame page review, Figma API calls remain identical across all patterns since 061:

| Call | Tier | Count |
|------|------|-------|
| `GET /meta` | T3 | 1 |
| `GET /files/{key}/nodes` | **T1** | 1 (batched) |
| `GET /images/{key}` | **T1** | 1 (batched) |
| `GET /comments` | T2 | 1 |
| **Total Tier 1** | | **2** |

The Figma API budget is unchanged. The additional overhead is MCP tool calls (N frames + 2 prompts = 7 total MCP calls for 5 frames), which are local/fast since they read from server cache.

---

## 10. Implementation Plan

### New Files

| File | Purpose |
|------|---------|
| `server/providers/figma/scope-cache.ts` | Cache creation, validation, cleanup, read operations |
| `server/providers/figma/tools/figma-frame-analysis/index.ts` | Tool registration |
| `server/providers/figma/tools/figma-frame-analysis/figma-frame-analysis.ts` | MCP tool wrapper |
| `server/providers/figma/tools/figma-frame-analysis/core-logic.ts` | Data resolution (cache + standalone fetch) + response building |
| `server/providers/figma/tools/figma-frame-analysis/standalone-fetcher.ts` | `fetchSingleFrameData()` for standalone mode |
| `server/providers/figma/tools/figma-get-cached-prompt/index.ts` | Tool registration |
| `server/providers/figma/tools/figma-get-cached-prompt/figma-get-cached-prompt.ts` | MCP tool + core logic (simple enough for single file) |
| `server/providers/figma/xml-truncator.ts` | `truncateSemanticXml()` and `generateStructureSummary()` |

### Modified Files

| File | Change |
|------|--------|
| `server/providers/figma/tools/figma-ask-scope-questions-for-page/core-logic.ts` | Replace response building: write to scope cache, return manifest instead of full data |
| `server/providers/figma/tools/index.ts` | Register new tools |
| `server/readme.md` | Document new tools and cache architecture |

### What Doesn't Change

- `figma-ask-scope-questions-for-page` **tool signature** — same `url` + `context` inputs
- **Figma API fetching** — same `fetchFrameData()` pipeline
- **Prompt text** — same `FRAME_ANALYSIS_PROMPT_TEXT`, etc. from `prompt-constants.ts`
- **Existing cache** (`cache/figma-files/`) — untouched
- **MCP resources** — if registered from 063, they continue to work independently
- **Monolithic tools** (`figma-review-design`) — unchanged, still use sampling

### Step-by-Step

1. **Implement `scope-cache.ts`** — cache CRUD operations with TTL
2. **Implement `xml-truncator.ts`** — truncation and summary generation
3. **Refactor `core-logic.ts`** — write to cache instead of building mega-response, return manifest
4. **Implement `figma-frame-analysis`** — resolve data (cache or live fetch), build per-frame response with analysis prompt + save instructions
5. **Implement `figma-get-cached-prompt`** — read prompt from cache
6. **Register new tools** in provider index
7. **Add REST API wrappers** (if needed for the dual-interface pattern)
8. **Update documentation**
9. **Test end-to-end** with VS Code Copilot

---

## 11. Open Questions

### Q1: Should the cache token be opaque or parseable?

**Current design:** `{fileKey}-{timestamp}` (parseable — server extracts fileKey from it)

**Alternative:** UUID v4 (opaque — server maintains a lookup table)

**Leaning parseable:** Simpler, no lookup table, filesystem-based. The fileKey is not sensitive.

### Q2: ~~Should `figma-frame-analysis` also accept a Figma URL (fallback to live fetch)?~~

**RESOLVED: `url` is now the primary (required) input.** The `cacheToken` is an optional optimization hint. The URL always identifies the frame (contains file key + node ID), so:
- No separate `frameId` parameter needed
- Cache miss transparently falls back to live Figma fetch
- The tool works standalone or orchestrated with the same interface
- See Section 3 for the full design.

### Q3: Should we support partial cache creation for rate-limited scenarios?

If the Figma image API rate-limits mid-batch, we could cache the frames we got and let the agent retry the rest. This adds complexity (partial manifests, retry tokens).

**Leaning defer:** Current `fetchFrameData()` already handles rate limiting with retries. If it truly fails, the whole tool fails and the agent retries later. Partial caches add significant complexity for an edge case.

### Q4: What about Docker/remote server deployments?

The cache is on the server filesystem. For Docker deployments, it's inside the container. For serverless deployments, there IS no persistent filesystem.

**Mitigations:**
- **Docker:** Mount a volume for `cache/` (already needed for existing caches)
- **Serverless:** This pattern requires a persistent server. The MCP server already uses Express with sessions — it's not designed for serverless. For serverless MCP, a different caching backend (Redis, S3) would be needed, but that's a broader architectural change beyond this spec.

### Q5: Should we combine `figma-frame-analysis` and `figma-get-cached-prompt` into one tool?

A single tool with a `type` parameter (`frame` or `prompt`) would reduce tool count. But it conflates two different response shapes and makes the tool description less clear.

**Leaning separate tools:** `figma-frame-analysis` is a rich, standalone analysis tool. `figma-get-cached-prompt` is a simple cache reader for synthesis/question-generation prompts. Different purposes, different interfaces, separate tools.

### Q6: Image scale for the scope cache?

Current `figma-ask-scope-questions-for-page` fetches at `scale: 2`. For design review analysis, `scale: 1` is sufficient and reduces image sizes by ~75%.

**Recommendation:** Default to `scale: 1` for scope cache. Add optional `imageScale` parameter to `figma-ask-scope-questions-for-page` for users who need higher fidelity.

---

## 12. Summary

**The core insight:** The failure mode in specs 060–063 was returning ALL data in one tool response and expecting the agent to parse and distribute it. The solution is to let the server hold the data and serve it per-frame on demand — and make the per-frame tool self-sufficient.

**Three tools, two modes:**

1. `figma-ask-scope-questions-for-page` → Fetches all data, caches server-side, returns lightweight manifest (~3KB)
2. `figma-frame-analysis` → Analyzes one frame: image + context + structure + analysis prompt + save instructions (~600KB)
3. `figma-get-cached-prompt` → Returns one prompt's text for synthesis/questions (~2KB)

`figma-frame-analysis` works in **two modes**:
- **Orchestrated** (with `url + cacheToken`): Reads from server cache — fast, no Figma API calls
- **Standalone** (with just `url`): Fetches directly from Figma — works without any prior tool call

**Orchestrated workflow (optimal):**
```
1. Call figma-ask-scope-questions-for-page → get manifest (pre-populates cache)
2. For each frame (parallel subagents):
   a. Call figma-frame-analysis with url + cacheToken → get everything
   b. LLM analyzes frame → saves analysis.md to the path in the response
3. Call figma-get-cached-prompt("scope-synthesis") → get prompt
4. Synthesize all analyses → write scope-analysis.md
5. Call figma-get-cached-prompt("generate-questions") → get prompt
6. Generate questions → present to user
```

**Standalone workflow (simple):**
```
1. Call figma-frame-analysis with Figma URL → get everything for one frame
2. LLM analyzes frame following included prompt
3. Save analysis to the path specified in the response
```

Total MCP tool calls for 5-frame orchestrated workflow: 1 (initial) + 5 (frames) + 2 (prompts) = **8 calls** — each lightweight and purpose-specific. No mega-responses. No base64 extraction and file writing. No XML overload. The agent orchestrates; the server serves.
