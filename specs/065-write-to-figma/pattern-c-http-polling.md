# Pattern C: HTTP Polling

> **Status: FALLBACK** — Simplest implementation, highest latency. Good for environments with strict network policies.

---

## Overview

The Figma plugin periodically polls the server via HTTP GET for pending commands, executes them, and POSTs results back. No persistent connections required.

```
┌─────────────┐         ┌──────────────────┐               ┌────────────────┐         ┌──────────────┐
│  MCP Client │  HTTP   │   cascade-mcp     │  GET (poll)   │  Figma Plugin  │  post   │ Plugin Worker │
│ (VS Code)   │◄──────►│  (remote server)  │◄────────────►│  UI (iframe)   │◄──────►│  (code.js)    │
└─────────────┘ /mcp    │                   │  POST (result)│                │  Msg    │              │
                        └──────────────────┘               └────────────────┘         └──────────────┘
```

---

## How It Works

### Poll Loop

```
Plugin polls every 500ms:
  GET /figma-bridge/commands?sessionToken=xxx

Server responds:
  200 { commands: [] }              ← nothing pending
  200 { commands: [{ id, method, params }] }  ← execute these

Plugin executes commands, then:
  POST /figma-bridge/results
  body: [{ id: "cmd_42", result: { success: true } }]
```

### Adaptive Polling

- **Idle**: Poll every 2 seconds (no recent commands)
- **Active**: Poll every 200ms (commands received in last 10s)
- **Burst**: Poll every 100ms (batch operations in progress)

---

## Server-Side Implementation

### Command Queue

```typescript
// Per-session command queue
interface SessionQueue {
  sessionToken: string;
  mcpSessionId: string;
  pendingCommands: Array<{ id: string; method: string; params: any }>;
  pendingResults: Map<string, { resolve, reject, timeout }>;
}

const sessionQueues = new Map<string, SessionQueue>();
```

### Poll Endpoint: `GET /figma-bridge/commands`

```typescript
app.get('/figma-bridge/commands', (req, res) => {
  const { sessionToken } = req.query;
  const session = sessionQueues.get(sessionToken);
  
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  
  // Drain pending commands
  const commands = session.pendingCommands.splice(0);
  res.json({ commands });
});
```

### Result Endpoint: `POST /figma-bridge/results`

```typescript
app.post('/figma-bridge/results', (req, res) => {
  const { sessionToken } = req.query;
  const { results } = req.body; // Array of { id, result?, error? }
  
  const session = sessionQueues.get(sessionToken);
  if (!session) return res.status(401).end();
  
  for (const { id, result, error } of results) {
    const pending = session.pendingResults.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      session.pendingResults.delete(id);
      if (error) pending.reject(new Error(error));
      else pending.resolve(result);
    }
  }
  
  res.status(200).end();
});
```

### Enqueuing Commands

```typescript
function sendCommand(mcpSessionId: string, method: string, params: any): Promise<any> {
  const session = findSessionByMcpId(mcpSessionId);
  const id = `cmd_${++counter}_${Date.now()}`;
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.pendingResults.delete(id);
      reject(new Error('Command timed out'));
    }, 30000); // Longer timeout for polling
    
    session.pendingResults.set(id, { resolve, reject, timeout });
    session.pendingCommands.push({ id, method, params });
  });
}
```

---

## Plugin Implementation

### ui.html

```html
<script>
  const SERVER = 'https://cascade-mcp.example.com';
  let sessionToken = null;
  let pollInterval = 2000; // Start slow
  let lastCommandTime = 0;
  
  // Register and get session token
  async function register(pairingCode) {
    const res = await fetch(`${SERVER}/figma-bridge/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode, fileKey: window.__fileInfo?.fileKey })
    });
    const data = await res.json();
    sessionToken = data.sessionToken;
  }
  
  // Poll loop
  async function poll() {
    if (!sessionToken) return;
    
    try {
      const res = await fetch(`${SERVER}/figma-bridge/commands?sessionToken=${sessionToken}`);
      const { commands } = await res.json();
      
      if (commands.length > 0) {
        lastCommandTime = Date.now();
        pollInterval = 200; // Speed up
        
        const results = [];
        for (const cmd of commands) {
          try {
            const result = await handleCommand(cmd.method, cmd.params);
            results.push({ id: cmd.id, result });
          } catch (error) {
            results.push({ id: cmd.id, error: error.message });
          }
        }
        
        // Send all results at once
        await fetch(`${SERVER}/figma-bridge/results?sessionToken=${sessionToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ results })
        });
      } else {
        // Slow down if idle
        if (Date.now() - lastCommandTime > 10000) pollInterval = 2000;
      }
    } catch (error) {
      console.error('Poll error:', error);
      pollInterval = 5000; // Back off on error
    }
    
    setTimeout(poll, pollInterval);
  }
  
  register(generatePairingCode()).then(poll);
</script>
```

---

## Advantages

| Advantage | Detail |
|-----------|--------|
| **Simplest implementation** | No WebSocket, no SSE — just standard REST endpoints |
| **Maximum compatibility** | Works through any proxy, firewall, or CDN |
| **Stateless server** | No persistent connections to manage |
| **Easy debugging** | Standard HTTP requests, easy to log and replay |
| **Works on serverless** | No long-lived connections needed |

## Disadvantages

| Disadvantage | Impact |
|-------------|--------|
| **Latency** | 500ms–2s delay between command and execution |
| **Bandwidth** | Constant polling even when idle (mitigated by adaptive interval) |
| **Not real-time** | Can't stream events like selection changes efficiently |
| **Battery/CPU** | Continuous polling uses resources on user's machine |
| **Timeout complexity** | Must account for poll interval in command timeouts |

---

## When to Use Pattern C

- As a last-resort fallback when both WebSocket and SSE fail
- For environments with extremely strict network policies
- For serverless deployments that can't maintain persistent connections
- For initial prototyping (simplest to implement)
- When command latency of 1-2 seconds is acceptable
