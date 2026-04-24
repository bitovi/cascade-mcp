# 067 — Figma Design Review: Zip Download Approach

**Date:** March 7, 2026  
**Status:** 📝 Research / Design  
**Builds on:** [062-workflow-patterns.md](../062-workflow-patterns.md), [063-questions-subagents.md](../063-questions-subagents.md)

## Problem Statement

The current `figma-ask-scope-questions-for-page` tool returns all frame data (images, annotations, semantic XML) as a multi-part MCP tool response containing:
- Base64-encoded PNG images (`ImageContent` blocks) — ~500KB each
- Embedded resource blocks for context markdown and semantic XML — up to ~1MB each
- Embedded prompt resources

**This is a remote HTTP server.** It cannot write to the agent's local filesystem. The only way to get files to the agent is through the MCP response or by having the agent download them.

**Three failures with the current approach:**

1. **Images can't be consumed by subagents.** `ImageContent` blocks in a tool response are rendered inline for the calling agent but can't be forwarded to subagents or extracted to disk.
2. **Response size overwhelms agents.** A 5-frame page produces ~5MB+ in a single response. Agents hit context window limits or truncate.
3. **No incremental processing.** All data arrives at once. The agent must parse a multi-megabyte response before it can begin working on any single frame.

## Proposed Approach: Server-Generated Zip + Agent Download

**Core idea:** The MCP server fetches all Figma data, packages it into a zip file, serves it via an HTTP download endpoint, and returns lightweight instructions telling the agent to `curl` + `unzip` it.

```
BEFORE (current):
  Agent calls tool → Gets 5MB MCP response → Can't extract pieces → Fails

AFTER (proposed):
  Agent calls tool → Server builds zip → Gets 3KB response with download URL
  → Agent runs: curl + unzip → Real files on disk → Subagents read files
```

---

## 1. MCP Response Types & Download Capabilities

### What MCP Supports

The MCP SDK v1.25.2 defines 5 content block types for tool responses:

| Type | What It Does | Can Trigger Download? |
|------|-------------|----------------------|
| `TextContent` | Plain text in response | No — but can contain instructions with URLs |
| `ImageContent` | Base64 inline image | No download — rendered in chat context |
| `AudioContent` | Base64 inline audio | No download |
| `ResourceLink` | URI reference (new in 2025) | **Theoretically** — client *may* call `resources/read` to resolve. No agent auto-fetches `https://` URIs in practice. |
| `EmbeddedResource` | Inline text/blob content | No download — content is in the response |

**Key finding: No MCP content type triggers automatic file download.** The `ResourceLink` type (with `type: "resource_link"`) is the closest — it includes a `uri`, `name`, `mimeType`, and `size` — but current agents (VS Code Copilot, Claude Desktop, Claude Code) do not auto-fetch URLs from `resource_link` responses.

### How Agents Can Download Files

| Agent | Terminal Access | Can `curl`? | Can `unzip`? | Can `read_file`? |
|-------|----------------|-------------|-------------|-----------------|
| **VS Code Copilot** | ✅ `run_in_terminal` | ✅ Yes | ✅ Yes | ✅ Text files |
| **Claude Code** | ✅ Built-in shell | ✅ Yes | ✅ Yes | ✅ Text files |
| **Cursor** | ✅ Terminal | ✅ Yes | ✅ Yes | ✅ Text files |
| **Claude Desktop** | ❌ No terminal | ❌ No | ❌ No | ❌ No filesystem |

**The practical approach:** Return text instructions with a `curl` command. Agents with terminal access (VS Code Copilot, Claude Code, Cursor) follow the instructions. Claude Desktop gets a fallback.

---

## 2. Download Endpoint Design

### Token-Based Authentication

The MCP tool already authenticated the user. Instead of requiring the agent to pass a JWT in the `curl` command (which would leak credentials in terminal history), we generate a short-lived download token.

```
GET /api/downloads/{token}
```

- `{token}` is a UUID generated when the tool creates the zip
- Token expires after **10 minutes** (covers the full review session)
- Token can be used **multiple times** (agent may retry failed downloads)
- No additional auth headers required — the token IS the authorization

### Why Not Bearer Token Auth?

