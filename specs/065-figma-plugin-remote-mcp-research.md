# 065: Research — Connecting a Remote MCP Server to Figma Plugin for Canvas Writes

## Executive Summary

**The key finding: Figma plugins CAN connect directly to remote servers via WebSocket and HTTP.** The `networkAccess.allowedDomains` manifest field explicitly supports `ws://`, `wss://`, `http://`, and `https://` schemes for arbitrary remote domains — not just localhost. This means a Figma plugin can open a WebSocket connection or make fetch requests to `cascade-mcp.example.com` just as easily as to `localhost:9223`.

This makes **Pattern A (Direct Remote WebSocket)** and **Pattern D (Plugin Polls/SSE to Remote Server)** the most viable architectures. No local relay, browser extension, or localhost tunnel is required.

---

## 1. Figma Plugin Network Access Capabilities

### Source: [Plugin Manifest — networkAccess](https://developers.figma.com/docs/plugins/manifest/)

#### What `networkAccess.allowedDomains` Allows

The `networkAccess` field in `manifest.json` controls which domains the plugin can reach. The key details:

- **Supported schemes**: `http`, `https`, `ws`, `wss` — all four are explicitly supported
- **Arbitrary remote domains**: You can specify any public domain, not just localhost
- **Wildcard subdomains**: `*.example.com` matches all subdomains
- **Path restrictions**: You can restrict to specific paths (e.g., `api.example.com/rest/get`)
- **Wildcard all**: `["*"]` allows access to any domain (requires `reasoning` field)
- **No access**: `["none"]` blocks all network access

**Official example from Figma docs:**
```json
"networkAccess": {
  "allowedDomains": [
    "figma.com",
    "*.google.com",
    "https://my-app.cdn.com",
    "wss://socket.io",
    "example.com/api/",
    "exact-path.com/content"
  ],
  "devAllowedDomains": [
    "http://localhost:3000"
  ]
}
```

Note: `"wss://socket.io"` is right there in Figma's own documentation example. **Remote WebSockets are a first-class supported feature.**

#### Plugin Architecture: Two Execution Contexts

Figma plugins have two separate execution environments:

1. **Plugin Sandbox (main/code.js)** — "Plugin code"
   - Has access to `figma.*` API (create nodes, modify canvas, etc.)
   - Runs in a sandboxed JavaScript environment (NOT a browser)
   - Has Figma's custom `fetch()` API (not browser fetch — different interface)
   - Figma's `fetch()` has CORS restrictions: **null origin** means the server must set `Access-Control-Allow-Origin: *`
   - **Cannot** open WebSocket connections directly (no `WebSocket` constructor in sandbox)
   - Communicates with UI via `figma.ui.postMessage()` / `figma.ui.onmessage`

2. **Plugin UI (iframe/ui.html)** — "UI code"
   - Standard HTML/browser environment in an iframe
   - Has access to all browser APIs: `WebSocket`, `fetch`, `EventSource` (SSE), etc.
   - Also has **null origin** (same CORS restriction)
   - **Cannot** access `figma.*` API directly
   - Communicates with plugin code via `parent.postMessage({ pluginMessage: ... }, '*')`
   - Can navigate to a remote URL via `figma.showUI('<script>window.location.href = "https://..."</script>')`

**Critical implication**: The UI iframe is where WebSocket/SSE connections live. The UI receives commands from the remote server and relays them to the plugin sandbox via `postMessage`, where the sandbox executes `figma.*` API calls.

#### CORS Constraint

Both execution contexts have a `null` origin. This means:
- Remote servers **must** set `Access-Control-Allow-Origin: *` for HTTP requests
- WebSocket connections don't have the same CORS restriction (WS handshake doesn't enforce origin for `ws://`/`wss://`)
- This is manageable for our own server — we control the CORS headers

#### What figma-console-mcp Does (Reference)

The figma-desktop-bridge plugin's `manifest.json`:
```json
"networkAccess": {
  "allowedDomains": [
    "http://localhost",
    "ws://localhost",
    "ws://localhost:9223",
    "ws://localhost:9224",
    ...
    "ws://localhost:9232"
  ]
}
```

