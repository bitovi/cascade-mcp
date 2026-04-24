# Workflow Patterns: MCP Resources + Subagent Orchestration

**Date:** March 5, 2026  
**Status:** 📝 Draft / Exploration  
**Builds on:** [057-prompts.md](./057-prompts.md), [058-agent-workflow.md](./058-agent-workflow.md), [059-context-tools-with-embedded-prompts.md](./059-context-tools-with-embedded-prompts.md), [061-prompt-context-tool-pairs.md](./061-prompt-context-tool-pairs.md)

## Problem Recap

We've tried four patterns for enabling agents without sampling to drive multi-step workflows:

| Spec | Pattern | Problem |
|------|---------|---------|
| 057 | MCP Prompts alone | Agents can't reliably call other MCP prompts from within a prompt |
| 058 | Decomposed tools + orchestration prompts | Too many sequential tool calls; agents lose track |
| 059 | Context tools with embedded prompts | Still 3–5 sequential tool calls; embedded `prompt://` URIs aren't real resources |
| 061 | Prompt + Context Tool pairs | Single entry point → single super-tool call, but the "context tool" becomes a monolith that fetches everything upfront |

**The core tension:** We want workflows that are *discoverable*, *self-contained*, and *parallelizable* — but previous approaches sacrifice at least one of these.

## New Idea: MCP Resources as Prompt Library

### Observation

The MCP spec has a **resources** primitive that we haven't used. Resources are:
- **Discoverable** — clients call `resources/list` and `resources/templates/list`
- **Independently readable** — clients call `resources/read` with a URI at any time
- **Template-based** — `ResourceTemplate` supports URI patterns with variables (RFC 6570)
- **Subscribable** — clients can subscribe to changes

Our SDK (v1.15.1) fully supports `mcp.registerResource()` and `ResourceTemplate`.

### Key Insight

**Resources can serve as a resolvable prompt library.** Instead of embedding prompt text inline in tool responses (the 059/061 pattern), we register prompts as MCP resources with stable URIs. Tools reference these URIs, and the agent resolves them on demand.

This solves the "prompts can't call prompts" problem: a **resource** (which is just text) can reference another resource by URI, and the agent can resolve the chain. It also means prompts are cacheable, discoverable, and version-stable.

## Pattern: Resource-Backed Workflow Orchestration

### Architecture

```
┌─────────────────────────────────────────────────┐
│                  MCP Resources                   │
│  (Prompt library — always available, no auth)    │
│                                                  │
│  workflow://review-design          (orchestrator) │
│  workflow://write-story            (orchestrator) │
│  prompt://frame-analysis           (atomic)      │
│  prompt://scope-synthesis          (atomic)      │
│  prompt://generate-questions       (atomic)      │
│  prompt://write-story-content      (atomic)      │
│                                                  │
└───────────────────────┬─────────────────────────┘
                        │  Agent reads resources
                        │  by URI on demand
┌───────────────────────┴─────────────────────────┐
│                  MCP Tools                       │
│  (Data fetching — requires auth)                 │
│                                                  │
│  figma-get-layers-for-page                       │
│  figma-get-image-download                        │
│  figma-get-metadata-for-layer                    │
│  figma-get-frame-data      (new: XML+annotations)│
│  atlassian-get-issue-context                     │
│  atlassian-get-confluence-doc                    │
│  drive-doc-to-markdown                           │
│  atlassian-update-issue-description              │
│  figma-post-comment                              │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Separation of concerns:**
- **Resources** = instructions (prompts, workflow orchestration, format specs). No auth needed. Always available.
- **Tools** = data access + side effects. Require auth. Are the "verbs."

### How It Works

1. Agent discovers resources via `resources/list` — sees `workflow://review-design`, `prompt://frame-analysis`, etc.
2. Agent reads `workflow://review-design` — gets a structured orchestration document that names which tools to call and which `prompt://` resources to read at each step.
3. Agent follows the orchestration: calls tools for data, reads prompt resources for instructions, uses its own LLM.
4. Prompt resources can reference other prompt resources by URI — the agent resolves the chain.

### Why This Beats Previous Patterns

| Concern | 058 (Decomposed) | 061 (Prompt+Tool) | 062 (Resources) |
|---------|------------------|--------------------|------------------|
| **Discovery** | Agent must know tool names | Agent discovers prompts, prompt names one tool | Agent discovers resources, reads orchestration |
| **Prompt access** | MCP prompt protocol (unreliable chain) | Embedded in tool response (ephemeral) | `resources/read` by URI (stable, cacheable) |
| **Parallelism** | Prompt text suggests it | Tool bundles everything serially | Orchestration explicitly defines parallel steps |
| **Subagent-friendly** | Mentioned but not structured | Not designed for it | First-class subagent fork/join pattern |
| **Composability** | Mix-and-match tools + prompts | Locked to one context tool | Read any prompt resource independently |
| **Data freshness** | Many tool calls per frame | One giant tool call | Targeted tool calls per step |

## Workflow Resource Design

### Resource URI Scheme