- JWTs are long (~500+ chars) — error-prone in `curl` commands
- Leaks auth credentials in terminal history and process list
- The download token is scoped to exactly one zip file — minimal blast radius

### Server Implementation

```typescript
// In-memory token store (survives for server lifetime)
const downloadTokens = new Map<string, {
  zipPath: string;
  expiresAt: number;
  fileKey: string;
  fileName: string;
}>();

function createDownloadToken(zipPath: string, fileKey: string, fileName: string): string {
  const token = crypto.randomUUID();
  downloadTokens.set(token, {
    zipPath,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    fileKey,
    fileName,
  });
  return token;
}

// Express route — added to server/server.ts
app.get('/api/downloads/:token', (req, res) => {
  const entry = downloadTokens.get(req.params.token);
  
  if (!entry || Date.now() > entry.expiresAt) {
    downloadTokens.delete(req.params.token);
    return res.status(404).json({
      error: 'Download link expired or invalid',
      message: 'Re-run figma-ask-scope-questions-for-page to generate a new download.',
    });
  }
  
  // Check file still exists (server may have restarted)
  if (!fs.existsSync(entry.zipPath)) {
    downloadTokens.delete(req.params.token);
    return res.status(410).json({
      error: 'File no longer available',
      message: 'Re-run figma-ask-scope-questions-for-page to regenerate.',
    });
  }
  
  const filename = `figma-review-${entry.fileKey}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(entry.zipPath);
});

// Periodic cleanup of expired tokens (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of downloadTokens) {
    if (now > entry.expiresAt) {
      downloadTokens.delete(token);
      // Also clean up the zip file
      fs.unlink(entry.zipPath, () => {});
    }
  }
}, 5 * 60 * 1000);
```

---

## 3. Zip File Structure

### Layout

```
figma-review-{fileKey}/
├── manifest.json                  # Frame list, metadata, workflow entry point
├── README.md                      # Human-readable overview + agent instructions
├── prompts/
│   ├── frame-analysis.md          # How to analyze a single frame
│   ├── scope-synthesis.md         # How to synthesize scope across frames
│   └── generate-questions.md      # How to generate questions
└── frames/
    ├── {sanitized-frame-name}/
    │   ├── image.png              # Actual PNG file (decoded from base64)
    │   ├── context.md             # Annotations, comments, connections
    │   └── structure.xml          # Semantic XML component tree
    ├── {sanitized-frame-name}/
    │   ├── image.png
    │   ├── context.md
    │   └── structure.xml
    └── ...
```

### manifest.json

```json
{
  "version": 1,
  "fileKey": "abc123DEF",
  "fileName": "My Design File",
  "pageName": "Login Flow",
  "pageId": "0:1",
  "figmaUrl": "https://www.figma.com/design/abc123DEF/...",
  "createdAt": "2026-03-07T12:00:00Z",
  "frameCount": 5,
  "featureContext": "Optional context from the user...",
  "frames": [
    {
      "id": "123:456",
      "name": "Login Screen",
      "dirName": "login-screen",
      "order": 1,
      "section": "Authentication",
      "hasImage": true,
      "hasStructure": true,
      "annotationCount": 3,
      "imageBytes": 487320,
      "structureBytes": 14200
    }
  ]
}
```

### Frame Name Sanitization

```typescript
function sanitizeFrameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}
// "Login Screen (v2)" → "login-screen-v2"
// "Dashboard / Overview" → "dashboard-overview"
```

Collisions resolved by appending `-2`, `-3`, etc.

### README.md (Embedded in Zip)

The zip includes a `README.md` that serves as the entry point for any agent or human:

```markdown
# Figma Design Review: {fileName} — {pageName}

This directory contains extracted Figma design data for analysis.

## Quick Start

1. Read `manifest.json` for the frame list
2. For each frame in `frames/`, analyze:
   - `image.png` — the frame screenshot
   - `context.md` — designer annotations and comments
   - `structure.xml` — semantic component tree
3. Follow prompts in `prompts/` for analysis instructions

## Frame Analysis Workflow

See the MCP tool response for detailed workflow instructions,
or read `prompts/frame-analysis.md` for per-frame analysis steps.
```

---

## 4. Zip Generation

### Server-Side Zip Creation

Use Node.js `archiver` package (well-maintained, streaming, handles large files):

```typescript
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import path from 'path';