They restrict to localhost only because the MCP server runs locally. But this is a **design choice**, not a platform limitation. They could just as easily specify `wss://remote-server.example.com`.

---

## 2. Figma Plugin ↔ External Communication Patterns

### Source: [Creating a User Interface](https://developers.figma.com/docs/plugins/creating-ui/)

#### Plugin UI iframe Capabilities

- The UI is a standard HTML iframe. When using inline HTML (`figma.showUI(__html__)`), it has a null origin.
- When navigated to a remote URL (`window.location.href = "https://..."`), it becomes a **non-null origin iframe** — this enables even more capabilities.
- The plugin UI **can**:
  - Open WebSocket connections (`new WebSocket('wss://...')`)
  - Make fetch requests to remote APIs
  - Open Server-Sent Events connections (`new EventSource('https://...')`)
  - Use any browser JavaScript API
- All subject to `networkAccess.allowedDomains` CSP enforcement

#### Message Passing Protocol

**UI → Plugin Code:**
```javascript
// In UI (iframe)
parent.postMessage({ pluginMessage: { type: 'command', data: ... } }, '*')
```

**Plugin Code → UI:**
```javascript
// In plugin sandbox
figma.ui.postMessage({ type: 'response', data: ... })
```

**Plugin Code → Listen:**
```javascript
figma.ui.onmessage = (message) => {
  // Execute figma.* API calls based on message
}
```

This is exactly the pattern figma-console-mcp uses, just over localhost WebSocket. The same pattern works over remote WebSocket.

#### Non-null Origin iframes

If you navigate the plugin iframe to a custom URL:
```javascript
figma.showUI(`<script>window.location.href = "https://cascade-mcp.example.com/plugin-ui"</script>`)
```

Then the iframe has a real origin. Messages need `pluginId` for security:
```javascript
// In remote-hosted UI
parent.postMessage(
  { pluginMessage: 'data', pluginId: '123456' },
  'https://www.figma.com'
)
```

This pattern lets you **host the plugin's UI on your server**, enabling dynamic updates without republishing the plugin.

---

## 3. Figma Widget API vs Plugin API

### Source: [Widget Introduction](https://developers.figma.com/docs/widgets/)

#### Key Differences

| Feature | Plugin | Widget |
|---------|--------|--------|
| Visibility | Only the user who runs it | All collaborators see it |
| Network access | Same `networkAccess` manifest | Same `networkAccess` manifest |
| Canvas API | Full `figma.*` API | Subset + widget-specific `widget.*` API |
| Persistence | Runs then closes | Persists as an object on the canvas |
| UI | Optional iframe | Optional (via Plugin API bridge) |

#### Widget Network Capabilities

Widgets use the **same** `networkAccess` mechanism. They can also:
- Use Figma's `fetch()` API from the widget code
- Open an iframe (via Plugin API) for browser-level networking
- Have identical CORS restrictions (null origin)

**Verdict**: Widgets don't offer meaningfully different network capabilities. Plugins are the right tool for our use case because we need persistent background connections (plugins can stay running), while widgets re-render on state changes.

---

## 4. Authentication Patterns for Figma Plugins

### How Plugins Handle Auth

#### Personal Access Tokens (PATs)
- Most common for developer tools
- User generates a PAT in Figma settings
- Plugin stores it (in plugin storage or entered each session)
- figma-console-mcp uses this for local mode

#### OAuth Flows
- Plugin UI iframe navigates to OAuth provider's auth page
- After auth, redirect back to the iframe with tokens
- Plugin stores tokens in client storage or plugin data
- figma-console-mcp's remote SSE mode uses Figma OAuth

#### For Our Architecture
The plugin needs to authenticate with OUR MCP server, not with Figma itself. Options:
1. **User enters a pairing code/key** — simplest UX for connecting the plugin to an MCP session
2. **OAuth with our server** — plugin redirects to our OAuth page, receives a token
3. **PAT from our server** — user generates a key from our dashboard and pastes it into the plugin

---

## 5. Possible Architecture Patterns — Detailed Analysis

### Pattern A: Direct Remote WebSocket ⭐ RECOMMENDED

