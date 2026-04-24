# 067 — Agent Workflow: Making Figma Design Review Work

**Date:** March 7, 2026  
**Status:** 📝 Research / Design  
**Directory:** `specs/067-agent-workflow/`

## The Problem

The `figma-ask-scope-questions-for-page` tool doesn't work in practice. It returns a multi-megabyte MCP tool response containing base64-encoded images (~500KB each), semantic XML (~1MB per complex frame), annotations, and embedded prompts — all at once. Three specific failures:

1. **Images can't be consumed.** Agents receive `ImageContent` blocks in the tool response but can't extract them to files or reliably pass them to subagent LLM calls. The images are "stranded" in the response.
2. **XML overwhelms context.** A 5-frame page produces ~5MB+ of XML alone. Agents hit context limits, truncate data, or fail silently.
3. **The "save to files" step fails.** Current workflow instructions tell agents to parse the response and write each piece to `./temp/cascade/{fileKey}/`. Agents can't reliably extract heterogeneous content blocks (text, image, resource) from a multi-MB response and write them to disk.

## Lessons from Specs 058–063

We've attempted six prior specifications. Each solved something but introduced new problems:

| Spec | Approach | What It Solved | What Broke |
|------|----------|---------------|------------|
| **058** | Decomposed tools (29 new files) | Modular, testable | Too many sequential tool calls (3-5 per step), agents lose track |
| **059** | Context tools with embedded prompts | Reduced per-step calls from 3-5 → 1 | Still 3-5 sequential steps for full workflow |
| **060** | Single super-tool returns everything | One call, good discovery | Monolithic, ~2.5MB payload, no subagent support |
| **061** | Prompt + Context Tool pairs | Clean discovery, prompt as entry point | Context tool is still monolithic, no incremental processing |
| **062** | MCP Resources + workflow URIs + subagents | Elegant architecture, multi-tier agents | Complex, requires MCP client resource support (not universal) |
| **063** | Hybrid filesystem pattern (062b concrete) | Minimal code changes, pragmatic | Still returns all data inline — the "save to files" step fails |

**The recurring tension:** Payload size vs. round-trips. Every approach either returns too much data at once (060, 061, 063) or requires too many tool calls (058, 059). Specs 062-063 identified the right *pattern* (subagents processing one frame each, filesystem as coordination mechanism) but placed the burden of extracting data on the agent.

**The key insight:** The MCP *server* should handle heavy data, not the agent. The server already fetches and caches everything — it should also organize it for consumption, not dump it into a response.

## Two New Approaches

Both approaches share the same insight: **move data handling from agent to server.** They differ in where the data lives after the server processes it.

### Approach 1: Server-Side Cache + Per-Frame Retrieval Tool

**See:** [approach-1-server-cache.md](approach-1-server-cache.md)

The server caches all data in `cache/figma-scope/{fileKey}/` with a 10-minute TTL. The tool returns a ~3KB manifest. A new `figma-frame-analysis` tool serves ONE frame at a time (image + context + truncated XML + analysis prompt + save instructions). It works **standalone** (given a Figma URL) or **orchestrated** (reads from the pre-populated cache). Subagents each call this tool for their assigned frame.

**Strengths:**
- Works with ANY MCP deployment (local + remote)
- Server-managed lifecycle (TTL, cleanup)
- Per-frame responses are appropriately sized (~600KB)
- Images delivered as `ImageContent` in a controlled, single-image context
- XML can be tiered: full (<50KB), truncated (50-200KB), summarized (>200KB)
- `figma-frame-analysis` works standalone — no prior caching step required
- Includes analysis prompt + save-to-filesystem instructions in every response

**Weaknesses:**
- Requires a NEW tool (`figma-frame-analysis`), adding to tool count
- Cache management complexity (TTL, expiry mid-workflow, token tracking)
- Double storage (images in `cache/figma-files/` AND `cache/figma-scope/`)
- Standalone mode uses 3 Figma API calls per frame (vs. 0 for cached mode)

### Approach 2: Zip File Download

**See:** [approach-2-zip-download.md](approach-2-zip-download.md)

The server packages all data into a zip file and serves it via an HTTP download endpoint. The tool returns ~3KB of instructions with a `curl` command + a `resource_link`. The agent downloads and extracts the zip to its local workspace. Subagents read files directly from disk.

**Strengths:**
- Works with remote/deployed MCP servers (the primary deployment model)
- Single download gets ALL data — no per-frame round-trips
- Once extracted, subagents read files directly (no MCP tool calls for text data)
- Real PNG files on disk (not base64) are easier to work with
- Server-managed lifecycle (download tokens expire, zip files cleaned up)
- Future-proofed with `resource_link` content block for agents that support auto-download

