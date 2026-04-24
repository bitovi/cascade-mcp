# 063-questions-subagents.md

## Status
Implemented

## What it proposes
Enable agents with subagent capabilities to parallelize the design review questions workflow. The server batch-fetches all Figma data via `figma-page-questions-context`, the orchestrating agent saves frame data to local temp files, then spawns one subagent per frame for parallel analysis. No new tools were needed — only MCP resource registration and a prompt update.

## Architectural decisions made
- Add `resources: {}` capability to MCP server factory
- Create `server/mcp-resources/prompt-resources.ts` — expose 4 prompt constants as standalone MCP resources (`prompt://frame-analysis`, `prompt://scope-synthesis`, `prompt://generate-questions`, `prompt://write-story-content`)
- Create `server/mcp-resources/workflow-resources.ts` — register `workflow://review-design` as a static markdown orchestration document
- Create `server/mcp-resources/index.ts` — central registration called unconditionally (no auth required)
- Resources are always registered regardless of provider authentication (static text only)
- Subagents must have MCP tool access (not read-only agents) to call `figma-frame-analysis`
- Single source of truth: prompt text in resources matches what the context tool already embeds
- Update `prompt-figma-page-questions` to reference `workflow://review-design` with inline fallback for non-resource-capable agents

## What still needs implementing
Fully implemented — with one deviation from the spec: `prompt-figma-page-questions` was removed rather than updated (replaced by the dedicated `figma-ask-scope-questions-for-page` tool which directly embeds subagent orchestration instructions in its response). The MCP resources (`prompt-resources.ts`, `workflow-resources.ts`, `index.ts`) and server factory changes are all in place. Documentation in `server/readme.md` is updated.
