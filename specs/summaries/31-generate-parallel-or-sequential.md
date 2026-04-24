# 31-generate-parallel-or-sequential.md

## Status
Implemented

## What it proposes
Introduce a `createQueuedGenerateText` wrapper that transparently handles parallel vs sequential LLM execution: for AI SDK clients it is a no-op (allowing real `Promise.all()` parallelism), while for MCP sampling clients it queues requests to execute sequentially. This removes the need for every call site to check `supportsParallelRequests` and branch manually.

## Architectural decisions made
- Queue wrapper applied **at the source** (client creation), not at each usage site
- AI SDK path: `createQueuedGenerateText` returns the function unchanged (supports parallel)
- MCP sampling path: wraps with a promise-chain queue ensuring sequential execution
- Error propagation: if one queued request fails, subsequent queued requests also fail immediately
- `supportsParallelRequests` flag retained on `GenerateTextFn` type for introspection but tools no longer need to check it
- `createQueuedGenerateText` exported from `server/llm-client/index.ts` and used across tools: `confluence-analyze-page`, `analyze-feature-scope`, `figma-review-design`, `write-shell-stories`, `review-work-item`

## What still needs implementing
Fully implemented.
