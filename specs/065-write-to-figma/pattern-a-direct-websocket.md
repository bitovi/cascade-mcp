# Pattern A: Direct Remote WebSocket

> **Status: RECOMMENDED** — Primary architecture for cascade-mcp Figma write capabilities.

---

## Overview

The Figma plugin opens a persistent WebSocket connection directly to the cascade-mcp remote server. Commands flow bidirectionally in real-time.

```
┌─────────────┐         ┌──────────────────┐         ┌────────────────┐         ┌──────────────┐
│  MCP Client │  HTTP   │   cascade-mcp     │  WSS    │  Figma Plugin  │  post   │ Plugin Worker │
│ (VS Code)   │◄──────►│  (remote server)  │◄──────►│  UI (iframe)   │◄──────►│  (code.js)    │
└─────────────┘ /mcp    └──────────────────┘         └────────────────┘  Msg    └──────────────┘
                               │                                                      │
                               │ Figma REST API                                       │ figma.* API
                               ▼                                                      ▼
                        ┌──────────────┐                                       ┌──────────────┐
                        │  Figma API   │                                       │ Figma Canvas │
                        └──────────────┘                                       └──────────────┘
```

---

## How It Works

### 1. Plugin Manifest

```json
{
  "name": "Cascade Figma Bridge",
  "id": "cascade-figma-bridge",
  "editorType": ["figma", "dev"],
  "documentAccess": "dynamic-page",
  "main": "code.js",
  "ui": "ui.html",
  "permissions": ["teamlibrary"],
  "networkAccess": {
    "allowedDomains": [
      "wss://cascade-mcp.example.com"
    ],
    "devAllowedDomains": [
      "ws://localhost:3000"
    ]
  }
}
```

### 2. Connection Establishment

```
Plugin loads in Figma
  │
  ├── Plugin worker (code.js) initializes
  │   ├── Registers figma.* event listeners (selection, document changes)
  │   └── Shows UI iframe (ui.html)
  │
  ├── Plugin UI (ui.html) generates 6-char pairing code
  │   └── Displays code to user: "Your pairing code: A7K3M2"
  │
  ├── Plugin UI opens WebSocket
  │   └── new WebSocket('wss://cascade-mcp.example.com/figma-bridge')
  │
  ├── On connect, plugin sends registration
  │   └── { type: "REGISTER", pairingCode: "A7K3M2", fileKey: "abc123", fileName: "My Design" }
  │
  └── Server stores: pairingCode → { ws, fileKey, fileName, connectedAt }
```

### 3. Session Pairing

```
User in MCP client (e.g., VS Code Copilot)
  │
  ├── Calls MCP tool: figma_connect({ pairingCode: "A7K3M2" })
  │   (or enters code during OAuth flow as additional auth step)
  │
  ├── Server looks up pairingCode in pending connections
  │   ├── Found → links mcpSessionId ↔ pluginWebSocket
  │   └── Not found → error "Invalid pairing code"
  │
  └── Plugin receives confirmation
      └── { type: "PAIRED", mcpSessionId: "sess_123" }
      └── Plugin UI updates: "Connected to Cascade ✓"
```

### 4. Command Execution

```
MCP Client calls: figma_set_fills({ nodeId: "123:456", fills: [...] })
  │
  ├── cascade-mcp server receives MCP tool call
  │   ├── Looks up figma plugin WebSocket for this MCP session
  │   └── Sends command via WebSocket:
  │       { id: "cmd_42", method: "SET_NODE_FILLS", params: { nodeId: "123:456", fills: [...] } }
  │
  ├── Plugin UI receives WebSocket message
  │   ├── Routes via methodMap: methodMap["SET_NODE_FILLS"](params)
  │   └── Sends to plugin worker: parent.postMessage({ pluginMessage: { type: "SET_NODE_FILLS", ... } })
  │
  ├── Plugin worker executes
  │   ├── const node = await figma.getNodeByIdAsync("123:456")
  │   ├── node.fills = [...]
  │   └── figma.ui.postMessage({ type: "SET_NODE_FILLS_RESULT", success: true })
  │
  ├── Plugin UI receives result
  │   └── Sends back via WebSocket: { id: "cmd_42", result: { success: true } }
  │
  └── Server resolves pending request → returns MCP tool result
```

---

## Server-Side Implementation