```
workflow://review-design                    — Full orchestration (references prompt:// URIs)
workflow://write-story                      — Full orchestration

prompt://frame-analysis                     — Single-frame analysis instructions
prompt://scope-synthesis                    — Cross-frame scope synthesis instructions
prompt://generate-questions                 — Question generation instructions
prompt://write-story-content                — Story content writing instructions
```

All resources return markdown text. The `workflow://` resources are structured orchestration documents; the `prompt://` resources are LLM prompt instructions.

### Resource Registration

```typescript
// In server-factory.ts capabilities
capabilities: {
  tools: {},
  prompts: {},
  resources: {},   // ← NEW
  logging: {},
  sampling: {},
}

// In a new server/mcp-resources/index.ts
export function registerAllResources(mcp: McpServer): void {
  registerWorkflowResources(mcp);
  registerPromptResources(mcp);
}
```

```typescript
// Workflow resources
mcp.registerResource(
  'review-design-workflow',
  'workflow://review-design',
  {
    description: 'Design review orchestration: analyze Figma frames, synthesize scope, generate questions',
    mimeType: 'text/markdown',
  },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'text/markdown',
      text: REVIEW_DESIGN_WORKFLOW,  // imported from prompt file
    }],
  })
);

// Prompt resources (importing from existing prompt source files)
import { SCREEN_ANALYSIS_SYSTEM_PROMPT } from '../providers/figma/screen-analyses-workflow/screen-analyzer.js';

mcp.registerResource(
  'frame-analysis-prompt',
  'prompt://frame-analysis',
  {
    description: 'Instructions for analyzing a single Figma frame',
    mimeType: 'text/markdown',
  },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'text/markdown',
      text: SCREEN_ANALYSIS_SYSTEM_PROMPT,
    }],
  })
);
```

### Review Design Workflow Resource

The `workflow://review-design` resource would contain orchestration instructions like:

```markdown
# Design Review Workflow

## Inputs
- `figmaUrl` — Figma page URL
- `context` (optional) — Feature description, epic context, constraints

## Step 1: Get frames

Call `figma-get-layers-for-page` with `{ url: figmaUrl }`.

This returns a list of frames on the page with metadata (name, nodeId, dimensions).

Filter to top-level frames (the ones representing screens/pages).

## Step 2: Analyze each frame

> **Parallelizable — spawn subagents if supported**

For each frame, perform these sub-steps:

### 2a. Fetch frame data

Call `figma-get-frame-data` with `{ url: figmaUrl, nodeId: frame.nodeId }`.

Returns:
- `image` — base64 PNG of the frame
- `semanticXml` — XML representation of the component tree
- `annotations` — comments + sticky notes associated with this frame

### 2b. Analyze the frame

Read the prompt resource `prompt://frame-analysis`.

Combine the prompt with the frame data to analyze the frame. Include:
- The frame image (as a vision input if your LLM supports it)
- The semantic XML
- The annotations
- The feature context (from inputs)
- The frame name and position in the page

Save the analysis output — you'll need it in Step 3.

## Step 3: Synthesize scope

Read the prompt resource `prompt://scope-synthesis`.

Combine ALL frame analyses from Step 2 into a scope synthesis.
Include any additional context (epic description, reference docs).

## Step 4: Generate questions

Read the prompt resource `prompt://generate-questions`.

Use the scope synthesis + individual frame analyses to generate
frame-specific clarifying questions.

## Step 5: Present to user

Present the generated questions to the user. The user may:
- Answer questions directly
- Ask you to post them to Figma as comments
- Ask for revisions

To post a question to Figma, call `figma-post-comment` with 
the frame's nodeId and the question text.
```

## Subagent Support: Fork/Join Pattern

### The Opportunity

Modern AI agents (Copilot, Claude Code, Cursor) support spawning subagents for parallel work. The design review workflow has a natural parallelism boundary: **frame analysis is independent per frame**.

### Explicit Subagent Instructions in Orchestration

The workflow resource marks parallelizable steps with structured hints:

```markdown
## Step 2: Analyze each frame

> **⚡ PARALLEL**: This step can be run as independent subagents per frame.
> Each frame analysis is self-contained — no dependencies between frames.
>
> **Subagent pattern:**
> - Fork: One subagent per frame
> - Each subagent: fetch data → read prompt → analyze → return result
> - Join: Collect all frame analyses before proceeding to Step 3
>
> **Without subagents:** Process frames sequentially. Same result, just slower.
```

### Subagent Task Description Pattern

The orchestration can include a copy-paste-ready subagent task description:

```markdown
### Subagent Task (per frame)

If you can spawn subagents, give each one these instructions:

---
**Task:** Analyze Figma frame "{frameName}" (nodeId: {nodeId})

1. Call `figma-get-frame-data` with `{ url: "{figmaUrl}", nodeId: "{nodeId}" }`
2. Read resource `prompt://frame-analysis`
3. Apply the prompt to the frame data. Include:
   - Frame image (vision input)
   - Semantic XML
   - Annotations
   - Feature context: "{context}"
   - Frame name: "{frameName}"
   - Frame order: {order} of {total}
