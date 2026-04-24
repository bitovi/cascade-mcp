# 067-agent-workflow

## Status
Implemented

## What it proposes
Resolves failures in the `figma-ask-scope-questions-for-page` tool caused by multi-megabyte MCP responses (base64 images + large XML) that agents can't reliably process. Proposes moving data handling from the agent to the MCP server via a server-side scope cache, returning a lightweight manifest, and providing a new `figma-frame-analysis` tool that serves one frame at a time to subagents.

## Architectural decisions made
- MCP server fetches all Figma data once, writes to `cache/figma-scope/{fileKey}/` with a 10-minute TTL
- `figma-ask-scope-questions-for-page` returns a ~3KB manifest (cacheToken, frame list, workflow instructions) instead of raw data
- New `figma-frame-analysis` tool serves one frame per call (image + context + XML + analysis prompt); works standalone (fetches from Figma API) or orchestrated (reads from pre-populated scope cache via `cacheToken`)
- Parallel subagent pattern: main agent spawns one MCP-capable subagent per frame, each calling `figma-frame-analysis`
- Approach 2 (zip download) was specified but not selected for implementation; Approach 1 (server cache) was chosen as it works without terminal access
- `prompt://frame-analysis` MCP resource exposes the per-frame analysis prompt

## What still needs implementing
Fully implemented.