```
┌─────────────────┐     WebSocket (wss://)     ┌──────────────────┐
│  Figma Plugin    │◄──────────────────────────►│ Remote MCP Server│
│  (UI iframe)     │                            │ (cascade-mcp)    │
│       │          │                            │       │          │
│       ▼          │                            │       ▼          │
│  Plugin Sandbox  │                            │  MCP Protocol    │
│  (figma.* API)   │                            │  (Claude, etc.)  │
└─────────────────┘                             └──────────────────┘
```

**How it works:**
1. Plugin UI iframe opens `new WebSocket('wss://cascade-mcp.example.com/figma-bridge')`
2. Server sends commands as JSON messages (create frame, add text, etc.)
3. Plugin UI receives commands, forwards to plugin sandbox via `postMessage`
4. Plugin sandbox executes `figma.*` API calls
5. Results sent back: sandbox → UI → WebSocket → server

**manifest.json:**
```json
"networkAccess": {
  "allowedDomains": [
    "wss://cascade-mcp.example.com"
  ],
  "reasoning": "Connects to Cascade MCP server for AI-assisted design operations."
}
```

**Technical feasibility**: ✅ **Fully supported.** Figma docs explicitly show `wss://` in allowedDomains examples.

**Latency**: Low — WebSocket is bidirectional and persistent. Similar to localhost WS but with internet RTT (typically 20-100ms).

**Complexity**: Low — simplest architecture. No relay, no middle layer.

**User experience**: Good — user installs plugin, enters a pairing key, and it just works. No local software needed.

**Security**: 
- `wss://` provides TLS encryption
- Authentication via pairing key or JWT token sent on WS handshake
- Plugin can only reach the domains in `allowedDomains`

**Works with Figma restrictions**: ✅ Yes, confirmed by documentation.

---

### Pattern B: WebSocket Relay via Browser Extension

```
┌─────────────┐  WS/localhost  ┌────────────────┐  WS/remote  ┌──────────────┐
│ Figma Plugin │◄─────────────►│ Browser Extension│◄───────────►│ Remote MCP   │
│ (localhost)  │               │ (relay)          │              │ Server       │
└─────────────┘               └────────────────┘              └──────────────┘
```

**Technical feasibility**: ✅ Works, but unnecessary.

**Latency**: Medium — adds an extra hop.

**Complexity**: High — requires building a browser extension, install friction for users.

**User experience**: Poor — user must install both a Figma plugin AND a browser extension.

**Security**: More attack surface with the browser extension relay.