4. Return the analysis as markdown.
---
```

### Why This Works for Subagents

- **Self-contained**: Each subagent task references only the one tool call (`figma-get-frame-data`) and one resource (`prompt://frame-analysis`). The subagent doesn't need to understand the overall workflow.
- **Independently resolvable**: The prompt resource URI is stable — every subagent reads the same `prompt://frame-analysis` and gets the same instructions.
- **No shared state**: Frame analyses don't depend on each other. The orchestrating agent collects results after all subagents complete.
- **Graceful degradation**: If the agent doesn't support subagents, it processes frames sequentially using the same instructions.

## Hybrid Pattern: Server Batch + Local Files + Subagents

### The Insight

The pure resource pattern (above) has subagents each calling `figma-get-frame-data` independently — which works, but each subagent still makes an MCP tool call, and the caching strategy needs to be airtight to avoid redundant Figma API requests.

There's a simpler hybrid: **let the server batch-fetch everything efficiently in one tool call** (like the 061 context tool), but instead of the agent processing all frames in one context, have the **orchestrating agent save frame data to local files**, then **spawn subagents that read from the filesystem**.

```
Agent                               MCP Server                    Local Filesystem
  │                                     │                              │
  ├─ Call figma-page-questions-context ─►│                              │
  │                                     ├─ Batch fetch (2 Tier 1 calls)│
  │◄─ All frames + images + prompts ────┤                              │
  │                                     │                              │
  ├─ Save frame data to temp/ ─────────────────────────────────────────►│
  │   temp/cascade/{fileKey}/                                          │
  │     manifest.json                                                  │
  │     frame-analysis-prompt.md                                       │
  │     frames/                                                        │
  │       login-page/                                                  │
  │         image.png                                                  │
  │         context.md (XML + annotations)                             │
  │       dashboard/                                                   │
  │         image.png                                                  │
  │         context.md                                                 │
  │                                                                    │
  ├─ Spawn subagent per frame ──────────────────────────────────────────┤
  │   "Read temp/.../login-page/ + frame-analysis-prompt.md            │
  │    Analyze this frame. Write analysis to login-page/analysis.md"   │
  │                                                                    │
  ├─ [Subagents read local files, run LLM, write analysis.md] ────────►│
  │                                                                    │
  ├─ Collect all analysis.md files ◄────────────────────────────────────┤
  │                                                                    │
  ├─ Scope synthesis + questions (using prompt resources) ──────────────┤
  │                                                                    │
  └─ Present to user                                                   │
```

### Why This Is Compelling

**Server does what it's good at:** The context tool already handles all Figma API batching, caching, semantic XML generation, annotation association, and rate-limit-aware fetching. It makes exactly 2 Tier 1 + 1 Tier 2 + 1 Tier 3 calls regardless of frame count. No new `figma-get-frame-data` tool needed.

**Filesystem is the coordination layer:** Instead of subagents needing MCP access (tool calls, resource reads), they just read local files. This works with *any* subagent implementation — even ones that don't have MCP tool access. The subagent's task is simple: "read these files, analyze, write output."

**No cache complexity:** The server handles all Figma API caching internally (its existing multi-layer disk + in-memory cache). The agent doesn't need to worry about `siblingNodeIds`, deduplication, or TTLs. It just gets one big response and saves it locally.

**Resumable:** If analysis is interrupted, the temp directory persists. Re-running the workflow can skip frames that already have `analysis.md` files. The orchestration prompt can instruct this:

```markdown
> Before spawning subagents, check each frame folder for an existing `analysis.md`.
> Skip frames that already have analyses unless you want to re-analyze.
```

### Workflow Resource: `workflow://review-design` (Hybrid Version)

````markdown
# Design Review Workflow

## Inputs
- `figmaUrl` — Figma page URL
- `context` (optional) — Feature description, epic context, constraints

## Step 1: Fetch all page data

Call `figma-page-questions-context` with `{ url: figmaUrl, context: context }`.

This returns ALL frame data in a single batch:
- Frame images (base64)
- Semantic XML per frame
- Annotations (comments + sticky notes) per frame
- Embedded prompts for each workflow step

## Step 2: Save to temp directory

Create a working directory keyed by the Figma file: `./temp/cascade/{fileKey}/`

The `fileKey` comes from the manifest JSON in the tool response (e.g., `abc123DEF`).
Re-running on the same file reuses the same directory, enabling resumability.

Save the following structure:

```
temp/cascade/{fileKey}/
├── manifest.json          # Frame list, metadata, figma URL
├── prompts/
│   ├── frame-analysis.md  # From prompt://frame-analysis embedded resource
│   ├── scope-synthesis.md # From prompt://scope-synthesis embedded resource
│   └── questions.md       # From prompt://generate-questions embedded resource
└── frames/
    ├── {frame-name-1}/
    │   ├── image.png      # Decoded from base64
    │   └── context.md     # Semantic XML + annotations + frame metadata
    ├── {frame-name-2}/
    │   ├── image.png
    │   └── context.md
    └── ...
```

The `context.md` for each frame should include:
- Frame name and dimensions
- Frame order in the page
- Semantic XML
- Associated comments and sticky notes
- Feature context (from inputs)

## Step 3: Analyze each frame

> **⚡ PARALLEL**: Spawn one subagent per frame.

For each frame directory without an `analysis.md` file:

### Subagent Task

---
**Task:** Analyze the Figma frame in `{framePath}/`

