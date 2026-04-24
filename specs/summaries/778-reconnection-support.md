# 778-reconnection-support.md

## Status
Implemented

## What it proposes
When a user refreshes the browser while a tool is running, the MCP session is lost and results are discarded. This spec proposes a two-phase solution: Phase 1 preserves the server-side session across page refresh by reusing the `mcp-session-id` and recreating a fresh transport tied to the existing `McpServer`; Phase 2 adds an `EventStore` to replay missed SSE events via `Last-Event-ID`.

## Architectural decisions made
- Session grace period (10 minutes) instead of immediate cleanup on transport close, with a session reaper that detects idle sessions and starts grace periods
- On reconnect (`initialize` + existing `mcp-session-id`), close the old stale transport and create a new `StreamableHTTPServerTransport` with the same session ID, reusing the existing `McpServer` instance
- `EventStore` (`InMemoryEventStore`) lives on `SessionData` (not per-transport) so it survives transport recreation during reconnection
- `cleanupStaleStreamMappings()` called before GET /mcp requests to clear stale `_GET_stream` entries that would cause 409 Conflict
- Client stores `mcp-session-id` in `localStorage` and attempts `reconnect()` before `connect()` on page load

## What still needs implementing
Fully implemented.