**Weaknesses:**
- Requires agent to have terminal access (`curl` + `unzip`) — doesn't work for Claude Desktop
- Agents may not be able to process PNG files from disk as vision inputs (need MCP tool fallback)
- Adds HTTP download endpoint infrastructure (token management, route, cleanup)
- Requires `archiver` npm dependency for zip creation
- Download tokens are in-memory by default (lost on server restart)

## Comparison Matrix

| Dimension | Approach 1 (Server Cache) | Approach 2 (Zip Download) |
|-----------|--------------------------|--------------------------|
| **Deployment** | Local + Remote | Local + Remote |
| **Tool response size** | ~3KB manifest | ~3KB instructions + URL |
| **Data delivery** | MCP tool calls (one per frame) | Single `curl` + `unzip` |
| **Round-trips for data** | N tool calls (one per frame) | 1 HTTP download |
| **Per-frame data access** | Tool call (`figma-frame-analysis`) | `read_file` for text, optional tool for images |
| **Image delivery** | `ImageContent` in tool response | PNG on disk + optional MCP tool fallback |
| **XML strategy** | Tiered truncation, served via tool | Full file on disk, agent reads what it needs |
| **New tools required** | 2 (`figma-frame-analysis`, `get-cached-prompt`) | 0-1 (optional `get-cached-frame-image`) |
| **Agent requirements** | MCP tool access only | Terminal access (`curl`, `unzip`) |
| **Works without terminal** | ✅ Yes | ❌ No |
| **Offline after initial fetch** | ❌ Needs server for each frame | ✅ All data local after download |
| **Cache management** | Server-side TTL (10 min) | Token expiry (10 min) + agent-managed files |
| **Failure recovery** | `CACHE_EXPIRED` error → re-fetch | Re-call tool for new download link |
| **Implementation effort** | Medium (new cache infrastructure) | Medium (download endpoint + zip builder) |

## Synthesis: The Shared Pattern

Both approaches converge on the same agent workflow:

```
1. Agent calls figma-ask-scope-questions-for-page(url)
2. Server fetches all data (using existing fetchFrameData pipeline)
3. Server organizes data (cache directory or zip file)
4. Tool returns lightweight response (~3KB manifest/instructions, NOT data)
5. Agent gets frame data (via tool calls OR curl+unzip)
6. Agent reads manifest, spawns one subagent per frame
7. Each subagent gets its frame data (tool call or file read)
8. Each subagent runs LLM analysis, writes output to a file
9. Main agent collects analyses, runs scope synthesis
10. Main agent generates questions, presents to user
```

The disagreement is about step 3 (where data lives), step 5 (how the agent first gets data), and step 7 (how subagents access per-frame data).

## Possible Hybrid: Approach 2 with Approach 1 Fallback

Since this is a **remote HTTP server**, the most practical path may be:

1. **Default:** Zip download (Approach 2). Agents with terminal access (`curl`+`unzip`) get all data in one download, then work entirely from local files.
2. **Fallback:** For agents without terminal access (Claude Desktop), fall back to server-side cache (Approach 1) where all data is accessible via MCP tool calls.
3. **Image tool either way:** Both approaches benefit from an optional `figma-get-cached-frame-image` MCP tool that returns `ImageContent` from the server's cache. Agents that can't process PNGs from disk use this tool.

## Files in This Directory

| File | Description |
|------|-------------|
| [overview.md](overview.md) | This file — problem statement, 058-063 learnings, comparison |
| [approach-1-server-cache.md](approach-1-server-cache.md) | Server-side cache + per-frame retrieval tool design |
| [approach-2-zip-download.md](approach-2-zip-download.md) | Zip file download via HTTP endpoint |

## Open Questions

1. **Image vision capability:** Can VS Code Copilot subagents actually process images via `ImageContent`? If not, both approaches need a different image strategy (e.g., server-side image analysis, return only text).
2. **XML size in practice:** The "~1MB per frame" claim needs measurement. If typical frames are actually 5-20KB (per spec 060 measurements), the XML problem may be overstated and a simpler solution suffices.
3. **Subagent reliability:** How reliably do VS Code Copilot and Claude Desktop spawn and coordinate subagents? If subagent support is poor, a sequential single-agent approach (process frames one at a time via tool calls) may be more practical.
4. **Existing cache reuse:** Images are already cached at `cache/figma-files/{fileKey}/` by the `fetchFrameData` pipeline. The zip builder (Approach 2) and scope cache (Approach 1) should read from this existing cache rather than re-downloading from Figma.
5. **`resource_link` adoption:** MCP's `resource_link` type is the protocol-native way to reference downloadable content. No agent auto-downloads from it today, but this could change. Both approaches should include a `resource_link` in the response for future-proofing.
6. **Claude Desktop support:** Neither approach works well for Claude Desktop (no terminal, limited filesystem). Should we detect Claude Desktop and fall back to a summarized text-only response?