1. Read `{framePath}/context.md` for frame data
2. Read `{framePath}/image.png` as a vision input
3. Read `prompts/frame-analysis.md` for analysis instructions
4. Follow the prompt instructions to analyze this frame
5. Write your analysis to `{framePath}/analysis.md`
---

> **Without subagents:** Process frames sequentially using the same steps.

## Step 4: Synthesize scope

After all frame analyses are complete:

1. Read `prompts/scope-synthesis.md`
2. Read ALL `frames/*/analysis.md` files
3. Synthesize a cross-screen scope analysis
4. Save to `temp/cascade/{fileKey}/scope-analysis.md`

## Step 5: Generate questions

1. Read `prompts/questions.md`
2. Read `scope-analysis.md` + all `frames/*/analysis.md`
3. Generate frame-specific questions
4. Save to `temp/cascade/{fileKey}/questions.md`

## Step 6: Present to user

Present the questions. The user may answer or ask you to post to Figma.
To post, call `figma-post-comment` with nodeId and question text.
````

### Comparison: All Patterns

| Approach | Figma API calls (5 frames) | MCP calls per subagent | Subagent needs MCP? | Complexity |
|----------|---------------------------|----------------------|--------------------|----|
| **061: Context tool only** | 2 T1 + 1 T2 + 1 T3 | N/A (no subagents) | N/A | Low |
| **062a: Resource orchestration** | 2 T1 + 1 T2 + 1 T3 (with cache) | 1 tool + 1 resource | Yes | Medium |
| **062b: Hybrid (batch + files)** | 2 T1 + 1 T2 + 1 T3 | 0 (reads local files) | **No** | Low |
| **058: Decomposed tools** | 10 T1 + 5 T2 + 1 T3 | 3+ tools + prompts | Yes | High |
| **Monolithic (sampling)** | 2 T1 + 1 T2 + 1 T3 | N/A (server-side) | N/A | None |

The hybrid pattern matches the monolithic tool's API efficiency while enabling subagent parallelism — and subagents don't even need MCP access.

### Trade-offs

| Advantage | Limitation |
|-----------|-----------|
| Zero Figma API overhead vs monolithic | Requires agent to write files (most can) |
| Subagents need only filesystem access | Large tool response (images are base64 — ~500KB per frame) |
| Resumable via temp directory | Agent must parse multi-part MCP response to extract frame data |
| Reuses existing `figma-page-questions-context` tool | Temp directory cleanup is agent's responsibility |
| No new tool needed | Context tool response may be large for many frames |

### Response Size Concern

A `figma-page-questions-context` response for 5 frames includes ~5 base64 PNG images. At ~500KB per image, that's ~2.5MB of base64 in a single tool response. This is within MCP's capabilities, but:

- **Mitigation 1:** The context tool already exists and handles this. Agents that use it today deal with the same payload.
- **Mitigation 2:** If response size is a problem, the workflow can fall back to the resource pattern (062a) where each subagent fetches its own frame image via `figma-get-frame-data`.
- **Mitigation 3:** The context tool could optionally return image CDN URLs instead of base64, and the agent downloads images directly to temp files. This would require the agent to handle HTTP downloads but dramatically reduces the MCP response size.

## Recommended Default: Hybrid Pattern (062b)

Given the analysis, **the hybrid pattern (062b) is the strongest default** for agents with subagent support:

1. It reuses the existing `figma-page-questions-context` tool — no new Figma tool needed
2. It achieves optimal API efficiency (same as monolithic)
3. Subagents work with just filesystem access — maximum compatibility
4. The temp directory enables resumability and debugging (inspect intermediate files)
5. It naturally supports agents without subagents too (just process frames sequentially)

The resource pattern (062a) and `figma-get-frame-data` remain valuable as an alternative for agents that prefer MCP-native data access over filesystem coordination, or where writing to the local filesystem isn't practical.

## Story Writing Workflow via Resources

The same pattern applies to `workflow://write-story`:

```markdown
# Story Writing Workflow

## Inputs
- `issueKey` — Jira issue key (e.g., "PROJ-123")
- `siteName` — Atlassian site name (e.g., "mycompany")

## Step 1: Get issue context

Call `atlassian-get-issue-context` with `{ issueKey, siteName }`.

Returns: target issue + parent chain + blockers + project description + comments.

## Step 2: Extract linked resources

Parse the issue description and comments for URLs:
- Figma links → Step 2a
- Confluence links → Step 2b
- Google Docs links → Step 2c

### 2a. Figma screens

> **⚡ PARALLEL**: Analyze linked Figma frames independently.

For each Figma link, follow the per-frame analysis in `workflow://review-design` Step 2.
(Or call `figma-get-frame-data` + read `prompt://frame-analysis` directly.)

### 2b. Confluence docs

> **⚡ PARALLEL**: Fetch docs independently.

Call `atlassian-get-confluence-doc` for each Confluence URL.

### 2c. Google Docs

> **⚡ PARALLEL**: Fetch docs independently.

Call `drive-doc-to-markdown` for each Google Docs URL.

## Step 3: Write the story

Read the prompt resource `prompt://write-story-content`.

