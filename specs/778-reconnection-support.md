# 778 — Session Reconnection on Page Refresh

## Problem

When a participant refreshes the Cascade page while a tool is running, they lose their session entirely. The page "completely exits them out" — they see no tool results and must start a new session from scratch.

## Root Cause

On page refresh:
1. The browser destroys the `StreamableHTTPClientTransport` (no close signal is sent to the server)
2. The old server-side session (transport + McpServer) stays alive in memory, orphaned
3. On reload, the client auto-reconnects using stored OAuth tokens but creates a **brand new session** via `client.connect()` → `initialize` POST
4. Any in-flight or completed tool results from the old session are lost — there's no way to "catch up"

## Solution Overview

We'll implement this in two phases:

**Phase 1 (Simple Reconnect):** Reconnect to the existing server session by preserving the `mcp-session-id` across page refresh. The session stays alive, tool calls work, and if a tool finishes *after* reconnect the result arrives normally. Any SSE notifications sent *during* the brief refresh window are lost — acceptable for an initial version.

**Phase 2 (Event Replay — future):** Add `EventStore` to buffer server-side events and replay missed notifications on reconnect via `Last-Event-ID`. This closes the gap of notifications lost during the refresh window.

### Key Constraint: Re-initialization Handling

The SDK's `StreamableHTTPServerTransport` **rejects** `initialize` requests on an already-initialized transport (`400: Server already initialized`). The `_initialized` flag is private with no public reset.

The solution is to **recreate the transport**: close the old (stale) transport and create a new `StreamableHTTPServerTransport` with the same `sessionId`, then connect the existing `McpServer` to it. The initialize request passes through the new transport normally — no synthetic response needed.

Additionally, three MCP SDK behaviors require workarounds for notifications to flow after reconnection (see Steps 2.5 and 3d):
1. The client SDK skips the `_startOrAuthSse()` call on reconnection (no GET SSE stream opens)
2. Stale `_GET_stream` entries can block new SSE connections with 409 Conflict
3. Tool notifications with `relatedRequestId` route to the dead POST stream instead of the standalone SSE

---

## Phase 1: Simple Session Reconnect

### Step 1: Session Grace Period on Server

Currently, `transport.onclose` immediately deletes the session. Change this to a delayed cleanup so the session stays alive during page refreshes.

**What to do:**
- In `mcp-service.ts`, replace the immediate cleanup in `transport.onclose` with a grace period:
  ```typescript
  const SESSION_GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 minutes

  transport.onclose = () => {
    if (transport.sessionId) {
      console.log(`  ⏳ Session ${transport.sessionId} transport closed, starting grace period`);
      startGracePeriod(transport.sessionId);
    }
  };
  ```

