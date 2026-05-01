# 069: Figma Batch Cache & Frame Data Tools

**Status:** Draft  
**Builds on:** [068-plugin-skills.md](./068-plugin-skills.md)

## Problem

The `figma-batch-load` tool (from spec 068) batch-fetches Figma data and returns a one-time zip download URL. The agent uses `curl` + `unzip` to extract the data locally. This works for local agents (VS Code Copilot, Claude Code) but **fails in GitHub's cloud Copilot** — the sandboxed runner cannot resolve external DNS, so `curl` to our server is blocked.

The agent can still make MCP tool calls (GitHub proxies MCP traffic), so we need a cache-based alternative: batch-fetch into server-side cache, then let subagents retrieve individual frames via MCP.

Additionally, the existing `figma-frame-analysis` tool embeds prompt text and save instructions in its response — coupling the tool to a specific workflow. Skills need a data-only tool that returns image, structure, and context without prescribing how to use them.

## Goals

1. New `figma-batch-cache` MCP tool — batch-fetch Figma data into request-token-based server cache, return `batchToken` + manifest
2. New `figma-frame-data` MCP tool — retrieve one frame's data (image, XML, context) from scope cache, no prompt text
3. Rename `figma-batch-load` → `figma-batch-zip` for clarity
4. Share the data-fetching pipeline between `figma-batch-zip` and `figma-batch-cache`
5. REST API wrappers for both new tools
6. Deprecate `figma-frame-analysis` and `figma-ask-scope-questions-for-page` (cleanup phase)

## Architecture

### Skill Data Flow — Two Paths

Skills prefer zip (faster, fewer MCP calls), fall back to cache (works everywhere):

```
Skill SKILL.md
├── Primary: figma-batch-zip → curl + unzip → .temp/cascade/figma/ → subagents read local files
│   (Fails in cloud Copilot — DNS blocked)
│
└── Fallback: figma-batch-cache → cacheToken + manifest → subagents call figma-frame-data(cacheToken, nodeId)
    (Works everywhere — all MCP, no curl)
```

### Detection Logic (in SKILL.md)

```
1. Call figma-batch-zip(requests)
2. If response includes downloadUrl:
   a. Run: curl -sL "{downloadUrl}" -o /tmp/cascade-figma.zip && unzip -qo ... -d .temp/cascade/figma/ && rm /tmp/cascade-figma.zip
   b. If curl succeeds → use local files for all subsequent work
   c. If curl fails (exit code != 0) → fall through to step 3
3. Call figma-batch-cache(requests)
4. Pass batchToken to subagents — each calls figma-frame-data(url, batchToken)
```

### Tool Comparison

| | `figma-batch-zip` | `figma-batch-cache` | `figma-frame-data` |
|-|--------------------|--------------------|--------------------|
| **Input** | `requests: [{ url, label }]` | `requests: [{ url, label }]` | `url`, `batchToken?` |
| **What it does** | Batch fetch → build zip → register download | Batch fetch → write to scope cache | Read one frame from scope cache |
| **Returns** | `{ downloadUrl, manifest }` | `{ batchToken, manifest }` | Image + XML + context (no prompt) |
| **Data transfer** | HTTP download (zip binary) | MCP response (small JSON) | MCP response (image + text) |
| **Subagent pattern** | Read local filesystem | Call `figma-frame-data` per frame | N/A (is the subagent tool) |
| **Works in cloud Copilot** | ❌ (DNS blocked) | ✅ | ✅ |

### Tool Relationship to Existing Tools

| New Tool | Replaces | Key Difference |
|----------|----------|----------------|
| `figma-batch-zip` | Was `figma-batch-load` | Renamed for clarity |
| `figma-batch-cache` | `figma-ask-scope-questions-for-page` (for skills) | No prompts, no orchestration instructions, multi-file support |
| `figma-frame-data` | `figma-frame-analysis` (for skills) | No prompt text, no save instructions — data only |