Provide:
- Issue context (from Step 1)
- Relevant screen analyses (from Step 2a)
- Relevant documentation (from Steps 2b/2c — include only what's pertinent)
- Any existing description content (for updates vs. fresh writes)

## Step 4: Update the issue

Call `atlassian-update-issue-description` with `{ issueKey, siteName, markdown: generatedContent }`.
```

Note how Step 2a references `workflow://review-design` — this is **cross-workflow composition**. The story writing workflow reuses the frame analysis pattern without duplicating its instructions.

## New Tool: `figma-get-frame-data`

The 058 pattern required 3 tool calls per frame (image + XML + annotations). We can consolidate these into one while keeping it lightweight (unlike the 061 super-tool that fetches ALL frames):

```typescript
// figma-get-frame-data — single frame, all data
{
  name: 'figma-get-frame-data',
  description: 'Get image, semantic XML, and annotations for a single Figma frame',
  args: {
    url: z.string().describe('Figma file URL'),
    nodeId: z.string().describe('Frame node ID'),
  },
  returns: {
    image: 'base64 PNG',
    mimeType: 'image/png',
    semanticXml: 'XML component tree',
    annotations: {
      comments: [{ author, text, timestamp }],
      stickyNotes: [{ text, position }],
    },
    frameName: 'string',
    dimensions: { width, height },
  }
}
```

This gives subagents everything they need in **one tool call** while keeping it scoped to a single frame (so different subagents fetch different frames in parallel).

## Figma Rate Limiting & Caching Strategy

### The Problem

Figma has severe rate limits (see [055-reducing-api-requests.md](./055-reducing-api-requests.md)):

| API Endpoint | Tier | Professional (Dev/Full seat) | View/Collab seat |
|-------------|------|------|------|
| `GET /v1/files/{key}` | **Tier 1** | 10/min | Up to 6/month |
| `GET /v1/files/{key}/nodes?ids=` | **Tier 1** | 10/min | Up to 6/month |
| `GET /v1/images/{key}?ids=` | **Tier 1** | 10/min | Up to 6/month |
| `GET /v1/files/{key}/comments` | Tier 2 | 25/min | Up to 5/min |
| `GET /v1/files/{key}/meta` | Tier 3 | 50/min | Up to 10/min |
| `POST /v1/files/{key}/comments` | Tier 2 | 25/min | Up to 5/min |

The subagent pattern creates a **specific risk**: 5 subagents each calling `figma-get-frame-data` for frames in the same file would naively make 5x independent Figma API calls for comments, nodes, and images. That's a rate limit disaster — especially since **comments are fetched per-file, not per-frame**.

### Current Caching Infrastructure

We already have multi-layer caching:

| Layer | Type | Scope | TTL/Invalidation | Location |
|-------|------|-------|-------------------|----------|
| File metadata | Disk JSON | Per file key | Until `lastTouchedAt` changes | `cache/figma-files/{key}/.figma-metadata.json` |
| Node data | Disk JSON | Per file key + node IDs | Invalidated with metadata | `cache/figma-files/{key}/nodes-cache.json` |
| Images | Disk PNG | Per frame | Invalidated with metadata | `cache/figma-files/{key}/{name}.png` |
| Frame analyses | Disk Markdown | Per frame | Invalidated with metadata or new comments | `cache/figma-files/{key}/{name}.analysis.md` |
| Comments | **In-memory Map** | `figma-get-frame-analysis-context` only | 30s TTL | Module-level variable |

**Key gap:** The in-memory comment cache currently lives inside a single tool module (`figma-get-frame-analysis-context`). Other tools and any new `figma-get-frame-data` tool can't benefit from it.

### Design: Shared Figma Request Cache

`figma-get-frame-data` should present a per-frame interface but internally **batch and cache at the file level**.

#### Principle: The Tool Is Per-Frame, the Cache Is Per-File

From the agent's perspective, `figma-get-frame-data` is a single-frame tool. But internally, Figma's API endpoints return file-level data:
- **Comments**: `GET /v1/files/{key}/comments` → ALL comments for the file
- **Images**: `GET /v1/images/{key}?ids=` → batch endpoint, accepts multiple node IDs
- **Nodes**: `GET /v1/files/{key}/nodes?ids=` → batch endpoint, accepts multiple node IDs

The tool should exploit this: the first call for a given file key fetches and caches file-level data, and subsequent calls for other frames in the same file hit the cache.

#### Three Caching Layers for `figma-get-frame-data`

**1. In-Memory Comment Cache (shared across tools)**

Move the 30-second TTL comment cache from `figma-get-frame-analysis-context` to a shared module:

```typescript
// server/providers/figma/figma-request-cache.ts
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const commentCache = new Map<string, CacheEntry<FigmaComment[]>>();
const COMMENT_CACHE_TTL_MS = 30_000; // 30 seconds

export async function getCachedComments(
  figmaClient: FigmaClient,
  fileKey: string
): Promise<FigmaComment[]> {
  const cached = commentCache.get(fileKey);
  if (cached && (Date.now() - cached.timestamp) < COMMENT_CACHE_TTL_MS) {
    return cached.data;
  }
  const comments = await figmaClient.fetchComments(fileKey);
  commentCache.set(fileKey, { data: comments, timestamp: Date.now() });
  return comments;
}
```

**Why 30 seconds?** Comments have no change-detection signal (no `lastTouchedAt` equivalent). The 30-second window covers the typical subagent burst — 5 subagents spawned near-simultaneously all resolve within seconds. After 30s, fresh data is fetched if the workflow continues.

**Why in-memory, not disk?** Comments are transient and relatively small. Disk caching would add I/O overhead and stale-data risk without the `lastTouchedAt` invalidation signal that file/node caching has.

**2. Disk-Based Node + Image Cache (existing infrastructure)**

Already implemented in `figma-cache.ts`, `image-downloader.ts`, `url-processor.ts`. The `figma-get-frame-data` tool should use these:

- Check `cache/figma-files/{key}/nodes-cache.json` before calling `/nodes` API
- Check `cache/figma-files/{key}/{frameName}.png` before calling `/images` API
- Use `validateCache()` (Tier 3 `/meta` call) to decide if disk cache is valid

**3. In-Memory Pending-Request Deduplication**

When 5 subagents call `figma-get-frame-data` nearly simultaneously for frames in the same file, we don't want 5 concurrent `/comments` requests while the cache is still empty. Use a **pending-request Map** to deduplicate in-flight requests:

```typescript
const pendingRequests = new Map<string, Promise<FigmaComment[]>>();

export async function getCachedComments(
  figmaClient: FigigmaClient,
  fileKey: string
): Promise<FigmaComment[]> {
  // 1. Check cache
  const cached = commentCache.get(fileKey);
  if (cached && (Date.now() - cached.timestamp) < COMMENT_CACHE_TTL_MS) {
    return cached.data;
  }
  
  // 2. Check if a request is already in-flight
  const pending = pendingRequests.get(fileKey);
  if (pending) return pending;
  
  // 3. Start request and share the promise
  const request = figmaClient.fetchComments(fileKey).then(comments => {
    commentCache.set(fileKey, { data: comments, timestamp: Date.now() });
    pendingRequests.delete(fileKey);
    return comments;
  });
  pendingRequests.set(fileKey, request);
  return request;
}
```

This guarantees that even with 5 concurrent callers, only **one** Figma API call is made. All callers await the same promise.

#### API Call Budget for `figma-get-frame-data`

For a typical 5-frame page review:

| API Call | Tier | Without cache | With cache (first run) | With cache (re-run) |
|----------|------|---------------|----------------------|---------------------|
| `GET /meta` | T3 | — | 1 | 1 |
| `GET /nodes?ids=` | **T1** | 5 | 1* | 0 (disk cache) |
| `GET /images?ids=` | **T1** | 5 | 1* | 0 (disk cache) |
| `GET /comments` | T2 | 5 | 1 | 1 (30s TTL) |
| **Total Tier 1** | | **10** | **2** | **0** |

\* Nodes and images use batch endpoints — multiple frame IDs in one request. However, with the per-frame tool interface, we need a strategy to batch these too (see "Batching Strategy" below).

#### Batching Strategy for Nodes and Images

Comments naturally centralize (one file-level fetch). But nodes and images are per-frame Tier 1 calls. Two options:

**Option A: Eager Batch (Server Prefetch)**

When `figma-get-frame-data` is called for the first frame in a file, the tool recognizes it's likely part of a multi-frame workflow and prefetches nodes + images for ALL frames in the file (using the same batch API). Subsequent calls for other frames hit the warm cache.

Pros: Minimizes Tier 1 calls (2 total: 1 nodes batch, 1 images batch)
Cons: Fetches data for frames the agent might not analyze; requires knowing all frame IDs upfront

**Option B: Cache-Aware Sequential**

Each `figma-get-frame-data` call fetches only its own frame's node and image data. Disk cache prevents re-fetches on re-runs, but the first run makes N Tier 1 calls.

Pros: Simple; no over-fetching
Cons: N Tier 1 calls on first run (5 frames = 5 node calls + 5 image calls = 10 Tier 1, right at the limit)

**Option C: Hint-Based Batch (Recommended)**

The agent can pass an optional `siblingNodeIds` parameter alongside the target `nodeId`. On the first call, the tool batches all sibling IDs into a single `/nodes` and `/images` request and caches the results. Subsequent calls for sibling frames hit the cache.

```typescript
{
  name: 'figma-get-frame-data',
  args: {
    url: z.string(),
    nodeId: z.string(),
    siblingNodeIds: z.array(z.string()).optional()
      .describe('Other frame nodeIds on the same page — enables batch prefetch to reduce API calls'),
  },
}
```

The workflow orchestration instructs the agent to pass sibling IDs:

```markdown
## Step 2: Analyze each frame

For the first frame, include ALL frame nodeIds from Step 1 as `siblingNodeIds`.
This prefetches data for all frames in a single API call.

Subsequent calls for other frames will use cached data automatically.
```

Pros: Explicit batching; no over-fetch; agent controls what gets prefetched
Cons: Slightly more complex agent instructions

**Comparison:**

| Approach | Tier 1 calls (5 frames, first run) | Complexity | Over-fetch risk |
|----------|-------------------------------------|-----------|-----------------|
| A: Eager | 2 (1 nodes + 1 images) | Medium | Yes — fetches unused frames |
| B: Sequential | 10 (5 nodes + 5 images) | Low | None |
| C: Hint-based | 2 (1 nodes + 1 images) | Medium | None — agent specifies |

#### Putting It All Together: `figma-get-frame-data` Internal Flow

```
figma-get-frame-data(url, nodeId, siblingNodeIds?)
│
├─ 1. Parse fileKey from URL
│
├─ 2. Cache validation: GET /meta (Tier 3, always)
│     └─ If cache invalid → clear disk cache for this file
│
├─ 3. Fetch node data
│     ├─ Check disk cache: nodes-cache.json for this nodeId
│     ├─ Cache miss? Batch fetch: nodeId + siblingNodeIds (Tier 1, 1 call)
│     └─ Save all results to disk cache
│
├─ 4. Fetch image
│     ├─ Check disk cache: {frameName}.png
│     ├─ Cache miss? Batch fetch: nodeId + siblingNodeIds (Tier 1, 1 call)
│     └─ Save all results to disk cache
│
├─ 5. Fetch comments
│     ├─ Check in-memory cache (30s TTL)
│     ├─ Check pending-request dedup
│     ├─ Cache miss? GET /comments (Tier 2, 1 call)
│     └─ Filter to this frame's comments
│
├─ 6. Generate semantic XML from node data
│
└─ 7. Return: { image, semanticXml, annotations, frameName, dimensions }
```

**API call budget with hint-based batching (5 frames, first run):**
- 1× `/meta` (Tier 3)
- 1× `/nodes?ids=all` (Tier 1)
- 1× `/images?ids=all` (Tier 1)
- 1× `/comments` (Tier 2)
- **Total: 2 Tier 1 calls** — well within the 10/min Professional limit

**On re-runs (cache warm):**
- 1× `/meta` (Tier 3)
- 0× `/nodes` (disk cache)
- 0× `/images` (disk cache)
- 1× `/comments` (30s TTL, may or may not hit cache)
- **Total: 0 Tier 1 calls**

### View/Collab Seat Considerations

Per spec 055, View/Collab seats have extreme limits: **up to 6 Tier 1 calls/month**. The batching strategy is critical here:

- With hint-based batching: 2 Tier 1 calls per review (nodes + images)
- Without batching: 10 Tier 1 calls per review → would consume monthly budget in one run

The workflow resource should note this:

```markdown
> **⚠️ Rate Limits:** Always pass `siblingNodeIds` to minimize Figma API calls.
> Without it, each frame makes separate API calls which can exhaust rate limits
> quickly, especially on View/Collab seat plans.
```

## Implementation Sketch

### File Structure

```
server/mcp-resources/
├── index.ts                          # registerAllResources(mcp)
├── workflow-resources.ts             # workflow://review-design, workflow://write-story
└── prompt-resources.ts               # prompt://frame-analysis, etc.

server/providers/figma/tools/
├── figma-get-frame-data/             # NEW consolidated per-frame tool
│   ├── index.ts
│   └── figma-get-frame-data.ts
└── ... (existing tools unchanged)
```

### Registration in Server Factory

```typescript
// server/mcp-core/server-factory.ts
import { registerAllResources } from '../mcp-resources/index.js';

// In createMcpServer():
const mcp = new McpServer({
  // ...
  capabilities: {
    tools: {},
    prompts: {},
    resources: {},   // ← ADD
    logging: {},
    sampling: {},
  },
});

// Resources are always registered (no auth needed, just text)
registerAllResources(mcp);
```

### Prompt Resources Pull from Existing Source Files

```typescript
// server/mcp-resources/prompt-resources.ts
import { SCREEN_ANALYSIS_SYSTEM_PROMPT } from '../providers/figma/screen-analyses-workflow/screen-analyzer.js';
import { FEATURE_IDENTIFICATION_SYSTEM_PROMPT } from '../providers/combined/tools/analyze-feature-scope/strategies/prompt-scope-analysis-2.js';
import { FIGMA_QUESTIONS_SYSTEM_PROMPT } from '../providers/figma/tools/figma-review-design/prompt-figma-questions.js';
import { STORY_CONTENT_SYSTEM_PROMPT } from '../providers/combined/tools/write-story/prompt-story-content.js';

export function registerPromptResources(mcp: McpServer): void {
  mcp.registerResource('frame-analysis-prompt', 'prompt://frame-analysis', 
    { description: '...', mimeType: 'text/markdown' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: SCREEN_ANALYSIS_SYSTEM_PROMPT }],
    })
  );
  // ... same for scope-synthesis, generate-questions, write-story-content
}
```

Single source of truth — same constants used by both the monolithic tools (with sampling) and the resource-based workflow.

## Open Questions

### 1. Do agents actually resolve `resources/read` mid-workflow?

The MCP spec supports it, and VS Code Copilot exposes `resources/list` + `resources/read` in its MCP client. But we should verify that agents will actually follow a workflow instruction like "Read resource `prompt://frame-analysis`" and issue a `resources/read` call.

**Mitigation:** If agents don't reliably do this, we can include the prompt text inline in the workflow resource (like 061's embedded approach) while still registering the prompts as resources for direct access. The workflow text becomes self-contained but larger.

