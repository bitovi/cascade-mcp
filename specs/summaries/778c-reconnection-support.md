# 778c-reconnection-support.md

## Status
Implemented

## What it proposes
Replace a fragile browser reconnection approach (SDK private-property monkey-patching) with a standards-based mechanism using only public SDK APIs (`sessionId`, `onresumptiontoken`, `resumeStream()`), `localStorage` persistence of session/event-ID state across refreshes, and server-side session grace periods with EventStore preserved across transport recreations.

## Architectural decisions made
- Use `localStorage` keys `mcp_session_id`, `mcp_last_event_id`, `mcp_server_url` persisted continuously during normal operation (not just on disconnect)
- `SessionData` interface holds `eventStore` separately from the transport so it survives transport recreation on reconnect
- Session reaper interval (`SESSION_REAPER_INTERVAL_MS = 60s`, `SESSION_IDLE_THRESHOLD_MS = 10min`) replaces `onclose`-triggered cleanup (which rarely fires for HTTP transports)
- On reconnect `initialize`, server creates a new transport reusing the existing `McpServer` and `EventStore`; stale stream mappings cleaned via `cleanupStaleStreamMappings()` in `sdk-stream-mapping-fix.ts`
- Client calls `transport.resumeStream(lastEventId)` after `connect()` because the SDK skips `_startOrAuthSse` when a `sessionId` is already set
- E2E test in `test/e2e/reconnection.test.ts` validates the full Phase A → destroy → Phase B → result delivery flow

## What still needs implementing
Fully implemented.