interface ZipOptions {
  fileKey: string;
  fileName: string;
  pageName: string;
  frames: FrameData[];
  prompts: PromptTexts;
  featureContext?: string;
}

async function createReviewZip(options: ZipOptions): Promise<string> {
  const zipFilename = `figma-review-${options.fileKey}.zip`;
  const zipPath = path.join(getCacheDir(), 'downloads', zipFilename);
  
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 6 } }); // Moderate compression
  
  archive.pipe(output);
  
  const prefix = `figma-review-${options.fileKey}`;
  
  // Manifest
  const manifest = buildManifest(options);
  archive.append(JSON.stringify(manifest, null, 2), { name: `${prefix}/manifest.json` });
  
  // README
  archive.append(buildReadme(options), { name: `${prefix}/README.md` });
  
  // Prompts
  archive.append(options.prompts.frameAnalysis, { name: `${prefix}/prompts/frame-analysis.md` });
  archive.append(options.prompts.scopeSynthesis, { name: `${prefix}/prompts/scope-synthesis.md` });
  archive.append(options.prompts.generateQuestions, { name: `${prefix}/prompts/generate-questions.md` });
  
  // Frames
  for (const frame of options.frames) {
    const dirName = sanitizeFrameName(frame.name);
    const framePrefix = `${prefix}/frames/${dirName}`;
    
    // Image — decode base64 to binary
    if (frame.image) {
      const buffer = Buffer.from(frame.image.base64Data, 'base64');
      archive.append(buffer, { name: `${framePrefix}/image.png` });
    }
    
    // Context markdown
    archive.append(buildFrameContext(frame), { name: `${framePrefix}/context.md` });
    
    // Semantic XML
    if (frame.semanticXml) {
      archive.append(frame.semanticXml, { name: `${framePrefix}/structure.xml` });
    }
  }
  
  await archive.finalize();
  
  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);
  });
}
```

### Zip Size Estimates

| Component | Per Frame | 5 Frames | 10 Frames |
|-----------|----------|----------|-----------|
| PNG image | 200KB–1.5MB | 1–7.5MB | 2–15MB |
| Semantic XML | 5–20KB (compressed well) | 25–100KB | 50–200KB |
| Context MD | 2–10KB | 10–50KB | 20–100KB |
| Prompts | 5KB total | 5KB | 5KB |
| **Zip total** | — | **~1–8MB** | **~2–15MB** |

PNG files don't compress much further in zip (already compressed), but XML and markdown compress significantly (60-80% reduction). A typical 5-frame review zip will be **~2-4MB**.

---

## 5. Tool Response Design

### The Tool Response (After Zip Creation)

```typescript
{
  content: [
    {
      type: "text",
      text: `## Figma Design Review Ready

**File:** ${fileName}
**Page:** ${pageName}
**Frames:** ${frameCount} screens extracted

### Download & Extract

Run this command to download and extract the review files:

\`\`\`bash
curl -sS -o /tmp/figma-review.zip "${serverUrl}/api/downloads/${downloadToken}" && \\
  unzip -o /tmp/figma-review.zip -d ./temp/ && \\
  rm /tmp/figma-review.zip
\`\`\`

This creates \`./temp/figma-review-${fileKey}/\` with:
- \`manifest.json\` — frame list and metadata
- \`frames/*/image.png\` — frame screenshots
- \`frames/*/context.md\` — designer annotations
- \`frames/*/structure.xml\` — semantic component tree
- \`prompts/\` — analysis instructions

⚠️ Download link expires in 10 minutes.

### Workflow

After extracting:

1. **Read** \`./temp/figma-review-${fileKey}/manifest.json\`

2. **Analyze each frame** (spawn one subagent per frame, or process sequentially):
   - Read \`frames/{name}/context.md\` and \`frames/{name}/structure.xml\`
   - Read \`frames/{name}/image.png\` for visual analysis
   - Follow instructions in \`prompts/frame-analysis.md\`
   - Write analysis to \`frames/{name}/analysis.md\`

3. **Synthesize scope** — read all \`analysis.md\` files + \`prompts/scope-synthesis.md\`, write \`scope-analysis.md\`

4. **Generate questions** — read scope + analyses + \`prompts/generate-questions.md\`, write \`questions.md\`

5. **Present questions** to the user
`
    }
  ]
}
```

### Why `TextContent` and Not `ResourceLink`?

MCP's `ResourceLink` (`type: "resource_link"`) would be the "proper" way to reference a downloadable resource:

```typescript
{
  type: "resource_link",
  uri: `${serverUrl}/api/downloads/${token}`,
  name: `figma-review-${fileKey}.zip`,
  mimeType: "application/zip",
  size: zipSizeBytes,
  title: `Figma Review: ${fileName} — ${pageName}`,
  description: `Design review package with ${frameCount} frame screenshots, annotations, and analysis prompts`,
}
```

However, **no current agent auto-downloads from `resource_link` URIs**. Agents might resolve the link via `resources/read` (MCP protocol), but:
- That returns the content into the MCP response (same size problem)
- It's not a file download to disk

So we use `TextContent` with explicit `curl` instructions, which agents with terminal access reliably follow. We can **also** include a `ResourceLink` for future-proofing — agents that eventually support auto-download will benefit.

### Dual Response (Recommended)

```typescript
{
  content: [
    // For current agents — explicit instructions
    {
      type: "text",
      text: "## Figma Design Review Ready\n\n### Download & Extract\n..."
    },
    // For future agents — protocol-native resource reference
    {
      type: "resource_link",
      uri: `${serverUrl}/api/downloads/${token}`,
      name: `figma-review-${fileKey}.zip`,
      mimeType: "application/zip",
      size: zipSizeBytes,
      title: `Design review: ${fileName}`,
    }
  ]
}
```

---

## 6. Image Handling

### The Image Problem (Specific to Subagents)

Once files are on disk, images are real PNG files. But:

| Agent Capability | Read `image.png` for Vision? | Notes |
|-----------------|------------------------------|-------|
| **VS Code Copilot** | ⚠️ Depends on context | Can reference workspace images in chat. `read_file` returns text. May be able to use image with `@workspace` references. |
| **Claude Code** | ⚠️ Limited | Can read file contents but binary → vision path is unreliable. |
| **Subagents** | ❓ Unknown | Subagents spawned by the main agent may or may not have vision capabilities. |

### Strategy: Layered Image Access

**Option A — Direct file reference (preferred when supported):**
Agents that can process images from the workspace include them directly. The instructions say:
```
Read frames/{name}/image.png for visual analysis
```

**Option B — MCP tool for image delivery:**
A companion tool reads the PNG from disk and returns `ImageContent`:

```typescript
// figma-get-review-image — reads saved PNG, returns ImageContent
{
  name: 'figma-get-review-image',
  inputSchema: {
    fileKey: z.string(),
    frameDirName: z.string(),
  },
  handler: async ({ fileKey, frameDirName }) => {
    const imagePath = path.join('temp', `figma-review-${fileKey}`, 'frames', frameDirName, 'image.png');
    const buffer = await fs.readFile(imagePath);
    return {
      content: [{
        type: 'image',
        data: buffer.toString('base64'),
        mimeType: 'image/png',
      }],
    };
  }
}
```

**Wait — this tool reads from the local filesystem, but the server is remote.** This tool would need to read from the *agent's* filesystem, which the remote server can't access.

**Revised approach for remote server:**
The server also serves individual frame images via HTTP:

```
GET /api/downloads/{token}/frames/{frameDirName}/image.png
```

The tool response tells agents to either:
1. Read `image.png` from the extracted zip (if they can process images from disk)
2. Use `curl` to download individual frame images from the server (if they need fresh copies)
3. Call `figma-get-cached-frame-image` MCP tool, which reads from server cache and returns `ImageContent`

**Option C — Text-only fallback:**
If neither image approach works, subagents analyze from `context.md` + `structure.xml` only. Still produces useful analysis, just without visual information.

### Recommended Image Strategy

```
Primary:    Agent reads image.png from disk (works if agent has vision+file access)
Secondary:  MCP tool figma-get-cached-frame-image → returns ImageContent from server cache
Tertiary:   Agent runs: curl -o ./frame.png "{serverUrl}/api/downloads/{token}/frames/{name}/image.png"
Fallback:   Text-only analysis using context.md + structure.xml
```

The workflow instructions include all four options, letting the agent use whichever works.

---

## 7. Subagent Workflow

### Full Flow

```
Main Agent                              Remote MCP Server              Agent Filesystem
  │                                          │                              │
  ├─ figma-ask-scope-questions(url) ────────►│                              │
  │                                          ├── Fetch from Figma API       │
  │                                          ├── Generate XML, context      │
  │                                          ├── Build zip file             │
  │                                          ├── Create download token      │
  │◄── Text response: curl command ──────────┤                              │
  │    + resource_link                       │                              │
  │                                          │                              │
  ├─ run_in_terminal: ───────────────────────────────────────────────────►  │
  │   curl -o /tmp/review.zip "…/api/downloads/{token}"                    │
  │   unzip -o /tmp/review.zip -d ./temp/                                  │
  │   rm /tmp/review.zip                     │                              │
  │                                          │    temp/figma-review-{key}/  │
  │                                          │    ├── manifest.json          │
  │                                          │    ├── prompts/               │
  │                                          │    └── frames/                │
  │                                          │                              │
  ├─ read_file: manifest.json ◄────────────────────────────────────────── │
  │                                          │                              │
  ├─ Spawn subagent per frame:              │                              │
  │   ┌───────────────────────┐             │                              │
  │   │ Subagent (frame 1)    │             │                              │
  │   │ 1. read context.md  ◄─────────────────────────────────────────── │
  │   │ 2. read structure.xml ◄────────────────────────────────────────── │
  │   │ 3. read prompts/frame-analysis.md ◄────────────────────────────── │
  │   │ 4. view image.png (if capable)      │                              │
  │   │    OR: call MCP tool for image ─────►│                              │
  │   │    ◄── ImageContent ────────────────┤                              │
  │   │ 5. Analyze frame                    │                              │
  │   │ 6. write analysis.md ──────────────────────────────────────────►  │
  │   └───────────────────────┘             │                              │
  │                                          │                              │
  ├─ (repeat for all frames)                │                              │
  │                                          │                              │
  ├─ read all analysis.md files ◄──────────────────────────────────────── │
  ├─ read scope-synthesis.md ◄─────────────────────────────────────────── │
  ├─ Synthesize → write scope-analysis.md ─────────────────────────────►  │
  │                                          │                              │
  ├─ read generate-questions.md ◄──────────────────────────────────────── │
  ├─ Generate questions → write questions.md ──────────────────────────►  │
  │                                          │                              │
  └─ Present questions to user              │                              │
