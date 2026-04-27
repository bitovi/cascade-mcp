# 068: Cascade MCP Plugin Skills

**Status:** Draft  
**Builds on:** [057-prompts.md](./057-prompts.md), [062-workflow-patterns.md](./062-workflow-patterns.md), [063-questions-subagents.md](./063-questions-subagents.md), [067-agent-workflow/](./067-agent-workflow/)

## Problem

Cascade MCP exposes 26+ tools, prompt resources (`prompt://`), workflow resources (`workflow://`), and MCP prompts — but there is no way for agents to discover guided multi-step workflows unless they already know how to chain the tools. Today, workflows like "generate questions from a Figma design and post them to Jira" require the user to manually orchestrate multiple tool calls or use monolithic sampling-based tools (e.g., `figma-review-design`) that can't be customized.

AI plugin skills solve this by packaging step-by-step workflow instructions as installable `.claude-plugin` skills that work in both Claude Code and VS Code Copilot. The agent follows the skill instructions, calling MCP tools for data and side-effects while using its own LLM for generation — no sampling dependency.

## Goals

1. Package composable sub-skills and parent workflow skills as an installable AI plugin (`.claude-plugin/` format)
2. Expose 3 internal helper functions as standalone MCP tools (comment posting, comment reading)
3. Add `figma-batch-load` tool that batch-fetches Figma data and serves it as a downloadable zip
4. Skill-managed `.temp/cascade/` local cache — Figma images, context, analyses persist across skill invocations
5. Bundle MCP server configuration so plugin installation also connects cascade-mcp
6. Work across Claude Code and VS Code Copilot without IDE-specific APIs
7. Decompose workflows into reusable sub-skills (load-content, analyze-content, analyze-figma-frame, synthesize) that parent skills compose

## Architecture

### How Skills Interact with MCP

```
┌──────────────────────────────────────────────────────────────┐
│  AI Plugin (installed in Claude Code / VS Code Copilot)       │
│                                                               │
│  SKILL.md files — self-contained workflow instructions        │
│  + embedded prompt text (no prompt:// dependency)             │
│  + plugin.json with bundled mcpServers config                 │
│                                                               │
└───────────────────────┬───────────────────────────────────────┘
                        │  Agent reads skill instructions,
                        │  then calls MCP tools
┌───────────────────────▼───────────────────────────────────────┐
│  Cascade MCP Server (connected via plugin's mcpServers)       │
│                                                               │
│  Existing tools:                                              │
│    atlassian-get-issue          figma-ask-scope-questions-*    │
│    atlassian-update-issue-*     figma-frame-analysis           │
│    write-story-context          figma-get-image-download       │
│    confluence-analyze-page      google-drive-doc-to-markdown   │
│                                                               │
│  NEW tools (Phase 1):                                         │
│    figma-batch-load             (multi-URL batch fetch → zip) │
│    figma-post-comment           (single comment posting)      │
│    atlassian-add-comment        (issue comment posting)       │
│    figma-get-comments           (read existing comments)      │
│                                                               │
│  NEW endpoint:                                                │
│    GET /dl/:token               (one-time zip download)       │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Skill Design Principles

- **Self-contained prompts**: SKILL.md files embed prompt text directly (sourced from `QUESTIONS_GENERATION_PROMPT_TEXT` and `STORY_CONTENT_SYSTEM_PROMPT`). No dependency on `prompt://` MCP resources — skills work even if the agent can't call `resources/read`.
- **Agent-driven orchestration**: The agent IS the LLM. Skills instruct it to call MCP tools for data/side-effects and use its own reasoning for generation. No MCP sampling required.
- **Natural chat flow for user interaction**: Skills present results in chat and ask follow-up questions inline. No dependency on MCP elicitation or `vscode_askQuestions` — works across both Claude Code and VS Code Copilot.
- **Zip download + local cache**: Figma data is batch-fetched server-side and served as a zip file. The agent downloads via `curl` and extracts to `.temp/cascade/figma/`. Subagents read local files — no MCP calls needed for frame data.
- **Skill-managed `.temp/cascade/` cache**: Skills check for cached data before fetching. Once Figma frames are downloaded, they persist indefinitely. Subsequent skills (write-story, generate-questions, review-design) reuse cached data with zero API calls.
- **Subagent parallelism**: For Figma frame analysis, skills instruct the agent to spawn one subagent per frame. Each subagent reads its frame data from `.temp/cascade/figma/{fileKey}/frames/{name}/` — pure filesystem, no MCP, no tokens.
- **Self-healing compatibility**: Questions posted to Jira use ❓ markers so existing `write-story` tools can detect answered questions (💬).
- **Composable sub-skills**: Skills are decomposed into reusable sub-skills (building blocks) and parent skills (user-facing workflows). Sub-skills are shared across parent skills — e.g., `analyze-figma-frame` is used by both `generate-questions` and `write-story`. Parent agents drive the orchestration loop; subagents only appear at leaf-level tasks (frame analysis).

### Composable Sub-Skill Architecture

Skills are decomposed into **sub-skills** (reusable building blocks) and **parent skills** (user-facing workflows that compose sub-skills). This enables reuse: the same context-gathering and analysis sub-skills power question generation, story writing, and future workflows.

**Constraint**: Subagents can only be spawned one level deep. Parent skills drive all orchestration loops directly — sub-skills that need looping are called iteratively by the parent, not nested.

#### Sub-Skills (Building Blocks)

| Sub-Skill | Purpose | Called By |
|-----------|---------|-----------|
| **`load-content`** | Fetches raw content for a URL (or set of URLs) via MCP tools. Saves raw content to `.temp/cascade/context/{source}/`. If new links are discovered in the fetched content, appends them to `to-load.md`. | Parent skills (directly) |
| **`analyze-content`** | Takes raw fetched content, summarizes it, categorizes it, extracts newly discovered links. Writes summary files. Appends any new links to `to-load.md` for the next load cycle. | Parent skills (directly) |
| **`analyze-figma-frame`** | Takes a single frame's local files (image.png, structure.xml, context.md), runs analysis per the frame-analysis prompt, writes `analysis.md`. | Subagents (one per frame) |
| **`synthesize`** | Reads all frame analyses + content summaries, produces cross-content synthesis. | Parent skills (directly) |

#### Parent Skills (User-Facing Workflows)

| Parent Skill | Composes | User Trigger |
|-------------|----------|--------------|
| **`generate-questions`** | load-content → analyze-content → (loop) → analyze-figma-frame → synthesize → generate questions | "generate questions for PROJ-123" |
| **`write-story`** | load-content → analyze-content → (loop) → analyze-figma-frame → synthesize → write story | "write the story for PROJ-456" |
| **`review-design`** | generate-questions → user review → post to Figma/Jira | "review the design for PROJ-123" |
| **`post-questions-to-figma`** | (uses question output from generate-questions) | "post these to Figma" |
| **`post-questions-to-jira`** | (uses question output from generate-questions) | "add these to the ticket" |

#### Parent Skill Orchestration Loop

The iterative context-gathering pattern used by `generate-questions`, `write-story`, and future parent skills:

```
Parent agent:
  1. extract-linked-resources(issueKey) → get initial links
  
  2. LOOP: Load & Analyze
     a. load-content(unloaded links from to-load.md)
        → fetches raw content via MCP tools
        → saves to .temp/cascade/context/{source}/
        → appends newly discovered links to to-load.md
     b. analyze-content(loaded content)
        → summarizes, categorizes
        → extracts new links → appends to to-load.md
     c. Check to-load.md — any unloaded links?
        → If yes → go to 2a
        → If no → context gathering complete
  
  3. Figma Loading (all discovered Figma URLs)
     a. figma-batch-load(all Figma URLs) → curl/unzip
     b. figma-get-comments(fileKey) → agent saves to context.md
  
  4. Frame Analysis (subagents — one level deep)
     → Spawn one subagent per frame (analyze-figma-frame)
     → Each reads local files, writes analysis.md
     → Sequential fallback if no subagent support
  
  5. Synthesize all analyses + content summaries
  
  6. [Skill-specific output]
     → generate-questions: generate and present questions
     → write-story: generate and present story draft
```
  │                                │                            │
  │                                │  Build zip in os.tmpdir(): │
  │                                │   manifest.json            │
  │                                │   frames/login/image.png   │
  │                                │   frames/login/structure.xml│
  │                                │   frames/dashboard/...     │
  │                                │   prompts/frame-analysis.md│
  │                                │                            │
  │                                │  Serve at one-time URL     │
  │◄── { downloadUrl, manifest } ──│                            │
  │                                │                            │
  │  curl -sL {downloadUrl}        │                            │
  │    -o /tmp/figma-data.zip      │                            │
  │  unzip -qo ... -d .temp/cascade/figma/                           │
  │  rm /tmp/figma-data.zip        │                            │
  │                                │  (zip deleted on download  │
  │                                │   or after 10-min TTL)     │
  │                                │                            │
  │── figma-get-comments(fileKey)─►│── GET /comments ──────────►│
  │◄── fresh comments by frame ────│◄──────────────────────────│
  │                                │                            │
  │  Agent saves comments to:      │                            │
  │  .temp/cascade/figma/{fileKey}/     │                            │
  │    frames/{name}/context.md    │                            │
  │  (always fresh, never cached)  │                            │
  │                                │                            │
  │  Subagents read local files:   │                            │
  │  .temp/cascade/figma/{fileKey}/     │                            │
  │    frames/{name}/image.png     │                            │
  │    frames/{name}/context.md    │                            │
  │  (zero further MCP calls)      │                            │
```

### Local Cache Structure (`.temp/cascade/`)

Skills manage a persistent workspace cache at `.temp/cascade/`. Data survives across skill invocations, conversations, and agent restarts.

```
.temp/cascade/
└── figma/
    ├── abc123/                        ← keyed by Figma fileKey
    │   ├── manifest.json              ← frame list, metadata (from zip)
    │   ├── prompts/
    │   │   ├── frame-analysis.md      ← analysis prompt (from zip)
    │   │   └── scope-synthesis.md     ← synthesis prompt (from zip)
    │   ├── frames/
    │   │   ├── login/
    │   │   │   ├── image.png          ← actual PNG (from zip, cached)
    │   │   │   ├── context.md         ← comments/annotations (from figma-get-comments, always fresh)
    │   │   │   ├── structure.xml      ← semantic component tree (from zip, cached)
    │   │   │   └── analysis.md        ← written by subagent
    │   │   └── dashboard/
    │   │       ├── image.png
    │   │       ├── context.md
    │   │       ├── structure.xml
    │   │       └── analysis.md
    │   ├── scope-synthesis.md         ← cross-frame synthesis
    │   └── questions.md               ← generated questions
    └── xyz789/
        └── ...                        ← another Figma file
```

**Cache-first pattern** (embedded in every skill that uses Figma data):
```
1. Check if .temp/cascade/figma/{fileKey}/manifest.json exists
2. If yes, check if frames/{name}/image.png exists for each needed frame
3. If all frames cached → skip figma-batch-load entirely (zero image/structure API calls)
4. If some missing → call figma-batch-load for missing URLs only
5. After loading → save to .temp/cascade/figma/ for future skills
6. ALWAYS call figma-get-comments for fresh comments (comments are never cached)
7. Agent saves comments to .temp/cascade/figma/{fileKey}/frames/{name}/context.md
```

---

## Phase 1: New MCP Tools & Download Endpoint

Four new MCP tools and one HTTP endpoint. The `figma-batch-load` tool is the centerpiece — it replaces the `figma-ask-scope-questions-for-page` + `figma-frame-analysis` per-frame pattern with a single batch fetch that serves a downloadable zip.

### Step 1.1: `figma-batch-load` tool

Batch-fetches Figma data for multiple URLs (pages or frames, across files), builds a zip containing all frame images, context, structure, and prompts, and returns a one-time download URL. The agent uses `curl` + `unzip` to save everything to `.temp/cascade/figma/`.

**New folder**: `server/providers/figma/tools/figma-batch-load/`
**New files**: `index.ts`, `figma-batch-load.ts`, `zip-builder.ts`
**Register in**: `server/providers/figma/tools/index.ts`

**Input schema:**
```typescript
inputSchema: {
  requests: z.array(z.object({
    url: z.string().describe('Figma URL — page-level or frame-level'),
    label: z.string().optional().describe('Human label (e.g., "Login Screen" or "PROJ-123 designs")'),
  })).min(1).describe('Figma URLs to load. Can span multiple files. Deduplicates by file.'),
  context: z.string().optional()
    .describe('Feature context for annotation association'),
}
```

**Implementation — `figma-batch-load.ts`:**

1. **Parse & deduplicate**: Group URLs by fileKey. If a page URL is given, include all frames on that page. If frame URLs are given, include only those specific frames.

2. **Batch fetch per file** (parallel across files):
   - `GET /v1/files/{key}/meta` (Tier 3) — cache validation, frame discovery
   - `GET /v1/files/{key}/nodes?ids=...` (Tier 1) — all requested nodeIds in ONE call
   - `GET /v1/images/{key}?ids=...` (Tier 1) — all frame images in ONE call
   - ~~`GET /v1/files/{key}/comments`~~ **Removed**: comments are always-fresh data and cannot be cached. Fetched separately via `figma-get-comments`.

3. **Build zip** (in `os.tmpdir()`):
   ```
   {fileKey}/
   ├── manifest.json
   ├── prompts/
   │   ├── frame-analysis.md
   │   └── scope-synthesis.md
   └── frames/
       ├── {frame-name}/
       │   ├── image.png           ← actual PNG binary
       │   └── structure.xml       ← semantic component tree
       └── ...
   ```
   No `context.md` in the zip — comments are fetched separately via `figma-get-comments` and saved by the agent to `.temp/cascade/figma/{fileKey}/frames/{name}/context.md`.
   When multiple files are requested, zip contains one `{fileKey}/` directory per file.

4. **Generate download token**: `crypto.randomUUID()`, register in in-memory `downloads` Map with 10-minute TTL.

5. **Return lightweight response**:
   ```json
   {
     "downloadUrl": "https://cascade.example.com/dl/a1b2c3d4-...",
     "expiresAt": "2026-04-26T12:10:00Z",
     "manifest": {
       "files": [
         {
           "fileKey": "abc123",
           "fileName": "User Onboarding",
           "frames": [
             { "nodeId": "1:2", "name": "Login", "dirName": "login" },
             { "nodeId": "3:4", "name": "Dashboard", "dirName": "dashboard" }
           ]
         }
       ],
       "totalFrames": 2,
       "zipSizeBytes": 1048576
     },
     "saveInstructions": "curl -sL \"{downloadUrl}\" -o /tmp/cascade-figma.zip && unzip -qo /tmp/cascade-figma.zip -d .temp/cascade/figma/ && rm /tmp/cascade-figma.zip"
   }
   ```

**Implementation — `zip-builder.ts`:**

Helper that takes the fetched frame data and builds a zip file using `archiver` (or similar):
- Writes actual PNG binaries (not base64)
- Writes markdown/XML as text files
- Generates `manifest.json` with frame metadata
- Embeds analysis prompts from shared constants

**Also expose via REST API**: `server/api/figma-batch-load.ts`
**Route**: `POST /api/figma-batch-load`
**Headers**: `X-Figma-Token`
**Body**: `{ requests: [{ url, label? }], context? }`

### Step 1.2: Download endpoint (`GET /dl/:token`)

One-time zip download endpoint. Not an MCP tool — a plain HTTP endpoint the agent hits via `curl`.

**New file**: `server/api/download.ts`
**Register in**: `server/server.ts` (Express routes)

**Implementation:**
```typescript
// In-memory download registry
const downloads = new Map<string, { zipPath: string; expiresAt: number }>();
const MAX_PENDING_DOWNLOADS = 20;