### New Endpoint: `/figma-bridge`

```typescript
// server/providers/figma/figma-bridge.ts

interface PendingPairing {
  ws: WebSocket;
  pairingCode: string;
  fileKey: string;
  fileName: string;
  connectedAt: Date;
}

interface PairedSession {
  ws: WebSocket;
  mcpSessionId: string;
  fileKey: string;
  fileName: string;
  pendingRequests: Map<string, { resolve, reject, timeout }>;
}

// Pending pairings (code → connection)
const pendingPairings = new Map<string, PendingPairing>();

// Paired sessions (mcpSessionId → connection)
const pairedSessions = new Map<string, PairedSession>();

// WebSocket upgrade handler
app.ws('/figma-bridge', (ws, req) => {
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    
    if (msg.type === 'REGISTER') {
      // Plugin registering with pairing code
      pendingPairings.set(msg.pairingCode, {
        ws, pairingCode: msg.pairingCode,
        fileKey: msg.fileKey, fileName: msg.fileName,
        connectedAt: new Date()
      });
    }
    
    if (msg.id && (msg.result || msg.error)) {
      // Response to a pending command
      const session = findSessionByWs(ws);
      if (session) {
        const pending = session.pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timeout);
          session.pendingRequests.delete(msg.id);
          if (msg.error) pending.reject(new Error(msg.error));
          else pending.resolve(msg.result);
        }
      }
    }
  });
  
  ws.on('close', () => {
    // Clean up pending pairings and paired sessions
    // Grace period: keep session for 10s to allow reconnection
  });
});
```

### Pairing MCP Tool

```typescript
// MCP tool: figma_connect
server.tool('figma_connect', { pairingCode: z.string().length(6) }, async (params, context) => {
  const pending = pendingPairings.get(params.pairingCode);
  if (!pending) throw new Error('Invalid pairing code. Open the Cascade plugin in Figma and try again.');
  
  const sessionId = getMcpSessionId(context);
  pairedSessions.set(sessionId, {
    ws: pending.ws,
    mcpSessionId: sessionId,
    fileKey: pending.fileKey,
    fileName: pending.fileName,
    pendingRequests: new Map()
  });
  pendingPairings.delete(params.pairingCode);
  
  // Notify plugin
  pending.ws.send(JSON.stringify({ type: 'PAIRED', mcpSessionId: sessionId }));
  
  return { success: true, fileName: pending.fileName, fileKey: pending.fileKey };
});
```

### Sending Commands

```typescript
// server/providers/figma/figma-bridge-client.ts

async function sendFigmaCommand(mcpSessionId: string, method: string, params: any, timeoutMs = 15000): Promise<any> {
  const session = pairedSessions.get(mcpSessionId);
  if (!session) throw new Error('No Figma plugin connected. Use figma_connect first.');
  if (session.ws.readyState !== WebSocket.OPEN) throw new Error('Figma plugin disconnected.');
  
  const id = `cmd_${++counter}_${Date.now()}`;
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.pendingRequests.delete(id);
      reject(new Error(`Figma command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    session.pendingRequests.set(id, { resolve, reject, timeout });
    session.ws.send(JSON.stringify({ id, method, params }));
  });
}
```

---

## Plugin Implementation (Figma Side)

### ui.html (WebSocket Client)

```html
<script>
  const SERVER_URL = 'wss://cascade-mcp.example.com/figma-bridge';
  let ws = null;
  let pairingCode = generatePairingCode(); // 6-char alphanumeric
  
  function connect() {
    ws = new WebSocket(SERVER_URL);
    
    ws.onopen = () => {
      // Register with server
      ws.send(JSON.stringify({
        type: 'REGISTER',
        pairingCode,
        fileKey: window.__fileInfo?.fileKey,
        fileName: window.__fileInfo?.fileName
      }));
      updateStatus('Waiting for pairing...');
    };
    
    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'PAIRED') {
        updateStatus('Connected ✓');
      }
      
      if (msg.id && msg.method) {
        // Command from server — route to handler
        try {
          const result = await handleCommand(msg.method, msg.params);
          ws.send(JSON.stringify({ id: msg.id, result }));
        } catch (error) {
          ws.send(JSON.stringify({ id: msg.id, error: error.message }));
        }
      }
    };
    
    ws.onclose = () => {
      updateStatus('Disconnected');
      setTimeout(connect, 2000); // Reconnect
    };
  }
  
  // Route commands to plugin worker
  const methodMap = {
    SET_NODE_FILLS: (p) => sendPluginCommand('SET_NODE_FILLS', p),
    SET_TEXT: (p) => sendPluginCommand('SET_TEXT_CONTENT', p),
    CREATE_CHILD: (p) => sendPluginCommand('CREATE_CHILD_NODE', p),
    RESIZE_NODE: (p) => sendPluginCommand('RESIZE_NODE', p),
    MOVE_NODE: (p) => sendPluginCommand('MOVE_NODE', p),
    // ... all write operations
  };
  
  async function handleCommand(method, params) {
    const handler = methodMap[method];
    if (!handler) throw new Error(`Unknown method: ${method}`);
    return await handler(params);
  }
  
  function sendPluginCommand(type, params, timeoutMs = 15000) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Plugin timeout')), timeoutMs);
      window.__pendingRequests.set(requestId, { resolve, reject, timeout });
      parent.postMessage({ pluginMessage: { type, requestId, ...params } }, '*');
    });
  }
  
  connect();