```

### Subagent Task Template (In Workflow Instructions)

```markdown
### Per-Frame Subagent Task

> **⚡ PARALLEL**: Spawn one subagent per frame. Each is independent.
> If you don't support subagents, process frames sequentially.

For each frame in `manifest.json` without an existing `analysis.md`:

**Give the subagent these instructions:**

```
Analyze the Figma frame in the directory: ./temp/figma-review-{fileKey}/frames/{dirName}/

**Read these files:**
1. `context.md` — designer annotations, comments, connections to other frames
2. `structure.xml` — semantic XML component tree
3. `../../prompts/frame-analysis.md` — analysis instructions to follow

**View the image:**
- Read `image.png` in the frame directory for visual analysis
- If you cannot view image files, analyze using only the text files above

**Output:**
Write your complete analysis to `analysis.md` in the same frame directory.
Follow the format specified in `frame-analysis.md`.
```
```

---

## 8. Comparison with Approach 1 (Server-Side Cache)

| Dimension | Approach 1 (Server Cache) | Approach 2 (Zip Download) |
|-----------|--------------------------|--------------------------|
| **Deployment** | Local + Remote | Local + Remote |
| **Tool response size** | ~3KB manifest | ~3KB instructions + URL |
| **Data delivery** | MCP tool calls (one per frame) | Single `curl` + `unzip` |
| **Round-trips for data** | N tool calls (one per frame) | 1 HTTP download |
| **Text file access** | Via MCP tool per file | Direct `read_file` (local) |
| **Image access** | Via MCP tool → `ImageContent` | File on disk + optional MCP tool fallback |
| **New tools required** | 2 (`get-cached-frame-data`, `get-cached-prompt`) | 0-1 (optional `get-cached-frame-image`) |
| **New infrastructure** | Cache TTL management | Download endpoint + zip generation |
| **Agent requirements** | MCP tool access | Terminal access (`curl`, `unzip`) |
| **Works without terminal** | ✅ Yes (all via MCP) | ❌ No (needs `curl`) |
| **Offline after download** | ❌ Needs server for each frame | ✅ All data local |
| **Subagent data access** | Must have MCP tool access | Read files directly |
| **Cleanup** | Server-managed TTL | Agent-managed (manual delete) |
| **Disk usage** | Server only | Server (temp zip) + agent workspace |

### Key Trade-offs

**Approach 1 wins when:**
- Agent has no terminal access (Claude Desktop)
- You want server-managed lifecycle
- You need fine-grained access control per frame

**Approach 2 wins when:**
- Agent has terminal access (VS Code Copilot, Claude Code)
- Subagents need data without MCP tool access
- Network reliability is a concern (download once, work offline)
- You want the simplest subagent design (just read files)

---

## 9. Edge Cases & Fallback Strategies

### Edge Case 1: Agent Has No Terminal Access (Claude Desktop)

**Detection:** Can't detect from the server side. Include fallback in response.

**Fallback:** Also return a summary in the `TextContent` response:
```markdown
If you cannot run terminal commands, here's a summary of the
{frameCount} frames found on page "{pageName}":

