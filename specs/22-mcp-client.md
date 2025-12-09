# Browser MCP Client

## Overview

Build a browser-based MCP client that can connect to any MCP server with OAuth authentication and sampling support. This client will enable users without VS Code or other MCP-enabled IDEs to use CascadeMCP tools via a web interface.

## Requirements

- Connect to MCP servers via Streamable HTTP transport
- Support OAuth 2.0 authentication flow (RFC 7636 PKCE)
- Handle `sampling/createMessage` requests by calling LLM APIs directly from browser
- Display tool execution progress via MCP notifications
- Provide UI for tool discovery and invocation

## Decisions

The following decisions have been made for this implementation:

| Decision | Choice | Notes |
|----------|--------|-------|
| TypeScript config | Shared `tsconfig.json` | Frontend and server share the same tsconfig |
| Styling | Tailwind CSS | Use Tailwind for consistent, utility-first styling |
| OAuth callback | Redirect flow | Use same-page redirect handling (Option A) |
| Recent/favorites | Not included | Keep initial version simple |
| Server changes | Minimal | Serve static files at `/` and `/assets/*` |
| Form validation | JSON Schema + Ajv | Validate tool inputs using the tool's JSON Schema from `tools/list` |

## Architecture

### How MCP Inspector Does It

Based on research of [modelcontextprotocol/inspector](https://github.com/modelcontextprotocol/inspector):

1. **OAuth Flow**: Uses `InspectorOAuthClientProvider` implementing `OAuthClientProvider` interface
   - Stores tokens in `sessionStorage`
   - Handles PKCE code verifier/challenge
   - Supports dynamic client registration (RFC 7591)

2. **Transport**: Uses `StreamableHTTPClientTransport` for direct HTTP connections
   - Sends requests to `/mcp` endpoint
   - Receives SSE streams for notifications
   - Manages `mcp-session-id` header

3. **Sampling**: MCP Inspector presents sampling requests to user for manual approval
   - Server sends `sampling/createMessage` request
   - Inspector shows request in UI
   - User fills in response manually

### Our Approach: Automatic Sampling

Unlike Inspector's manual approval, we'll **automatically** handle sampling by calling the user's configured LLM:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser MCP Client                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   OAuth      │    │   MCP        │    │   Sampling       │  │
│  │   Provider   │    │   Client     │    │   Handler        │  │
│  │              │    │              │    │                  │  │
│  │ - PKCE flow  │    │ - Transport  │    │ - Anthropic API  │  │
│  │ - Token      │    │ - Tool calls │    │                  │  │
│  │   storage    │    │ - Notifs     │    │                  │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/SSE
                              ▼
                    ┌─────────────────┐
                    │   MCP Server    │
                    │  (CascadeMCP)   │
                    └─────────────────┘
```

## Project Structure

Following the pattern from [bitovi/jira-timeline-report](https://github.com/bitovi/jira-timeline-report), we'll add a Vite-based frontend in a `src/` folder:

```
cascade-mcp/
├── server/                    # Existing MCP server code
├── src/                       # NEW: Frontend code (Vite)
│   ├── main.tsx              # React entry point
│   ├── vite-env.d.ts         # Vite type declarations
│   ├── css/
│   │   └── styles.css        # Tailwind input
│   ├── mcp-client/           # MCP client library
│   │   ├── index.ts          # Main exports
│   │   ├── client.ts         # BrowserMcpClient class
│   │   ├── oauth/
│   │   │   ├── provider.ts   # OAuthClientProvider implementation
│   │   │   └── storage.ts    # Token storage utilities
│   │   └── sampling/
│   │       ├── handler.ts    # Sampling request handler
│   │       └── providers/
│   │           └── anthropic.ts
│   └── react/                # React UI components
│       ├── App.tsx
│       ├── components/
│       │   ├── ConnectionPanel/
│       │   ├── ToolSelector/
│       │   ├── ToolForm/
│       │   ├── ProgressLog/
│       │   ├── ResultDisplay/
│       │   └── Footer/
│       └── hooks/
│           └── useMcpClient.ts
├── index.html                # Main HTML entry (Vite)
├── vite.config.ts            # Vite configuration
├── tailwind.config.js        # Tailwind configuration
└── package.json              # Updated with frontend deps

**Note:** Frontend code shares the existing `tsconfig.json` with the server. The same config works for both since Vite handles its own TypeScript compilation for the browser.
```

## Implementation Plan

### Phase 1: Project Setup and Build Configuration

**Goal:** Set up Vite build for frontend alongside existing server

#### Step 1.1: Add Vite and Frontend Dependencies

Update `package.json` with new scripts and dependencies:

```json
{
  "scripts": {
    "dev": "concurrently \"npm:dev:server\" \"npm:dev:client\"",
    "dev:server": "tsx watch server/server.ts",
    "dev:client": "vite",
    "build": "npm run build:client",
    "build:client": "vite build"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.21",
    "concurrently": "^9.0.1",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "vite": "^5.x"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "existing",
    "ajv": "^8.17.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}
```

**Note:** No separate `build:css` script needed - Vite processes Tailwind via PostCSS automatically.

**Verification:** `npm run dev:client` starts Vite dev server on port 5173

#### Step 1.2: Create Vite Configuration

Create `vite.config.ts`:

```typescript
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: '.', // Project root
  publicDir: 'static', // Existing static folder
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy MCP and API requests to backend during dev
      '/mcp': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/.well-known': 'http://localhost:3000',
    },
  },
});
```

**Verification:** Dev server proxies `/mcp` requests to backend correctly

#### Step 1.3: Create Tailwind Configuration

Create `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Create `postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `src/css/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />
```

#### Step 1.4: Create HTML Entry Point

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CascadeMCP Client</title>
    <link rel="icon" href="/static/favicon.ico" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Note:** No separate `oauth-callback.html` needed - OAuth redirects are handled on the main page.

**Verification:** `index.html` loads React app in browser

### Phase 2: Core MCP Client Library

**Goal:** Minimal MCP client that can connect and call tools

#### Step 2.1: OAuth Provider Implementation

Create `src/mcp-client/oauth/provider.ts` implementing MCP SDK's `OAuthClientProvider`:

```typescript
import { OAuthClientProvider, OAuthTokens } from '@modelcontextprotocol/sdk/client/auth.js';