app.get('/dl/:token', (req, res) => {
  const entry = downloads.get(req.params.token);
  if (!entry || Date.now() > entry.expiresAt) {
    downloads.delete(req.params.token);
    return res.status(404).send('Expired or already downloaded');
  }

  res.download(entry.zipPath, 'figma-data.zip', () => {
    // Delete zip after download completes
    fs.unlink(entry.zipPath).catch(() => {});
    downloads.delete(req.params.token);
  });
});
```

**Server-side cleanup strategy:**

| Layer | What it handles | Mechanism |
|-------|----------------|-----------|
| Delete on download | Normal flow — zip lives for seconds | `res.download()` callback |
| OS temp dir (`os.tmpdir()`) | Server crash, abandoned zips | OS auto-cleans `/tmp` |
| Lazy sweep on creation | Never-downloaded zips within session | Sweep expired entries before creating new ones |
| Max pending cap (20) | Burst of requests | Evict oldest when limit reached |
| Docker restart | Everything | Container `/tmp` is ephemeral |

No background timers, no database, no cron — same philosophy as existing `scope-cache.ts`.

**Security:**
- Download token: `crypto.randomUUID()` — not guessable
- Time-limited: 10-minute expiry
- Single-use: deleted after first download
- No auth header on `curl` — the token IS the auth (like a signed URL)
- No path traversal risk — token is the only lookup key

### Step 1.3: `figma-post-comment` tool

Posts a single comment to a Figma file, optionally pinned to a specific frame node.

**New file**: `server/providers/figma/tools/figma-post-comment.ts`
**Register in**: `server/providers/figma/tools/index.ts`

**Input schema:**
```typescript
inputSchema: {
  fileKey: z.string()
    .describe('Figma file key (from the URL path, e.g., "abc123" from figma.com/design/abc123/...)'),
  message: z.string()
    .describe('Comment text to post'),
  nodeId: z.string().optional()
    .describe('Node ID to pin the comment to a specific frame (e.g., "123:456"). If omitted, posts as a file-level comment.'),
}
```

**Implementation:**
- Single comment only — no batch mode or rate limiting for v1
- Reuses `FigmaClient.postComment()` → Figma API `POST /v1/files/{fileKey}/comments`
- When `nodeId` is provided, uses `client_meta: { node_id: nodeId, node_offset: { x: 0, y: 0 } }` (type `FigmaFrameOffset` from `figma-comment-types.ts`)
- Pattern reference: `postQuestionsToFigma()` in `figma-comment-utils.ts` (but simpler — single call, no batching)

**Also expose via REST API**: `server/api/figma-post-comment.ts`  
**Route**: `POST /api/figma-post-comment`  
**Headers**: `X-Figma-Token`  
**Body**: `{ fileKey, message, nodeId? }`

### Step 1.4: `atlassian-add-comment` tool

Posts a comment to a Jira issue. Accepts markdown, converts to ADF server-side.

**New file**: `server/providers/atlassian/tools/atlassian-add-comment.ts`
**Register in**: `server/providers/atlassian/tools/index.ts`

**Input schema:**
```typescript
inputSchema: {
  issueKey: z.string()
    .describe('Jira issue key (e.g., "PROJ-123")'),
  comment: z.string()
    .describe('Comment text in markdown format. Converted to ADF before posting.'),
  cloudId: z.string().optional()
    .describe('Cloud ID to specify the Jira site.'),
  siteName: z.string().optional()
    .describe('Jira site name (e.g., "mycompany" from mycompany.atlassian.net).'),
}
```

**Implementation:**
- Wraps existing `addIssueComment(client, cloudId, issueKey, markdownText)` from `atlassian-helpers.ts`
- Resolves cloudId from siteName if needed (pattern from existing tools)
- Returns: `{ success: true, issueKey, commentId }`

**Also expose via REST API**: `server/api/atlassian-add-comment.ts`  
**Route**: `POST /api/atlassian-add-comment`  
**Headers**: `X-Atlassian-Token`  
**Body**: `{ issueKey, comment, cloudId?, siteName? }`

### Step 1.5: `figma-get-comments` tool

Reads existing comments from a Figma file, grouped into threads and associated with frames.

**New file**: `server/providers/figma/tools/figma-get-comments.ts`
**Register in**: `server/providers/figma/tools/index.ts`

**Input schema:**
```typescript
inputSchema: {
  fileKey: z.string()
    .describe('Figma file key (from the URL path)'),
  nodeId: z.string().optional()
    .describe('Filter to comments on a specific node. If omitted, returns all file comments.'),
}
```

**Implementation:**
- Wraps existing `fetchCommentsForFile(figmaClient, fileKey)` from `figma-comment-utils.ts`
- Groups into threads via `groupCommentsIntoThreads()`
- Optionally filters by nodeId
- Returns: markdown-formatted comment threads (author, timestamp, message, replies)

**Why this is needed**: Skills need fresh Figma comments on every invocation — comments can't be cached because there's no timestamp-based invalidation. The `figma-batch-load` tool intentionally excludes comments (they're always-fresh data). Skills call `figma-get-comments`, then the SKILL.md instructs the agent to save the returned comments to `.temp/cascade/figma/{fileKey}/frames/{name}/context.md` for subagent consumption.

**Also expose via REST API**: `server/api/figma-get-comments.ts`  
**Route**: `GET /api/figma-get-comments?fileKey=...&nodeId=...`  
**Headers**: `X-Figma-Token`

### Verification (Phase 1)

- Start server with `npm run start-local`
- Browser MCP client: call `figma-batch-load` with a Figma page URL → verify response contains `downloadUrl` and manifest
- `curl` the `downloadUrl` → verify zip downloads, contains `manifest.json`, `frames/*/image.png`, etc.
- `curl` the same `downloadUrl` again → verify 404 (single-use token consumed)
- Browser MCP client: call `figma-post-comment` → verify comment appears in Figma
- Browser MCP client: call `atlassian-add-comment` → verify comment appears in Jira
- Browser MCP client: call `figma-get-comments` → verify existing comments returned
- REST API: `curl` each new endpoint with PAT headers → verify same behavior

---

## Phase 2: Plugin Structure & Manifest

### Step 2.1: Plugin directory structure

```
plugins/cascade-mcp/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── # Sub-skills (reusable building blocks)
│   ├── load-content/
│   │   └── SKILL.md
│   ├── analyze-content/
│   │   └── SKILL.md
│   ├── analyze-figma-frame/
│   │   └── SKILL.md
│   ├── synthesize/
│   │   └── SKILL.md
│   │
│   ├── # Parent skills (user-facing workflows)
│   ├── generate-questions/
│   │   └── SKILL.md
│   ├── post-questions-to-figma/
│   │   └── SKILL.md
│   ├── post-questions-to-jira/
│   │   └── SKILL.md
│   ├── review-design/
│   │   └── SKILL.md
│   └── write-story/
│       └── SKILL.md
└── README.md
```

### Step 2.2: Marketplace manifest at repo root

```
.claude-plugin/
└── marketplace.json
```

```json
{
  "name": "cascade-mcp-marketplace",
  "owner": { "name": "Bitovi" },
  "plugins": [
    {
      "name": "cascade-mcp",
      "source": "./plugins/cascade-mcp",
      "description": "Skills for Jira/Figma/Google workflow orchestration with Cascade MCP"
    }
  ]
}
```

### Step 2.3: Plugin manifest

`plugins/cascade-mcp/.claude-plugin/plugin.json`:

```json
{
  "name": "cascade-mcp",
  "description": "Skills for generating design review questions, posting to Figma/Jira, and writing user stories via Cascade MCP",
  "author": { "name": "Bitovi" },
  "mcpServers": {
    "cascade-mcp": {
      "type": "http",
      "url": "${CASCADE_MCP_URL}/mcp"
    }
  }
}
```

- No `version` field — uses git commit SHA for auto-updates
- `mcpServers` bundles the cascade-mcp connection; users set `CASCADE_MCP_URL` env var
- Plugin-provided MCP servers start automatically when the plugin is enabled (per Claude Code docs)

### Verification (Phase 2)

- `claude plugin validate ./plugins/cascade-mcp` — passes
- `claude --plugin-dir ./plugins/cascade-mcp` — loads, skills discoverable
- With `CASCADE_MCP_URL` set: `/mcp` shows `cascade-mcp` server connected
- In VS Code: marketplace configured via `"chat.plugins.marketplaces"` setting, plugin installable

---

## Phase 3: Skill — Generate Questions

### `skills/generate-questions/SKILL.md`

**Triggers**: "generate questions", "review this issue", "what questions should we ask about this design", "analyze this Figma page"

### MCP Tool Call Sequence

```
User: "generate questions for PROJ-123"
  │
  ▼
1. Check .temp/cascade/figma/ for cached data (see cache-first pattern above)
   If all Figma data is already cached → skip to step 4
  │
  ▼
2. atlassian-get-issue(issueKey: "PROJ-123", siteName)
   └─► Returns: issue description with linked Figma/Confluence/Google Docs URLs
  │
  ▼  (Agent extracts Figma URLs from description)
  │
3. figma-batch-load(requests: [{ url: figmaUrl1 }, { url: figmaUrl2 }], context: issue.summary)
   └─► Returns: { downloadUrl, manifest } (lightweight — no image data inline)
  │
  ▼
   Agent downloads and extracts to local cache:
   ```bash
   curl -sL "{downloadUrl}" -o /tmp/cascade-figma.zip && \
     unzip -qo /tmp/cascade-figma.zip -d .temp/cascade/figma/ && \
     rm /tmp/cascade-figma.zip
   ```
  │
  ▼
4. SUBAGENT per frame (parallel):
   For each frame in .temp/cascade/figma/{fileKey}/manifest.json:
     Subagent reads from local filesystem:
       .temp/cascade/figma/{fileKey}/frames/{name}/image.png    ← vision input
       .temp/cascade/figma/{fileKey}/frames/{name}/context.md   ← annotations
       .temp/cascade/figma/{fileKey}/frames/{name}/structure.xml ← component tree
       .temp/cascade/figma/{fileKey}/prompts/frame-analysis.md  ← analysis instructions
     Subagent analyzes frame and writes:
       .temp/cascade/figma/{fileKey}/frames/{name}/analysis.md
     (Zero MCP calls — pure filesystem)
  │
  ▼
5. For each Google Doc URL (parallel):
   google-drive-doc-to-markdown(url)
   └─► Returns: markdown text
  │
  ▼
6. Agent synthesizes all frame analyses + Google Docs context
   using scope-synthesis instructions embedded in SKILL.md
   Saves to .temp/cascade/figma/{fileKey}/scope-synthesis.md
  │
  ▼
7. Agent generates questions using questions-generation instructions
   embedded in SKILL.md (from QUESTIONS_GENERATION_PROMPT_TEXT)
   Saves to .temp/cascade/figma/{fileKey}/questions.md
  │
  ▼
8. Present questions to user, grouped by screen:

   # Design Review Questions

   ## [Frame: Login Screen (nodeId: 123:456)](https://figma.com/design/abc?node-id=123-456)
   1. What happens when the user enters an invalid email format?
   2. Is there a "forgot password" flow from this screen?

   ## [Frame: Dashboard (nodeId: 789:012)](https://figma.com/design/abc?node-id=789-012)
   1. How should the data cards sort by default?

   ---
   Would you like to:
   - **Post to Figma** (as comments pinned to each frame)
   - **Post to Jira** (as a comment on PROJ-123)
   - **Refine** these questions
```

### Local Cache After This Skill

```
.temp/cascade/figma/{fileKey}/
├── manifest.json          ← from zip
├── prompts/
│   ├── frame-analysis.md  ← from zip
│   └── scope-synthesis.md ← from zip
├── frames/
│   ├── login-screen/
│   │   ├── image.png      ← from zip (actual PNG)
│   │   ├── context.md     ← from zip
│   │   ├── structure.xml  ← from zip
│   │   └── analysis.md    ← written by subagent
│   ├── dashboard/
│   │   └── ...
│   └── ...
├── scope-synthesis.md     ← written by agent
└── questions.md           ← written by agent
```

These files persist. If the user later runs `write-story`, the skill finds the cache and skips `figma-batch-load` entirely.

### Subagent Prompt (per frame)

```
You are analyzing a single Figma design frame. All data is available locally.

Read these files:
- image.png — screenshot of the frame (use as vision input)
- context.md — designer annotations, comments, connections to other frames
- structure.xml — semantic XML showing the component tree
- ../prompts/frame-analysis.md — analysis instructions to follow

Follow the analysis prompt instructions to produce your analysis.
Write your complete analysis to analysis.md in this directory.
```

Note: subagents need NO MCP access. They only need filesystem access and LLM capability.

### Sequential Fallback (No Subagent Support)

If the agent doesn't support subagents, process frames sequentially:
read each frame's local files one at a time, analyze inline, write `analysis.md`, then proceed to synthesis. Still zero MCP calls — just slower.

### Key Design

- Prompt text is embedded directly in SKILL.md — no `prompt://` resource dependency
- The skill instructs URL extraction from the Jira issue description (look for `figma.com`, `docs.google.com` patterns)
- **Cache-first**: skill checks `.temp/cascade/figma/` before calling `figma-batch-load` — reuses data from any prior skill run
- **Zip download**: `figma-batch-load` returns a `downloadUrl`, agent uses `curl` + `unzip` to extract to `.temp/cascade/figma/`
- **Subagents are filesystem-only**: no MCP access needed, just read local files + analyze + write `analysis.md`
- Agent uses its own LLM for question generation — no MCP sampling

### Verification

- Load plugin in Claude Code: "generate questions for PROJ-123"
- Agent calls `atlassian-get-issue`, then `figma-ask-scope-questions-for-page` per Figma URL
- Subagents spawn per frame (or sequential fallback)
- Questions presented grouped by screen with Figma links
- Follow-up options offered

---

## Phase 4: Skill — Post Questions to Figma

### `skills/post-questions-to-figma/SKILL.md`

**Triggers**: "post questions to Figma", "send these to Figma", "add comments to Figma"

### MCP Tool Call Sequence

```
(Assumes questions were generated in Phase 3 and are in the conversation context)
  │
  ▼
For each question group (by frame):
  Extract fileKey and nodeId from the frame heading link
  For each question in the group:
    figma-post-comment(
      fileKey: "{fileKey}",
      message: "Cascade🤖: {question text}",
      nodeId: "{nodeId}"
    )
    └─► Returns: { success, commentId }
  │
  ▼
Report summary:
  "Posted 8 questions to 3 frames in file abc123:
   - Login Screen (123:456): 3 questions
   - Dashboard (789:012): 2 questions
   - Settings (345:678): 3 questions"
```

### Key Design

- Prefix each comment with `Cascade🤖:` (matches existing convention from `figma-review-design`)
- Extract `fileKey` and `nodeId` from the Figma URL in each frame heading (format: `figma.com/design/{fileKey}?node-id={nodeId}`)
- Node ID conversion: Figma URLs use hyphens (`123-456`), API uses colons (`123:456`)
- Single-comment tool calls — no batching. Agent loops through questions sequentially.

### Verification

- After generating questions, say "post these to Figma"
- Comments appear on correct Figma frames with `Cascade🤖:` prefix
- Each comment is pinned to the right frame node

---

## Phase 5: Skill — Post Questions to Jira

### `skills/post-questions-to-jira/SKILL.md`

**Triggers**: "post questions to Jira", "add these to the ticket", "comment these on the issue"

### MCP Tool Call Sequence

```
(Assumes questions were generated in Phase 3 and are in the conversation context)
  │
  ▼
1. Format all questions as a single markdown comment with ❓ markers:

   ## Design Review Questions

   ### Login Screen
   ❓ What happens when the user enters an invalid email format?
   ❓ Is there a "forgot password" flow from this screen?

   ### Dashboard
   ❓ How should the data cards sort by default?

  │
  ▼
2. atlassian-add-comment(
     issueKey: "PROJ-123",
     comment: "{formatted markdown above}",
     siteName: "mycompany"
   )
   └─► Returns: { success, issueKey, commentId }
  │
  ▼
3. Report: "Posted 5 questions as a comment on PROJ-123"
```

### Key Design

- ❓ markers make questions compatible with the self-healing write-story loop:
  - User edits ❓ → 💬 to answer questions
  - `write-story` / `write-shell-stories` detect 💬 markers and incorporate answers
- All questions consolidated into one comment (not individual comments per question)
- Preserves frame grouping with headings for readability

### Verification

- After generating questions, say "add these questions to PROJ-123"
- Comment appears on Jira issue with ❓ markers and frame groupings
- Later: editing ❓ to 💬 in the comment → `write-story` can detect answers

---

## Phase 6: Skill — Review Design (Composite)

### `skills/review-design/SKILL.md`

**Triggers**: "review the design for PROJ-123", "review these Figma screens", "do a design review"

### MCP Tool Call Sequence

This is a composite skill that chains generate-questions → user review → post.

```
1. Run the generate-questions workflow (Phase 3 steps 1-7)
   └─► Questions presented to user

2. Present questions and ask:
   "Review these questions. You can:
    - Edit any questions before posting
    - Remove questions you don't want to post
    - Add additional questions

    When ready, where should I post them?
    - **Figma** (as comments pinned to frames)
    - **Jira** (as a comment on {issueKey})
    - **Both** (Figma comments + Jira comment)"

3. Based on user response:
   - "Figma" → Run post-questions-to-figma workflow (Phase 4)
   - "Jira" → Run post-questions-to-jira workflow (Phase 5)
   - "Both" → Run both in sequence (Figma first, then Jira)

4. Summarize:
   "Design review complete:
    - 8 questions posted to 3 Figma frames
    - 8 questions posted as comment on PROJ-123"
```

### Key Design

- This is the primary user-facing skill — the other question skills are building blocks
- User gets a chance to review/edit before posting (natural chat interaction)
- Supports posting to one or both destinations
- If the user says "refine", agent iterates on questions before posting

### Verification

- "review the design for PROJ-123" → full end-to-end flow
- Questions generated, user reviews, posts to chosen destination(s)
- Comments appear in Figma and/or Jira

---

## Phase 7: Skill — Send Answers to Figma

### `skills/send-answers-to-figma/SKILL.md`

**Triggers**: "send answers to Figma", "reply to Figma questions", "post answers back to Figma"

### MCP Tool Call Sequence

```
User: "send answers to Figma for PROJ-123"
  │
  ▼
1. atlassian-get-issue(issueKey: "PROJ-123", siteName)
   └─► Returns: issue description + comments
  │
  ▼
2. Agent parses answered questions from description/comments:
   - Look for ❓ → 💬 transitions in scope analysis section
   - Look for quoted questions with answers in comments
   - Extract: { question, answer, screenName, nodeId }
  │
  ▼
3. Extract Figma file URL from issue description
  │
  ▼
4. figma-get-comments(fileKey: "{fileKey}")
   └─► Returns: existing comment threads, grouped by frame
  │
  ▼
5. For each answered question:
   a. Match to existing Figma comment thread by question text similarity
   b. If match found (comment_id available):
      figma-post-comment(
        fileKey: "{fileKey}",
        message: "Cascade🤖 Answer: {answer text}",
        nodeId: "{nodeId}"
      )
      NOTE: Figma API supports reply threading via comment_id parameter.
            For v1, post as new pinned comment if thread matching is unreliable.
   c. If no match:
      Post as new comment pinned to the relevant frame
  │
  ▼
6. Report:
   "Sent 3 answers to Figma:
    - Login Screen: 2 answers posted
    - Dashboard: 1 answer posted
    (1 question could not be matched to a Figma comment — posted as new comment)"
```

### Key Design

- Depends on `figma-get-comments` tool (Phase 1 Step 1.3) for reading existing threads
- Thread matching is best-effort: compare question text from Jira with `Cascade🤖:` comment text from Figma
- Fallback: if matching is unreliable, post all answers as new comments pinned to the relevant frame
- Answers prefixed with `Cascade🤖 Answer:` for distinction from questions

### Verification

- Have a Jira issue with 💬 answered questions
- "send answers to Figma for PROJ-123"
- Verify answer comments appear on correct Figma frames
- Verify thread matching or fallback to new comments

---

## Phase 8: Skill — Write Story

### `skills/write-story/SKILL.md`

**Triggers**: "write this story", "fill in the story for PROJ-456", "write the Jira story"

### MCP Tool Call Sequence

```
User: "write the story for PROJ-456"
  │
  ▼
1. write-story-context(issueKey: "PROJ-456", siteName: "mycompany")
   └─► Returns multi-part response:
       - JSON manifest: issue metadata, linkedUrls.figma[], linkedUrls.confluence[]
       - context://hierarchy: parent/child/blocker relationships
       - context://existing-description: current story content (if re-run)
       - context://comments: all issue comments
       - prompt://write-story-content: story writing instructions
  │
  ▼
2. Check .temp/cascade/figma/ for cached Figma data
   If cached (e.g., from prior generate-questions run) → skip to step 5
  │
  ▼
3. For each Figma URL in linkedUrls.figma[]:
   figma-batch-load(requests: [{ url: figmaUrl }], context: issue.summary)
   └─► Returns: { downloadUrl, manifest }
  │
  ▼
   Agent downloads and extracts:
   ```bash
   curl -sL "{downloadUrl}" -o /tmp/cascade-figma.zip && \
     unzip -qo /tmp/cascade-figma.zip -d .temp/cascade/figma/ && \
     rm /tmp/cascade-figma.zip
   ```
  │
  ▼
4. SUBAGENT per frame (parallel):
   For each frame in .temp/cascade/figma/{fileKey}/manifest.json:
     Subagent reads local files (image.png, context.md, structure.xml)
     Follows .temp/cascade/figma/{fileKey}/prompts/frame-analysis.md
     Writes .temp/cascade/figma/{fileKey}/frames/{name}/analysis.md
     (Zero MCP calls — pure filesystem)
  │
  ▼
5. For each Confluence URL in linkedUrls.confluence[]:
   confluence-analyze-page(url: "{confluenceUrl}")
   └─► Returns: page content as markdown
  │
  ▼
6. For each Google Doc URL (extracted from issue description):
   google-drive-doc-to-markdown(url: "{googleDocUrl}")
   └─► Returns: doc content as markdown
  │
  ▼
7. Agent generates story content using embedded prompt instructions
   (from STORY_CONTENT_SYSTEM_PROMPT, embedded in SKILL.md)
   incorporating: hierarchy, Figma analyses (from .temp/cascade/), Confluence pages,
   Google Docs, comments, and existing description (if re-run)
  │
  ▼
8. Present draft to user:
   "Here's the draft story for PROJ-456:
    [full story content]
    
    Would you like to:
    - **Save** this to Jira
    - **Revise** (tell me what to change)
    - **Cancel**"
  │
  ▼
9. On "Save":
   atlassian-update-issue-description(
     issueKey: "PROJ-456",
     description: "{story markdown}",
     siteName: "mycompany"
   )
   └─► Returns: { success, issueKey }
  │
  ▼
10. Report: "Story saved to PROJ-456"
```

### Key Design

- Mirrors the existing `prompt-write-story` → `write-story-context` flow, but as a discoverable skill
- **Cache-first**: if `generate-questions` was run first, `.temp/cascade/figma/` already has all frame data — zero Figma API calls
- **Zip download for fresh data**: `figma-batch-load` + `curl`/`unzip` when cache is cold
- Story format instructions (from `STORY_CONTENT_SYSTEM_PROMPT`) embedded directly in SKILL.md
- User reviews draft before saving — no auto-save
- Supports re-run: if existing description exists, agent incorporates it (update vs. overwrite)
- ❓ markers in Scope Analysis section are preserved for self-healing loop

### Verification

- "write the story for PROJ-456"
- Agent calls `write-story-context`, then Figma/Confluence tools for linked resources
- Draft presented with proper story format (User Story Statement, Supporting Artifacts, Scope Analysis, ACs)
- On approval: saved to Jira via `atlassian-update-issue-description`
- Re-run: detects existing description, shows changes

---

## Phase 9: Documentation

### Step 9.1: Update `server/readme.md`

Add sections documenting:
- New MCP tools: `figma-post-comment`, `atlassian-add-comment`, `figma-get-comments`
- Plugin structure and available skills
- How skills interact with MCP tools

### Step 9.2: Create `plugins/cascade-mcp/README.md`

Include:
- Install instructions for Claude Code (`claude plugin marketplace add ...`)
- Install instructions for VS Code Copilot (`chat.plugins.marketplaces` setting)
- Prerequisites: `CASCADE_MCP_URL` env var, authentication setup
- List of available skills with trigger phrases and descriptions
- Examples of each workflow

### Verification

- README install instructions are testable step-by-step
- All 6 skills listed with accurate trigger phrases

---

## Complete MCP Tool Inventory for Skills

### Existing Tools Used by Skills

| Tool | Used By Skills | Purpose |
|------|---------------|---------|
| `atlassian-get-issue` | generate-questions, send-answers-to-figma | Fetch Jira issue data |
| `write-story-context` | write-story | Fetch Jira hierarchy, comments, linked URLs |
| `confluence-analyze-page` | write-story | Fetch Confluence page content |
| `google-drive-doc-to-markdown` | generate-questions, write-story | Convert Google Doc to markdown |
| `atlassian-update-issue-description` | write-story | Save story content to Jira |

### New Tools Required (Phase 1)

| Tool | Used By Skills | Purpose |
|------|---------------|---------|
| `figma-batch-load` | generate-questions, write-story, review-design | Batch-fetch Figma data across files → zip download URL |
| `figma-post-comment` | post-questions-to-figma, send-answers-to-figma | Post single comment to Figma |
| `atlassian-add-comment` | post-questions-to-jira | Post comment to Jira issue |
| `figma-get-comments` | send-answers-to-figma | Read existing Figma comment threads |

### New Endpoint (Phase 1)

| Endpoint | Purpose |
|----------|---------|
| `GET /dl/:token` | One-time zip download — agent calls via `curl` |

### Tools Superseded by New Pattern

| Old Tool | New Replacement | Why |
|----------|----------------|-----|
| `figma-ask-scope-questions-for-page` | `figma-batch-load` | Multi-URL, zip download instead of per-frame MCP calls |
| `figma-frame-analysis` | Local filesystem reads | Subagents read from `.temp/cascade/` instead of calling MCP tool |

Note: `figma-ask-scope-questions-for-page` and `figma-frame-analysis` remain for backward compatibility with non-skill workflows. Skills prefer the zip pattern.

### Internal Behaviors Surfaced as Tools

| Behavior | Current Location | New Tool |
|----------|-----------------|----------|
| Post Figma comment | `postQuestionsToFigma()` in `figma-comment-utils.ts` | `figma-post-comment` |
| Add Jira comment | `addIssueComment()` in `atlassian-helpers.ts` | `atlassian-add-comment` |
| Read Figma comments | `fetchCommentsForFile()` in `figma-comment-utils.ts` | `figma-get-comments` |

---

## Subagent Pattern Detail

The Figma frame analysis subagent pattern (used by generate-questions and write-story) is the core parallelization strategy. With the zip download approach, subagents are purely filesystem-based — no MCP access required.

### Phase 1: Discovery (Agent)

The agent discovers Figma URLs by reading Jira issues, extracting links from descriptions. It may also discover URLs across multiple stories when working on an epic. All discovered URLs are collected into a list for batch loading.

### Phase 2: Batch Load (One MCP Call)

```
Agent                              Cascade MCP Server              Figma API
  │                                      │                            │
  │── figma-batch-load(requests) ───────►│                            │
  │                                      │── Per file (parallel):     │
  │                                      │   GET /meta       (T3) ──►│
  │                                      │   GET /nodes?ids= (T1) ──►│
  │                                      │   GET /images?ids=(T1) ──►│
  │                                      │   GET /comments   (T2) ──►│
  │                                      │◄──────────────────────────│
  │                                      │                            │
  │                                      │  Build zip in os.tmpdir()  │
  │                                      │  Register download token   │
  │◄── { downloadUrl, manifest } ───────│                            │
```

**API budget**: 2 Tier 1 + 1 Tier 2 + 1 Tier 3 per file. For 3 files: 6 T1 + 3 T2 + 3 T3 — all in one MCP tool call.

### Phase 3: Download & Extract (Agent Shell)

```bash
curl -sL "{downloadUrl}" -o /tmp/cascade-figma.zip && \
  unzip -qo /tmp/cascade-figma.zip -d .temp/cascade/figma/ && \
  rm /tmp/cascade-figma.zip
```

After extraction:
```
.temp/cascade/figma/{fileKey}/
├── manifest.json
├── prompts/
│   ├── frame-analysis.md
│   └── scope-synthesis.md
└── frames/
    ├── login/
    │   ├── image.png          ← actual PNG binary
    │   ├── context.md         ← annotations, comments, connections
    │   └── structure.xml      ← semantic component tree
    └── dashboard/
        ├── image.png
        ├── context.md
        └── structure.xml
```

### Phase 4: Parallel Analysis (Subagents — Filesystem Only)

The skill instructs the agent to spawn one subagent per frame directory:

```
For EACH frame in .temp/cascade/figma/{fileKey}/manifest.json:
  Spawn a subagent with working directory set to .temp/cascade/figma/{fileKey}/frames/{name}/

  Subagent prompt:
  "You are analyzing a single Figma design frame. All data is local.

   Read these files in your working directory:
   - image.png — screenshot of the frame (use as vision input)
   - context.md — designer annotations, comments, connections
   - structure.xml — semantic XML of the component tree

   Read the analysis instructions at:
   - ../prompts/frame-analysis.md

   Follow those instructions to produce your analysis.
   Write your complete analysis to analysis.md in this directory."
```

**Key difference from prior pattern**: Subagents make ZERO MCP calls. No `figma-frame-analysis` tool, no `cacheToken`, no server-side cache TTL concerns. Each subagent has everything it needs on the local filesystem.

### Phase 5: Synthesis (Agent)

After all subagents complete:
```
1. Read all .temp/cascade/figma/{fileKey}/frames/*/analysis.md files
2. Synthesize using scope-synthesis prompt (from SKILL.md or .temp/cascade/figma/{fileKey}/prompts/scope-synthesis.md)
3. Save to .temp/cascade/figma/{fileKey}/scope-synthesis.md
```

### Sequential Fallback

For agents without subagent support:
```
Process frames one at a time:
  For each frame in manifest:
    Read image.png, context.md, structure.xml from .temp/cascade/
    Analyze inline (use the frame-analysis prompt)
    Write analysis.md
  Then synthesize all analyses