1. **Login Screen** — 3 annotations, authentication flow entry point
2. **Dashboard** — 5 annotations, main navigation hub
3. ...

For detailed analysis, use an MCP client with terminal access
(VS Code Copilot or Claude Code).
```

Or: fall back to Approach 1 (server-side cache), where all data is accessible via MCP tools without terminal.

### Edge Case 2: curl/unzip Not Available

**Detection:** Agent tries to run the command and it fails.

**Mitigation:** Provide alternative commands:
```bash
# If curl is not available:
wget -O /tmp/figma-review.zip "{url}"

# If unzip is not available:
python3 -c "import zipfile; zipfile.ZipFile('/tmp/figma-review.zip').extractall('./temp/')"

# If neither works, use the MCP tool approach (Approach 1 fallback)
```

### Edge Case 3: Download Token Expires Mid-Workflow

**Detection:** `curl` returns 404.

**Recovery:**
1. The agent re-calls `figma-ask-scope-questions-for-page` with the same URL
2. Server regenerates the zip (data may still be in its internal cache)
3. New download token is issued
4. Previously-written `analysis.md` files in the workspace are preserved (unzip uses `-o` for overwrite, but analysis.md won't be in the new zip)

### Edge Case 4: Huge Pages (20+ Frames)

**Mitigation:**
- The zip is generated in streaming mode (`archiver`) — server memory usage stays low
- For very large zips (>50MB), the server could chunk: "Download frames 1-10, then 11-20"
- Or: generate the zip on the fly and stream it (no temp file on server)

### Edge Case 5: Concurrent Reviews

Same `fileKey` but different pages or different users:
- Include `pageId` in the zip filename: `figma-review-{fileKey}-{pageId}.zip`
- Or include a session ID: `figma-review-{fileKey}-{timestamp}.zip`
- Download tokens are unique per zip, so there's no collision

### Edge Case 6: Server Restart Between Zip Creation and Download

**Problem:** Download tokens are in-memory. Server restart loses them.

**Mitigation:**
- Store tokens in a persistent store (Redis, SQLite) for production
- For development: zip files persist on disk; add a fallback route that serves any zip in the downloads directory if the filename matches the token pattern
- Or: make the token deterministic from the fileKey + creation timestamp, so it can be re-derived

### Edge Case 7: Agent Can't Process Images from Disk

After downloading and extracting, the agent (or subagent) may not be able to pass `image.png` to the LLM as vision input.

**Fallback options:**
1. **MCP tool:** `figma-get-cached-frame-image` reads the image from the server's cache directory and returns `ImageContent`. This works because the server still has the image data.
2. **Agent-side base64:** The workflow instructions tell the agent: "If you can't view image files directly, run `base64 < image.png` and include the output in your analysis context."
3. **Text-only:** Analyze from `context.md` + `structure.xml` without the image.

---

## 10. Dependencies

### New npm Package Required

```json
{
  "archiver": "^7.0.0"   // Zip file creation (streaming, well-maintained)
}
```

`archiver` is the standard Node.js zip creation library. It supports streaming (low memory for large zips) and is widely used.

No unzip package needed on the server side — the agent does the unzipping.

---

## 11. Implementation Plan

### New/Modified Files

```
server/
├── api/
│   └── downloads.ts                       # NEW: Express route for /api/downloads/:token
├── providers/figma/tools/
│   ├── figma-ask-scope-questions-for-page/
│   │   ├── core-logic.ts                  # MODIFY: add zip generation path
│   │   ├── zip-builder.ts                 # NEW: creates the zip file
│   │   └── workflow-instructions.ts       # NEW: builds curl-based instructions
│   └── figma-get-cached-frame-image/
│       ├── index.ts                       # NEW: optional image tool
│       └── figma-get-cached-frame-image.ts
└── server.ts                              # MODIFY: register /api/downloads route
```

### Step 1: Add `archiver` dependency
```bash
npm install archiver && npm install -D @types/archiver
```

### Step 2: Create `zip-builder.ts`
Module that takes frame data + prompts and builds a zip file server-side.

### Step 3: Create `downloads.ts` route
Express route that serves zip files by download token.

### Step 4: Modify `core-logic.ts`
Add a `outputMode: 'zip' | 'inline'` parameter. When `'zip'`:
1. Call `createReviewZip()`
2. Call `createDownloadToken()`
3. Return lightweight text response with `curl` command + `resource_link`

### Step 5: Create optional `figma-get-cached-frame-image` tool
Reads from server's internal cache (`cache/figma-files/`), returns `ImageContent`. Fallback for agents that can't process disk images.

### Step 6: Register download route in `server.ts`
```typescript
import { downloadRouter } from './api/downloads';
app.use('/api', downloadRouter);
```

---

## 12. Open Questions

1. **Should the server stream the zip directly (no temp file)?** Using `archiver` piped to the HTTP response avoids disk I/O but means we can't serve the same zip to multiple requests. For 10-minute tokens, temp file is simpler.

2. **Should we compress PNGs in the zip?** PNG is already compressed — zipping it adds overhead for minimal size reduction. `archiver` can store PNGs with `store` compression (no compression) and compress only text files.

3. **How does this interact with the existing Figma file cache?** The server already caches images at `cache/figma-files/{key}/`. The zip builder should read from this cache (not re-download from Figma). This means `fetchFrameData()` → populate cache → build zip from cache.

4. **Should `curl` instructions use `--fail` flag?** `curl --fail` returns a non-zero exit code on HTTP errors, making it easier for agents to detect failures. But error messages aren't shown. Maybe `curl --fail-with-body` (if available).

5. **Should we support incremental zip downloads?** For re-runs where only 2 of 10 frames changed, could we generate a smaller zip with just the changed frames? Adds complexity but saves download time.

6. **Claude Desktop fallback:** Should the tool detect Claude Desktop and automatically use Approach 1 (server cache) instead? Or always return both curl instructions + MCP tool references?

---

## 13. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Delivery mechanism | Zip file via HTTP download | Server is remote — can't write to agent's filesystem |
| Download auth | Short-lived UUID token (10 min) | Simpler than Bearer JWT in curl; minimal blast radius |
| Zip creation | `archiver` package, streaming | Low memory, well-maintained, handles large files |
| Agent instruction | `curl` + `unzip` in `TextContent` | All capable agents have terminal access |
| Protocol hint | Also include `resource_link` | Future-proofing for agents that support auto-download |
| Image access (primary) | Read PNG from extracted files | Zero additional round-trips; file is right there |
| Image access (fallback) | MCP tool returns `ImageContent` from server cache | For agents that can't process disk images |
| Image access (last resort) | Text-only analysis | Still useful with context.md + structure.xml |
| Cleanup | Agent-managed + server-side token expiry deletes zip | Zip deleted when token expires; workspace files persist |
| Compression | Store PNGs, compress text | PNG already compressed; saves ~60-80% on XML/markdown |