**Verdict**: ❌ **Not recommended.** Since Pattern A works directly, this adds unnecessary complexity. Only useful if Figma somehow blocked remote connections (they don't).

---

### Pattern C: Figma Plugin Polls Remote Server (HTTP Polling)

```
┌─────────────────┐   GET /commands (periodic)   ┌──────────────────┐
│  Figma Plugin    │────────────────────────────►│ Remote MCP Server│
│  (sandbox fetch) │◄────────────────────────────│                  │
│       │          │   POST /results              │                  │
│       ▼          │────────────────────────────►│                  │
│  Plugin Sandbox  │                              └──────────────────┘
│  (figma.* API)   │
└─────────────────┘
```

**How it works:**
1. Plugin sandbox uses Figma's built-in `fetch()` to periodically poll `GET /figma-bridge/commands?session=XYZ`
2. Server responds with queued commands (or empty array)
3. Plugin executes commands, posts results back via `POST /figma-bridge/results`

**Technical feasibility**: ✅ Works. Figma's sandbox `fetch()` can reach remote servers (requires `Access-Control-Allow-Origin: *`).

**Latency**: Higher — polling interval determines responsiveness. 1-second polling = up to 1s delay. 250ms polling = more responsive but more requests.

**Complexity**: Low — simple HTTP, no WebSocket complexity in the sandbox.

**User experience**: Good — same as Pattern A from user's perspective.

**Security**: Requires `Access-Control-Allow-Origin: *` on the server (since plugin origin is null).

**Key advantage**: Can work from the sandbox directly WITHOUT needing a UI iframe, making the plugin simpler. However, you'd need the plugin to keep running (not close).

**Verdict**: ✅ **Viable fallback.** Simpler than WebSocket but higher latency. Good for command-based workflows where sub-second response isn't critical.

---

### Pattern D: Figma Plugin uses SSE (Server-Sent Events) ⭐ STRONG ALTERNATIVE

```
┌─────────────────┐   EventSource (SSE)          ┌──────────────────┐
│  Figma Plugin    │◄────────────────────────────│ Remote MCP Server│
│  (UI iframe)     │                              │                  │
│       │          │   POST /results              │                  │
│       ▼          │────────────────────────────►│                  │
│  Plugin Sandbox  │                              └──────────────────┘
│  (figma.* API)   │
└─────────────────┘
```

**How it works:**
1. Plugin UI iframe opens `new EventSource('https://cascade-mcp.example.com/figma-bridge/events?session=XYZ')`
2. Server pushes commands via SSE (one-directional server→client stream)
3. Plugin UI relays commands to sandbox via `postMessage`
4. Sandbox executes `figma.*` API calls
5. Results posted back via `fetch()` from UI iframe

**Technical feasibility**: ✅ Works. `EventSource` is a standard browser API available in the iframe.

**Latency**: Low-to-medium — SSE is server-push, so nearly as fast as WebSocket for server→client. But POST for client→server adds a round trip.

**Complexity**: Medium — two transport mechanisms (SSE + HTTP POST) instead of one (WebSocket).

**User experience**: Good — same as Pattern A.

**Security**: Same as Pattern A. SSE over HTTPS.

**Pros over WebSocket**: SSE auto-reconnects on disconnection. Simpler server implementation (just HTTP streaming). Works through more corporate proxies.

**Verdict**: ✅ **Strong alternative to WebSocket.** Especially relevant since our MCP server already uses SSE for its transport layer.

---

### Pattern E: Local Relay Service

```
┌─────────────┐ WS/localhost ┌──────────┐ HTTPS/WS ┌──────────────┐
│ Figma Plugin │◄────────────►│ Local    │◄─────────►│ Remote MCP   │
│ (localhost)  │              │ Relay    │            │ Server       │
└─────────────┘              │ (Node.js)│            └──────────────┘
                             └──────────┘
```

**Technical feasibility**: ✅ Works — this is exactly what figma-console-mcp does.

**Latency**: Low — similar to Pattern A.

**Complexity**: High — user must install and run local software.

**User experience**: Poor — friction of installing Node.js, running a process, keeping it alive.

**Verdict**: ❌ **Not recommended for our use case.** Our whole value proposition is being a remote MCP server. Pattern A eliminates the need for any local software. This pattern only makes sense if you want the MCP server's "intelligence" to be remote but still need localhost connectivity (which we don't, since Figma supports remote connections).

---

### Pattern F: Figma REST API + Plugin Hybrid

```
┌──────────────────┐  REST API  ┌──────────────────┐
│ Remote MCP Server│────────────►│ Figma Cloud      │  (Variables, Comments, Dev Resources)
│                  │             └──────────────────┘
│                  │
│                  │  WebSocket  ┌──────────────────┐
│                  │◄───────────►│ Figma Plugin     │  (Canvas: Frames, Shapes, Text, etc.)
└──────────────────┘             └──────────────────┘
```

**How it works:**
- Use Figma REST API directly for what it supports (no plugin needed):
  - Variables (Enterprise only)
  - Comments (create, delete)
  - Dev Resources (create, update, delete)
- Use the plugin bridge (Pattern A) for everything else:
  - Creating/modifying frames, shapes, text, components
  - Auto-layout, styles, effects
  - Anything requiring `figma.*` API

**Verdict**: ✅ **Good optimization.** The REST API can handle some writes without the plugin being open. But since the REST API can't create canvas nodes, the plugin bridge is still needed for the primary use case.

---

### Pattern G: Unique Key Pairing (Auth Mechanism)

This is an **authentication/pairing** mechanism, not a transport pattern. It works **with** any of the above patterns (A, C, D).

```
1. User opens plugin → Plugin generates unique code "ABC-123"
2. User enters "ABC-123" in MCP client (e.g., Copilot chat)
3. MCP server matches: Plugin connection (via WS) ↔ MCP session
4. Commands flow through the matched pair
```