### 2. Should workflow resources be static or parameterized?

Static `workflow://review-design` returns the same orchestration every time. A `ResourceTemplate` like `workflow://review-design/{figmaUrl}` could return a customized orchestration with the URL pre-filled.

**Leaning static:** The orchestration instructions are generic. The agent fills in parameters when calling tools. Parameterized workflows add complexity without clear benefit.

### 3. How does this interact with MCP prompts?

We currently have `prompt-figma-page-questions` and `prompt-write-story` as MCP prompts (the 061 entry points). With resources:

- **Option A:** Keep MCP prompts as entry points. The prompt message says "Read `workflow://review-design` and follow it." Prompts remain the discovery mechanism.
- **Option B:** Drop MCP prompts. Agents discover `workflow://` resources directly via `resources/list`. Simpler, but changes the entry point from prompts to resources.
- **Option C:** Both. MCP prompts for agents that use the prompt protocol; resources for agents that browse resources. Same workflow, two entry points.

**Leaning Option A:** Prompts are the conventional MCP entry point for "do this task." Resources are the "reference material" the agent consults while executing. This matches the MCP spec's intent — prompts are user-controlled templates, resources are application-controlled data.

### 4. What if the agent's context window can't hold all prompt resources?

A single frame analysis prompt is ~2K tokens. The workflow orchestration is another ~1K. For a 10-frame page, the agent needs ~20K tokens of prompt text plus image data.