</script>
```

### code.js (Plugin Worker)

Same structure as figma-console-mcp's `code.js` — handles all `figma.*` API calls:

```javascript
figma.ui.onmessage = async (msg) => {
  const { type, requestId, ...params } = msg;
  
  try {
    let result;
    switch (type) {
      case 'SET_NODE_FILLS': {
        const node = await figma.getNodeByIdAsync(params.nodeId);
        node.fills = params.fills;
        result = { success: true };
        break;
      }
      case 'SET_TEXT_CONTENT': {
        const node = await figma.getNodeByIdAsync(params.nodeId);
        await figma.loadFontAsync(node.fontName);
        node.characters = params.characters;
        result = { success: true };
        break;
      }
      // ... all other handlers
    }
    figma.ui.postMessage({ type: `${type}_RESULT`, requestId, result });
  } catch (error) {
    figma.ui.postMessage({ type: `${type}_RESULT`, requestId, error: error.message });
  }
};
```

---

## Advantages

| Advantage | Detail |
|-----------|--------|
| **Low latency** | ~50ms round-trip for commands |
| **Bidirectional** | Server can push events (selection changes, document updates) to MCP client |
| **No local install** | Only the Figma plugin needed — no local server, relay, or extension |
| **Proven pattern** | figma-console-mcp uses identical architecture (just localhost) |
| **Real-time** | Events like `selectionchange` can stream to MCP client instantly |
| **Multi-file** | Multiple Figma files can connect simultaneously |

## Disadvantages

| Disadvantage | Mitigation |
|-------------|------------|
| **WebSocket may be blocked** by corporate proxies | Fall back to Pattern B (SSE) |
| **Persistent connection** needed | Reconnection with exponential backoff |
| **Plugin must be open** in Figma | Clear UX messaging when plugin disconnects |
| **Server needs WebSocket support** | Most hosting supports WSS (Cloudflare, Railway, etc.) |

---

## Security Considerations

| Concern | Approach |
|---------|----------|
| **Authentication** | Pairing code is single-use, short-lived (5 min expiry) |
| **Transport** | WSS (TLS encrypted) — no plaintext WS in production |
| **Session binding** | After pairing, WebSocket is bound to MCP session |
| **CSWSH** | Origin validation in WebSocket upgrade handler |
| **Pairing code brute-force** | Rate limit pairing attempts; 6-char alphanumeric = 2.1B combos |
| **Reconnection** | On reconnect, plugin must re-authenticate with session token (not just pairing code) |

---

## Implementation Phases

### Phase 1: Core Bridge
- WebSocket endpoint on cascade-mcp server (`/figma-bridge`)
- Pairing code generation + matching
- `figma_connect` MCP tool
- Basic Figma plugin (manifest, ui.html, code.js)
- 5 core write tools: `set_fills`, `set_text`, `create_child`, `resize_node`, `move_node`

### Phase 2: Full Write Operations
- Variable CRUD (create, update, delete, rename)
- Component operations (instantiate, properties)
- Node manipulation (clone, delete, rename, strokes)
- Batch operations

### Phase 3: Bidirectional Events
- Selection change events → MCP client
- Document change events → MCP client
- Console log forwarding
- Screenshot capture via plugin
