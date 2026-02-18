# 778c — Standards-Based Browser Reconnection

## Problem

When a user refreshes the browser during a long-running MCP tool execution (e.g., `write-shell-stories` which takes 30-60+ seconds), they lose everything:

1. The SSE stream carrying progress notifications is destroyed
2. The in-memory MCP client, transport, and all JS state are gone
3. The final tool result — which may arrive seconds after refresh — is lost
4. The user must start over from scratch

The old spec (778) proposed a solution involving heavy SDK private-property patching (`_webStandardTransport`, `_streamMapping`, `_GET_stream`, monkey-patching `send()`). While it worked, it was fragile and would break on SDK updates.

## Goal

Implement browser reconnection using **only standards-based mechanisms** already built into the MCP specification and SDK:

| Mechanism | Standard | Status |
|-----------|----------|--------|
| `EventStore` with event IDs | MCP Spec §Resumability | ✅ Already implemented (778 Phase 3) |
| `Last-Event-ID` on GET reconnection | SSE spec / MCP §Resumability | ✅ SDK handles server-side |
| `sessionId` on transport constructor | SDK public API | ✅ Available |
| `onresumptiontoken` callback | SDK public API | ✅ Available |
| `Client.connect()` skip-init behavior | SDK public API | ✅ Built-in |
| `localStorage` for cross-refresh persistence | Web API | Standard browser API |

**No private SDK properties. No monkey-patching. No synthetic responses.**

## Key Constraint: Browser Refresh Destroys Everything