```
Still zero MCP calls — just sequential instead of parallel.

### Comparison with Prior Pattern

| Aspect | Prior (cacheToken) | New (zip + local cache) |
|--------|-------------------|------------------------|
| Figma data flow | `figma-ask-scope-questions-for-page` → `figma-frame-analysis` per frame (MCP calls) | `figma-batch-load` → `curl`/`unzip` → local files |
| Subagent requirements | MCP access (must call `figma-frame-analysis` tool) | Filesystem access only (no MCP needed) |
| Data persistence | Server-side `cache/figma-scope/` (10-min TTL) | `.temp/cascade/figma/` (persists indefinitely) |
| Cross-skill reuse | Must re-fetch if cache expired | Reuses local cache forever |
| Image format | Base64 in MCP response (~33% overhead) | Binary PNG on disk (no overhead) |
| Transfer mechanism | MCP content blocks (~500KB per frame) | Single zip download via `curl` |
| Max frames practical | ~10 (context window limit) | Unlimited (zip scales to any size) |

---

## Cache & Temp File Summary

### Server-Side (ephemeral — managed by cascade-mcp)

| Path | Created By | TTL | Purpose |
|------|-----------|-----|---------|
| `os.tmpdir()/cascade-mcp-downloads/*.zip` | `figma-batch-load` | Deleted on download, or 10-min max | Zip files for agent download |
| `cache/figma-scope/{fileKey}/` | `figma-ask-scope-questions-for-page` (legacy) | 10 min (extended on access) | Server-side cache for `figma-frame-analysis` (backward compat) |
| `cache/figma-files/{fileKey}/` | Various Figma tools | Persistent | Figma file/image data cache |
| `cache/google-docs/` | Google Docs tools | Persistent | Cached doc conversions |

**Server-side zip cleanup strategy:**

| Layer | Handles |
|-------|---------|
| Delete on download | Normal flow — zip lives for seconds |
| `os.tmpdir()` | Server crash — OS auto-cleans `/tmp` |
| Lazy sweep on creation | Never-downloaded zips — sweep expired before creating new |
| Max pending cap (20) | Burst of requests — evict oldest when limit reached |
| Docker restart | Everything — container `/tmp` is ephemeral |

### Agent-Side (persistent — managed by skills via `.temp/cascade/`)

| Path | Created By | Purpose |
|------|-----------|---------|
| `.temp/cascade/figma/{fileKey}/manifest.json` | `curl`/`unzip` from `figma-batch-load` zip | Frame list, metadata |
| `.temp/cascade/figma/{fileKey}/prompts/*.md` | `curl`/`unzip` from zip | Analysis + synthesis prompts |
| `.temp/cascade/figma/{fileKey}/frames/{name}/image.png` | `curl`/`unzip` from zip | Frame screenshot (binary PNG) |
| `.temp/cascade/figma/{fileKey}/frames/{name}/context.md` | Agent (from `figma-get-comments` response) | Comments/annotations (always fresh, never cached) |
| `.temp/cascade/figma/{fileKey}/frames/{name}/structure.xml` | `curl`/`unzip` from zip | Semantic component tree |
| `.temp/cascade/figma/{fileKey}/frames/{name}/analysis.md` | Subagent (or agent) | Frame analysis output |
| `.temp/cascade/figma/{fileKey}/scope-synthesis.md` | Agent | Cross-frame synthesis |
| `.temp/cascade/figma/{fileKey}/questions.md` | Agent | Generated questions |

The `.temp/` directory should be added to `.gitignore`. It's a workspace-local cache — not committed.

---

## Files to Create/Modify

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `server/providers/figma/tools/figma-batch-load/index.ts` | 1 | Export tool registration |
| `server/providers/figma/tools/figma-batch-load/figma-batch-load.ts` | 1 | MCP tool: batch fetch → zip |
| `server/providers/figma/tools/figma-batch-load/zip-builder.ts` | 1 | Helper: build zip from fetched data |
| `server/api/download.ts` | 1 | HTTP endpoint: `GET /dl/:token` |
| `server/providers/figma/tools/figma-post-comment.ts` | 1 | MCP tool: post single Figma comment |
| `server/providers/atlassian/tools/atlassian-add-comment.ts` | 1 | MCP tool: post Jira comment |
| `server/providers/figma/tools/figma-get-comments.ts` | 1 | MCP tool: read Figma comments |
| `server/api/figma-batch-load.ts` | 1 | REST API wrapper |
| `server/api/figma-post-comment.ts` | 1 | REST API wrapper |
| `server/api/atlassian-add-comment.ts` | 1 | REST API wrapper |
| `server/api/figma-get-comments.ts` | 1 | REST API wrapper |
| `.claude-plugin/marketplace.json` | 2 | Marketplace catalog |
| `plugins/cascade-mcp/.claude-plugin/plugin.json` | 2 | Plugin manifest + MCP server config |
| `plugins/cascade-mcp/README.md` | 2 | Install + usage docs |
| `plugins/cascade-mcp/skills/generate-questions/SKILL.md` | 3 | Parent skill: question generation |
| `plugins/cascade-mcp/skills/load-content/SKILL.md` | 3 | Sub-skill: fetch raw content for URLs, discover new links |
| `plugins/cascade-mcp/skills/analyze-content/SKILL.md` | 3 | Sub-skill: summarize/categorize content, extract new links |
| `plugins/cascade-mcp/skills/analyze-figma-frame/SKILL.md` | 3 | Sub-skill: single-frame analysis (subagent-level) |
| `plugins/cascade-mcp/skills/synthesize/SKILL.md` | 3 | Sub-skill: cross-content synthesis |
| `plugins/cascade-mcp/skills/post-questions-to-figma/SKILL.md` | 4 | Parent skill: post questions+answers to Figma |
| `plugins/cascade-mcp/skills/post-questions-to-jira/SKILL.md` | 5 | Parent skill: post questions to Jira |
| `plugins/cascade-mcp/skills/review-design/SKILL.md` | 6 | Parent skill: composite design review |
| `plugins/cascade-mcp/skills/write-story/SKILL.md` | 8 | Parent skill: write Jira story |

### Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `server/providers/figma/tools/index.ts` | 1 | Register `figma-batch-load`, `figma-post-comment`, `figma-get-comments` |
| `server/providers/atlassian/tools/index.ts` | 1 | Register `atlassian-add-comment` |
| `server/api/index.ts` | 1 | Add routes for new REST endpoints |
| `server/server.ts` | 1 | Add `GET /dl/:token` route |
| `.gitignore` | 2 | Add `.temp/` |
| `server/readme.md` | 9 | Document new tools, download endpoint, plugin structure |

### Existing Files Referenced (not modified)

| File | Referenced By | Purpose |
|------|--------------|---------|
| `server/providers/figma/tools/figma-review-design/figma-comment-utils.ts` | Phase 1 | `postQuestionsToFigma()`, `fetchCommentsForFile()`, `groupCommentsIntoThreads()` patterns |
| `server/providers/figma/figma-comment-types.ts` | Phase 1 | `PostCommentRequest`, `FigmaFrameOffset` types |
| `server/providers/atlassian/atlassian-helpers.ts` | Phase 1 | `addIssueComment()` function |
| `server/providers/figma/tools/figma-ask-scope-questions-for-page/core-logic.ts` | Phase 1 | Batch fetch logic to reuse in `figma-batch-load` |
| `server/providers/figma/scope-cache.ts` | Phase 1 | Cleanup pattern reference (lazy sweep, no background timers) |
| `server/providers/figma/tools/figma-ask-scope-questions-for-page/prompt-constants.ts` | Phase 3 | `QUESTIONS_GENERATION_PROMPT_TEXT` — embedded in generate-questions SKILL.md |
| `server/providers/combined/tools/write-story/prompt-story-content.ts` | Phase 8 | `STORY_CONTENT_SYSTEM_PROMPT` — embedded in write-story SKILL.md |
| `server/mcp-prompts/prompt-write-story.ts` | Phase 8 | Orchestration pattern reference |
| `server/mcp-core/server-factory.ts` | Phase 1 | Tool registration pattern |

---

## Questions

1. Should `figma-post-comment` accept a `url` parameter (full Figma URL) instead of `fileKey` + `nodeId`? The URL-based pattern is more consistent with other Figma tools (`figma-batch-load`, etc.) which all take a `url` and parse it internally. Users/agents always have the URL, rarely have the raw `fileKey`.

   > **Answer:** Yes — use `url` parameter. Parse `fileKey`/`nodeId` server-side, consistent with all other Figma tools.

2. For `figma-get-comments`, should the tool return raw comment data (JSON) or formatted markdown? Formatted markdown is easier for the agent to process, but raw JSON allows more flexible programmatic use.

   > **Answer:** Formatted markdown. The agent is the primary consumer.

3. The `send-answers-to-figma` skill relies on matching Jira answer text to existing Figma question comments by text similarity. This matching could be fragile. Should we:
   - (a) Accept best-effort matching and fall back to new comments
   - (b) Store comment IDs in Jira when questions are first posted (would require enhancing `post-questions-to-figma` to record the mapping)
   - (c) Skip thread matching entirely — always post answers as new pinned comments

   > **Answer:** N/A — the premise was incorrect. Questions are posted to ONE destination (Figma or Jira), not both. Users generate questions locally, review/answer some in chat, then post questions+answers to their chosen destination. No cross-system sync needed. Phase 7 (`send-answers-to-figma`) should be merged into Phase 4 (`post-questions-to-figma`) as a variant that includes answers alongside questions.

4. Should the `write-story` skill support the "re-run" flow (detect existing description, show diff, incorporate inline answers)? Or should v1 always overwrite? The existing `write-story` tool supports re-run detection, but adding that logic to a SKILL.md makes it significantly more complex.

   > **Answer:** Yes — support re-run in v1. `write-story-context` already returns the existing description; the SKILL.md just needs prompt guidance to incorporate it.

5. For the generate-questions skill: when the agent extracts URLs from the Jira issue description, should it use `write-story-context` (which pre-extracts URLs in `linkedUrls`) instead of having the agent parse URLs from `atlassian-get-issue` output? Using `write-story-context` is more reliable but was designed for the write-story flow, not question generation.

   > **Answer:** Neither — create a new provider-agnostic `extract-linked-resources` tool. It takes multiple source types (Jira issue, Google Doc, raw URL), fetches their content, regex-extracts all URLs, and categorizes by URL pattern (Figma, Confluence, Google Docs, unknown). No LLM needed — just pattern matching. Lives in a `combined` or `utility` provider. Both `generate-questions` and `write-story` skills use this tool. `write-story-context` should also be refactored to use it internally. Add to Phase 1 tool list.

6. The `figma-ask-scope-questions-for-page` tool returns workflow instructions that reference `prompt://scope-synthesis` and `prompt://generate-questions` resources. The SKILL.md also embeds the same prompt text. Should the skill instruct the agent to prefer the embedded text (SKILL.md) or the MCP resource (tool response)? Dual sources could cause version drift.

   > **Answer:** Create data-only variants of existing tools (no embedded prompts) for skills to call. Skills use SKILL.md-embedded prompts as the single source of truth. Existing tools with embedded prompts stay as-is for backward compatibility with non-skill workflows. New Phase 1 tools should be data-only by design.

7. Should `figma-batch-load` support incremental loading? If `.temp/cascade/figma/{fileKey}/manifest.json` already exists, the agent could pass a list of `existingNodeIds` to skip re-fetching those frames. This would optimize the case where a new frame is added to a Figma page that was partially cached. Or should the agent just re-download the entire file (zip is cheap, Figma API calls are the bottleneck)?

   > **Answer:** No incremental loading. The API calls are per-file (not per-frame), so fetching 3 or 10 frames costs the same. Cache-first check happens agent-side: if all frames cached locally, skip `figma-batch-load` entirely. If any missing, re-fetch the whole file.

8. Should `figma-batch-load` reuse the existing `figma-ask-scope-questions-for-page` batch fetch logic internally (extracting its core data-fetching functions), or be an independent implementation? Sharing code avoids duplication but couples the two tools.

   > **Answer:** Reuse — extract shared data-fetching functions into a common module (e.g., `server/providers/figma/figma-data-fetcher.ts`) that both tools import.

9. Should the download endpoint (`/dl/:token`) require any authentication (e.g., check that the requesting IP matches the MCP session), or is the unguessable token sufficient? A signed-URL pattern (token = HMAC of content hash + expiry) would be more robust but adds complexity.

   > **Answer:** UUID token is sufficient. It's 122-bit entropy, single-use, and time-limited — same security model as pre-signed URLs. No additional auth needed.

---

## Reviewer Questions

### Contradictions & Inconsistencies

1. **Phase 3 verification section says the wrong tool.** Line 591 says "Agent calls `atlassian-get-issue`, then `figma-ask-scope-questions-for-page` per Figma URL" — but the entire point of this spec is that skills use `figma-batch-load` instead. The MCP Tool Call Sequence in the same section (steps 2-3) correctly shows `atlassian-get-issue` → `figma-batch-load`. Should the verification bullet be updated to reference `figma-batch-load`?

   > **Answer:** Yes — fix the verification bullet to reference `figma-batch-load`.

2. **Referenced spec `067-agent-workflow/` doesn't exist at that path.** The header says `Builds on: ... [067-agent-workflow/](./067-agent-workflow/)` but only `specs/summaries/067-agent-workflow.md` exists. Is this referring to a directory that was never created, or should the link point to the summary?

   > **Answer:** Fix link to `./summaries/067-agent-workflow.md`.

3. **`figma-post-comment` uses `fileKey` + `nodeId` while `figma-batch-load` uses `url`.** Your own Question 1 flags this, but the spec body proceeds with the `fileKey`/`nodeId` pattern for `figma-post-comment`. The post-questions-to-figma skill (Phase 4) then has the agent parse `fileKey` and `nodeId` out of Figma URLs in the question headings. This works but feels fragile — the agent must understand URL ↔ API ID conversion. Worth deciding before implementation.

   > **Answer:** Update the spec body — change `figma-post-comment` input schema and Phase 4 skill flow to use `url` parameter, consistent with Q1 answer.

### Redundancy

4. **The cache-first pattern is described 4 separate times** (once in Architecture, once in the cache structure section, once in generate-questions Phase 3 step 1, once in write-story Phase 8 step 2). The repetition isn't harmful since each SKILL.md will need its own copy, but the spec could refer to a single canonical description to reduce drift risk during edits. Is this intentional for self-containedness?

   > **Answer:** Consolidate to a single canonical description in the spec. Each SKILL.md will still get its own copy during implementation, but the spec should define it once and reference it.

5. **The subagent pattern is detailed 3 times** — in the Architecture section, the Subagent Pattern Detail section, and inline in Phase 3. Again, likely intentional for readability, but worth noting as a maintenance burden in the spec itself.

   > **Answer:** Consolidate to a single canonical description, same as Q4.

### Missing Details

6. **No error handling for `curl`/`unzip` failures.** If the agent runs `curl -sL "{downloadUrl}" -o /tmp/cascade-figma.zip && unzip ...` and the download fails (network issue, server down, token expired), the skill instructions don't describe recovery. Should the SKILL.md include a retry/fallback instruction?

   > **Answer:** No \u2014 agent handles errors naturally. No explicit retry instructions needed in SKILL.md.

7. **`figma-batch-load` frame name sanitization.** The zip uses `frames/{frame-name}/` directories, but Figma frame names can contain spaces, slashes, special characters (e.g., "Login / Sign Up (v2)"). How should `dirName` be derived? The manifest shows a `dirName` field, but the spec doesn't define the sanitization rules.

   > **Answer:** Use the existing pattern from `scope-cache.ts`: directories are keyed by `safeNodeId` (nodeId with `:` → `-`), e.g., `frames/123-456/`. The slugified frame name is stored in `dirName` for human readability but the directory key is the nodeId. Pattern: `{nodeId}-{slugified-name}` (e.g., `123-456-login-sign-up-v2`). Reuse the existing `sanitizeFrameName()` from `scope-cache.ts` for the slug portion.

8. **No `archiver` (or equivalent) in `package.json`.** The spec references `archiver` for zip building. Is that the intended library, or should a lighter alternative be used? This is a new dependency.

   > **Answer:** Use `archiver` + `@types/archiver`. Standard Node.js zip library.

9. **Plugin `mcpServers` URL requires `CASCADE_MCP_URL` env var.** The plugin.json uses `"url": "${CASCADE_MCP_URL}/mcp"` — but the spec doesn't document what happens if this env var isn't set. Does the plugin fail silently, show an error, or prompt the user? The README (Phase 9) should cover this.

   > **Answer:** Use the production URL `https://cascade.bitovi.com/mcp` as the default in plugin.json. `CASCADE_MCP_URL` env var can override for local development. README documents both usage patterns.

10. **`figma-get-comments` tool spec says "Step 1.3" but it's actually Step 1.5.** The "Why this is needed" section under figma-get-comments references it as supporting the send-answers-to-figma skill, which is correct, but the heading numbering skips — Step 1.3 is `figma-post-comment` and Step 1.5 is `figma-get-comments`. Minor but could confuse implementors.

   > **Answer:** No change needed — numbering is correct (1.3, 1.4, 1.5). Reviewer miscounted.

11. **`figma-batch-load` REST API spec doesn't mention the download token/URL.** The REST API at `POST /api/figma-batch-load` would return a `downloadUrl` pointing to `/dl/:token` — but from a REST client's perspective, do they also use `curl` to download the zip? Or should the REST response optionally inline the zip as a binary response for non-MCP clients?

   > **Answer:** Same two-step pattern — REST API returns `downloadUrl`, client downloads separately. Standard pattern for large file generation APIs.

12. **write-story skill step 1 calls `write-story-context` which already returns embedded prompts.** The skill also embeds prompts from `STORY_CONTENT_SYSTEM_PROMPT` directly in SKILL.md. This creates the dual-source issue raised in your Question 6. For the write-story skill specifically, should it ignore the `prompt://write-story-content` from the tool response and only use the SKILL.md-embedded version?

   > **Answer:** Call a data-only variant of `write-story-context`, use SKILL.md-embedded prompts only. Consistent with Q6 answer.

13. **What's the expected behavior when `figma-batch-load` receives both page-level and frame-level URLs for the same file?** E.g., user passes `figma.com/design/abc/Page?node-id=0:1` (full page) AND `figma.com/design/abc/Frame?node-id=3:4` (specific frame from the same page). Does the page-level URL subsume the frame-level one, or are they processed independently?

   > **Answer:** Deduplicate — if a page URL covers all frames on a page, drop individual frame URLs that belong to the same page. Server-side deduplication after URL parsing.

14. **The spec proposes 26+ tools in the Problem section, but the tool inventory in the "Complete MCP Tool Inventory" section only lists ~13.** The 26+ count presumably includes all tools across all providers. Should the inventory table be expanded to show the full list, or is the partial listing (tools relevant to skills) intentional?

   > **Answer:** Keep as-is — the inventory is scoped to skills-relevant tools only. The section title "for Skills" already clarifies this.
