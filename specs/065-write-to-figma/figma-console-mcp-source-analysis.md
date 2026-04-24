# figma-console-mcp — Source Code Analysis

> Deep dive into [southleft/figma-console-mcp](https://github.com/southleft/figma-console-mcp) v1.11.2 architecture and source code.

---

## 1. Project Overview

| | |
|---|---|
| **Repository** | https://github.com/southleft/figma-console-mcp |
| **Version** | 1.11.2 |
| **License** | MIT |
| **Language** | TypeScript (66.7%) |
| **Stars** | 900+ |
| **Key deps** | `@modelcontextprotocol/sdk ^1.26.0`, `ws ^8.19.0` |

The project is an MCP server that bridges AI agents to Figma — both for **reading** design data (via REST API) and **writing** to the canvas (via a WebSocket bridge to a Figma Desktop plugin).

---

## 2. Dual-Mode Architecture

The project runs in two fundamentally different modes:

| | **Local Mode** (NPX/Git) | **Remote Mode** (Cloudflare Workers) |
|---|---|---|
| **Entry Point** | `src/local.ts` → `LocalFigmaConsoleMCP` | `src/index.ts` → Cloudflare Workers handler |
| **Transport** | `StdioServerTransport` (stdin/stdout) | Server-Sent Events (SSE) |
| **Tool Count** | **57 tools** (read + write) | **22 tools** (read-only) |
| **Figma Access** | REST API + Desktop Bridge (WebSocket) | REST API only |
| **Write Ops** | ✅ Full | ❌ None |
| **Auth** | Personal Access Token (env var) | OAuth 2.0 |

### Why This Matters for Us

Remote mode has **no write capability** — this is the fundamental limitation we want to solve. Write operations require the Figma Plugin API, which only runs inside Figma's sandboxed environment.

---

## 3. File Structure

```
figma-console-mcp/
├── package.json
├── tsconfig.json
├── README.md
│
├── figma-desktop-bridge/              ← Figma Plugin (installed in Figma Desktop)
│   ├── manifest.json                  ← Plugin config: ports 9223-9232, dynamic-page
│   ├── code.js                        ← Plugin worker: ~30 message handlers, console capture
│   └── ui.html                        ← Plugin UI: WebSocket client, method routing
│
├── src/
│   ├── index.ts                       ← Remote/SSE entry (Cloudflare Workers)
│   ├── local.ts                       ← Local entry: LocalFigmaConsoleMCP class, ~35 inline tools
│   ├── browser-manager.ts
│   │
│   ├── core/
│   │   ├── figma-tools.ts             ← registerFigmaAPITools: 9 tools
│   │   ├── design-code-tools.ts       ← registerDesignCodeTools: 2 tools
│   │   ├── comment-tools.ts           ← registerCommentTools: 3 tools
│   │   ├── design-system-tools.ts     ← registerDesignSystemTools: 1 tool
│   │   ├── websocket-server.ts        ← FigmaWebSocketServer: multi-client WS bridge
│   │   ├── websocket-connector.ts     ← WebSocketConnector: IFigmaConnector via WS
│   │   ├── figma-connector.ts         ← IFigmaConnector interface
│   │   ├── figma-desktop-connector.ts ← Legacy CDP connector (fallback)
│   │   ├── figma-api.ts               ← FigmaApi: REST API client
│   │   ├── console-monitor.ts         ← ConsoleMonitor: log buffering
│   │   ├── config.ts                  ← Constants
│   │   ├── logger.ts                  ← Structured logging (pino)
│   │   ├── port-discovery.ts          ← Dynamic port fallback (9223-9232)
│   │   ├── snippet-injector.ts        ← Console-based variable extraction fallback
│   │   ├── enrichment/                ← Token/component enrichment modules
│   │   └── types/                     ← TypeScript type definitions
│   │
│   └── apps/                          ← MCP Apps (Token Browser, Design System Dashboard)
```

---

## 4. Class Hierarchy

```
LocalFigmaConsoleMCP (src/local.ts)
├── McpServer (@modelcontextprotocol/sdk)
│   ├── StdioServerTransport
│   └── Tool registrations (inline + external)
├── FigmaWebSocketServer (src/core/websocket-server.ts)
│   └── WebSocketConnector (src/core/websocket-connector.ts) implements IFigmaConnector
├── FigmaDesktopConnector (src/core/figma-desktop-connector.ts) — Legacy CDP fallback
├── FigmaApi (src/core/figma-api.ts) — REST API client
├── ConsoleMonitor (src/core/console-monitor.ts) — Log buffering
├── EnrichmentService (src/core/enrichment/) — Token/component enrichment
└── External tool registrations:
    ├── registerFigmaAPITools (src/core/figma-tools.ts)
    ├── registerDesignCodeTools (src/core/design-code-tools.ts)
    ├── registerCommentTools (src/core/comment-tools.ts)
    └── registerDesignSystemTools (src/core/design-system-tools.ts)
```

---

## 5. Communication Architecture

```
┌────────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│   AI Client    │◄──►│  MCP Server   │◄──►│   Plugin UI    │◄──►│ Plugin Worker │
│ (VS Code, etc) │stdio│(local.ts)    │ WS  │  (ui.html)     │post │  (code.js)   │
└────────────────┘     └──────────────┘     └────────────────┘Msg  └──────────────┘
                             │                                           │
                             │ REST API (HTTPS)                          │ figma.* API
                             ▼                                           ▼
                       ┌──────────────┐                          ┌──────────────┐
                       │  Figma REST  │                          │ Figma Canvas │
                       │    Server    │                          │   (Desktop)  │
                       └──────────────┘                          └──────────────┘
```

### Three Transport Layers

1. **Stdio** (AI Client ↔ MCP Server) — Standard MCP transport
2. **WebSocket** (MCP Server ↔ Figma Plugin UI) — localhost:9223-9232
3. **postMessage** (Plugin UI ↔ Plugin Worker) — Figma's sandboxed messaging

### WebSocket Bridge Details

**Server:** `FigmaWebSocketServer` extends `EventEmitter`
- Port scanning: 9223 → 9224 → ... → 9232 (automatic fallback)
- Max payload: 100MB
- CSWSH protection: Origin validation (only `null`, `figma.com`, no-origin)

**Protocol:** JSON-RPC-like messages
```json
// Command (server → plugin):
{ "id": "ws_1_1234567890", "method": "UPDATE_VARIABLE", "params": { "variableId": "...", "modeId": "...", "value": "#FF0000" } }

// Response (plugin → server):
{ "id": "ws_1_1234567890", "result": { "success": true, "variable": {...} } }

// Unsolicited event (plugin → server):
{ "type": "SELECTION_CHANGE", "data": { "nodes": [...], "count": 2, "page": "Page 1" } }
```

**Multi-file support:** Plugin instances self-identify via `FILE_INFO` message containing `fileKey`. Server tracks per-file state independently.

**Grace period:** 5-second reconnection window on disconnect.

---

## 6. Figma Plugin Architecture

### manifest.json

```json
{
  "name": "Figma Desktop Bridge",
  "id": "figma-desktop-bridge-mcp",
  "editorType": ["figma", "dev"],
  "capabilities": ["inspect"],
  "enablePrivatePluginApi": true,
  "permissions": ["teamlibrary"],
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["http://localhost", "ws://localhost:9223-9232"]
  }
}
```

Key constraint: `networkAccess.allowedDomains` is locked to **localhost only**. This is why the MCP server must run locally — the plugin cannot connect to remote servers.

### Plugin Worker (code.js)

**Initialization sequence:**
1. Monkey-patches `console.log/info/warn/error/debug` → forwards as `CONSOLE_CAPTURE` messages
2. Fetches all local variables via `figma.variables.getLocalVariablesAsync()`
3. Fetches all collections via `figma.variables.getLocalVariableCollectionsAsync()`
4. Sends `VARIABLES_DATA` to UI
5. Registers event listeners: `documentchange`, `selectionchange`, `currentpagechange`
6. Shows minimal UI (120×36px status indicator)

**~30 message handlers** organized by category:
- Code execution (`EXECUTE_CODE`)
- Variable CRUD (UPDATE, CREATE, DELETE, RENAME)
- Collection/mode management
- Component operations (get, instantiate, property management)
- Node manipulation (resize, move, fills, strokes, clone, delete, rename, text, create child)
- Instance property updates
- Screenshot capture
- File info / reload

### Plugin UI (ui.html)

**WebSocket Client:**
- Scans ports 9223–9232, connects to ALL active MCP servers simultaneously
- Reconnection: exponential backoff 500ms → 5000ms, max 50 attempts per port
- Events broadcast to all connected servers via `broadcastToAll()`

**Method routing** via `methodMap`:
```javascript
const methodMap = {
  EXECUTE_CODE: (p) => window.executeCode(p.code, p.timeout),
  UPDATE_VARIABLE: (p) => window.updateVariable(p.variableId, p.modeId, p.value),
  // ... 30+ method mappings
};
```

**Generic command infrastructure:**
```javascript
window.sendPluginCommand = function(type, params, timeoutMs) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), timeoutMs || 15000);
    window.__figmaPendingRequests.set(requestId, { resolve, reject, timeout });
    parent.postMessage({ pluginMessage: { type, requestId, ...params } }, '*');
  });
};
```

---

## 7. Write Operation Data Flow

Complete path for a write operation (e.g., "make the button red"):

```
AI Client
  │ MCP tool call: figma_set_fills({nodeId: "123:456", fills: [{type: "SOLID", color: {r:1,g:0,b:0}}]})
  ▼
MCP Server (local.ts) — Tool handler
  │ connector.setNodeFills(nodeId, fills)
  ▼
WebSocketConnector (websocket-connector.ts)
  │ wsServer.sendCommand('SET_NODE_FILLS', {nodeId, fills})
  │ Creates pending request with unique ID + timeout
  ▼
FigmaWebSocketServer (websocket-server.ts)
  │ JSON.stringify({id: "ws_42_...", method: "SET_NODE_FILLS", params: {nodeId, fills}})
  │ client.ws.send(message)
  ▼
WebSocket (localhost:9223)
  ▼
Plugin UI (ui.html) — onmessage handler
  │ methodMap["SET_NODE_FILLS"](params) → window.setNodeFills(nodeId, fills)
  │ window.sendPluginCommand("SET_NODE_FILLS", {nodeId, fills})
  │ parent.postMessage({pluginMessage: {type: "SET_NODE_FILLS", nodeId, fills, requestId}}, '*')
  ▼
Plugin Worker (code.js) — figma.ui.onmessage
  │ case "SET_NODE_FILLS":
  │   const node = await figma.getNodeByIdAsync(nodeId)
  │   node.fills = fills.map(fill => ({ ...fill, color: hexToFigmaRGB(fill.color) }))
  │   figma.ui.postMessage({type: "SET_NODE_FILLS_RESULT", requestId, result: {success: true}})
  ▼
Plugin UI (ui.html) — onmessage
  │ Resolves pending promise for requestId
  │ Sends {id, result} back via WebSocket
  ▼
FigmaWebSocketServer → WebSocketConnector → Tool handler → MCP response → AI Client
```

### Timeout Strategy

| Operation Type | Default Timeout |
|---|---|
| Standard commands | 15,000ms |
| Code execution | 7,000ms (5s code + 2s buffer) |
| Variable refresh | 300,000ms (5 min) |
| Get local components | 300,000ms (5 min) |
| Screenshot capture | 30,000ms |

---

## 8. Connection Establishment Sequence

```
1. User starts MCP server (npx figma-console-mcp)
   │
2. FigmaWebSocketServer.start()
   ├── Tries port 9223, if in use → 9224 → ... → 9232
   ├── Origin validation configured
   └── Enters "listening" state
   │
3. User opens Figma Desktop with Bridge plugin installed
   │
4. Plugin worker (code.js) initializes
   ├── Monkey-patches console methods
   ├── Fetches local variables/collections
   ├── Shows minimal UI
   └── Registers event listeners
   │
5. Plugin UI scans ports 9223-9232
   ├── Connects to ALL active MCP servers
   └── Reconnection with backoff
   │
6. Server receives connection → "pending" pool (30s timeout)
   │
7. Plugin sends FILE_INFO message
   ├── { type: "FILE_INFO", data: { fileKey, fileName, currentPage } }
   │
8. Server promotes pending → named client
   └── Bidirectional communication established
```

---

## 9. Variable Fetch Fallback Chain

The most complex fallback in the project — `figma_get_variables` tries 5 strategies:

1. **Figma REST API** (preferred when PAT exists) — requires Enterprise/Organization plan
2. **Desktop Bridge cached** — `GET_VARIABLES_DATA` from `window.__figmaVariablesData`
3. **Desktop Bridge direct** — `EXECUTE_CODE` with inline variable-fetching code
4. **Console Snippet Injection** — 2-call pattern: inject code snippet, then read results
5. **Styles API fallback** — On 403, falls back to `GET /v1/files/{fileKey}/styles`

---

## 10. Adaptive Response System

Prevents AI context window exhaustion:

| Threshold | Behavior |
|-----------|----------|
| < 100KB | Full response (ideal) |
| 100–200KB | Moderate compression |
| > 500KB | Emergency: summary/inventory/compact modes |

---

## 11. Key Architectural Insights

1. **The WebSocket bridge is the core innovation** — it enables write access through the Plugin API, which only runs inside Figma's sandbox.

2. **Network restriction is the central challenge** — The Figma plugin manifest only allows `networkAccess` to localhost. This is why `figma-console-mcp` requires local installation for write operations.

3. **Multi-instance resilience** — Server supports multiple Figma files; plugin connects to all active MCP servers on different ports.

4. **Graceful degradation** — Variable access has a 5-level fallback chain; write capability degrades to read-only without the Desktop Bridge.

5. **The "console" name** refers to the original feature: intercepting `console.log` from Figma's plugin sandbox. It evolved into a full bidirectional bridge.
