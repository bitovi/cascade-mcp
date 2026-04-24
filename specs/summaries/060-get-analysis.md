# 060-get-analysis.md

## Status
Not Implemented

## What it proposes
A single tool `figma-get-page-analysis-context` that returns a complete bundle (manifest, frame images, frame context markdown, and analysis prompts) in one call, eliminating the multi-step orchestration required by prior approaches. The agent then processes all frames locally using the returned data, reducing MCP round-trips.

## Architectural decisions made
- Single tool call returns all frames' images, context, and prompts in one response
- Response uses a structured content array: manifest JSON, then interleaved image+context resource blocks per frame, then two embedded prompt resources (`prompt://frame-analysis`, `prompt://scope-synthesis`)
- Agent-side loop processes frames (potentially in parallel) using returned data — no additional MCP calls needed per frame
- Tool supersedes the 059 multi-tool approach (`figma-get-layers-for-page` → `figma-get-frame-analysis-context` → `figma-get-scope-analysis-context`)
- Prompts are embedded as MCP resources in the response rather than registered separately

## What still needs implementing
- The `figma-get-page-analysis-context` tool does not exist in the codebase (no matches found in `server/`)
- The bundled response format (interleaved image + context + embedded prompt resources) is not implemented
- The manifest + frame ordering logic for this single-call pattern is missing
- The scope synthesis prompt resource embedding is not implemented
