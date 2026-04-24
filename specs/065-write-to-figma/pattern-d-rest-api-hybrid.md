# Pattern D: REST API Hybrid

> **Status: PARTIAL SOLUTION** — Handles some write operations via REST API, uses plugin bridge only for canvas manipulation.

---

## Overview

Some Figma write operations are available through the REST API without needing a plugin at all. This pattern maximizes REST API usage and only falls back to the plugin bridge for operations that require the Plugin API.

```
┌─────────────┐         ┌──────────────────┐
│  MCP Client │  HTTP   │   cascade-mcp     │──── REST API ────► Figma (comments, variables*, dev resources)
│ (VS Code)   │◄──────►│  (remote server)  │
│             │         │                   │──── WSS Bridge ──► Figma Plugin (canvas nodes, fills, text, etc.)
└─────────────┘         └──────────────────┘
```

---

## What the REST API CAN Write

| Operation | Endpoint | Plan Required | Notes |
|-----------|----------|---------------|-------|
| **Post comment** | `POST /v1/files/{key}/comments` | Any | Supports node pinning, threading |
| **Delete comment** | `DELETE /v1/files/{key}/comments/{id}` | Any | |
| **React to comment** | `POST /v1/files/{key}/comments/{id}/reactions` | Any | Emoji reactions |
| **Create/update variables** | `POST /v1/files/{key}/variables` | Enterprise/Org | Full CRUD on design tokens |
| **Publish variables** | `POST /v1/files/{key}/variables/publish` | Enterprise/Org | |
| **Set dev resources** | `POST /v1/dev_resources` | Professional+ | Links to code, docs |
| **Delete dev resources** | `DELETE /v1/dev_resources/{id}` | Professional+ | |
| **Create webhooks** | `POST /v2/webhooks` | Enterprise | Event subscriptions |

## What the REST API CANNOT Write (Requires Plugin)

| Operation | Why No REST API |
|-----------|----------------|
| Create/modify canvas nodes (frames, shapes, text) | Canvas manipulation is Plugin API only |
| Set fills, strokes, effects | Node properties are Plugin API only |
| Create/instantiate components | Plugin API only |
| Modify component properties | Plugin API only |
| Move/resize/clone/delete nodes | Plugin API only |
| Set auto-layout properties | Plugin API only |
| Modify styles | Plugin API only (read via REST, write via Plugin) |
| Execute arbitrary code | Plugin API only |

---

## Architecture

### Routing Layer

```typescript
// server/providers/figma/figma-command-router.ts

type CommandTransport = 'rest-api' | 'plugin-bridge';

const commandRouting: Record<string, CommandTransport> = {
  // REST API operations (no plugin needed)
  'POST_COMMENT': 'rest-api',
  'DELETE_COMMENT': 'rest-api',
  'CREATE_VARIABLES': 'rest-api',    // Enterprise only
  'UPDATE_VARIABLES': 'rest-api',    // Enterprise only
  'DELETE_VARIABLES': 'rest-api',    // Enterprise only
  'SET_DEV_RESOURCE': 'rest-api',
  
  // Plugin bridge operations (require plugin)
  'SET_NODE_FILLS': 'plugin-bridge',
  'SET_TEXT_CONTENT': 'plugin-bridge',
  'CREATE_CHILD_NODE': 'plugin-bridge',
  'RESIZE_NODE': 'plugin-bridge',
  'MOVE_NODE': 'plugin-bridge',
  'CLONE_NODE': 'plugin-bridge',
  'DELETE_NODE': 'plugin-bridge',
  'INSTANTIATE_COMPONENT': 'plugin-bridge',
  'SET_INSTANCE_PROPERTIES': 'plugin-bridge',
  'EXECUTE_CODE': 'plugin-bridge',
  // ... all canvas manipulation
};

async function executeCommand(mcpSessionId: string, command: string, params: any): Promise<any> {
  const transport = commandRouting[command];
  
  if (transport === 'rest-api') {
    return executeViaRestApi(mcpSessionId, command, params);
  } else {
    return executeViaPluginBridge(mcpSessionId, command, params);
  }
}
```

### Graceful Degradation

When the plugin is not connected, the system still works for REST API operations:

```typescript
server.tool('figma_write', schema, async (params, context) => {
  const transport = commandRouting[params.operation];
  
  if (transport === 'rest-api') {
    // Always available (with PAT or OAuth token)
    return executeViaRestApi(sessionId, params.operation, params);
  }
  
  if (transport === 'plugin-bridge') {
    const session = pairedSessions.get(sessionId);
    if (!session) {
      return {
        error: 'This operation requires the Cascade Figma plugin. ' +
               'Install it from the Figma Community, open it in your file, ' +
               'and run figma_connect with the pairing code.',
        availableWithoutPlugin: ['comments', 'variables (Enterprise)', 'dev resources']
      };
    }
    return executeViaPluginBridge(sessionId, params.operation, params);
  }
});
```

---

## Variable Operations via REST API

For Enterprise/Organization plan users, variables can be managed entirely via REST API:

```typescript
// POST https://api.figma.com/v1/files/{file_key}/variables

// Create a variable collection + variables
const payload = {
  variableCollections: [
    {
      action: "CREATE",
      id: "temp_collection_1",
      name: "Colors",
      initialModeId: "temp_mode_1"
    }
  ],
  variableModeValues: [
    {
      variableId: "temp_var_1",
      modeId: "temp_mode_1",
      value: { r: 1, g: 0, b: 0, a: 1 }
    }
  ],
  variables: [
    {
      action: "CREATE",
      id: "temp_var_1",
      name: "primary/red",
      resolvedType: "COLOR",
      variableCollectionId: "temp_collection_1"
    }
  ]
};
```

---

## Advantages

| Advantage | Detail |
|-----------|--------|
| **Partial functionality without plugin** | Comments, variables, dev resources always work |
| **Lower latency for REST ops** | Direct API call, no bridge overhead |
| **Simpler for common ops** | Variable management (Enterprise) needs no plugin |
| **Progressive enhancement** | System works partially → fully as plugin connects |

## Disadvantages

| Disadvantage | Impact |
|-------------|--------|
| **Split behavior** | Some tools need plugin, some don't — confusing UX |
| **Enterprise dependency** | Variable REST API is Enterprise-only |
| **Incomplete** | Can't create ANY canvas elements without plugin |
| **Two auth flows** | REST API needs PAT/OAuth; plugin bridge needs pairing code |
| **Complexity** | Routing layer adds maintenance burden |

---

## When to Use Pattern D

This isn't a standalone pattern — it's a **complement** to Patterns A/B/C. The recommendation is:

1. **Always** expose REST API operations (comments, dev resources)
2. **When possible** (Enterprise), use REST API for variable operations
3. **For canvas manipulation**, use Pattern A (WebSocket bridge) as primary
4. Route commands through a unified layer that picks the right transport

The routing layer should be transparent to the MCP tool consumer — they call `figma_update_variable` and the system decides whether to use REST API or plugin bridge based on:
- Whether the user has Enterprise plan (REST API available)
- Whether the plugin is connected (bridge available)
- Which gives better results for the specific operation
