# Pattern E: Local Relay

> **Status: NOT RECOMMENDED** — Defeats the purpose of a remote MCP server. Documented for completeness.

---

## Overview

A lightweight local process runs on the user's machine, acting as a relay between the remote cascade-mcp server and the Figma plugin (which connects to localhost).

```
┌─────────────┐       ┌──────────────────┐       ┌──────────────┐       ┌────────────────┐       ┌──────────────┐
│  MCP Client │ HTTP  │   cascade-mcp     │ WSS   │ Local Relay  │ WS    │  Figma Plugin  │ post  │ Plugin Worker │
│ (VS Code)   │◄────►│  (remote server)  │◄────►│ (npx/binary) │◄────►│  UI (iframe)   │◄────►│  (code.js)    │
└─────────────┘      └──────────────────┘       └──────────────┘       └────────────────┘  Msg  └──────────────┘
```

---

## How It Works

1. User installs and runs a local relay: `npx @cascade/figma-relay`
2. Relay connects to remote cascade-mcp server via WSS
3. Relay opens a local WebSocket server on localhost:9223-9232
4. Figma plugin connects to local relay (standard figma-console-mcp pattern)
5. Commands are forwarded: remote server → relay → plugin → figma.* API → result back

### Relay Code

```typescript
// Thin relay — no business logic
import WebSocket from 'ws';

const remoteWs = new WebSocket('wss://cascade-mcp.example.com/figma-relay');
const localServer = new WebSocket.Server({ port: 9223 });

let pluginWs: WebSocket | null = null;

localServer.on('connection', (ws) => {
  pluginWs = ws;
  
  // Forward plugin messages to remote
  ws.on('message', (data) => remoteWs.send(data));
});

// Forward remote commands to plugin
remoteWs.on('message', (data) => {
  if (pluginWs?.readyState === WebSocket.OPEN) pluginWs.send(data);
});
```

---

## Advantages

| Advantage | Detail |
|-----------|--------|
| **Uses existing plugin** | Could reuse figma-console-mcp's plugin as-is |
| **Simple plugin** | Plugin thinks it's connecting to a local MCP server |
| **Proven pattern** | Exact same WS bridge figma-console-mcp uses |

## Disadvantages

| Disadvantage | Impact |
|-------------|--------|
| **Requires local install** | User must install and run `npx` command — defeats the purpose of remote MCP |
| **Extra hop** | Remote → Relay → Plugin adds latency |
| **Maintenance burden** | Must maintain a separate relay package |
| **User friction** | "Install this, then run this command, then open plugin" vs "just open plugin" |
| **Port conflicts** | Same port-scanning issues as figma-console-mcp |

---

## When to Use Pattern E

Essentially **never** for this project. The whole point is to avoid requiring local software. Pattern A (direct WebSocket) achieves the same result without a local relay.

The only scenario where this might make sense:
- If Figma ever restricts `networkAccess` to localhost-only (unlikely — they explicitly document remote domains)
- For backwards compatibility with the existing figma-console-mcp plugin during migration

This pattern is documented for completeness and to explicitly explain why it was rejected.