- **`transport.onclose` behavior on browser disconnect:** The SDK's `StreamableHTTPServerTransport` only calls `onclose` when `transport.close()` is explicitly invoked (e.g., via a DELETE request). When the browser refreshes, the SSE connection drops — Node's `ServerResponse` emits `close`, `@hono/node-server` calls `reader.cancel()`, and the SDK's `ReadableStream.cancel()` callback fires. But that callback **only** removes the individual stream from `_streamMapping`; it does **not** call `transport.close()` or `onclose`. This is by design for the Streamable HTTP transport — unlike the old SSE transport (which listened for `res.on('close')` and triggered `onclose` immediately), the Streamable HTTP transport is request-based and expects sessions to persist across disconnected streams.

  **Pre-existing behavior:** The current code (before this spec) sets `transport.onclose` to delete the session immediately, but `onclose` rarely fires in practice — only on explicit DELETE. So orphaned sessions already accumulate. This hasn't mattered much because (a) the server gets restarted during development and (b) without reconnection support, orphaned sessions hold no useful state.

  **What this spec adds:** Since we're now intentionally keeping sessions alive for reconnection, we need explicit orphan cleanup. Add a **session reaper** with `lastActivityTimestamp` tracking:

  ```typescript
  // SessionData gains two new fields:
  interface SessionData {
    transport: StreamableHTTPServerTransport;
    mcpServer: McpServer;
    lastActivityAt: number;          // Date.now() — updated on every POST/GET
    graceTimer?: ReturnType<typeof setTimeout>;
  }

  function startGracePeriod(sessionId: string) {
    const session = sessions[sessionId];
    if (!session) return;
    session.graceTimer = setTimeout(() => {
      if (sessions[sessionId]) {
        console.log(`  🗑️ Grace period expired, cleaning up session: ${sessionId}`);
        delete sessions[sessionId];
        clearAuthContext(sessionId);
      }
    }, SESSION_GRACE_PERIOD_MS);
  }

  // Reaper: detect sessions with no recent activity and start grace periods.
  // This catches browser-refresh orphans where transport.onclose never fires.
  const SESSION_REAPER_INTERVAL_MS = 60 * 1000; // check every minute
  const SESSION_IDLE_THRESHOLD_MS = 2 * 60 * 1000; // 2 min without activity
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (!session.graceTimer && (now - session.lastActivityAt) > SESSION_IDLE_THRESHOLD_MS) {
        console.log(`  🧹 Reaper: session ${sessionId} idle for >2min, starting grace period`);
        startGracePeriod(sessionId);
      }
    }
  }, SESSION_REAPER_INTERVAL_MS);
  ```

- Update `lastActivityAt` in both `handleExistingSession()` and `handleSessionRequest()` (GET/DELETE handler) so active sessions are never reaped.

**How to verify:**
- Connect from the browser, note the session ID in server logs
- Refresh the page — the reaper should detect the orphaned session within ~1 minute and start a grace period
- If the client reconnects before the grace period expires, Step 2 cancels the timer
- If no reconnect, the session is cleaned up after 10 minutes

### Step 2: Recreate Transport for Existing Sessions on Re-initialization