export class BrowserOAuthClientProvider implements OAuthClientProvider {
  constructor(private serverUrl: string) {}
  
  get redirectUrl(): string {
    // Same-page redirect - main app handles OAuth callback
    return window.location.origin;
  }
  
  get clientMetadata() {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'CascadeMCP Browser Client',
    };
  }
  
  async tokens(): Promise<OAuthTokens | undefined> {
    const key = this.getStorageKey('tokens');
    const stored = sessionStorage.getItem(key);
    return stored ? JSON.parse(stored) : undefined;
  }
  
  saveTokens(tokens: OAuthTokens): void {
    sessionStorage.setItem(this.getStorageKey('tokens'), JSON.stringify(tokens));
  }
  
  // ... PKCE methods, state, etc.
}
```

**Verification:** 
- Can initiate OAuth flow
- Tokens stored/retrieved from sessionStorage
- PKCE verifier/challenge generated correctly

#### Step 2.2: MCP Client Wrapper

Create `src/mcp-client/client.ts`:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';

export class BrowserMcpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  
  async connect(serverUrl: string): Promise<void> {
    const provider = new BrowserOAuthClientProvider(serverUrl);
    
    // Attempt connection, handle 401 with OAuth flow
    const result = await auth(provider, { serverUrl });
    if (result !== 'AUTHORIZED') {
      throw new Error('Authorization failed');
    }
    
    this.transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    this.client = new Client(
      { name: 'cascade-mcp-browser-client', version: '1.0.0' },
      { capabilities: { sampling: {} } }  // Declare we support sampling
    );
    
    await this.client.connect(this.transport);
  }
  
  async listTools(): Promise<ListToolsResult> {
    return this.client.request({ method: 'tools/list' }, ListToolsResultSchema);
  }
  
  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return this.client.request({
      method: 'tools/call',
      params: { name, arguments: args }
    }, CallToolResultSchema);
  }
}
```

**Verification:**
- Connect to local MCP server
- List available tools
- Call a simple tool (like `get-accessible-sites`)

### Phase 3: Sampling Handler

**Goal:** Automatically respond to `sampling/createMessage` requests

#### Step 3.1: LLM Provider Abstraction

Create `src/mcp-client/sampling/providers/anthropic.ts`:

```typescript
export interface SamplingProvider {
  name: string;
  createMessage(request: CreateMessageRequest): Promise<CreateMessageResult>;
}

export class AnthropicSamplingProvider implements SamplingProvider {
  name = 'anthropic';
  
  constructor(private apiKey: string) {}
  
  async createMessage(request: CreateMessageRequest): Promise<CreateMessageResult> {
    // Call Anthropic API directly
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true', // Required for browser
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: request.maxTokens || 8000,
        system: request.systemPrompt,
        messages: this.convertMessages(request.messages),
      }),
    });
    
    const data = await response.json();
    return {
      role: 'assistant',
      content: { type: 'text', text: data.content[0].text },
      model: data.model,
      stopReason: data.stop_reason,
    };
  }
}
```

**Note:** Anthropic requires `anthropic-dangerous-direct-browser-access: true` header for browser calls. This is intentional - users are providing their own API keys.

**Verification:**
- Unit test with mocked fetch
- Integration test calling Anthropic API

#### Step 3.2: Wire Sampling Handler to Client

Update `src/mcp-client/client.ts`:

```typescript
export class BrowserMcpClient {
  private samplingProvider?: SamplingProvider;
  
  setSamplingProvider(provider: SamplingProvider): void {
    this.samplingProvider = provider;
  }
  
  async connect(serverUrl: string): Promise<void> {
    // ... existing connection code ...
    
    // Register sampling request handler
    this.client.setRequestHandler(CreateMessageRequestSchema, async (request) => {
      if (!this.samplingProvider) {
        throw new Error('No sampling provider configured');
      }
      return this.samplingProvider.createMessage(request.params);
    });
  }
}
```

**Verification:**
- Connect to CascadeMCP
- Call `analyze-feature-scope` tool
- Sampling requests automatically handled
- Tool completes successfully

### Phase 4: Notifications and Progress

**Goal:** Display real-time progress to user

#### Step 4.1: Notification Handler

```typescript
export type NotificationHandler = (notification: ServerNotification) => void;

export class BrowserMcpClient {
  private notificationHandlers: NotificationHandler[] = [];
  
  onNotification(handler: NotificationHandler): void {
    this.notificationHandlers.push(handler);
  }
  
  async connect(serverUrl: string): Promise<void> {
    // ... existing connection code ...
    
    this.client.setNotificationHandler((notification) => {
      for (const handler of this.notificationHandlers) {
        handler(notification);
      }
    });
  }
}
```

#### Step 4.2: Progress Event Types

```typescript
// notifications/message - General log messages
interface MessageNotification {
  method: 'notifications/message';
  params: {
    level: 'info' | 'debug' | 'warning' | 'error';
    data: string;
  };
}

// notifications/progress - Progress bar updates
interface ProgressNotification {
  method: 'notifications/progress';
  params: {
    progressToken: string;
    progress: number;
    total: number;
    message?: string;
  };
}
```

**Verification:**
- Receive message notifications during tool execution
- UI updates with progress information

### Phase 5: React UI Components

**Goal:** User-friendly interface for the MCP client

#### Step 5.1: Main App Structure

Create `src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './react/App';
import './css/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/react/App.tsx`:

```tsx
import React, { useState } from 'react';
import ConnectionPanel from './components/ConnectionPanel';
import ToolSelector from './components/ToolSelector';
import ToolForm from './components/ToolForm';
import ProgressLog from './components/ProgressLog';
import ResultDisplay from './components/ResultDisplay';
import { useMcpClient } from './hooks/useMcpClient';

export default function App() {
  const { client, status, connect, disconnect } = useMcpClient();
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">CascadeMCP Client</h1>
      
      <ConnectionPanel 
        status={status} 
        onConnect={connect} 
        onDisconnect={disconnect} 
      />
      
      {status === 'connected' && (
        <>
          <ToolSelector 
            client={client} 
            onSelect={setSelectedTool} 
          />
          
          {selectedTool && (
            <ToolForm 
              client={client}
              toolName={selectedTool}
              onLog={(msg) => setLogs(prev => [...prev, msg])}
              onResult={setResult}
            />
          )}
          
          <ProgressLog logs={logs} />
          <ResultDisplay result={result} />
        </>
      )}
    </div>
  );
}
```

#### Step 5.2: Connection Panel Component

Create `src/react/components/ConnectionPanel/ConnectionPanel.tsx`:

- Server URL input (default: current origin + `/mcp`)
- Anthropic API Key input (never sent to server, stored in sessionStorage)
- Connect/Disconnect buttons
- Connection status indicator

#### Step 5.3: Tool Selector Component

Create `src/react/components/ToolSelector/ToolSelector.tsx`:

- Fetches tools from `tools/list`
- Dropdown to select tool
- Shows tool description

#### Step 5.4: Tool Form Component

Create `src/react/components/ToolForm/ToolForm.tsx`:

- Dynamic form based on tool's input schema (JSON Schema → form fields)
- **JSON Schema validation using Ajv**: Parse the tool's `inputSchema` from `tools/list` response
  - Use `ajv` library to validate inputs against JSON Schema
  - Show inline validation errors under each field
  - Similar approach to MCP Inspector's `DynamicJsonForm` component
- Execute button (disabled until form is valid)
- Handles tool execution and progress

**Form Field Rendering Strategy** (following MCP Inspector pattern):
- `string` → text input (or email/url/date based on `format`)
- `string` with `enum` → select dropdown
- `number`/`integer` → number input with min/max constraints
- `boolean` → checkbox
- Simple `object` with known properties → nested form fields
- Complex `object`/`array` → JSON editor textarea as fallback

```typescript
// Example validation approach
import Ajv from 'ajv';

interface ToolFormProps {
  client: BrowserMcpClient;
  toolName: string;
  inputSchema: JSONSchema; // From tools/list response
  onLog: (msg: string) => void;
  onResult: (result: any) => void;
}

const ajv = new Ajv({ allErrors: true });

function validateInput(schema: JSONSchema, value: unknown): ValidationResult {
  const validate = ajv.compile(schema);
  const valid = validate(value);
  return {
    valid,
    errors: validate.errors?.map(e => ({
      path: e.instancePath,
      message: e.message || 'Invalid value'
    })) || []
  };
}
```

#### Step 5.5: Progress Log Component

Create `src/react/components/ProgressLog/ProgressLog.tsx`:

- Shows real-time notifications
- Auto-scrolls to bottom
- Different styling for info/warning/error

**Verification:**
1. Load UI at `http://localhost:5173`
2. Enter Anthropic API key
3. Click Connect → OAuth flow completes
4. Select `analyze-feature-scope` tool
5. Enter epic key
6. Click Execute
7. Watch progress in log
8. See result

### Phase 6: OAuth Callback Handler

**Goal:** Handle OAuth redirect properly

**Decision:** Use redirect flow with same-page handling (Option A).

**How it works:**

1. User clicks "Connect" → MCP SDK's `auth()` function initiates OAuth
2. Browser redirects to OAuth provider (Atlassian)
3. After authorization, OAuth provider redirects back to `window.location.origin` with `?code=...&state=...`
4. **MCP SDK automatically detects** the `code` parameter and completes the token exchange
5. App cleans up the URL to remove OAuth params

**Implementation notes:**
- Set `redirectUrl` to `window.location.origin` in the OAuth provider
- The MCP SDK's `auth()` function checks for OAuth callback params on each call
- No manual token exchange code needed - SDK handles it
- Just clean up URL after SDK completes

```typescript
// In useMcpClient hook - URL cleanup after OAuth completes
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.has('code') || params.has('error')) {
    // OAuth callback detected - SDK will handle token exchange
    // Clean up URL after a brief delay to let SDK process
    setTimeout(() => {
      window.history.replaceState({}, '', window.location.pathname);
    }, 100);
  }
}, []);
```

**Verification:**
- OAuth redirects complete successfully
- MCP SDK exchanges code for tokens
- URL is cleaned up after callback
- Connection established after OAuth

### Phase 7: Polish and Edge Cases

#### Step 7.1: Error Handling

- OAuth failures with clear messages
- Network errors with retry option
- LLM API errors (rate limits, invalid key)
- Tool execution errors

#### Step 7.2: Token Refresh

- Detect 401 responses
- Trigger token refresh flow
- Retry failed request

#### Step 7.3: Session Persistence

- Remember server URL in localStorage
- Clear sensitive data on logout

## CORS Considerations

### Anthropic API

Anthropic allows direct browser access with the `anthropic-dangerous-direct-browser-access` header. This is designed for exactly this use case - user-provided API keys.

### MCP Server

Our MCP server already has CORS configured for browser access (needed for MCP Inspector compatibility). **No server-side changes are required** for the browser client.

## Development Workflow

Following jira-timeline-report pattern:

```bash
# Start both server and client in dev mode
npm run dev

# Or separately:
npm run dev:server   # tsx watch server/server.ts
npm run dev:client   # vite (port 5173, proxies to server)

# Build for production
npm run build

# Client available at /dist/client/
```