**Implementation:**
1. Plugin connects to server via WebSocket (Pattern A)
2. Server generates a 6-character pairing code, sends to plugin
3. Plugin displays the code to the user
4. User types the code in their MCP client (e.g., "Connect to Figma with code ABC-123")
5. MCP server's `figma-connect` tool accepts the code, links the MCP session to the Figma plugin connection
6. Subsequent MCP tool calls that write to Figma route through the linked WebSocket

**Verdict**: ✅ **Recommended pairing mechanism.** Simple, no OAuth flow needed, works across any device. Similar to how you pair a TV with a streaming device.

---

## 6. Figma REST API Write Capabilities

### Source: [REST API Endpoints](https://developers.figma.com/docs/rest-api/)

#### What CAN Be Written via REST API (No Plugin Needed)

| Operation | Endpoints | Requirements |
|-----------|-----------|-------------|
| **Comments** | `POST /v1/files/:key/comments` | `file_comments:write` scope |
| | `DELETE /v1/files/:key/comments/:id` | |
| **Comment Reactions** | `POST .../reactions` , `DELETE .../reactions` | `file_comments:write` scope |
| **Variables** | Full CRUD (create, read, update, delete) | **Enterprise plan only**, `file_variables:write` scope |
| **Dev Resources** | `POST /v1/dev_resources` (bulk create) | `file_dev_resources:write` scope |
| | `PUT /v1/dev_resources` (bulk update) | |
| | `DELETE /v1/files/:key/dev_resources/:id` | |

#### What CANNOT Be Written via REST API (Requires Plugin)

| Operation | Notes |
|-----------|-------|
| **Create/modify frames** | No REST endpoint |
| **Create/modify shapes** (rectangles, ellipses, etc.) | No REST endpoint |
| **Create/modify text nodes** | No REST endpoint |
| **Apply fills, strokes, effects** | No REST endpoint |
| **Set auto-layout properties** | No REST endpoint |
| **Create/instantiate components** | No REST endpoint |
| **Modify node positions, sizes** | No REST endpoint |
| **Create/modify pages** | No REST endpoint |
| **Modify styles** (color, text, effect styles) | No REST endpoint |
| **Set plugin data on nodes** | No REST endpoint |

**Bottom line**: The Figma REST API is **read-heavy**. For canvas manipulation — which is the core use case for "AI writes designs to Figma" — the Plugin API is the **only option**.

---

## 7. Real-world Examples

### figma-console-mcp (southleft)
- **Architecture**: Local MCP server + WebSocket + Figma Desktop Bridge plugin
- **Limitation**: Write operations only work in "Local Mode" — their remote SSE mode is read-only because they chose to restrict the plugin to localhost
- **Key insight**: They have 57+ tools for full canvas manipulation. Their write tools use `figma_execute` which runs arbitrary Plugin API code via the WebSocket bridge.

### Figma's Official Dev Mode MCP
- Read-only with codegen focus
- No write capabilities

### Zeplin, Storybook, Abstract
- These are primarily **read** tools — they extract design data from Figma
- They use the REST API and/or Plugin API for extraction
- They don't write back to Figma

### Other Notable Projects
- No known public project connects a **remote** server to a Figma plugin for write operations. figma-console-mcp is the closest, but it does it locally. Our approach would be novel.

---

## 8. Recommended Architecture for cascade-mcp

### Primary: Pattern A (Direct Remote WebSocket) + Pattern G (Key Pairing)

