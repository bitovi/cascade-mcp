# 043-timeout.md

## Status
Partial

## What it proposes
The spec documents a timeout issue where the VS Code MCP client times out after ~40 seconds while the server continues processing, causing the client to never receive results. It proposes fixing this by sending progress notifications during long screen analysis operations to keep the connection alive, and optionally implementing cancellation handling and performance optimizations.

## Architectural decisions made
- Send progress notifications before each screen analysis when using sequential execution (MCP sampling) to prevent client timeout
- Use `generateText.supportsParallelRequests` flag to determine execution mode: `false` = MCP sampling (sequential, needs per-screen progress), `true` = AI SDK (parallel, no per-screen progress needed)
- Implement a `sendProgress` utility in `progress-notifier.ts` that sends both logging notifications and MCP `notifications/progress` events when `progressToken` is available
- Progress notifications are conditional on sequential execution to avoid unnecessary overhead for parallel execution

## What still needs implementing
- **Cancellation handling**: Tools do not check for or respect MCP `notifications/cancelled` signals; the server still continues processing after client cancels
- **Cache optimization**: More aggressive caching of screen analyses (checking file metadata/version before invalidating) to reduce redundant work
- **Performance optimizations**: Reducing semantic XML size by filtering unnecessary Figma properties, splitting large analyses into smaller chunks
