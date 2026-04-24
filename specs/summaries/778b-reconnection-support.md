# 778b-reconnection-support.md

## Status
Partial

## What it proposes
Replace the 778 reconnection approach (4 SDK patches) with a standards-based server implementation using the MCP spec's `EventStore` interface for event replay, reducing server-side SDK hacks from 2 to 1. Clients reconnect by sending `Last-Event-ID` on the GET SSE stream to replay missed events, while a single `send()` redirect patch handles orphaned tool notifications from dead POST streams.

## Architectural decisions made
- Use a custom `SessionEventStore` (not `InMemoryEventStore`) to avoid SDK Issue #943 where underscore-based event ID parsing breaks for `_GET_stream`
- Keep the old transport on reconnect (no close + recreation) so internal maps (`_streamMapping`, `_requestToStreamMapping`) stay intact
- Remove the `_GET_stream` cleanup patch — `Last-Event-ID` in the GET request bypasses the 409 check via `replayEvents()`
- Keep the `send()` redirect patch (1 remaining server hack) to route orphaned notifications from dead POST streams to the standalone GET SSE stream
- Client tracks resumption tokens via `onresumptiontoken`, persists to `localStorage`, and uses `transport.resumeStream(lastEventId)` on reconnect

## What still needs implementing
- The `applyOrphanedNotificationRedirect()` named function is not implemented — the spec's Step 4 (extracting the `send()` redirect as a reusable, idempotent function applied in `handleSessionReconnect()`) is missing from `mcp-service.ts`
- The implementation creates a **new transport** on reconnect (reusing the EventStore) rather than the spec's "keep old transport" approach — meaning internal stream maps are not preserved as the spec intended
- The `_GET_stream` cleanup patch (`cleanupStaleStreamMappings` in `sdk-stream-mapping-fix.ts`) is still present and still uses underscore-based stream ID parsing, which the spec intended to eliminate
- Step 5 (explicitly removing the inline `send()` patch from the GET handler path) does not appear to be completed
