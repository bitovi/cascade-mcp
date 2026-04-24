# 065-figma-plugin-remote-mcp-research.md

## Status
Not Implemented

## What it proposes
A research spec exploring how to connect a remote MCP server to a Figma plugin for canvas write operations. The key finding is that Figma's `networkAccess.allowedDomains` supports `wss://` remote domains natively, making a direct remote WebSocket bridge (Pattern A) fully viable without any local relay. The recommended architecture pairs a Figma plugin (UI iframe opens a WebSocket to the server) with a 6-character pairing code mechanism to link the plugin connection to an MCP session.

## Architectural decisions made
- **Pattern A (Direct Remote WebSocket)** is the recommended transport — plugin UI iframe opens `new WebSocket('wss://cascade-mcp.example.com/figma-bridge')`, no local relay needed
- **Pattern G (Key Pairing)** is the recommended auth mechanism — plugin generates a short pairing code the user enters in the MCP client to link sessions
- Plugin UI iframe handles WebSocket; plugin sandbox (with `figma.*` API access) cannot open WebSockets directly — messages relay via `postMessage`
- Server sends commands as JSON `{ type: 'execute', id, code, timeout }`; plugin returns `{ type: 'result', id, success, data/error }`
- SSE (Pattern D) is the recommended fallback if WebSocket is blocked by corporate proxies
- Canvas writes (frames, shapes, text, components) require the Plugin API — the Figma REST API is read-heavy and cannot create canvas nodes
- Implementation phased: PoC → command protocol → MCP tool integration → publish to Figma Community

## What still needs implementing
- Figma plugin itself (manifest, UI iframe, plugin sandbox code, WebSocket connection, `postMessage` relay)
- WebSocket endpoint on the server (`/figma-bridge`) for accepting plugin connections
- Pairing service (generate codes, match plugin WS connections to MCP sessions)
- Command protocol with error handling, timeouts, and reconnection logic
- MCP tools that translate high-level design operations into Plugin API commands (e.g., `figma-create-frame`, `figma-add-text`, `figma-apply-styles`)
- CORS header (`Access-Control-Allow-Origin: *`) for the server's fetch endpoints used by the plugin sandbox
- Auto-reconnect with exponential backoff for plugin WebSocket disconnections