When a reconnecting client POSTs an `initialize` request with a `mcp-session-id` that maps to an existing session, the server must create a **new transport** (the old one's internal state is stale) while preserving the existing `McpServer` instance.

**Why not a synthetic response?** The original design proposed returning a fake initialize response and keeping the old transport. This doesn't work because the old transport's internal state (`_streamMapping`, `_requestToStreamMapping`, etc.) references dead streams from the pre-refresh browser. The SDK needs a fresh transport to properly handle new GET/POST requests.

**What to do:**
- Refactor `handleMcpPost`'s branching into clearly named helper functions, and reorder so the reconnect intercept is checked first. The new branching structure:
  ```typescript
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  const method = req.body?.method;

  if (sessionId && sessions[sessionId] && method === 'initialize') {
    return handleSessionReconnect(req, res, sessionId, sessions[sessionId]);
  }
  if (sessionId && sessions[sessionId]) {
    return handleExistingSession(req, res, sessionId, sessions[sessionId]);
  }
  if (!sessionId && method === 'initialize') {
    return handleNewSession(req, res);
  }
  return handleInvalidRequest(res);
  ```

- `handleSessionReconnect()` — closes the old transport and creates a new one with the same session ID:
  ```typescript
  async function handleSessionReconnect(req, res, sessionId, session) {
    console.log(`  🔄 Reconnecting to existing session: ${sessionId}`);
    
    // Cancel any pending grace period timer (see Step 1)
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

    // Close old transport (SSE connection is stale after page refresh)
    await session.transport.close().catch((err) => {
      console.warn(`Failed to close old transport: ${err}`);
    });

    // Create a new transport with the same sessionId
    const newTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId, // Reuse existing sessionId!
      onsessioninitialized: (sid) => {
        sessions[sid].transport = newTransport;
        sessions[sid].lastActivityAt = Date.now();
      },
    });

    // Set up onclose handler for grace period
    newTransport.onclose = () => {
      startGracePeriod(sessionId);
    };

    // Connect the EXISTING MCP server to the NEW transport
    // This is the key: we keep the McpServer (with its registered tools) but give it
    // a fresh transport that can handle new HTTP requests
    await session.mcpServer.connect(newTransport);
    sessions[sessionId].transport = newTransport;

    // Handle the initialize request through the new transport (real response, not synthetic)
    await newTransport.handleRequest(req, res, req.body);
  }
  ```

- `handleExistingSession()` — the current session-reuse logic (moved from inline)
- `handleNewSession()` — the current new-initialization logic (moved from inline)
- `handleInvalidRequest()` — the current error response (moved from inline)

**How to verify:**
- Connect, note the session ID
- Using curl or the browser, POST an `initialize` request with the same `mcp-session-id` header
- Verify the server returns capabilities (not a 400 "already initialized" error)
- Verify a subsequent `tools/list` POST with the same session ID works

### Step 2.5: Patch GET SSE Handler for Reconnection

After transport recreation (Step 2), the client will open a GET SSE stream for server→client notifications. Two SDK-level issues must be fixed in `handleSessionRequest()` for GET requests:

**Problem A — Stale `_GET_stream` causes 409 Conflict:** When the browser refreshes, the old `ReadableStream`'s `cancel()` callback may not fire before the new GET arrives. The leftover `_GET_stream` entry in `_streamMapping` causes the SDK to reject the new stream with 409.

**Problem B — Notifications routed to dead POST stream:** The SDK's `send()` method routes notifications with `relatedRequestId` to the POST response SSE stream that started the `tools/call`. After a page refresh, that POST stream is dead (browser killed the fetch), but the tool keeps sending notifications targeting it. The SDK silently drops them — they never reach the standalone GET SSE stream.

**What to do:**

In `handleSessionRequest()`, add this block inside the `if (req.method === 'GET')` check, before calling `transport.handleRequest()`:

```typescript
if (req.method === 'GET') {
  // Access the inner WebStandardStreamableHTTPServerTransport
  const webTransport = (session.transport as any)._webStandardTransport;

  // Problem A: Clear stale _GET_stream before accepting new SSE connection
  if (webTransport?._streamMapping?.has('_GET_stream')) {
    const oldStream = webTransport._streamMapping.get('_GET_stream');
    try { oldStream?.controller?.close(); } catch { /* already closed */ }
    webTransport._streamMapping.delete('_GET_stream');
  }

  // Problem B: Patch send() to redirect orphaned notifications to standalone SSE.
  // Applied once per session (guarded by _reconnectSendPatched flag).
  if (webTransport && !webTransport._reconnectSendPatched) {
    const originalSend = webTransport.send.bind(webTransport);
    webTransport.send = async (message: any, options?: any) => {
      const relatedId = options?.relatedRequestId;
      if (relatedId !== undefined) {
        const streamId = webTransport._requestToStreamMapping?.get(relatedId);
        const stream = streamId ? webTransport._streamMapping?.get(streamId) : undefined;
        if (!stream?.controller) {
          // Target POST response stream is dead (page refresh killed it)
          if (message.id === undefined) {
            // Notification → redirect to standalone SSE (strip relatedRequestId)
            return originalSend(message);
          } else {
            // Response → silently drop (client is gone) and clean up mappings
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
  }
}

await session.transport.handleRequest(req, res);
```

**SDK internals referenced:**
- `_streamMapping`: `Map<string, { controller, readableStreamId }>` — maps stream IDs to open SSE streams
- `_GET_stream` / `_standaloneSseStreamId`: The key used for the standalone GET SSE stream
- `_requestToStreamMapping`: `Map<RequestId, StreamId>` — maps JSON-RPC request IDs to the stream that handles them
- `_requestResponseMap`: `Map<RequestId, ...>` — tracks pending request-response pairs
- `send(message, options?)`: When `options.relatedRequestId` is set, routes to the POST stream; when absent, routes to standalone SSE

**How to verify:**
- Connect, start a long-running tool (e.g., `utility-notifications` which sends 1 notification/second for 60s)
- Wait for a few notifications to arrive
- Refresh the page
- After reconnection, check browser console for notifications continuing to arrive
- Check server logs for `🔧 Patched transport.send()` confirming the patch was applied
- If 409 Conflict appears in server logs, the stale `_GET_stream` cleanup isn't working

### Step 3: Persist Session ID and Reconnect on the Client

The browser client needs to save the `mcp-session-id` to `localStorage` so it survives a refresh, and implement a `reconnect()` method that handles three MCP SDK limitations.

**What to do:**

**3a. Persist session ID in `connect()`:**
- In `BrowserMcpClient.connect()` (`src/mcp-client/client.ts`), after `client.connect(transport)` succeeds:
  ```typescript
  const sessionId = this.transport.sessionId; // Public getter
  if (sessionId) {
    localStorage.setItem('mcp_session_id', sessionId);
  }
  ```
- Also persist the server URL: `localStorage.setItem('mcp_last_server_url', serverUrl)`

**3b. Clear session ID in `disconnect()`:**
- Add `clearSession` option to `disconnect()`. Only clear `mcp_session_id` when explicitly requested (user-initiated disconnect), NOT on page unmount:
  ```typescript
  async disconnect(options: { clearSession?: boolean } = {}): Promise<void> {
    if (this.transport) { await this.transport.close(); this.transport = null; }
    this.client = null;
    if (options.clearSession) {
      localStorage.removeItem('mcp_session_id');
    }
    this.setStatus('disconnected');
  }
  ```

**3c. Extract shared `setupClientAndHandlers()` helper:**
- Extract Client creation and handler wiring from `connect()` into a reusable method used by both `connect()` and `reconnect()`:
  ```typescript
  private setupClientAndHandlers(): void {
    this.client = new Client(
      { name: 'cascade-mcp-browser-client', version: '1.0.0' },
      { capabilities: { sampling: {} } }
    );

    (this.client as any).fallbackNotificationHandler = (notification: ServerNotification) => {
      for (const handler of this.notificationHandlers) {
        try { handler(notification); } catch (e) { console.error('Notification handler error:', e); }
      }
    };

    if (this.samplingProvider) {
      this.setupSamplingHandler();
    }
  }
  ```

**3d. Implement `reconnect()` method:**

```typescript
async reconnect(serverUrl: string): Promise<boolean> {
  const storedSessionId = localStorage.getItem('mcp_session_id');
  if (!storedSessionId) return false;

  try {
    this.setStatus('reconnecting', undefined, serverUrl);

    // Create OAuth provider if needed (fresh instance after page refresh)
    if (!this.oauthProvider || this.oauthProvider.serverUrl !== serverUrl) {
      this.oauthProvider = new BrowserOAuthClientProvider(serverUrl);
    }

    // Read tokens directly — no auth() flow, no redirect risk
    const tokens = this.oauthProvider.tokens();
    if (!tokens?.access_token) {
      localStorage.removeItem('mcp_session_id');
      return false;
    }

    // Create transport with stored session ID
    this.transport = new StreamableHTTPClientTransport(
      new URL('/mcp', serverUrl),
      {
        sessionId: storedSessionId,
        requestInit: {
          headers: { 'Authorization': `Bearer ${tokens.access_token}` },
        },
      }
    );

    // Set up client + handlers (shared helper with connect())
    this.setupClientAndHandlers();

    // client.connect() with a pre-set sessionId triggers an MCP SDK behavior:
    // "When transport sessionId is already set this means we are trying to reconnect.
    //  In this case we don't need to initialize again."
    // (See @modelcontextprotocol/sdk/client/index.js, lines 286-289)
    //
    // This means the SDK skips sending notifications/initialized, which means
    // _startOrAuthSse() is never called, which means no GET SSE stream opens.
    // We fix this below.
    await this.client!.connect(this.transport);

    // FIX 1: Set protocol version (normally set during initialization, which was skipped).
    // The server requires mcp-protocol-version header on GET requests.
    if (this.transport.setProtocolVersion) {
      this.transport.setProtocolVersion('2025-11-25');
    }

    // FIX 2: Manually open the GET SSE stream for server→client notifications.
    // The SDK only opens this automatically when it sends notifications/initialized
    // (which is skipped on reconnection). Without this, no notifications arrive.
    // Use fire-and-forget (not await) — this matches how the SDK does it internally.
    // The SSE fetch is long-lived and never resolves until the stream closes.
    const transportAny = this.transport as any;
    if (typeof transportAny._startOrAuthSse === 'function') {
      transportAny._startOrAuthSse({ resumptionToken: undefined }).catch((err: Error) => {
        console.warn('Failed to open SSE stream:', err);
      });
    }

    // Update persisted session ID (should be the same, but just in case)
    const sessionId = this.transport.sessionId;
    if (sessionId) {
      localStorage.setItem('mcp_session_id', sessionId);
    }

    this.setStatus('connected', undefined, undefined, true); // wasReconnected = true
    return true;
  } catch (error) {
    console.error('Reconnect failed:', error);
    localStorage.removeItem('mcp_session_id');
    this.setStatus('disconnected');
    return false;
  }
}
```

**Key SDK behaviors that `reconnect()` must work around:**

1. **`Client.connect()` skips init when `sessionId` is pre-set** — The SDK deliberately doesn't re-initialize on reconnection. This is correct (the server session is already alive) but has the side effect of never opening the GET SSE stream.

2. **`protocolVersion` is only set during initialization** — The transport uses this for the `mcp-protocol-version` header on GET requests. Without it, the GET request may fail.

3. **`_startOrAuthSse()` is only called from initialization flow** — This private method opens the standalone GET SSE stream. It must be called manually after reconnection.

**How to verify:**
- Connect, check `localStorage` — `mcp_session_id` should be present
- Refresh the page, check that `reconnect()` is called and succeeds
- Verify `listTools()` returns the same tools as before the refresh
- Start a tool that sends notifications, refresh mid-execution, verify notifications continue in browser console

### Step 4: Update the React Hook for Reconnection Flow

Update `useMcpClient.ts` to try reconnection before creating a new session on refresh.

**What to do:**
- In the `useEffect` auto-reconnect block (the `else` branch checking `mcp_last_server_url`):
  ```typescript
  // Try to reconnect to existing session first
  const reconnected = await clientRef.current.reconnect(storedUrl);
  if (reconnected) {
    console.log('[useMcpClient] 🔄 Reconnected to existing session!');
    const toolList = await clientRef.current.listTools();
    setTools(toolList);
    return;
  }
  // Fall back to new session
  await clientRef.current.connect(storedUrl);
  ```
- Add a `'reconnecting'` status to the `ConnectionStatus` type so the UI can show appropriate feedback (e.g., "Reconnecting to session...")

**How to verify:**
- Connect, start a long-running tool, refresh the page
- Console logs should show "Reconnected to existing session"
- The tool list should load without requiring a new OAuth flow
- If the server was restarted (no session exists), it should fall back to a fresh connection seamlessly

### Step 5: Persist and Restore Tool Results in the UI

Even with session reconnection, the React state (`result`, `logs`) is lost on refresh. Persist them so the user sees results immediately while reconnection happens.

**What to do:**
- In `App.tsx`, save `result` and `logs` to `sessionStorage` whenever they change:
  ```typescript
  useEffect(() => {
    if (result !== null) {
      sessionStorage.setItem('mcp_last_result', JSON.stringify(result));
      sessionStorage.setItem('mcp_last_tool', selectedTool?.name || '');
    }
  }, [result]);
  ```
- On mount, restore from `sessionStorage` so the user sees the last result immediately
- Clear `sessionStorage` on explicit disconnect

**How to verify:**
- Call a tool, see the result, refresh the page
- Result should appear immediately from `sessionStorage`
- If a tool was running during refresh and finishes after reconnect, the new result arrives normally via the reconnected session's SSE stream

---

## Phase 2: Event Replay (Future)

Phase 1 loses any SSE notifications sent during the brief refresh window (~1-2 seconds). Phase 2 closes that gap.

### Step 6: Create an In-Memory Event Store

**What to do:**
- Create `server/mcp-core/event-store.ts` implementing the SDK's `EventStore` interface
- Methods: `storeEvent(streamId, message)`, `replayEventsAfter(lastEventId, { send })`
- Add `cleanup(maxAgeMs)` to evict old events

### Step 7: Enable EventStore on Server Transports

**What to do:**
- Pass `eventStore` to each `StreamableHTTPServerTransport` constructor
- Each session gets its own `EventStore` instance

### Step 8: Client Event Replay on Reconnect

**What to do:**
- Track last event ID client-side via `onresumptiontoken` callback, persist to `localStorage`
- After reconnect, call `transport.resumeStream(lastEventId)` to replay missed events

### Step 9: Event Store Cleanup

**What to do:**
- Periodic cleanup (every 5 min) to remove events older than 10 min
- Delete event store when session grace period expires

---

## Questions

1. Is 5 minutes a good grace period for session keep-alive? Given this is used during live demos, should it be longer (e.g., 15 minutes)?

10 min

2. Should the `result` and `logs` persistence (Step 5) use `sessionStorage` (scoped to the tab, gone when tab closes) or `localStorage` (persists across tabs and browser restarts)?

localStorage

3. Should we also handle the case where the **server** restarts mid-tool-call? That's a different (harder) problem — the session and all in-memory state are lost. The current fallback (new session) is the only option there. Just confirming that's out of scope.

Out of scope


4. **Step 2 branching conflict:** The spec says to add the reconnect intercept branch with the condition `sessionId && sessions[sessionId] && req.body?.method === 'initialize'`. But the **existing first branch** in `handleMcpPost` already matches `sessionId && sessions[sessionId]` — it catches *all* requests with a valid session ID, including `initialize`. So the reconnect branch would never fire unless it's placed **before** the existing reuse branch. The spec says "add a new branch **before** the existing session-reuse and new-initialization branches" but the code example's `if` condition doesn't make it clear that this changes the existing `if/else if/else` ordering. Should we restructure the branching to: (1) reconnect intercept (`sessionId && sessions[sessionId] && method === 'initialize'`), (2) normal reuse (`sessionId && sessions[sessionId]`), (3) new session (`!sessionId && method === 'initialize'`), (4) error?

Yes — put reconnect first. Refactor each branch into a named helper function (e.g. `handleSessionReconnect`, `handleExistingSession`, `handleNewSession`, `handleInvalidRequest`). Updated in Step 2.

5. **Synthetic response hardcodes capabilities:** ~~The original design proposed a synthetic initialize response with hardcoded capabilities.~~ This question is **resolved** — Step 2 now uses transport recreation instead of a synthetic response. The initialize request is handled by the SDK's real initialization flow through a fresh transport, so capabilities are always in sync.

6. **Step 3 uses private property `_sessionId`:** The spec accesses `(this.transport as any)._sessionId` to read the session ID. The SDK's `StreamableHTTPClientTransport` has `_sessionId` as a private field. The SDK *does* expose a public `sessionId` getter (confirmed in the type declarations). Should we use the public `this.transport.sessionId` instead?

Sounds like it. 

7. **Step 3's `reconnect()` re-runs `auth()` — is that necessary?** The spec says the reconnect method should "Run the OAuth `auth()` flow to get current tokens." But on a page refresh the tokens are already persisted in `localStorage` by `BrowserOAuthClientProvider`. The existing `connect()` method already calls `auth()` before creating the transport. Should `reconnect()` just read tokens directly from the OAuth provider (via `this.oauthProvider.tokens()`) instead of running the full `auth()` flow? That would avoid any risk of an unexpected redirect during reconnection.

Yes

8. **Step 3 doesn't set up notification/sampling handlers on `this.client`:** The spec says reconect should "Set up notification/sampling handlers as in normal `connect()`," but `reconnect()` creates only a new transport — it also needs to create a new `Client` instance (or reuse the old one) and wire up `fallbackNotificationHandler` and `setupSamplingHandler()`. The current `connect()` does all of this. Should `reconnect()` share a helper with `connect()` for the post-transport-creation setup, to avoid duplication?

Yes.  

9. **Grace period timer is not cancelled on reconnection:** Step 1 starts a `setTimeout` for cleanup but Step 2 doesn't cancel the timer. If a client reconnects at minute 4, the timer fires at minute 5 and deletes the session out from under the active connection. The spec should store the timer ID and clear it in Step 2 when a reconnect arrives.

Yes, sounds right. 

10. **`disconnect()` should clear `mcp_session_id` from localStorage:** Step 3 mentions this ("On `disconnect()`, clear `mcp_session_id` from `localStorage`") but doesn't show the code. Wanting to confirm — should we also clear it in `clearTokens()` since that's called from the hook's `disconnect` callback?


Yes, we shoudl clear. 

11. **Step 4 auto-reconnect block currently creates a new `BrowserMcpClient`:** In `useMcpClient.ts`, the `useEffect` on mount creates a fresh `clientRef.current = new BrowserMcpClient()` and then enters the auto-reconnect path. The spec's `reconnect()` method needs `this.oauthProvider` to exist (set by a prior `connect()` call). On a fresh client instance after refresh, `oauthProvider` is null. Should `reconnect()` handle creating the OAuth provider internally (using the stored server URL), or should the hook call `connect()` first and then `reconnect()`?

`reconnect()` creates the OAuth provider itself. After a page refresh, `oauthProvider` is null. The provider reads tokens from `localStorage` (keyed by server URL), so they survive the refresh. See Step 3d for the complete `reconnect()` implementation which also addresses Q7 (read tokens directly, no `auth()`) and Q8 (shared `setupClientAndHandlers()` helper).



12. **Step 5 persists `result` (tool output) but this can be very large:** Some tools return 100KB+ of content. Is there a concern about `sessionStorage` size limits or serialization cost? Should we cap what's stored, or only store a flag indicating "result available" and re-fetch via the reconnected session?

We don't have that many tools. Not worried about it for now.  We can refetch it easily enough. 

13. **`transport.onclose` may not fire on page refresh.** The root cause section says "The browser destroys the `StreamableHTTPClientTransport` (no close signal is sent to the server)." If `onclose` doesn't fire, the grace period timer from Step 1 is never started either — the orphaned session just lives forever. Is the assumption that the SSE connection drop will trigger `onclose` on the server side? If so that's fine, but it should be stated explicitly.

Confirmed after SDK source inspection: `transport.onclose` does **not** fire on browser disconnect. The chain is: Node.js `ServerResponse` emits `close` → `@hono/node-server` calls `reader.cancel()` → SDK's `ReadableStream.cancel()` removes the stream from `_streamMapping` — but never calls `transport.close()` or `onclose`. This is by design for the Streamable HTTP transport (request-based, not connection-based). The old SSE transport (`sse.js`) *did* listen for `res.on('close')` and call `onclose` directly, but the newer Streamable HTTP transport doesn't. This is a pre-existing orphaned-session issue. Solution: use a `lastActivityAt`-based session reaper (updated in Step 1).



14. **Multiple tabs / duplicate sessions:** If a user has two tabs open and refreshes one, each tab would try to reconnect to the same stored `mcp_session_id`. The second tab's `connect()` could race with the first's reconnect. Is multi-tab considered out of scope?

Out of scope. 
