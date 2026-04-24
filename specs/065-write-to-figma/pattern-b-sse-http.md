# Pattern B: SSE + HTTP POST

> **Status: STRONG ALTERNATIVE** — Use when WebSocket connections are unreliable (corporate proxies, firewalls).

---

## Overview

The Figma plugin opens a **Server-Sent Events (SSE)** connection to receive commands from the server, and sends results back via **HTTP POST**. This is the same transport pattern cascade-mcp already uses for MCP communication.

```
┌─────────────┐         ┌──────────────────┐         ┌────────────────┐         ┌──────────────┐
│  MCP Client │  HTTP   │   cascade-mcp     │ SSE←    │  Figma Plugin  │  post   │ Plugin Worker │
│ (VS Code)   │◄──────►│  (remote server)  │ POST→   │  UI (iframe)   │◄──────►│  (code.js)    │
└─────────────┘ /mcp    └──────────────────┘         └────────────────┘  Msg    └──────────────┘
```

**Key difference from Pattern A:** Instead of a single bidirectional WebSocket, Pattern B uses two unidirectional channels:
- **SSE** (Server → Plugin): Server pushes commands to the plugin
- **HTTP POST** (Plugin → Server): Plugin sends results back

---

## How It Works

### 1. Plugin Manifest

```json
{
  "name": "Cascade Figma Bridge",
  "networkAccess": {
    "allowedDomains": [
      "https://cascade-mcp.example.com"
    ],
    "devAllowedDomains": [
      "http://localhost:3000"
    ]
  }
}
```

Note: Only `https://` needed (no `wss://`).

### 2. Connection Flow

```
Plugin UI opens SSE connection:
  const eventSource = new EventSource('https://cascade-mcp.example.com/figma-bridge/events?pairingCode=A7K3M2');

Server receives SSE connection:
  Stores connection with pairing code
  Sends keepalive pings every 30s

User enters pairing code in MCP client:
  Server links MCP session → SSE connection

Server sends command via SSE:
  event: command
  data: {"id":"cmd_42","method":"SET_NODE_FILLS","params":{...}}

Plugin executes command, POSTs result:
  fetch('https://cascade-mcp.example.com/figma-bridge/result', {
    method: 'POST',
    body: JSON.stringify({ id: "cmd_42", result: { success: true } })
  });
```

### 3. Plugin Events (Selection, Document Changes)

Plugin also POSTs events to the server:

```javascript
// Plugin detects selection change → POST to server
fetch('https://cascade-mcp.example.com/figma-bridge/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
  body: JSON.stringify({ type: 'SELECTION_CHANGE', data: { nodes: [...] } })
});
```

---

## Server-Side Implementation

### SSE Endpoint: `GET /figma-bridge/events`

```typescript
app.get('/figma-bridge/events', (req, res) => {
  const { pairingCode } = req.query;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Store SSE connection
  pendingPairings.set(pairingCode, { res, pairingCode, connectedAt: new Date() });
  
  // Keepalive
  const keepalive = setInterval(() => res.write(': keepalive\n\n'), 30000);
  
  req.on('close', () => {
    clearInterval(keepalive);
    pendingPairings.delete(pairingCode);
  });
});
```

### Sending Commands via SSE

```typescript
function sendCommand(sessionId: string, method: string, params: any): Promise<any> {
  const session = pairedSessions.get(sessionId);
  const id = `cmd_${++counter}_${Date.now()}`;
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 15000);
    session.pendingRequests.set(id, { resolve, reject, timeout });
    
    // Send via SSE
    session.sseResponse.write(`event: command\ndata: ${JSON.stringify({ id, method, params })}\n\n`);
  });
}
```

### Result Endpoint: `POST /figma-bridge/result`

```typescript
app.post('/figma-bridge/result', (req, res) => {
  const { id, result, error } = req.body;
  const sessionToken = req.headers['x-session-token'];
  
  const session = findSessionByToken(sessionToken);
  if (!session) return res.status(401).end();
  
  const pending = session.pendingRequests.get(id);
  if (pending) {
    clearTimeout(pending.timeout);
    session.pendingRequests.delete(id);
    if (error) pending.reject(new Error(error));
    else pending.resolve(result);
  }
  
  res.status(200).end();
});
```

---

## Plugin Implementation

### ui.html

```html
<script>
  const SERVER = 'https://cascade-mcp.example.com';
  let pairingCode = generatePairingCode();
  let sessionToken = null;
  
  // Open SSE connection
  const eventSource = new EventSource(`${SERVER}/figma-bridge/events?pairingCode=${pairingCode}`);
  
  eventSource.addEventListener('command', async (event) => {
    const { id, method, params } = JSON.parse(event.data);
    
    try {
      const result = await handleCommand(method, params);
      // POST result back
      await fetch(`${SERVER}/figma-bridge/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
        body: JSON.stringify({ id, result })
      });
    } catch (error) {
      await fetch(`${SERVER}/figma-bridge/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
        body: JSON.stringify({ id, error: error.message })
      });
    }
  });
  
  eventSource.addEventListener('paired', (event) => {
    const data = JSON.parse(event.data);
    sessionToken = data.sessionToken;
    updateStatus('Connected ✓');
  });
  
  eventSource.onerror = () => {
    updateStatus('Reconnecting...');
    // EventSource auto-reconnects
  };
</script>
```

---

## Advantages

| Advantage | Detail |
|-----------|--------|
| **Proxy-friendly** | SSE is standard HTTP — passes through most corporate proxies and firewalls |
| **Auto-reconnect** | `EventSource` has built-in reconnection with `Last-Event-ID` |
| **Simple server** | No WebSocket upgrade needed; works with any HTTP server |
| **Familiar pattern** | cascade-mcp already uses SSE for MCP transport |
| **No special infra** | Works on any hosting that supports long-lived HTTP connections |

## Disadvantages

| Disadvantage | Impact |
|-------------|--------|
| **Higher latency** | Each result requires a separate HTTP POST (~100ms overhead) |
| **Not truly bidirectional** | Plugin events require separate POST calls |
| **Connection limits** | Browsers limit ~6 SSE connections per domain (shared across tabs) |
| **No binary data** | SSE is text-only; screenshots need base64 encoding |
| **Two channels to manage** | SSE + POST vs single WebSocket |

---

## When to Use Pattern B

- Corporate environments where WebSocket connections are blocked/unreliable
- When hosting doesn't support WebSocket upgrades (some serverless platforms)
- As an automatic fallback when Pattern A's WebSocket connection fails
- When simplicity of the server implementation is prioritized

---

## Hybrid Approach: Auto-Fallback

The plugin can try WebSocket first, then fall back to SSE:

```javascript
async function connect() {
  try {
    ws = new WebSocket(`wss://${SERVER}/figma-bridge`);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
      setTimeout(reject, 5000);
    });
    // WebSocket connected — use Pattern A
    useWebSocketMode(ws);
  } catch {
    // WebSocket failed — fall back to Pattern B
    const eventSource = new EventSource(`https://${SERVER}/figma-bridge/events?pairingCode=${pairingCode}`);
    useSSEMode(eventSource);
  }
}
```
