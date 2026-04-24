# 778-post-event-stream.md

## Status
Implemented

## What it proposes
Enable POST requests to respond with `Content-Type: text/event-stream` so the server can stream progress notifications before the final response, keeping tool notifications associated with their originating request. It also adds SSE event IDs (via an `EventStore`) to prepare for future resumability support.

## Architectural decisions made
- The SDK's `StreamableHTTPServerTransport` defaults to SSE (`enableJsonResponse: false`), so no config change was needed for Phase 1
- An `InMemoryEventStore` (in `server/mcp-core/event-store.ts`) generates event IDs in the format `{streamId}_{sequenceNumber}` and is passed to the transport constructor
- `EventStore` survives transport recreation (stored on the session alongside `McpServer`) so event replay remains possible after reconnection
- Resumability (client-side `Last-Event-ID` tracking and server-side replay) is explicitly deferred to a future phase
- In-memory pruning limits: 500 events/stream, 100 streams max

## What still needs implementing
Fully implemented. Remaining items in the spec are untested validation scenarios (concurrent POST requests, error responses via SSE, browser devtools verification) and a deferred resumability phase — not missing implementation.