```
┌──────────────────────────────────────────────────────────────────────┐
│ User's Figma Desktop / Web                                          │
│                                                                      │
│  ┌─────────────────────────────────────────┐                        │
│  │ Cascade Figma Plugin                     │                        │
│  │                                          │                        │
│  │  ┌────────────┐    postMessage    ┌────────────┐                 │
│  │  │ UI (iframe) │◄────────────────►│ Sandbox     │                 │
│  │  │             │                  │ (figma.*)   │                 │
│  │  │  WebSocket  │                  │             │                 │
│  │  │  connection │                  │ Executes    │                 │
│  │  │  to remote  │                  │ commands on │                 │
│  │  │  server     │                  │ canvas      │                 │
│  │  └──────┬──────┘                  └─────────────┘                 │
│  └─────────┼────────────────────────────────┘                        │
│            │                                                          │
└────────────┼──────────────────────────────────────────────────────────┘
             │
             │ wss://cascade-mcp.example.com/figma-bridge
             │
┌────────────▼──────────────────────────────────────────────────────────┐
│ Cascade MCP Server (Cloudflare/Docker)                                │
│                                                                        │
│  ┌──────────────────┐    ┌──────────────────┐                         │
│  │ Figma Bridge      │    │ MCP Protocol      │                         │
│  │ WebSocket Handler │◄──►│ (tools, prompts)  │                         │
│  │                   │    │                   │                         │
│  │ Session matching  │    │ figma-write-*     │                         │
│  │ (pairing codes)   │    │ tools trigger     │                         │
│  └──────────────────┘    │ bridge commands    │                         │
│                           └──────────────────┘                         │
│                                    ▲                                    │
│                                    │                                    │
│                           ┌────────┴────────┐                          │
│                           │ MCP Client       │                          │
│                           │ (Copilot, Claude)│                          │
│                           └─────────────────┘                          │
└────────────────────────────────────────────────────────────────────────┘
```

### User Flow

1. **Install plugin** (one-time): User imports the Cascade Figma plugin into Figma
2. **Run plugin**: User runs the plugin in their Figma file
3. **Pairing**: Plugin displays a 6-character code (e.g., "XK7-M2P")
4. **Connect**: User tells MCP client: "Connect to Figma with code XK7-M2P"
5. **MCP server matches**: Links the WebSocket connection to the MCP session
6. **AI designs**: MCP tools like `figma-create-frame`, `figma-add-text`, etc. now send commands through the WebSocket bridge to the plugin, which executes them on the canvas

### Plugin manifest.json

```json
{
  "name": "Cascade MCP Bridge",
  "id": "cascade-mcp-bridge",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": [
      "wss://cascade-mcp.example.com",
      "https://cascade-mcp.example.com"
    ],
    "reasoning": "Connects to Cascade MCP server for AI-assisted design creation and modification."
  }
}
```

### Server-side Components Needed

1. **WebSocket endpoint** (`/figma-bridge`) — accepts plugin connections, manages sessions
2. **Pairing service** — generates codes, matches plugin WS connections to MCP sessions
3. **Command protocol** — JSON message format for bidirectional communication:
   ```typescript
   // Server → Plugin (command)
   { type: 'execute', id: 'cmd-1', code: 'figma.createFrame()...', timeout: 5000 }
   
   // Plugin → Server (result)
   { type: 'result', id: 'cmd-1', success: true, data: { nodeId: '1:23' } }
   
   // Plugin → Server (error)
   { type: 'result', id: 'cmd-1', success: false, error: 'Node not found' }
   ```
4. **MCP tools** that translate high-level design operations into Plugin API code

### Why Not Polling or SSE?

WebSocket is preferred over Pattern C (polling) and Pattern D (SSE) because:
- **Bidirectional**: Both sides can send messages anytime (no POST-back needed)
- **Low latency**: No polling interval delay
- **Persistent**: Single connection for the entire session
- **Precedent**: figma-console-mcp uses WebSocket for the same purpose (just over localhost)
- **Simplicity**: One transport mechanism instead of two (SSE + HTTP POST)

SSE (Pattern D) is a reasonable **fallback** if WebSocket proves problematic in certain environments (e.g., corporate proxies that block WS upgrades).

---

## 9. Key Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Plugin must stay running | User closes plugin → bridge disconnects | Auto-reconnect, persistent "always on" UI option, minimize to tiny panel |
| WebSocket disconnections | Network hiccups interrupt operations | Automatic reconnect with exponential backoff, command queuing |
| CORS for fetch (null origin) | Plugin sandbox `fetch()` requires `Access-Control-Allow-Origin: *` | Server sets this header; WebSocket doesn't have this restriction |
| Plugin review/approval | Figma may scrutinize remote `wss://` in `allowedDomains` | Provide clear `reasoning` field, limit to specific domain |
| Published vs development plugin | Published plugins go through Figma review | Start as development plugin; publish when stable |
| Figma Web vs Desktop | Some features differ between web and desktop clients | WebSocket works in both; test both environments |
| Rate limiting | Rapid-fire commands could overwhelm the plugin | Throttle commands server-side, batch operations |

