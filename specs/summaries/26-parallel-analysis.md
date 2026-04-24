# 26-parallel-analysis.md

## Status
Implemented

## What it proposes
Add a `supportsParallelRequests` capability flag to `GenerateTextFn` so screen analysis can run in parallel for AI SDK clients (REST API) while remaining sequential for MCP sampling clients. This would cut multi-screen analysis time from O(n) to O(1) for REST API consumers.

## Architectural decisions made
- Add optional `supportsParallelRequests?: boolean` property to `GenerateTextFn` type
- AI SDK wrapper sets `supportsParallelRequests = true`; MCP sampling client leaves it undefined/false
- Conditional execution at the call site: `Promise.all()` for parallel clients, `for` loop for sequential clients
- Fail-fast behavior in both modes (errors propagate immediately)
- Progress notifications differ by mode: completion-based for parallel, start-based for sequential

## What still needs implementing
Fully implemented — but with an evolved architecture. Rather than conditional branching at the call site (as the spec proposed), the implementation uses a `createQueuedGenerateText` wrapper (`server/llm-client/queued-generate-text.ts`) that transparently serializes requests for non-parallel clients. This allows all call sites (including `analyzeFrames` in `server/providers/figma/screen-analyses-workflow/screen-analyzer.ts`) to always use `Promise.all()`, with the queue handling serialization for MCP sampling automatically. The `supportsParallelRequests` flag, the AI SDK wrapper assignment, and the queuing infrastructure are all in place.
