# Architecture Patterns Overview

> How can a **remote HTTP MCP server** (cascade-mcp) send write commands to Figma's canvas?

---

## The Core Challenge

Figma write operations (creating nodes, modifying properties, updating variables) require the **Figma Plugin API** (`figma.*`), which only runs inside Figma's sandboxed plugin environment. The REST API can only write comments, variables (Enterprise), and dev resources — it **cannot** create or modify canvas elements.

Therefore, any solution requires a **Figma plugin** running inside the user's Figma Desktop (or web) that receives commands from our remote server and executes them via `figma.*` API calls.

## Key Discovery: Figma Plugins CAN Connect to Remote Servers

Figma's `manifest.json` `networkAccess.allowedDomains` explicitly supports:
- `http://`, `https://` — standard HTTP
- `ws://`, `wss://` — WebSocket connections
- Arbitrary remote domains (not restricted to localhost)

The official docs even use `"wss://socket.io"` as an example. The figma-console-mcp project's localhost restriction is a **design choice**, not a platform limitation.

---

## Pattern Comparison

| Pattern | Transport | Latency | Complexity | UX Friction | Recommended |
|---------|-----------|---------|------------|-------------|-------------|
| [A: Direct WebSocket](pattern-a-direct-websocket.md) | WSS | ~50ms | Medium | Low (plugin only) | **Primary** |
| [B: SSE + HTTP POST](pattern-b-sse-http.md) | SSE/HTTP | ~100ms | Medium | Low (plugin only) | **Strong alt** |
| [C: HTTP Polling](pattern-c-http-polling.md) | HTTP | 500ms–2s | Low | Low (plugin only) | Fallback |
| [D: REST API Hybrid](pattern-d-rest-api-hybrid.md) | REST + WSS | Mixed | High | Low | Partial |
| [E: Local Relay](pattern-e-local-relay.md) | HTTP→WS | ~100ms | High | High (local install) | Not recommended |

---

## Recommended Architecture: Pattern A + Key Pairing

**Pattern A (Direct WebSocket)** is the primary recommendation because:
1. Lowest latency (~50ms round-trip)
2. True bidirectional communication (server can push events to MCP client)
3. Proven pattern (figma-console-mcp uses WebSocket, just locally)
4. No additional software needed — just the Figma plugin

Combined with the **Key Pairing** authentication mechanism from the original spec:

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────┐     ┌──────────────┐
│  MCP Client │◄──►│   cascade-mcp     │◄──►│  Figma Plugin  │◄──►│ Plugin Worker │
│ (VS Code)   │HTTP │  (remote server)  │WSS  │  (UI iframe)   │post │  (code.js)   │
│             │     │                   │     │                │Msg  │              │
└─────────────┘     └──────────────────┘     └────────────────┘     └──────────────┘
                           │                                              │
                           │ REST API                                     │ figma.* API
                           ▼                                              ▼
                     ┌──────────────┐                              ┌──────────────┐
                     │  Figma REST  │                              │ Figma Canvas │
                     │    Server    │                              │              │
                     └──────────────┘                              └──────────────┘
```

### Authentication Flow (Key Pairing)

```
1. User installs & opens Figma plugin
   │
2. Plugin generates a 6-character pairing code (e.g., "A7K3M2")
   │ Plugin connects to wss://cascade-mcp.example.com/figma-bridge
   │ Plugin sends: { type: "REGISTER", pairingCode: "A7K3M2" }
   │ Server stores: pairingCode → pluginConnection
   │
3. User opens MCP client (VS Code Copilot)
   │ During auth, user selects "Connect to Figma"
   │ User enters pairing code "A7K3M2"
   │
4. Server matches MCP session to plugin connection
   │ pairingCode "A7K3M2" → links mcpSession ↔ pluginConnection
   │
5. Bidirectional bridge established
   │ MCP tool call → server → WebSocket → plugin → figma.* API → result back
```

### Why Not Pattern B (SSE)?

Pattern B is a strong alternative if WebSocket connections are problematic (corporate proxies, firewalls). SSE is HTTP-based and passes through more network configurations. Consider Pattern B as a fallback if WebSocket reliability proves challenging.

---

## REST API Write Capabilities (No Plugin Needed)

Some operations can be done via Figma REST API alone:

| Operation | API Endpoint | Plan Required |
|-----------|-------------|---------------|
| Post/delete comments | `POST/DELETE /v1/files/{key}/comments` | Any |
| Create/update variables | `POST /v1/files/{key}/variables` | Enterprise/Org |
| Set dev resources | `POST /v1/dev_resources` | Professional+ |

Everything else (canvas nodes, fills, text, components, etc.) requires the Plugin API.

---

## Figma Plugin Constraints

| Constraint | Detail |
|-----------|--------|
| Network access | Must declare domains in `manifest.json` `networkAccess.allowedDomains` |
| Sandbox | Plugin worker (code.js) has no direct network access; only the UI iframe can make network calls |
| Communication | Plugin UI ↔ Worker via `postMessage` / `figma.ui.postMessage` |
| Max UI size | Configurable via `figma.showUI(__html__, { width, height })` |
| Supported schemes | `http://`, `https://`, `ws://`, `wss://` |
| Permissions | `teamlibrary`, `currentuser`, `activeusers`, `payments`, etc. |
| Document access | `dynamic-page` required for new plugins |

---

## Files in This Directory

| File | Description |
|------|-------------|
| [065-figma-write-capabilities.md](065-figma-write-capabilities.md) | Original spec / requirements |
| [figma-console-mcp-tools.md](figma-console-mcp-tools.md) | Quick reference of all 57 tools |
| [figma-console-mcp-source-analysis.md](figma-console-mcp-source-analysis.md) | Deep source code analysis |
| [architecture-overview.md](architecture-overview.md) | This file — pattern comparison |
| [pattern-a-direct-websocket.md](pattern-a-direct-websocket.md) | **Recommended**: Direct WSS connection |
| [pattern-b-sse-http.md](pattern-b-sse-http.md) | Alternative: SSE + HTTP POST |
| [pattern-c-http-polling.md](pattern-c-http-polling.md) | Fallback: HTTP polling |
| [pattern-d-rest-api-hybrid.md](pattern-d-rest-api-hybrid.md) | Hybrid: REST API where possible + plugin for the rest |
| [pattern-e-local-relay.md](pattern-e-local-relay.md) | Not recommended: local relay process |