---

## 10. Implementation Phases

### Phase 1: Proof of Concept
- Build minimal Figma plugin with WebSocket to remote server
- Implement basic pairing (generate code → enter in MCP client)
- Single command: `create-frame` (verify end-to-end flow)
- Development plugin only (no Figma review needed)

### Phase 2: Command Protocol
- Port figma-console-mcp's `figma_execute` approach (send Plugin API code as strings)
- Add structured commands (create-frame, add-text, set-fills, etc.)
- Error handling, timeouts, reconnection

### Phase 3: MCP Tool Integration
- Add MCP tools to cascade-mcp that invoke the Figma bridge
- `figma-create-component`, `figma-modify-layout`, `figma-apply-styles`, etc.
- Integrate with existing design analysis tools (read from Figma → AI → write back)

### Phase 4: Polish & Publish
- Plugin UI polish (status display, connection indicator, pairing UX)
- Figma Community marketplace review and publication
- Documentation, error messages, edge case handling

---

## Appendix A: Comparison with figma-console-mcp

| Aspect | figma-console-mcp | cascade-mcp (proposed) |
|--------|-------------------|------------------------|
| MCP server location | Local (Node.js on user's machine) | Remote (Cloudflare/Docker) |
| WebSocket target | `ws://localhost:9223-9232` | `wss://cascade-mcp.example.com` |
| Plugin network scope | localhost only | Remote domain |
| Authentication | PAT (local) / OAuth (remote, read-only) | Pairing code + MCP session JWT |
| Write capability | Full (56+ tools via local bridge) | Full (same Plugin API via remote bridge) |
| User setup | Install Node.js, run `npx`, import plugin | Import plugin, enter pairing code |
| Local dependencies | Node.js runtime required | None — just the Figma plugin |
| Update mechanism | `npx @latest` | Plugin auto-updates; server auto-updates |

## Appendix B: Figma Plugin `fetch()` vs Browser `fetch()`

The Figma sandbox's `fetch()` is custom, not the browser's:

```typescript
// Figma's Fetch API interface
interface FetchOptions {
  method?: string
  headers?: { [name: string]: string }
  body?: Uint8Array | string
  credentials?: string
  cache?: string
  redirect?: string
  referrer?: string
  integrity?: string
}

interface FetchResponse {
  headersObject: { [name: string]: string }  // NOT a Headers object
  ok: boolean
  redirected: boolean
  status: number
  statusText: string
  type: string
  url: string
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
  json(): Promise<any>
}
```

Key differences from browser `fetch`:
- `headers` is a plain object (not `Headers` instance)
- No `mode`, `signal` (AbortController) options
- Response `headersObject` is a plain object
- CORS: null origin means server must allow `*`

## Appendix C: Plugin Execution Model

```
┌─────────────────────────────────────────────────────────┐
│ Figma Application                                        │
│                                                          │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │ Plugin Sandbox       │  │ Plugin UI iframe          │  │
│  │ (code.js)            │  │ (ui.html)                 │  │
│  │                      │  │                            │  │
│  │ • figma.* API ✅     │  │ • DOM APIs ✅              │  │
│  │ • fetch() (custom) ✅│  │ • WebSocket ✅             │  │
│  │ • No DOM ❌          │  │ • fetch() (browser) ✅     │  │
│  │ • No WebSocket ❌    │  │ • EventSource (SSE) ✅     │  │
│  │ • No setTimeout ❌   │  │ • No figma.* API ❌        │  │
│  │                      │  │                            │  │
│  │  figma.ui.postMessage│  │  parent.postMessage        │  │
│  │  ──────────────────► │  │ ◄──────────────────────    │  │
│  │                      │  │                            │  │
│  │  figma.ui.onmessage  │  │  window.onmessage         │  │
│  │  ◄────────────────── │  │ ──────────────────────►    │  │
│  └─────────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```