**Mitigation:** The resource-based pattern naturally handles this because the agent reads prompts on demand (per-subagent or per-step), not all upfront. Compare to 061's super-tool which returns ALL prompts in one response.

### 5. `figma-get-frame-data` vs. existing individual tools?

We already have `figma-get-image-download`, `figma-get-metadata-for-layer`. Should `figma-get-frame-data` replace them or coexist?

**Leaning coexist:** The individual tools serve other use cases (e.g., someone just wants an image). `figma-get-frame-data` is the "workflow-optimized" tool that reduces per-frame round-trips from 3 to 1.

### 6. Comment cache TTL — 30 seconds enough?

The 30-second comment cache TTL was chosen for the subagent burst window — 5 subagents spawned simultaneously all resolve within seconds. But what about:

- **Sequential processing:** If an agent processes 10 frames one at a time, with LLM analysis between each, the total time could be 5+ minutes. After 30s, every `figma-get-frame-data` call re-fetches comments.
- **Re-analysis:** If the agent re-runs the workflow 2 minutes later, comments are re-fetched.

**Options:**
- **30s (current):** Safe default. Covers subagent burst. Sequential workflows pay extra Tier 2 calls, but Tier 2 is 25/min so this is rarely a problem.
- **5 minutes:** Covers most sequential workflows. Risk: stale comments if someone adds a comment mid-workflow (acceptable since the agent is the one running the workflow).
- **Per-workflow session:** Tool accepts an optional `sessionId` — all calls with the same session share a comment cache. Agent generates a session ID at the start of the workflow. Most flexible but adds API surface.