## Implementation

### Phase 1: Extract Shared Data Pipeline

The `figma-batch-load` tool's `fetchFileData()` function already does the heavy lifting — fetch nodes, fetch images, generate XML, build context markdown. Extract this into a shared module.

**New file: `server/providers/figma/tools/figma-batch-fetch.ts`**

```typescript
/**
 * Shared data-fetching pipeline for figma-batch-zip and figma-batch-cache.
 * Fetches Figma data for multiple URLs grouped by file, returns structured data.
 */

export interface FetchedFrameData {
  nodeId: string;
  name: string;
  dirName: string;
  imageBase64: string;
  structureXml: string;
  contextMd: string;
  url: string;
  order: number;
  section?: string;
  annotationCount: number;
  width?: number;
  height?: number;
}

export interface FetchedFileData {
  fileKey: string;
  fileName: string;
  frames: FetchedFrameData[];
}

/**
 * Group URLs by file key, fetch all data for each file in parallel.
 * Returns structured data — callers decide what to do with it (zip or cache).
 */
export async function fetchBatchData(
  requests: Array<{ url: string; label?: string }>,
  figmaClient: FigmaClient,
): Promise<FetchedFileData[]> {
  // Group URLs by file key
  // Fetch per file (parallel across files)
  // Return structured data (same as current fetchFileData logic)
}
```

Then:
- `figma-batch-zip` calls `fetchBatchData()` → `buildZip()` → `registerDownload()`
- `figma-batch-cache` calls `fetchBatchData()` → `createScopeCache()`

### Phase 2: `figma-batch-cache` Tool

**New file: `server/providers/figma/tools/figma-batch-cache/figma-batch-cache.ts`**

Input schema — same as `figma-batch-zip`:
```typescript
{
  requests: z.array(z.object({
    url: z.string().describe('Figma URL — page-level or frame-level'),
    label: z.string().optional().describe('Human label'),
  })).min(1),
  context: z.string().optional().describe('Feature context'),
}
```

Response — `batchToken` + manifest (no downloadUrl, no saveInstructions):
```json
{
  "batchToken": "a73efd14-dd6f-4a66-9270-e45309998982",
  "manifest": {
    "files": [{
      "fileKey": "abc123",
      "fileName": "My Design",
      "frames": [
        { "nodeId": "1:2", "name": "Login", "dirName": "1-2-login", "url": "...", "order": 0 }
      ]
    }],
    "totalFrames": 5
  }
}
```

Implementation:
1. Generate `batchToken = crypto.randomUUID()`
2. Call `fetchBatchData(requests, figmaClient)`
3. Write all frame data to `cache/figma-batch/{batchToken}/` — manifest.json + per-frame directories
4. Return `{ batchToken, manifest }`

Cache structure (request-token-based, no file-key indexing):
```
cache/figma-batch/{batchToken}/
├── manifest.json              # Full manifest with all files/frames
├── .cache-metadata.json       # TTL tracking (createdAt, expiresAt)
└── frames/
    ├── {safeNodeId}-{kebab-name}/
    │   ├── image.png
    │   ├── structure.xml
    │   └── context.md
    └── ...
```

Does **not** use `scope-cache.ts`. New standalone cache module (`batch-cache.ts`) with:
- TTL: 10 minutes (extended on read access)
- Lazy cleanup on creation (same pattern as `scope-cache.ts` and `download.ts`)
- No cross-request sharing — each batch gets its own isolated directory
- Security: no data leaks between users/sessions

### Phase 3: `figma-frame-data` Tool

**New file: `server/providers/figma/tools/figma-frame-data/figma-frame-data.ts`**

Input schema:
```typescript
{
  url: z.string().describe('Figma frame URL (must contain node-id)'),
  batchToken: z.string().optional().describe('Batch token from figma-batch-cache. Reads from server cache (0 API calls). Falls back to live fetch if expired.'),
  includeStructure: z.boolean().optional().default(true),
  maxStructureSize: z.number().optional().default(50000),
}
```