## Production Deployment

### How It Works

In production, the Express server serves both the MCP API endpoints and the static frontend files. The React app **replaces the existing homepage** at `/`, providing users with a functional MCP client rather than just documentation links.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Express Server (port 3000)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /                 → React SPA (index.html)                     │
│  /assets/*         → Static assets (JS, CSS from Vite build)   │
│                                                                 │
│  /mcp              → MCP HTTP transport (existing)              │
│  /auth/*           → OAuth endpoints (existing)                 │
│  /.well-known/*    → OAuth discovery (existing)                 │
│  /register         → Dynamic client registration (existing)    │
│  /api/*            → REST API endpoints (existing)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Homepage Migration

The new React app replaces the existing HTML homepage. The current homepage content (endpoint links, documentation) should be preserved in a **footer component**:

**Current homepage content to preserve:**
- Link to GitHub repo
- Note about sampling support
- MCP endpoint URL (`/mcp`)
- OAuth metadata links (`/.well-known/oauth-authorization-server`, etc.)
- Manual token retrieval link (`/get-access-token`)
- REST API documentation links

**New footer design:**
```tsx
// src/react/components/Footer/Footer.tsx
export function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 py-6 text-sm text-gray-600">
      <div className="max-w-4xl mx-auto px-6">
        <p className="mb-4">
          <strong>CascadeMCP</strong> - MCP tools for software teams. 
          <a href="https://github.com/bitovi/cascade-mcp" className="text-blue-600 hover:underline ml-1">
            View on GitHub
          </a>
        </p>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2">Endpoints</h4>
            <ul className="space-y-1">
              <li><code>/mcp</code> - MCP transport</li>
              <li><a href="/.well-known/oauth-authorization-server">OAuth metadata</a></li>
              <li><a href="/get-access-token">Manual token retrieval</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">REST API</h4>
            <ul className="space-y-1">
              <li><code>POST /api/write-shell-stories</code></li>
              <li><code>POST /api/write-next-story</code></li>
            </ul>
          </div>
        </div>
        
        <p className="mt-4 text-xs text-gray-500">
          Note: Some tools require <a href="https://modelcontextprotocol.io/specification/2025-06-18/client/sampling" className="underline">sampling support</a>.
        </p>
      </div>
    </footer>
  );
}
```

### Server Changes

Update `server/server.ts` to serve the React app at `/` instead of the inline HTML:

```typescript
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.join(__dirname, '../dist/client');

// ... existing middleware ...

// Serve static assets from Vite build (JS, CSS, etc.)
app.use('/assets', express.static(path.join(clientDistPath, 'assets')));

// Serve the React app at the homepage (replaces existing inline HTML)
app.get('/', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Keep all existing API routes unchanged:
// /mcp, /auth/*, /.well-known/*, /register, /api/*, etc.
```

**Note:** This is NOT a catch-all SPA route. The React app is served specifically at `/`. All other routes (API endpoints, OAuth flows) work as before.

### Build Process

```bash
# Build everything
npm run build                    # Builds client only (server runs from source via tsx)

# Production start
npm run start                    # tsx server/server.ts (serves API + static files)
```

### Docker Deployment

Update `Dockerfile` to build the client:

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build               # Build client to dist/client/

EXPOSE 3000
CMD ["npm", "run", "start"]
```

### Environment Variables

The frontend uses `VITE_*` environment variables at **build time** (baked into the bundle):

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_DEFAULT_SERVER_URL` | Default MCP server URL in connection form | `/mcp` (relative, same origin) |

Since the client is served from the same origin as the API, the default server URL can be relative (`/mcp`), avoiding CORS complexity.

## File Changes Summary

**New Files:**
- `vite.config.ts` - Vite configuration
- `tailwind.config.js` - Tailwind configuration
- `postcss.config.js` - PostCSS configuration for Tailwind
- `index.html` - Main entry point
- `src/main.tsx` - React entry point
- `src/vite-env.d.ts` - Vite type declarations
- `src/css/styles.css` - Tailwind input
- `src/mcp-client/*` - MCP client library
- `src/react/*` - React components

**Modified Files:**
- `package.json` - Add scripts and dependencies
- `tsconfig.json` - Add `"include": ["src/**/*"]` for frontend files (shared config)
- `server/server.ts` - Add static file serving and SPA fallback
- `Dockerfile` - Add client build step