**Leaning 30s** for simplicity. Tier 2 isn't the bottleneck (Tier 1 is). If we see excessive comment fetches in practice, bump to 5 minutes.

### 7. Should `figma-get-frame-data` use `siblingNodeIds` or auto-detect siblings?

The hint-based approach (Option C above) requires the agent to pass `siblingNodeIds`. Alternative: the tool could call `figma-get-layers-for-page` internally to discover siblings. But this adds another API call and conflates "get frame data" with "discover all frames."

**Leaning hint-based:** The agent already knows the frame list from Step 1. Passing sibling IDs is cheap and explicit. The tool stays focused on data retrieval.

## Summary: Recommended Path

### Default: Hybrid Pattern (062b) — Batch + Local Files + Subagents

1. **Reuse `figma-page-questions-context`** — server batch-fetches all data efficiently (2 Tier 1 calls)
2. **Register workflow resource** `workflow://review-design` with hybrid orchestration (save to temp → spawn subagents from filesystem)
3. **Register prompt resources** (`prompt://frame-analysis`, etc.) — available both as embedded in context tool response AND as standalone MCP resources
4. **Enable `resources: {}` capability** in server factory

### Also support:

5. **Keep `figma-get-frame-data` as an option** (062a: resource orchestration) for agents that prefer MCP-native data access over filesystem
6. **Extract shared Figma request cache** (`figma-request-cache.ts`) for `figma-get-frame-data` and other per-frame tools
7. **Keep MCP prompts** as entry points that reference workflow resources
8. **Keep monolithic tools** (`figma-review-design`, `write-story`) for agents with sampling

### Agent Tier Matrix

```
Tier 1 (Sampling):     figma-review-design → Server handles everything
Tier 2 (Simple):       figma-page-questions-context → One call, follow embedded prompts sequentially
Tier 3 (Subagents):    workflow://review-design (hybrid) → Batch fetch, save to temp, fork subagents from filesystem
Tier 4 (MCP-native):   workflow://review-design (resource) → Per-frame tool calls + resource reads
```

All tiers share the same Figma caching infrastructure. A 5-frame review costs **2 Tier 1 + 1 Tier 2 + 1 Tier 3 API calls** regardless of tier.