Unlike a network blip (where the SDK's built-in reconnection with backoff handles things automatically), a browser refresh:

- Destroys all JavaScript objects (Client, Transport, EventSource)
- Clears all in-memory state (callbacks, pending promises, event listeners)
- Cannot be intercepted reliably (`beforeunload` is limited and unreliable for async work)

The **only thing that survives** is what we explicitly persist to `localStorage` before the refresh happens. This means we must continuously persist reconnection state during normal operation — we cannot save it "on the way out."

## Architecture

### What Survives a Refresh (localStorage)

```
mcp_session_id     = "a1b2c3d4-..."     // Server session to reconnect to
mcp_last_event_id  = "stream123_42"      // Last SSE event received (for replay)
mcp_server_url     = "http://localhost:3000"  // Server URL
```

These are written **continuously** during normal operation, not on disconnect.

### What the Server Already Has (from 778 Phase 3)

- `InMemoryEventStore` — stores every SSE event with ID format `{streamId}_{seq}`
- `EventStore.replayEventsAfter(lastEventId)` — replays missed events to a new stream
- The SDK's `replayEvents()` method handles GET requests with `Last-Event-ID` header automatically

### Reconnection Sequence

```
Browser Refresh
     │
     ▼
Page loads, reads localStorage
     │ mcp_session_id = "abc123"
     │ mcp_last_event_id = "stream456_42"  
     │ mcp_server_url = "http://localhost:3000"
     │
     ▼
Create new StreamableHTTPClientTransport({
  sessionId: "abc123"        ← tells SDK this is a reconnection
})
     │
     ▼
new Client().connect(transport)
  → SDK sees sessionId is set
  → Skips initialize handshake (session already exists on server)
  → Does NOT open GET SSE stream (SDK limitation — see below)
     │
     ▼
Manually open GET SSE with Last-Event-ID header
  → GET /mcp with Last-Event-ID: "stream456_42"
  → Server calls eventStore.replayEventsAfter("stream456_42")
  → Missed events stream to new client
  → Stream stays open for future events
     │
     ▼
Tool finishes → result arrives on GET SSE stream
     │
     ▼
Client displays result ✅
```

### How Tool Results Arrive After Reconnection

This is the critical question: when a tool was invoked on the **old** POST stream (now dead), how does the result reach the **new** client via a GET stream?

**Answer: The SDK + EventStore handle this automatically.**

1. Tool sends result → SDK calls `transport.send(result, { relatedRequestId })` 
2. SDK looks up the POST stream for that `relatedRequestId` → it's dead (browser killed it)
3. SDK falls back: writes the event to the **standalone GET SSE stream** (if one exists)
4. EventStore captures the event regardless of stream health
5. If no GET stream exists yet (client still reconnecting), the event is stored
6. When the reconnected client opens GET with `Last-Event-ID`, EventStore replays it

**⚠️ This needs verification in the E2E test.** The SDK's fallback behavior for dead POST streams may vary. If the SDK does NOT fall back to the GET stream, we'll need the `send()` patch from spec 778. The E2E test is designed to validate this exact scenario.

## Server-Side Changes

### 1. Session Grace Period

Currently `transport.onclose` immediately deletes the session. We need sessions to survive long enough for reconnection.

**Key insight from 778 research**: `transport.onclose` does NOT fire on browser disconnect. The Streamable HTTP transport is request-based — when a browser SSE stream drops, the SDK only removes that stream from `_streamMapping`. It never calls `transport.close()` or `onclose`. So orphaned sessions already accumulate silently.

**Changes to `mcp-service.ts`:**

```typescript
interface SessionData {
  transport: StreamableHTTPServerTransport;
  mcpServer: McpServer;
  lastActivityAt: number;
}

const SESSION_IDLE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_REAPER_INTERVAL_MS = 60 * 1000;     // check every minute
```

- Add `lastActivityAt` to `SessionData`, update it on every POST/GET
- Add a session reaper interval that cleans up idle sessions
- This replaces the `onclose`-triggered cleanup (which rarely fires)

### 2. Transport Recreation for Re-initialization

When a reconnecting client sends `initialize` with an existing `mcp-session-id`, the server must create a **new transport** (the old one has stale stream references) while keeping the existing `McpServer`.

**New branch order in `handleMcpPost`:**

```typescript
if (sessionId && sessions[sessionId] && method === 'initialize') {
  return handleSessionReconnect(req, res, sessionId);
}
if (sessionId && sessions[sessionId]) {
  return handleExistingSession(req, res, sessionId);
}
if (!sessionId && method === 'initialize') {
  return handleNewSession(req, res);
}
return handleInvalidRequest(res);
```

**`handleSessionReconnect`:**
- Close old transport (stale streams)
- Create new `StreamableHTTPServerTransport` with same `sessionId` + fresh `EventStore`
- Connect existing `McpServer` to new transport
- Handle the `initialize` request through the new transport
- Update auth context with tokens from the reconnecting client

**Open question**: Should the new transport get a **fresh** EventStore or should we preserve events from the old one? Fresh is simpler — the client already has `Last-Event-ID` from before the disconnect, but events were stored in the old transport's EventStore. **If we use a fresh EventStore, replay won't work.** Options:
- (a) Share the EventStore instance across transport recreations (pass it from old to new)
- (b) Store EventStore on the session, not the transport
- (c) Accept that events during the disconnect gap are lost (Phase 1 behavior)

**Recommendation**: Option (b) — store EventStore on the session. The transport gets recreated, but the EventStore persists.

### 3. Event Store on Session (not Transport)

```typescript
interface SessionData {
  transport: StreamableHTTPServerTransport;
  mcpServer: McpServer;
  eventStore: InMemoryEventStore;  // Survives transport recreation
  lastActivityAt: number;
}
```

When creating a new transport (initial or reconnect), pass the session's EventStore:
```typescript
const eventStore = session?.eventStore || new InMemoryEventStore();
new StreamableHTTPServerTransport({
  sessionIdGenerator: () => sessionId,
  eventStore,
  ...
});
```

## Client-Side Changes

### 1. Persist Reconnection State Continuously

During normal operation, save state to `localStorage` on every event:

```typescript
// In BrowserMcpClient or equivalent

// After successful connect:
localStorage.setItem('mcp_session_id', transport.sessionId);
localStorage.setItem('mcp_server_url', serverUrl);

// On every SSE event (via onresumptiontoken):
transport.onresumptiontoken = (token: string) => {
  localStorage.setItem('mcp_last_event_id', token);
};
```

**`onresumptiontoken`** is the SDK's public callback that fires whenever an event with an ID is received. The token value is the event ID string. This is the correct, standards-based way to track resumption position.

### 2. Reconnect Method

```typescript
async reconnect(serverUrl: string): Promise<boolean> {
  const sessionId = localStorage.getItem('mcp_session_id');
  const lastEventId = localStorage.getItem('mcp_last_event_id');
  if (!sessionId) return false;

  // 1. Create transport with stored sessionId
  this.transport = new StreamableHTTPClientTransport(
    new URL('/mcp', serverUrl),
    {
      sessionId,  // Tells SDK this is a reconnection
      requestInit: {
        headers: { 'Authorization': `Bearer ${token}` },
      },
    }
  );

  // 2. Wire up onresumptiontoken to keep persisting
  this.transport.onresumptiontoken = (token: string) => {
    localStorage.setItem('mcp_last_event_id', token);
  };

  // 3. Create fresh Client and connect
  //    SDK sees transport.sessionId is set → skips initialize
  this.client = new Client(...);
  await this.client.connect(this.transport);

  // 4. Open GET SSE stream with Last-Event-ID for replay
  //    SDK skips _startOrAuthSse() on reconnection, so we call it manually
  if (lastEventId) {
    await this.transport.resumeStream(lastEventId);
  } else {
    // No event ID — just open a fresh GET SSE stream
    // Need to use _startOrAuthSse() as there's no public API for this
    (this.transport as any)._startOrAuthSse({}).catch(console.warn);
  }

  return true;
}
```

### 3. SDK Limitation: `Client.connect()` Skips SSE on Reconnection

When `transport.sessionId` is already set, the SDK's `Client.connect()`:
1. Opens the transport
2. Sends `initialize` request  
3. **But then skips** the `notifications/initialized` acceptance step  
4. Which means `_startOrAuthSse()` is never called  
5. Which means **no GET SSE stream opens**

This is by design in the SDK — it assumes reconnection is for network blips where the SSE stream will be re-established by the automatic retry logic. For a full browser refresh, we must manually open the SSE stream after `connect()`.

**Public API available**: `transport.resumeStream(lastEventId)` wraps `_startOrAuthSse({ resumptionToken: lastEventId })` and is a **public method**. However, if there's no `lastEventId` to resume from, there's no public API to open a plain GET SSE stream. In that case we'd need to call the private `_startOrAuthSse({})`.

**Alternative**: Always have a `lastEventId` by ensuring the server sends at least one event before any tool call. The `initialize` response itself gets an event ID from EventStore, so `lastEventId` should always be available after the first connection.

### 4. React Hook Integration

In `useMcpClient.ts`, on page load:

```typescript
useEffect(() => {
  const sessionId = localStorage.getItem('mcp_session_id');
  const serverUrl = localStorage.getItem('mcp_server_url');
  
  if (sessionId && serverUrl) {
    // Try reconnecting to existing session
    client.reconnect(serverUrl).then(success => {
      if (success) {
        // Reconnected — tool results will arrive on GET SSE
        setStatus('connected');
      } else {
        // Session is gone (server restarted?) — fresh connect
        localStorage.removeItem('mcp_session_id');
        client.connect(serverUrl);
      }
    });
  }
}, []);
```

### 5. Clear State on Explicit Disconnect

```typescript
async disconnect(): Promise<void> {
  localStorage.removeItem('mcp_session_id');
  localStorage.removeItem('mcp_last_event_id');
  // Keep mcp_server_url for convenience (auto-fill on next visit)
  await this.transport?.close();
  this.client = null;
  this.transport = null;
}
```

## E2E Test Plan

### Purpose

Validate the full reconnection flow end-to-end before implementing it in the browser client. The test simulates a browser refresh by completely destroying the MCP client and creating a new one from scratch — proving that reconnection works with only `sessionId` and `lastEventId` persisted.

### Test: `test/e2e/reconnection.test.ts`

Jest-based E2E test using the MCP SDK directly (no browser, no React) to isolate protocol behavior. Lives alongside the existing `api-workflow.test.ts` and uses the same `startTestServer` / `stopTestServer` helpers.

### Prerequisites

- `startTestServer()` helper (auto-starts the server)
- `/test/token` endpoint available (created in 778 Phase 1)
- `utility-notifications` tool registered (sends periodic notifications)

### Test Flow

```
┌─────────── Phase A: Initial Connection ───────────┐
│                                                     │
│  1. Fetch token from /test/token                    │
│  2. Create transport + client                       │
│  3. Connect (initialize handshake)                  │
│  4. Save sessionId                                  │
│  5. Wire onresumptiontoken → save lastEventId       │
│  6. Call utility-notifications (10s, 1000ms)        │
│  7. Receive ~3 notifications                        │
│  8. Record: sessionId, lastEventId, notification    │
│     count                                           │
│                                                     │
└─────────────────────┬───────────────────────────────┘
                      │
         ┌────────────▼────────────┐
         │  DESTROY EVERYTHING     │
         │  client = null          │
         │  transport = null       │
         │  (simulate refresh)     │
         │  Only keep: sessionId,  │
         │  lastEventId, token     │
         └────────────┬────────────┘
                      │
┌─────────── Phase B: Reconnection ─────────────────┐
│                                                     │
│  9. Wait 2 seconds (simulate page reload)           │
│ 10. Create NEW transport with saved sessionId       │
│ 11. Create NEW client                               │
│ 12. client.connect(transport) → SDK skips init(?)   │
│     ─── or ───                                      │
│     SDK sends init → server recreates transport     │
│ 13. Open GET SSE with Last-Event-ID                 │
│     → transport.resumeStream(lastEventId)           │
│ 14. Receive replayed events (missed during gap)     │
│ 15. Receive remaining live notifications            │
│ 16. Receive tool result                             │
│                                                     │
└─────────────────────┬───────────────────────────────┘
                      │
         ┌────────────▼────────────┐
         │  VALIDATE                │
         │  ✅ Got replayed events  │
         │  ✅ Got remaining live   │
         │     notifications        │
         │  ✅ Got final result     │
         │  ✅ No duplicate events  │
         │  ✅ Events in order      │
         └─────────────────────────┘
```

### Key Validation Points

1. **Session reuse**: The server doesn't create a new session — it reuses the existing one
2. **Event replay**: Events sent during the disconnect gap are replayed via `Last-Event-ID`
3. **Live events resume**: After replay, new events (tool still running) arrive normally
4. **Result delivery**: The tool result arrives on the reconnected stream
5. **No SDK private APIs**: Only `sessionId`, `resumeStream()`, and `onresumptiontoken` are used (plus `_startOrAuthSse` only if no `lastEventId` — see open question)

### Test Script Structure

```typescript
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startTestServer, stopTestServer } from '../../specs/shared/helpers/test-server.js';

const TOOL_DURATION_S = 10;
const TOOL_INTERVAL_MS = 1000;
const NOTIFICATIONS_BEFORE_DISCONNECT = 3;

describe('MCP Session Reconnection', () => {
  let serverUrl: string;

  beforeAll(async () => {
    serverUrl = await startTestServer({ port: 3000 });
  });

  afterAll(async () => {
    await stopTestServer();
  });

  test('reconnects after full client destruction and receives remaining events', async () => {
    // ─── Phase A: Connect and start tool ───
    const token = await fetchToken(serverUrl);
    const transport1 = createTransport(serverUrl, token);
    const client1 = new Client(...);

    let sessionId: string;
    let lastEventId: string;
    const phaseANotifications: any[] = [];

    transport1.onresumptiontoken = (t: string) => { lastEventId = t; };
    client1.fallbackNotificationHandler = (n: any) => phaseANotifications.push(n);

    await client1.connect(transport1);
    sessionId = transport1.sessionId!;

    // Call tool (don't await — it runs for TOOL_DURATION_S seconds)
    const toolPromise = client1.callTool({
      name: 'utility-notifications',
      arguments: {
        durationSeconds: TOOL_DURATION_S,
        intervalMs: TOOL_INTERVAL_MS,
        messagePrefix: 'reconnect-test',
      },
    });

    // Wait for some notifications
    await waitFor(() => phaseANotifications.length >= NOTIFICATIONS_BEFORE_DISCONNECT);

    console.log(`Phase A: ${phaseANotifications.length} notifications, ` +
                `sessionId=${sessionId}, lastEventId=${lastEventId}`);

    // ─── DESTROY (simulate browser refresh) ───
    await transport1.close();
    // client1, transport1, toolPromise — all gone after this scope

    // ─── Phase B: Reconnect ───
    await sleep(2000);

    const transport2 = createTransport(serverUrl, token, sessionId);
    const client2 = new Client(...);
    const phaseBNotifications: any[] = [];
    let result: any = null;

    transport2.onresumptiontoken = (t: string) => { lastEventId = t; };
    client2.fallbackNotificationHandler = (n: any) => phaseBNotifications.push(n);

    await client2.connect(transport2);

    // Resume stream with Last-Event-ID
    if (lastEventId) {
      await transport2.resumeStream(lastEventId);
    }

    // Wait for tool completion (result arrives via GET SSE)
    result = await waitForResult(TOOL_DURATION_S * 2 * 1000);

    // ─── VALIDATE ───
    expect(result).toBeTruthy();
    expect(phaseBNotifications.length).toBeGreaterThan(0);
    const total = phaseANotifications.length + phaseBNotifications.length;
    console.log(`Phase B: ${phaseBNotifications.length} notifications, total=${total}`);
  });
});
```

### Expected Outcomes and Decision Points

The test will reveal which of several paths the SDK takes. Here's what each outcome means for implementation:

| Scenario | What Happens | Implication |
|----------|-------------|-------------|
| **A: SDK skips init, `resumeStream` replays events** | Everything works with public API | 🎉 Cleanest path — no server changes needed beyond EventStore-on-session |
| **B: SDK sends init, server rejects with "already initialized"** | Need transport recreation on server (778 Step 2) | Server must handle re-init by recreating transport |
| **C: SDK sends init, tool result arrives on GET SSE** | Works, but need transport recreation | Server-side change + EventStore-on-session |
| **D: Tool result stuck on dead POST stream, never reaches GET** | SDK doesn't fall back to GET for related results | Need the `send()` patch from 778 Step 2.5 |
| **E: `resumeStream` not available or throws** | Public API doesn't work as expected | Fall back to `_startOrAuthSse()` (private but stable) |

**The test is the decision engine.** Rather than guessing which path the SDK takes, we run the test and let it tell us what works and what needs patching.

### How to Run

```bash
# Run just the reconnection test
npm run test:e2e -- --testPathPattern=reconnection

# Or run all E2E tests
npm run test:e2e
```

The test uses `startTestServer()` / `stopTestServer()` from `specs/shared/helpers/test-server.js` — no manual server start needed.

## Implementation Phases

### Phase 1: E2E Test (Validate Assumptions)

Write and run `test/e2e/reconnection.test.ts`. This tells us:
- Does `Client.connect()` with pre-set `sessionId` skip init or send init?
- Does `resumeStream(lastEventId)` replay missed events?
- Does the tool result arrive on the GET SSE stream?
- What server-side changes are actually needed?

**Deliverable**: Working Jest test in `test/e2e/reconnection.test.ts` + documented findings

### Phase 2: Server-Side Changes

Based on Phase 1 findings, implement the minimum server changes:

**Definitely needed:**
- [ ] Move EventStore from transport to session (survives transport recreation)
- [ ] Session reaper with `lastActivityAt` (replace `onclose`-based cleanup)

**Conditionally needed (if test reveals):**
- [ ] Transport recreation for re-initialization (if SDK sends init to existing session)
- [ ] `send()` fallback patch (if tool results don't reach GET stream — 778 Step 2.5)

### Phase 3: Browser Client Changes

Implement reconnection in the actual browser client:
- [ ] Persist `sessionId`, `lastEventId`, `serverUrl` to localStorage continuously
- [ ] `reconnect()` method on `BrowserMcpClient`
- [ ] React hook integration (try reconnect before fresh connect on page load)
- [ ] Clear localStorage on explicit disconnect

### Phase 4: UI Polish

- [ ] "Reconnecting..." status indicator
- [ ] Show notification count recovery ("Recovered 5 missed notifications")
- [ ] Handle reconnection failure gracefully (fall back to fresh connect)

## Differences from Spec 778

| Aspect | 778 (Old) | 778c (This Spec) |
|--------|-----------|-------------------|
| **Event replay** | Phase 2 (future) | Phase 1 (already done via EventStore) |
| **SDK patching** | Heavy (`_webStandardTransport`, `_streamMapping`, `send()` monkey-patch) | Minimal (only `_startOrAuthSse` if `resumeStream` unavailable) |
| **Transport recreation** | Required (Step 2) | Conditional (only if SDK sends init) |
| **GET stream fix** | Manual `_GET_stream` cleanup + `send()` redirect | `resumeStream()` / `_startOrAuthSse()` public API |
| **Approach** | Implementation-first, fix each issue as found | Test-first, let E2E test determine what's needed |
| **Session cleanup** | Grace period timer (fragile, `onclose` rarely fires) | Activity-based reaper (robust, doesn't depend on `onclose`) |

## Open Questions

1. **Does `Client.connect()` with pre-set `sessionId` actually skip init?** The SDK source suggests it does (lines 286-289 of `client/index.js`), but this needs E2E verification. If it does NOT skip, the server must handle re-initialization on an existing session.

2. **Does `resumeStream()` work as a public API?** The method exists in the SDK source, but it may have restrictions (e.g., only works if the transport was previously connected). The E2E test will validate.

3. **Where do tool results go when the POST stream dies?** This is THE critical question. Three possibilities:
   - (a) SDK queues the result and delivers it on the next available stream → ideal
   - (b) SDK falls back to the standalone GET SSE stream → works for us
   - (c) SDK drops the result silently → we need the `send()` patch from 778

4. **Should we attempt `beforeunload` persistence?** We could try to save state in `beforeunload` as a belt-and-suspenders approach, but `localStorage` writes during `beforeunload` are unreliable in some browsers. Since we persist continuously via `onresumptiontoken`, this is probably unnecessary.

5. **Multi-tab scenarios**: Out of scope. Two tabs sharing the same `mcp_session_id` in localStorage would conflict. Future work could use `BroadcastChannel` or tab-scoped keys.
