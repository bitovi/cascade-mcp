# 778b — Standards-Based Session Reconnection (EventStore Approach)

## Background

[Spec 778](./778-reconnection-support.md) implemented session reconnection on page refresh using 4 SDK patches — 2 server-side (clearing stale `_GET_stream`, monkey-patching `send()`) and 2 client-side (calling private `_startOrAuthSse()`, manually setting protocol version). It works, but relies on reaching into private SDK internals on both client and server.

This spec replaces the server patches with **zero server SDK hacks** by following the MCP spec's Resumability and Redelivery pattern. All SDK workarounds move to the client side only.

## Design Principles

1. **Standards-based server** — The server uses only public SDK APIs plus the standard `EventStore` interface. No monkey-patching, no private property access.
2. **Client patches are acceptable** — Our browser client is the only consumer; we control it fully.
3. **Keep the old transport** — On reconnect, reuse the existing `StreamableHTTPServerTransport` instead of creating a new one. The transport's internal maps (`_streamMapping`, `_requestToStreamMapping`) stay intact.

## Problem Recap

When the browser refreshes during a tool execution:

1. Browser destroys all fetch connections (GET SSE stream + POST response stream)
2. Server-side transport still has the session, McpServer, and in-progress tool call
3. Tool sends notifications via `send(message, { relatedRequestId })` → targets dead POST stream controller
4. Client creates a new page context with no MCP state

## How EventStore Solves This

The SDK's `EventStore` interface stores every SSE event before writing it to a stream controller. When a controller is dead, the write fails silently (try/catch in `writeSSEEvent()`), but **the event is already stored**. On client reconnect, the GET request includes `Last-Event-ID` and the server replays stored events.

Key SDK behaviors that make this work:

| Behavior | SDK Code Location | What Happens |
|---|---|---|
| Event stored before write | `send()` calls `eventStore.storeEvent()` before `writeSSEEvent()` | Events survive dead controllers |
| Dead controller write fails silently | `writeSSEEvent()` wraps `controller.enqueue()` in try/catch | No crash, returns false |
| `Last-Event-ID` bypasses 409 check | `handleGetRequest()` checks `Last-Event-ID` before checking for existing `_GET_stream` | Stale stream doesn't block reconnection |
| `replayEvents()` creates fresh stream | Creates new `ReadableStream`, replays stored events, updates `_streamMapping` | Client catches up |

### What EventStore Does NOT Solve

The SDK routes tool notifications (with `relatedRequestId`) to the original POST response stream, NOT the standalone GET SSE stream. After a page refresh:

- **Notifications with `relatedRequestId`** → SDK looks up the POST stream → controller is dead → `writeSSEEvent()` returns false → event IS stored (if EventStore configured) but NOT delivered to the GET stream
- **The client can't resume the POST stream** — MCP spec resumability replays events for the stream associated with a `Last-Event-ID`, but the client has no event ID from the dead POST stream (the page refresh destroyed it)

**Solution: The send() redirect patch is still needed**, but ONLY for redirecting tool notifications from dead POST streams to the standalone GET SSE stream. However, with EventStore:
- The `_GET_stream` cleanup patch is eliminated (Last-Event-ID bypasses 409)
- Transport recreation is eliminated (keep old transport, maps intact)

## Architecture

### Server Changes (1 patch — down from 2)

1. **Add custom `EventStore`** to transport creation (standard SDK interface, not a hack)
2. **Keep old transport** on reconnect — no `transport.close()` + recreation
3. **Remove `_GET_stream` cleanup patch** — `Last-Event-ID` in GET request bypasses the 409 check via `replayEvents()`
4. **Keep `send()` redirect patch** — still needed to route orphaned tool notifications to the GET stream (this is the one remaining server patch, though it could also be eliminated if the client tracked per-POST-stream resumption tokens — see Future Work)

### Client Changes (store + send resumption tokens)

1. **Track GET stream resumption token** — use `onresumptiontoken` callback, persist to `sessionStorage`
2. **On reconnect, send GET with `Last-Event-ID`** — server replays missed events
3. **Still set protocol version** — needed because init is skipped
4. **Don't send `initialize`** — create transport WITHOUT `sessionId` but with a custom header `x-mcp-reconnect-session` that tells the server to reuse the existing session (eliminates the SDK's "skip init" behavior and its side effects)

