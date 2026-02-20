# 778 — POST Event Stream Support

## Overview

Support responding to POST requests with `Content-Type: text/event-stream` instead of only `application/json`. This enables:
1. **Progress notifications**: Server can stream progress updates before sending the final response
2. **Spec compliance**: Proper implementation of MCP Streamable HTTP transport requirements
3. **Keeps notifications with originating requests**: Tool notifications stream on the POST that triggered them (instead of being orphaned or requiring GET fallback)

**Note on resumability**: POST streaming doesn't *simplify* resumability - it makes it *more necessary*. JSON POST responses are all-or-nothing (no resumability needed), but SSE POST streams can disconnect mid-progress, requiring Last-Event-ID support. That's future work (Phase 2).

## Background

According to the [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#sending-messages-to-the-server):

> If the input is a JSON-RPC *request*, the server **MUST** either return `Content-Type: text/event-stream`, to initiate an SSE stream, or `Content-Type: application/json`, to return one JSON object. The client **MUST** support both these cases.

Currently, our server always returns `application/json` for POST requests, even though:
- The SDK's `StreamableHTTPServerTransport` has built-in support for SSE on POST
- Our browser client sends `Accept: application/json, text/event-stream`
- Tools send progress notifications that would benefit from streaming

## Current Behavior

> **UPDATE (Feb 2026)**: Investigation revealed that POST requests **already return `text/event-stream`**.
> The SDK's `enableJsonResponse` defaults to `false`, so SSE streaming was always the default.
> The original assumption that POST returned `application/json` was incorrect.

Actual current behavior:
```
Accept: application/json, text/event-stream
POST utility-notifications
→ Returns 200 with text/event-stream ✅ (already SSE!)
→ Streams SSE events (no event IDs — requires EventStore)
→ Tool notifications go directly to POST stream
→ Final response sent as SSE event
→ Stream closes after response
```

Verified with `utility-notifications` tool (3s duration, 500ms interval):
- All 8 notifications received in order (6 periodic + start + complete)
- Tool result arrived after all notifications
- POST stream closed cleanly
- Server logged: `📤 POST response Content-Type: text/event-stream, status: 200`

**What's missing**: SSE events have no `id:` field, so resumability is not possible if the stream disconnects mid-flight.

## Implementation Plan

### Phase 1: Make POST Return text/event-stream ✅ COMPLETE

**Result**: POST already returns `text/event-stream`. No code changes needed.

#### Step 1.1: Investigate SDK Response Type Decision ✅

**Findings**:
- SDK has `enableJsonResponse` option (default: `false` = SSE preferred)
- We don't set it, so SSE is already the default
- The `WebStandardStreamableHTTPServerTransport` creates a `ReadableStream` with `Content-Type: text/event-stream`
- The Node.js wrapper uses `getRequestListener` from `@hono/node-server` to pipe it through Express
- No configuration changes needed

#### Step 1.2: Add Logging to Observe Response Headers ✅

Added logging in `mcp-service.ts` after `transport.handleRequest()`:

```typescript
const contentType = res.getHeader('content-type');
const statusCode = res.statusCode;
console.log(`  📤 POST response Content-Type: ${contentType}, status: ${statusCode}`);
```

**Result**: `📤 POST response Content-Type: text/event-stream, status: 200`

#### Step 1.3: Make SDK Return SSE for POST ✅ (No-op)

SSE was already the default. No changes needed.

### Phase 2: Stream Notifications Through POST ✅ COMPLETE

**Result**: Notifications already stream through POST. Verified end-to-end.

#### Step 2.1: Verify Notifications Use POST Stream ✅

Test: `utility-notifications` with 3s duration, 500ms interval (6 notifications)

**Results**:
- All 8 notifications received in order (6 periodic + "Starting" + "Complete")
- No errors in server or client
- POST stream stayed open for full duration
- Test script (`temp/test-post-sse.mjs`) using SDK client confirmed all notifications arrive via POST stream

#### Step 2.2: Verify Final Response Arrives ✅

**Results**:
- Tool result arrived after all notifications
- Result contained `{"success": true, "notificationsSent": 6, ...}`
- Stream closed cleanly after final response
- No errors or timeouts

### Phase 3: Add SSE Event IDs (Preparation for Resumability)

**Goal**: Add event IDs to SSE events (doesn't enable resumability yet, just prepares for it)

#### Step 3.1: Verify SDK Adds Event IDs ✅

**Finding**: SDK does NOT generate event IDs without an `EventStore`.

Raw SSE output from POST (verified with curl):
```
event: message
data: {"result":{...},"jsonrpc":"2.0","id":1}
```
No `id:` field present.

#### Step 3.2: Configure Event ID Generation (Needed)

The SDK requires an `EventStore` to generate event IDs. Implementation needed:

1. **Custom EventStore** (stores events with IDs):
   - Create `server/mcp-core/event-store.ts` with `SessionEventStore` class
   - Implement `storeEvent()`, `replayEventsAfter()`
   - Pass to transport constructor: `eventStore: new SessionEventStore()`

2. **SDK interface** (from `@modelcontextprotocol/sdk`):
   ```typescript
   interface EventStore {
     storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId>;
     replayEventsAfter(lastEventId: EventId, 
       { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
     ): Promise<StreamId>;
   }
   ```

**How to verify**:
1. After implementing EventStore
2. Run `temp/test-post-sse.mjs` or curl test
3. Every SSE event should have an `id:` field
4. IDs should be unique and sequential

### Phase 4: Testing & Validation

#### Step 4.1: Test Normal Execution (No Disconnection) ✅

**Scenario**: POST request completes successfully with streaming

**Verified** (Feb 2026) using `temp/test-post-sse.mjs` and curl:
- POST response is `text/event-stream`
- All notifications arrive in order
- No errors in server logs
- POST stream closes after final response
- Test endpoint `GET /test/token` added for creating no-provider JWTs

#### Remaining Tests:
- [ ] Multiple concurrent POST requests work independently
- [ ] Short-running tools (e.g., `list-tools`) work with SSE
- [ ] Error responses work correctly via SSE
- [ ] Browser network tab shows POST as "eventsource" type

## Success Criteria

- [x] POST requests return `Content-Type: text/event-stream` (not `application/json`) — **already working** (SDK default)
- [x] Tool notifications stream directly via POST response (all notifications delivered) — **verified with utility-notifications**
- [x] All notifications arrive in order through POST stream — **8/8 received in order**
- [x] Final tool result arrives as SSE event — **verified**
- [x] POST stream closes cleanly after tool completes — **verified**
- [ ] Multiple concurrent POST requests work independently — not yet tested
- [ ] Short-running tools work correctly with SSE — not yet tested
- [ ] Error responses work correctly via SSE — not yet tested
- [x] No regressions in existing functionality (GET streams, session management) — **verified**
- [ ] Browser network tab shows POST requests as "eventsource" type — not yet tested in browser
- [ ] SSE events include `id:` field for future resumability — **Done! EventStore implemented (`server/mcp-core/event-store.ts`)**
  - Format: `{streamId}_{sequenceNumber}` (e.g., `12c5c25e-fbdc-4e43-be6d-3f9645da972a_1`)
  - Verified with curl: `id: 12c5c25e-fbdc-4e43-be6d-3f9645da972a_1`
  - Includes in-memory storage with pruning (500 events/stream, 100 streams max)

## Out of Scope (This Phase)

- **Full resumability with Last-Event-ID on reconnection**: EventStore stores events and can replay, but client-side reconnection logic is not implemented yet
- **Client-side reconnection**: Handle in future phase
- Compression of event streams
- Rate limiting or backpressure
- POST stream pooling (reusing streams after response)

## Future Work

### Resumability (Separate Spec)

**Important**: EventStore is now in place (`server/mcp-core/event-store.ts`), so the server side is ready for resumability. Remaining work:

- **Client-side Last-Event-ID tracking**: Store last event ID per stream in sessionStorage
- **GET with Last-Event-ID**: Client sends `Last-Event-ID` header on reconnection GET
- **Replay logic**: Server's `replayEventsAfter()` is implemented, just needs client trigger
- **Testing**: Simulate disconnections and verify replay

### Other Improvements
- **Cross-version protocol support**: Detect client protocol version and adjust behavior
- **Event store pruning**: Limit memory usage by expiring old events
- **Metrics**: Track POST vs GET stream usage, error rates
- **Performance optimization**: Connection pooling, compression

## Related Specifications

- [MCP Streamable HTTP - Sending Messages to the Server](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#sending-messages-to-the-server)
- [MCP Streamable HTTP - Resumability and Redelivery](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#resumability-and-redelivery)
- [Server-Sent Events Specification (WHATWG)](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [Spec 778b - Standards-Based Session Reconnection](./778b-reconnection-support.md) (uses EventStore for GET streams)

## Questions & Answers

### 1. How do we make the SDK return `text/event-stream` instead of `application/json` for POST requests?

**Research findings**: The SDK has an `enableJsonResponse` option in `WebStandardStreamableHTTPServerTransportOptions`:
- **Default**: `false` (SSE streams are preferred)
- When `true`: Server returns JSON responses instead of SSE

**Our situation**: We're not setting `enableJsonResponse`, so the SDK should default to SSE. Need to investigate why it's currently returning JSON:
- Check if there's SDK logic that chooses JSON for specific request types (e.g., `initialize`)
- Verify the SDK is actually seeing the `Accept: application/json, text/event-stream` header
- May need to explicitly set: `enableJsonResponse: false` to force SSE

**Suggested answer**: Start by adding logging in Step 1.2 to see what the SDK is doing, then if needed, explicitly set `enableJsonResponse: false` in the transport constructor.

---

### 2. Does the SDK client handle receiving SSE for POST responses automatically?

**Research findings**: Yes! The `StreamableHTTPClientTransport` is designed to handle both:
- JSON responses (`application/json`)
- SSE streams (`text/event-stream`)

The MCP spec requires: *"The client **MUST** support both these cases"*

**Evidence**: 
- Our browser client sends `Accept: application/json, text/event-stream` 
- The client transport constructor doesn't require any special SSE configuration
- The SDK abstracts away the difference between JSON and SSE responses

**Suggested answer**: No client changes needed. The SDK client will automatically handle SSE responses from POST requests.

---

### 3. Should we add event IDs in this phase (for debugging) even though we're not adding resumability yet?

**Research findings**: Event IDs are added automatically when an `EventStore` is configured:
- `EventStore.storeEvent()` returns an `EventId`
- The SDK uses this ID in SSE `id:` fields
- Without EventStore: No event IDs are generated

**Trade-offs**:
- **For debugging**: Event IDs make message flow easier to trace in logs
- **Against**: EventStore adds complexity (memory management, lifecycle) without providing resumability benefits yet
- **Middle ground**: Could use a simple in-memory EventStore that doesn't persist across server restarts

**Suggested answer**: **Defer to Phase 3** (as currently planned). Get basic POST streaming working first without event IDs, then add them as preparation for resumability. This keeps Phase 1-2 simpler.

---

### 4. How do concurrent POST requests work with SSE?

**Research findings**: The SDK handles concurrent streams internally:
- Each POST request gets a unique stream ID (internally managed)
- SDK uses `_streamMapping` to track multiple concurrent streams
- SDK uses `_requestToStreamMapping` to route responses to correct streams
- Each stream is independent with its own `ReadableStreamDefaultController`

**From spec**: *"The server **MUST** send each of its JSON-RPC messages on only one of the connected streams"*

**Suggested answer**: **Concurrent POST requests work independently**. The SDK manages stream isolation automatically. Each tool execution gets its own POST stream with notifications routed correctly. No special handling needed.

---

### 5. What happens to the GET SSE stream once POST is streaming?

**Research findings**: According to MCP spec, both serve different purposes:
- **POST SSE streams**: For request/response with related notifications, **close after response**
  - *"The server **MAY** send JSON-RPC requests and notifications before sending the JSON-RPC response. These messages **SHOULD** relate to the originating client request."*
  - *"After the JSON-RPC response has been sent, the server **SHOULD** terminate the SSE stream."*
- **GET SSE stream**: For unrelated server-initiated messages, **stays open**
  - *"These messages **SHOULD** be unrelated to any concurrently-running JSON-RPC request from the client."*
  - Client "**MAY** issue an HTTP GET" - it's optional

**Critical use case for GET stream**: **Server-to-client requests**
- Example: `sampling/createMessage` - server asks client to call LLM
- These can't use POST streams because POST is for client requests only
- Without GET: Server has no way to initiate communication with client

**Question: Will client still open GET if POST streams?**
- The SDK behavior depends on the client implementation
- According to spec: *"The client **MAY** issue an HTTP GET"* - it's **optional**
- GET is only needed for:
  - Server-to-client requests (like `sampling/createMessage`) when no POST is active
  - Unsolicited notifications when no POST is active
- Clients that only make POST requests (never expect server-initiated messages) can skip GET entirely

**Suggested answer**: **GET is optional per spec**. Our browser client currently opens a GET stream, and we should keep that behavior for server-initiated requests. But POST streaming doesn't *require* GET - it just makes notifications stay with their originating request instead of being orphaned.

---

### 6. If the SDK doesn't support SSE for POST out-of-the-box, do we need to handle response writing manually?

**Research findings**: The SDK **does** support SSE for POST out-of-the-box:
- `enableJsonResponse` defaults to `false` (SSE preferred)
- `transport.handleRequest(req, res, body)` handles all response writing
- The SDK writes SSE events, manages stream lifecycle, handles backpressure

**Why might it be returning JSON currently?**
- Possible SDK logic: Returns JSON for `initialize` request specifically
- Possible bug: SDK not seeing Accept header correctly
- Possible override: Some middleware or Express config interfering

**Suggested answer**: **No manual handling needed** if SDK is working correctly. Step 1.1-1.2 will reveal if there's a configuration issue. If SDK genuinely doesn't support it, that would be a significant finding requiring either SDK patching or manual SSE implementation - but this seems unlikely given the SDK architecture.

---

### 7. Should POST SSE streams close immediately after the final response, or keep them open briefly?

**From MCP spec**: *"After the JSON-RPC response has been sent, the server **SHOULD** terminate the SSE stream."*

**"SHOULD" means**: Recommended but not mandatory. Valid reasons to deviate:
- Draining pending writes
- Graceful shutdown sequence
- Client-side buffer flushing

**SDK behavior**: Likely closes stream immediately after enqueuing final response, letting OS/network stack handle actual TCP close.

**Suggested answer**: **Close immediately after final response** (follow SDK default behavior). The spec's "SHOULD" gives us flexibility, but immediate close is the expected behavior. Clients shouldn't rely on the stream staying open after receiving the response.

---

### 8. How does stream resumption with Last-Event-ID work? Does the GET stream stay open?

**Key insight**: There are **two different types of GET streams**:

**1. Resumption GET (ephemeral - closes after response)**:
```
# Client reconnects to resume a disconnected POST stream
Client: GET /mcp
        Last-Event-ID: stream123-event2

# Server replays the POST stream that got disconnected
Server: text/event-stream
        id: stream123-event3 (notification)
        id: stream123-event4 (notification)
        id: stream123-event5 (final response)
        [stream closes] ← Closes because original was a POST stream
```

**2. Persistent GET (stays open for server-initiated messages)**:
```
# Client opens a channel for server-to-client requests
Client: GET /mcp
        (no Last-Event-ID header)

Server: text/event-stream
        [stays open indefinitely]
        [waits for server-initiated requests like sampling/createMessage]
```

**From the spec**:
- *"The server **MUST NOT** send a JSON-RPC response on the [GET] stream **unless** resuming a stream associated with a previous client request."*
- POST streams close after sending response, and resumption inherits that behavior

**Client can have both**:
- Multiple ephemeral resumption GETs (each closes after delivering response)
- One persistent GET for server-initiated messages (no Last-Event-ID)
- SDK tracks these as separate streams internally

**How EventStore enables this**:
1. Event IDs encode which stream they came from: `stream123-event5`
2. Server uses event ID to identify the original stream and its type (POST or persistent GET)
3. If resuming a POST stream → replay events and close after final response
4. If resuming a persistent GET → replay events and keep stream open

**Suggested answer**: **Resumption GETs are ephemeral** - they close after delivering the final response of the stream they're resuming. Only persistent GETs (opened without Last-Event-ID) stay open indefinitely.