Response — data only, no prompt, no save instructions:
```
Content blocks:
1. Image (base64 PNG)
2. Context markdown (embedded resource)
3. Semantic XML (embedded resource, optional)
4. Metadata JSON (frameId, frameName, fileKey, structureTruncated)
```

Compared to `figma-frame-analysis`:
- ❌ No `FRAME_ANALYSIS_PROMPT_TEXT`
- ❌ No `buildAnalysisPromptWithSaveInstructions()`
- ❌ No `outputDir` or file save instructions
- ✅ Same image, context, XML, metadata
- ✅ Same `resolveFrameData()` logic (cache first, live fetch fallback)
- ✅ Same XML truncation

Implementation: Fork `figma-frame-analysis.ts`, strip the prompt/save content blocks from `buildFrameAnalysisResponse()`. Share `resolveFrameData()` and `truncateSemanticXml()` — either by importing from `figma-frame-analysis` or extracting to a shared helper.

Cache lookup: parse `nodeId` from URL → scan `cache/figma-batch/{batchToken}/frames/` for directory matching `{safeNodeId}-*` → read files. No file-key routing needed — node IDs are unique within a batch.

### Phase 4: Rename `figma-batch-load` → `figma-batch-zip`

1. Rename MCP tool registration: `'figma-batch-load'` → `'figma-batch-zip'`
2. Rename folder: `figma-batch-load/` → `figma-batch-zip/`
3. Rename REST API: `handleFigmaBatchLoad` → `handleFigmaBatchZip`
4. Update route in `server/api/index.ts`
5. Update `server/server.ts` references
6. Replace `fetchFileData()` with `fetchBatchData()` call from shared module
7. Update tool description to mention that `figma-batch-cache` is the fallback for environments where `curl` is blocked

### Phase 5: REST API Wrappers

**`server/api/figma-batch-cache.ts`** — same pattern as `figma-batch-load.ts`:
```typescript
// Required Headers: X-Figma-Token
// POST body: { requests: [{ url, label }], context?: string }
// Returns: { success: true, cacheToken, manifest }
```

**`server/api/figma-frame-data.ts`** — same pattern as other frame tools:
```typescript
// Required Headers: X-Figma-Token (only needed if cacheToken misses)
// POST body: { url, cacheToken?, includeStructure?, maxStructureSize? }
// Returns: { success: true, frameData: { image, context, structure, metadata } }
```

### Phase 6: Skill Updates (spec 068)

Update SKILL.md files to use the two-path pattern:

```markdown
## Load Figma Data

1. Call `figma-batch-zip` with the Figma URLs from the issue description
2. If the response includes `downloadUrl`:
   - Run: `curl -sL "{downloadUrl}" -o /tmp/cascade-figma.zip && unzip -qo /tmp/cascade-figma.zip -d .temp/cascade/figma/ && rm /tmp/cascade-figma.zip`
   - If the curl command fails (non-zero exit code), proceed to step 3
   - If it succeeds, all frame data is now in `.temp/cascade/figma/` — use local file reads for all subsequent work
3. If curl failed or was not attempted:
   - Call `figma-batch-cache` with the same Figma URLs
   - Note the `batchToken` from the response
   - For each frame, call `figma-frame-data(url, batchToken)` to retrieve its data
```

### Phase 7: Deprecation & Cleanup

Remove after skills are validated:

1. **`figma-ask-scope-questions-for-page`** — replaced by `figma-batch-cache` (data) + skills (orchestration/prompts)
2. **`figma-frame-analysis`** — replaced by `figma-frame-data` (data only)

Deprecation approach:
- Add `[DEPRECATED]` prefix to tool descriptions
- Add console warning when called: `⚠️ figma-frame-analysis is deprecated. Use figma-frame-data instead.`
- Remove after one release cycle

## Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `server/providers/figma/tools/figma-batch-fetch.ts` | 1 | Shared data-fetching pipeline |
| `server/providers/figma/batch-cache.ts` | 2 | Request-token-based cache module (create, read, cleanup) |
| `server/providers/figma/tools/figma-batch-cache/index.ts` | 2 | Export tool registration |
| `server/providers/figma/tools/figma-batch-cache/figma-batch-cache.ts` | 2 | MCP tool: batch fetch → batch cache |
| `server/providers/figma/tools/figma-frame-data/index.ts` | 3 | Export tool registration |
| `server/providers/figma/tools/figma-frame-data/figma-frame-data.ts` | 3 | MCP tool: read one frame, data only |
| `server/api/figma-batch-cache.ts` | 5 | REST API wrapper |
| `server/api/figma-frame-data.ts` | 5 | REST API wrapper |

## Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `server/providers/figma/tools/figma-batch-load/figma-batch-load.ts` | 1, 4 | Extract `fetchFileData()` to shared module; rename tool to `figma-batch-zip` |
| `server/providers/figma/tools/figma-batch-load/index.ts` | 4 | Rename export |
| `server/api/figma-batch-load.ts` | 4 | Rename handler |

| `server/providers/figma/tools/index.ts` | 2, 3 | Register `figma-batch-cache`, `figma-frame-data` |
| `server/api/index.ts` | 4, 5 | Update route names, add new routes |
| `server/readme.md` | 7 | Document new tools, deprecations |

## Existing Files Referenced (not modified)

| File | Referenced By | Purpose |
|------|--------------|---------|
| `server/providers/figma/screen-analyses-workflow/frame-data-fetcher.ts` | Phase 1 | `fetchFrameData()` — core pipeline reused by shared module |
| `server/providers/figma/tools/figma-batch-load/zip-builder.ts` | Phase 4 | Unchanged — `figma-batch-zip` continues to use it |
| `server/api/download.ts` | Phase 4 | Unchanged — `figma-batch-zip` continues to use it |
| `server/providers/figma/tools/figma-frame-analysis/figma-frame-analysis.ts` | Phase 3 | `resolveFrameData()`, `truncateSemanticXml()` — logic reused in `figma-frame-data` |
| `server/providers/figma/tools/figma-ask-scope-questions-for-page/frame-context-builder.ts` | Phase 1 | `buildFrameContextMarkdown()`, `findConnections()` — used by shared pipeline |

## Decisions

1. **Request-token-based caching.** `figma-batch-cache` generates a random `batchToken` (`crypto.randomUUID()`) and caches everything under `cache/figma-batch/{batchToken}/`. No file-key indexing, no cross-request sharing. If two users load the same Figma file, they get separate cache entries — safer for security (no data leaking between sessions). `figma-frame-data` only needs `batchToken` + `nodeId` to look up a frame. Does not use `scope-cache.ts` — new standalone cache module with simpler logic.

## Questions

1. Should `figma-frame-data` also support standalone mode (no batchToken, fetches from Figma directly)? `figma-frame-analysis` does this. It's useful but adds complexity and API call cost. If skills always batch-load first, standalone mode may be unnecessary.

Answer: yes it should.  

2. For the shared `fetchBatchData()` module — should it also handle URL grouping/deduplication (currently in `figma-batch-load.ts`), or should callers handle that? Putting it in the shared module means both tools get the same dedup behavior automatically.

yes.

3. How should skills detect that `curl` failed? Options:
   - (a) Check exit code (exit 6 = DNS resolution failure, exit 7 = connection refused)
   - (b) Check if the extracted directory exists and contains `manifest.json`
   - (c) Both — try curl, then verify the output


Would skills know their agent?  Ideally the could pick the right option.  But a note about if curl fails to try this different approach would be good.

Btw, the approaches have to differ a bit because I'm not sure agents can "download" images locally.  If NOT using the zip, an agent will need to make the request and look at the data in the mcp response.  It won't be able to look file by file.