### Why Custom EventStore (Not InMemoryEventStore)

SDK Issue [#943](https://github.com/modelcontextprotocol/typescript-sdk/issues/943): `InMemoryEventStore.getStreamIdFromEventId()` splits event IDs on underscore (`_`) to extract the stream ID. But the standalone SSE stream ID is `_GET_stream` — which contains underscores. This breaks stream ID extraction for GET stream events.

Our custom implementation uses a `Map<EventId, StreamId>` lookup instead of string parsing.

---

## Implementation Steps

### Step 1: Create Custom EventStore

Create `server/mcp-core/event-store.ts`:

```typescript
import type { EventStore, StreamId, EventId } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Custom EventStore that avoids SDK Issue #943.
 * 
 * The SDK's InMemoryEventStore uses underscore-delimited event IDs
 * (e.g., "streamId_counter") and splits on underscore to extract the stream ID.
 * This breaks for the standalone SSE stream whose ID is "_GET_stream" (contains
 * underscores). Our implementation uses a Map lookup instead.
 */
export class SessionEventStore implements EventStore {
  private events: Map<EventId, { streamId: StreamId; message: JSONRPCMessage }> = new Map();
  private streamCounters: Map<StreamId, number> = new Map();

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const counter = (this.streamCounters.get(streamId) ?? 0) + 1;
    this.streamCounters.set(streamId, counter);
    // Use a delimiter that won't appear in stream IDs
    const eventId = `${streamId}::${counter}`;
    this.events.set(eventId, { streamId, message });
    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.events.get(eventId)?.streamId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    const entry = this.events.get(lastEventId);
    if (!entry) {
      throw new Error(`Unknown event ID: ${lastEventId}`);
    }

    const targetStreamId = entry.streamId;

    // Replay all events on this stream after the given event ID
    let foundStart = false;
    for (const [eventId, event] of this.events) {
      if (eventId === lastEventId) {
        foundStart = true;
        continue;
      }
      if (foundStart && event.streamId === targetStreamId) {
        // Skip empty/priming events
        if (Object.keys(event.message).length > 0) {
          await send(eventId, event.message);
        }
      }
    }

    return targetStreamId;
  }

  /**
   * Clean up events older than maxAgeMs.
   * Call periodically to prevent unbounded memory growth.
   */
  cleanup(maxEvents: number = 1000): void {
    if (this.events.size <= maxEvents) return;
    const excess = this.events.size - maxEvents;
    const keys = [...this.events.keys()];
    for (let i = 0; i < excess; i++) {
      this.events.delete(keys[i]);
    }
  }
}
```

### Step 2: Wire EventStore into Transport Creation

In `mcp-service.ts`, pass EventStore to both `handleNewSession()` and `handleSessionReconnect()`:

```typescript
import { SessionEventStore } from './mcp-core/event-store.ts';

// In handleNewSession():
const eventStore = new SessionEventStore();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  eventStore,  // ← enables resumability
  onsessioninitialized: (newSessionId: string) => { ... },
});

// Store eventStore in SessionData for reuse on reconnect
interface SessionData {
  transport: StreamableHTTPServerTransport;
  mcpServer: McpServer;
  eventStore: SessionEventStore;
  lastActivityAt: number;
  graceTimer?: ReturnType<typeof setTimeout>;
}
```

### Step 3: Simplify handleSessionReconnect — Keep Old Transport

Replace the current "close old + create new transport" approach:

```typescript
async function handleSessionReconnect(
  req: Request, res: Response, sessionId: string, session: SessionData
): Promise<void> {
  console.log(`  🔄 Reconnecting to existing session: ${sessionId}`);

  // Cancel any pending grace period timer
  if (session.graceTimer) {
    clearTimeout(session.graceTimer);
    session.graceTimer = undefined;
  }
  session.lastActivityAt = Date.now();

  // Update auth context with fresh tokens from the reconnecting client
  const { authInfo } = await getAuthInfoFromBearer(req, res);
  if (authInfo) {
    setAuthContext(sessionId, authInfo);
  }

  // DON'T close or recreate the transport.
  // The old transport's EventStore has all buffered events.
  // The client will open a GET with Last-Event-ID to catch up.
  // Tool notifications targeting dead POST streams are redirected
  // to the GET stream by the send() patch (applied once per session).

  // The only server-side patch: redirect orphaned notifications
  // from dead POST streams to the standalone GET SSE stream.
  applyOrphanedNotificationRedirect(session);

  // Don't handle the POST (it's an initialize on an already-initialized transport).
  // Return a synthetic 200 so the client knows the session is alive.
  // The client will then open a GET with Last-Event-ID to resume.
  res.status(200).json({
    jsonrpc: '2.0',
    result: {
      protocolVersion: '2025-11-25',
      serverInfo: MCP_SERVER_INFO,
      capabilities: MCP_SERVER_CAPABILITIES,
    },
    id: req.body?.id || null,
  });
  console.log('  ✅ Reconnect handled (kept old transport, sent synthetic init response)');
}
```

### Step 4: Extract the send() Redirect as a Named Function

Move the `send()` monkey-patch from `handleSessionRequest()` GET handler into a reusable function, applied in `handleSessionReconnect()`:

```typescript
/**
 * Apply the orphaned notification redirect patch to a session's transport.
 * 
 * After a page refresh, tool notifications with relatedRequestId target a dead
 * POST response stream. This patch detects the dead stream and redirects
 * notifications to the standalone GET SSE stream instead.
 * 
 * Applied once per session (idempotent via _reconnectSendPatched flag).
 */
function applyOrphanedNotificationRedirect(session: SessionData): void {
  const webTransport = (session.transport as any)._webStandardTransport;
  if (!webTransport || webTransport._reconnectSendPatched) return;

  const originalSend = webTransport.send.bind(webTransport);
  webTransport.send = async (message: any, options?: any) => {
    const relatedId = options?.relatedRequestId;
    if (relatedId !== undefined) {
      const streamId = webTransport._requestToStreamMapping?.get(relatedId);
      const stream = streamId ? webTransport._streamMapping?.get(streamId) : undefined;
      if (!stream?.controller) {
        if (message.id === undefined) {
          // Notification → redirect to standalone SSE (strip relatedRequestId)
          return originalSend(message);
        } else {
          // Response → drop (client is gone) and clean up mappings
          console.log(`  🗑️ Dropping response to dead stream (request ${relatedId})`);
          webTransport._requestToStreamMapping?.delete(relatedId);
          webTransport._requestResponseMap?.delete(relatedId);
          if (streamId) webTransport._streamMapping?.delete(streamId);
          return;
        }
      }
    }
    return originalSend(message, options);
  };
  webTransport._reconnectSendPatched = true;
  console.log(`  🔧 Applied orphaned notification redirect patch`);
}
```

### Step 5: Remove _GET_stream Cleanup from handleSessionRequest

The `_GET_stream` cleanup patch in the GET handler is no longer needed. When the client sends `Last-Event-ID`, the SDK's `replayEvents()` path runs before the 409 Conflict check, creating a fresh stream mapping.

Remove this block from `handleSessionRequest()`:
```typescript
// REMOVE: no longer needed with EventStore
const webTransport = (session.transport as any)._webStandardTransport;
if (webTransport?._streamMapping?.has('_GET_stream')) {
  // ...
  webTransport._streamMapping.delete('_GET_stream');
}
```

Also remove the inline `send()` patch from `handleSessionRequest()` — it's now applied in `handleSessionReconnect()` via `applyOrphanedNotificationRedirect()`.

### Step 6: Update Client — Track Resumption Tokens

In `BrowserMcpClient`, track `Last-Event-ID` tokens as they arrive:

```typescript
// In connect(), after client.connect():
if (this.transport) {
  this.transport.onresumptiontoken = (token: string) => {
    sessionStorage.setItem('mcp_get_stream_token', token);
  };
}
```

### Step 7: Update Client — Reconnect with Last-Event-ID

Rewrite `reconnect()` to use the custom header approach + resumption tokens:

```typescript
async reconnect(serverUrl: string): Promise<boolean> {
  const storedSessionId = localStorage.getItem('mcp_session_id');
  if (!storedSessionId) return false;

  try {
    this.setStatus('reconnecting', undefined, serverUrl);

    // Create OAuth provider if needed
    if (!this.oauthProvider || this.oauthProvider.serverUrl !== serverUrl) {
      this.oauthProvider = new BrowserOAuthClientProvider(serverUrl);
    }

    const tokens = this.oauthProvider.tokens();
    if (!tokens?.access_token) {
      localStorage.removeItem('mcp_session_id');
      return false;
    }

    // Create transport WITH sessionId (tells SDK to skip init)
    this.transport = new StreamableHTTPClientTransport(
      new URL('/mcp', serverUrl),
      {
        sessionId: storedSessionId,
        requestInit: {
          headers: { 'Authorization': `Bearer ${tokens.access_token}` },
        },
      }
    );

    // Set up client + handlers
    this.setupClientAndHandlers();
    await this.client!.connect(this.transport);

    // Set protocol version (skipped during reconnection)
    if (this.transport.setProtocolVersion) {
      this.transport.setProtocolVersion('2025-11-25');
    }

    // Open GET SSE stream with Last-Event-ID for event replay
    const lastEventId = sessionStorage.getItem('mcp_get_stream_token');
    const transportAny = this.transport as any;
    transportAny._startOrAuthSse({
      resumptionToken: lastEventId || undefined,
      onresumptiontoken: (token: string) => {
        sessionStorage.setItem('mcp_get_stream_token', token);
      },
    }).catch((err: Error) => {
      console.warn('Failed to open SSE stream:', err);
    });

    // POST to server with session ID to "reconnect" (synthetic init response)
    // The server sees sessionId + initialize → returns synthetic response
    // (handled by handleSessionReconnect)

    this.setStatus('connected', undefined, undefined, true);
    return true;
  } catch (error) {
    console.error('Reconnect failed:', error);
    localStorage.removeItem('mcp_session_id');
    this.setStatus('disconnected');
    return false;
  }
}
```

### Step 8: Clean Up EventStore on Session Expiry

In `startGracePeriod()`, call `session.eventStore.cleanup()` or delete the event store when the session is cleaned up. This already happens implicitly when `delete sessions[sessionId]` removes the reference.

---

## Patch Summary

| Component | 778 (old) | 778b (this spec) |
|---|---|---|
| **Server: EventStore** | None | Custom `SessionEventStore` (public SDK interface) |
| **Server: Transport recreation** | Close old + create new transport | Keep old transport (no recreation) |
| **Server: `_GET_stream` cleanup** | Patch: delete from private `_streamMapping` | Eliminated (Last-Event-ID bypasses 409) |
| **Server: `send()` redirect** | Patch: monkey-patch in GET handler | Patch: same logic, applied in reconnect handler |
| **Server total patches** | 2 private SDK access points | 1 private SDK access point (send redirect) |
| **Client: `_startOrAuthSse()`** | Call private method | Call private method (with resumption token) |
| **Client: `setProtocolVersion()`** | Call after reconnect | Call after reconnect |
| **Client: Resumption tokens** | None | Track via `onresumptiontoken`, persist to `sessionStorage` |
| **Client total patches** | 2 private SDK access points | 2 private SDK access points |

Net improvement: **Server goes from 2 SDK hacks to 1**, gains event replay capability, and aligns with the MCP Resumability spec.

---

## Future Work

### Eliminate the Last Server Patch

The `send()` redirect (patch #1 on server) could be eliminated if the client tracked per-POST-stream resumption tokens. On reconnect, the client would call `transport.resumeStream(postStreamToken)` for each in-flight tool call, which would replay events from the POST stream via EventStore. This is more complex on the client side but would make the server **fully standards-compliant with zero patches**.

### SDK Contributions

- Report the reconnection gap (no official solution for page-refresh reconnection) as an SDK issue
- If Issue #943 is fixed, switch from custom `SessionEventStore` to `InMemoryEventStore`

---

## Questions

1. **Should we track per-POST-stream resumption tokens to eliminate the last server patch?** This adds client complexity (tracking N in-flight requests) but makes the server fully clean. Recommendation: defer to a future spec unless it's straightforward.

2. **Should EventStore have a TTL or max-events cap?** Current design uses `cleanup(maxEvents)` called manually. Could add automatic cleanup on a timer tied to the session reaper.

3. **Is the synthetic init response (Step 3) the right approach?** An alternative is the "custom header" approach from spec 778 discussion: transport created WITHOUT sessionId but with `x-mcp-reconnect-session` header, so the SDK runs full init normally. This eliminates client patches 1 and 2 (setProtocolVersion, _startOrAuthSse) but adds server-side header inspection. Worth exploring as an add-on.
