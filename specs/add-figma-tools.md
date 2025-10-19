# Add Figma MCP Tools and Combined Tools

## Overview

This document outlines the plan to integrate Figma MCP tools from [figma-downloadable-image-mcp](https://github.com/bitovi/figma-downloadable-image-mcp) into the existing jira-mcp-auth-bridge, enabling multi-provider OAuth authentication and dynamic tool registration based on user permissions.

**Architectural Approach**: This plan uses a **functional factory pattern** instead of class-based providers. Providers are simple objects with functions, and OAuth endpoints are created using factory functions (`makeAuthorize(provider)`, `makeCallback(provider)`, etc.). This approach is:
- **Simpler**: No classes, inheritance, or complex OOP patterns
- **More testable**: Easy to inject mock providers into factory functions  
- **More flexible**: Providers are just data, factories handle the logic
- **Type-safe**: Full TypeScript support with explicit dependencies

See `specs/make-oauth-reusable.md` for detailed rationale and examples.

## Goals

1. **Multi-Provider OAuth**: Support simultaneous authentication with both Atlassian (Jira) and Figma
2. **Dynamic Tool Registration**: Register MCP tools dynamically based on which providers the user has authenticated with
   - ✅ **Validated**: MCP SDK supports dynamic `mcp.registerTool()` calls per session
3. **Per-Session MCP Servers**: Create isolated MCP server instances per session with provider-specific tools
   - ✅ **Validated**: Current pattern uses global MCP; refactor to `createMcpServer(authContext)` per session
4. **Combined Tools**: Enable tools that leverage both Jira and Figma APIs (e.g., `write-story` combining both providers)
5. **No Backward Compatibility Required**: Users will re-authenticate after deployment (breaking changes allowed)

## Current Architecture

### Existing Structure
```
server/
├── jira-mcp/                      # Single MCP server with Jira tools
│   ├── index.ts                   # Global MCP instance exported
│   ├── tool-*.ts                  # Individual Jira tool implementations
│   ├── auth-context-store.ts      # Session auth storage
│   └── auth-helpers.ts            # Auth retrieval utilities
├── pkce/                          # OAuth 2.0 PKCE implementation
│   ├── access-token.ts           # Token exchange endpoint
│   ├── authorize.ts              # Authorization endpoint
│   ├── callback.ts               # OAuth callback handler
│   └── token-helpers.ts          # JWT creation utilities
├── atlassian-auth-code-flow.ts   # Atlassian-specific OAuth
├── mcp-service.ts                # HTTP transport + session management
└── server.ts                     # Express app setup
```

### Current Flow
1. User initiates OAuth via `/authorize`
2. Redirect to Atlassian OAuth with PKCE challenge
3. Callback receives code, exchanges for Atlassian tokens
4. Create JWT embedding Atlassian tokens
5. Client uses JWT in `Authorization: Bearer <token>` header
6. MCP transport validates JWT and extracts Atlassian credentials
7. Global MCP server instance serves Jira tools to all sessions

### Current Limitations
- **Single Provider**: Only supports Atlassian/Jira authentication
- **Static Tool Set**: All sessions get the same tools regardless of permissions
- **Global MCP Server**: One `McpServer` instance shared across all sessions
- **Single JWT Payload**: JWT only contains Atlassian credentials

## Target Architecture

### Key Architectural Patterns

**1. Functional Provider Objects**
- Providers are simple objects with functions (not classes)
- Example: `atlassianProvider = { name, createAuthUrl, exchangeCodeForTokens, registerTools }`
- No inheritance, no complex OOP patterns

**2. OAuth Factory Functions**
- OAuth endpoints created by passing provider to factory: `makeAuthorize(provider)`
- Factory functions contain the logic, providers contain the data
- Provider-specific behavior encapsulated in provider object
- Example: `app.get('/authorize', makeAuthorize(atlassianProvider))`

**3. Standard Token Structure**
- All providers return `StandardTokenResponse` with consistent fields
- JWT always uses standard field names (`access_token`, not `atlassian_access_token`)
- Tools work with any provider without modification

**4. Explicit Dependency Injection**
- Providers explicitly passed to factory functions (no hidden globals)
- Can use direct imports or optional registry pattern
- Better for testing (easy to inject mocks)

### New Structure
```
server/
├── mcp/                           # Core MCP infrastructure (NEW)
│   ├── server-factory.ts         # Dynamic MCP server creation per session
│   ├── transport-manager.ts      # Session-to-transport mapping
│   └── types.ts                  # Shared MCP types
├── providers/                     # Multi-provider architecture (NEW)
│   ├── provider-interface.ts     # Common OAuth provider interface
│   ├── atlassian/
│   │   ├── index.ts             # Atlassian provider implementation
│   │   ├── auth-flow.ts         # OAuth flow (existing code refactored)
│   │   └── tools/               # Atlassian-specific tools
│   │       ├── tool-get-atlassian-sites.ts (renamed from get-accessible-sites)
│   │       ├── tool-get-jira-issue.ts
│   │       ├── tool-get-jira-attachments.ts
│   │       └── tool-update-issue-description.ts
│   ├── figma/
│   │   ├── index.ts             # Figma provider implementation
│   │   ├── auth-flow.ts         # Figma OAuth flow
│   │   └── tools/               # Figma-specific tools (from figma-downloadable-image-mcp)
│   │       ├── tool-get-figma-image-download.ts
│   │       ├── tool-get-layers-for-a-page.ts
│   │       └── tool-get-metadata-for-layer.ts
│   └── combined/
│       └── tools/                # Cross-provider tools
│           └── tool-attach-figma-to-jira.ts (future)
├── pkce/                          # Enhanced OAuth (MODIFIED)
│   ├── multi-provider-authorize.ts  # Multi-provider authorization flow
│   ├── multi-provider-callback.ts   # Handles multiple provider callbacks
│   ├── access-token.ts           # Enhanced to support multiple providers
│   └── token-helpers.ts          # Enhanced JWT with multiple provider credentials
├── auth/                          # Enhanced auth management (NEW)
│   ├── multi-provider-context.ts # Store credentials for multiple providers
│   └── consent-page.ts           # UI for provider selection and consent
├── mcp-service.ts                # Enhanced transport (MODIFIED)
└── server.ts                     # Enhanced Express app (MODIFIED)
```

### Enhanced JWT Structure
```typescript
interface MultiProviderJWT {
  type: 'access_token';
  iat: number;
  exp: number;
  resource?: string;
  
  // Provider credentials (only present if authenticated)
  atlassian?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    scopes: string[];
  };
  figma?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user_id: string;
    scopes: string[];
  };
}
```

### Enhanced Auth Context
```typescript
// server/jira-mcp/auth-context-store.ts
interface AuthContext {
  sessionId: string;
  atlassian?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    cloudId?: string; // From accessible-resources API
  };
  figma?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user_id: string;
  };
}
```

## Design Decisions Summary

Based on user answers and codebase review, these decisions guide the implementation:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **OAuth Endpoint Pattern** | Factory functions (`makeAuthorize(provider)`) | Simpler, testable, explicit dependencies |
| **Provider Access** | Direct imports (no registry) | Explicit, better tree-shaking, less magic |
| **MCP Server Lifecycle** | Always create fresh per session | Simpler state management, no caching complexity |
| **Tool Registration** | Dynamic based on JWT providers | Tools only appear if authenticated with provider |
| **Combined Tool Naming** | No special prefix (e.g., `write-story`) | Descriptive names, not implementation details |
| **JWT Token Embedding** | Embed all provider tokens in single JWT | Works for 2-3 providers, simpler than server-side storage |
| **Token Refresh** | Individual provider or all (whichever easier) | Flexible based on implementation simplicity |
| **Connection Hub UI** | Buttons with status display | User-controlled, visual feedback, no persistence |
| **OAuth Flow** | Parallel (user choice) | User clicks buttons in any order |
| **Figma Authentication** | OAuth only (no PAT fallback) | Clean migration path, consistent auth pattern |
| **Partial Authentication** | Allowed (user clicks "Done") | Flexible, handles provider failures gracefully |
| **Session Storage** | In-memory (existing pattern) | Sufficient for current scale, simpler |
| **Backward Compatibility** | NOT REQUIRED | Breaking changes allowed, users re-authenticate |
| **Testing Strategy** | Follow `specs/e2e-testing-strategy.md` | Dual approach: direct HTTP + MCP SDK testing |
| **Performance Targets** | No specific benchmarks | Focus on correctness first |
| **Tool Name Prefixes** | Provider-prefixed (e.g., `atlassian-get-sites`) | Clear provider identification, combined tools use descriptive names |
| **JWT Payload Structure** | Nested providers (`{ atlassian: {...}, figma: {...} }`) | Cleaner multi-provider support, aligns with auth context |
| **Token Access Pattern** | Nested access (`authInfo.atlassian.access_token`) | Matches JWT structure, clean tool code |
| **Connection Hub Timing** | Phase 1.3 (after Atlassian refactor, before Figma) | Validate UI with single provider first |
| **OAuth Endpoint Pattern** | Static routes with factory functions | Clean, explicit, type-safe routing from day 1 |
| **Callback Routing** | Provider-specific routes returning to hub | No session flags needed, route indicates intent |
| **Phase Structure** | Split Phase 2 (factories in 1.3, dynamic MCP separate) | Factory pattern established early, MCP refactor independent |
| **AuthContext Migration** | Update to nested structure in Phase 1.2 | Avoid migrating tools twice, consistent from start |
| **Session Token Security** | Express session secret only (no additional encryption) | Sufficient for short-lived OAuth flow |

### All Decisions Finalized ✅

All critical decisions have been made:
- **Q13**: ✅ Use provider prefixes (e.g., `atlassian-get-sites`, `figma-get-image`)
- **Q21**: ✅ Use nested JWT structure (`{ atlassian: { access_token, ... }, figma: { ... } }`)
- **Q22**: ✅ Use Option A - nested access (`authInfo.atlassian.access_token`)
- **Q23**: ✅ Implement connection hub after Phase 1.2 (before adding Figma provider)
- **Q24**: ✅ Connection hub is part of multi-provider flow (after single-provider factory pattern validated)

## Implementation Plan

### Phase 1: Provider Abstraction & Refactoring

**Goal**: Extract existing Atlassian OAuth logic into a reusable provider pattern without breaking current functionality.

**1.1 Create Provider Interface** (`server/providers/provider-interface.ts`)

Use a **functional interface** instead of class-based approach:

```typescript
// Standard token response structure used by all providers
export interface StandardTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id?: string;
  [key: string]: any; // Allow provider-specific fields
}

// Parameters for creating authorization URLs
export interface AuthUrlParams {
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  responseType?: string;
  scope?: string;
  redirectUri?: string;
}

// Parameters for token exchange
export interface TokenExchangeParams {
  code: string;
  codeVerifier: string;
  redirectUri?: string;
}

// Callback parameters extracted from request
export interface CallbackParams {
  code: string;
  state?: string;
  normalizedState?: string;
}

// Provider interface - simple object with functions
export interface OAuthProvider {
  name: string;
  
  // Core OAuth functions - each provider implements these
  createAuthUrl(params: AuthUrlParams): string;
  extractCallbackParams(req: any): CallbackParams;
  exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse>;
  
  // Optional provider customizations
  getDefaultScopes?(): string[];
  validateTokenResponse?(response: any): boolean;
  
  // Tool registration function
  registerTools(mcp: McpServer, authContext: any): void;
}
```

**1.2 Refactor Atlassian Provider + Migrate to Nested AuthContext**

**Objective**: Convert existing code to provider pattern AND migrate to nested AuthContext structure (Q28: avoid migrating tools twice).

**Critical**: This phase updates both the provider abstraction AND the token access pattern simultaneously.

Refactor existing code into a **simple provider object**:

```typescript
// server/providers/atlassian/index.ts
import type { OAuthProvider, AuthUrlParams, TokenExchangeParams, StandardTokenResponse, CallbackParams } from '../provider-interface.ts';
import { registerAtlassianTools } from './tools/index.ts';

export const atlassianProvider: OAuthProvider = {
  name: 'atlassian',
  
  createAuthUrl(params: AuthUrlParams): string {
    const clientId = process.env.VITE_JIRA_CLIENT_ID;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
    const redirectUri = params.redirectUri || `${baseUrl}/callback`;
    const scope = params.scope || process.env.VITE_JIRA_SCOPE || 'read:jira-work write:jira-work offline_access';
    
    const urlParams: Record<string, string> = {
      client_id: clientId!,
      response_type: params.responseType || 'code',
      redirect_uri: redirectUri,
      scope,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod,
    };
    
    if (params.state) {
      urlParams.state = params.state;
    }
    
    return `https://auth.atlassian.com/authorize?${new URLSearchParams(urlParams).toString()}`;
  },
  
  extractCallbackParams(req: any): CallbackParams {
    const { code, state } = req.query;
    
    // Handle Atlassian-specific URL encoding: + gets decoded as space
    const normalizedState = state ? state.replace(/ /g, '+') : state;
    
    return {
      code: code || '',
      state,
      normalizedState,
    };
  },
  
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    const clientId = process.env.VITE_JIRA_CLIENT_ID;
    const clientSecret = process.env.JIRA_CLIENT_SECRET;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
    const redirectUri = params.redirectUri || `${baseUrl}/callback`;
    
    const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: params.code,
        redirect_uri: redirectUri,
        code_verifier: params.codeVerifier,
      }),
    });
    
    const tokenData = await tokenRes.json();
    
    if (!tokenData.access_token) {
      throw new Error(`Atlassian token exchange failed: ${JSON.stringify(tokenData)}`);
    }
    
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      scope: tokenData.scope,
    };
  },
  
  getDefaultScopes(): string[] {
    return ['read:jira-work', 'write:jira-work', 'offline_access'];
  },
  
  registerTools(mcp: McpServer, authContext: any): void {
    registerAtlassianTools(mcp, authContext);
  },
};
```

Move existing tools to `server/providers/atlassian/tools/`:
- Move all `server/jira-mcp/tool-*.ts` files
- Rename tools with `atlassian-` prefix per Q13:
  - `get-accessible-sites` → `atlassian-get-sites`
  - `get-jira-issue` → `atlassian-get-issue`
  - `get-jira-attachments` → `atlassian-get-attachments`
  - `update-issue-description` → `atlassian-update-issue-description`
- Update tools to use nested token access per Q22: `authInfo.atlassian.access_token`
- Create `tools/index.ts` that exports `registerAtlassianTools(mcp, authContext)`

**Update AuthContext structure** to nested format (Q21, Q28):

```typescript
// server/jira-mcp/auth-context-store.ts
export interface AuthContext {
  sessionId: string;
  atlassian?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    cloudId?: string;
  };
  figma?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user_id?: string;
  };
}
```

**Update dependent files**:
- `server/jira-mcp/auth-helpers.ts`: Return nested `AuthContext`
- `server/tokens.ts`: Create/validate JWT with nested payload `{ atlassian: {...}, figma: {...} }`
- `server/pkce/access-token.ts`: Create nested JWT after token exchange
- All 6+ tool files: Use `authInfo.atlassian.access_token` instead of `authInfo.atlassian_access_token`

**Deliverables:**
- [ ] Update `AuthContext` interface to nested structure
- [ ] Update `auth-context-store.ts` with new interface
- [ ] Update `auth-helpers.ts` to return nested AuthContext
- [ ] Update `tokens.ts` JWT creation/validation for nested payload
- [ ] Atlassian provider object created
- [ ] All Jira tools moved to `providers/atlassian/tools/`
- [ ] Tools renamed with `atlassian-` prefix
- [ ] Tools updated to use nested token access (`authInfo.atlassian.access_token`)
- [ ] `registerAtlassianTools` function implemented
- [ ] Unit tests for Atlassian provider and nested auth structure

**Verification:**
- ✅ AuthContext interface uses nested structure
- ✅ JWT payload contains `{ atlassian: { access_token, refresh_token, ... } }`
- ✅ auth-helpers.ts returns properly typed nested AuthContext
- ✅ Atlassian provider object exports correct functions
- ✅ All Atlassian tools registered with prefixed names
- ✅ Tools can access tokens using `authInfo.atlassian.access_token`
- ✅ Existing OAuth flow works with nested tokens
- ✅ `registerAtlassianTools(mcp, authContext)` successfully registers all tools

---

**1.3 Create Connection Hub UI + Factory Functions** **[NEW PHASE - Per Q23, Q25, Q26, Q27]**

**Objective**: Implement connection hub UI and factory-based OAuth routing with static routes BEFORE adding Figma provider.

**Why this phase exists**:
- Q23: Validate connection hub UI with single provider first
- Q25: Use static routes with factory functions from day 1
- Q26: Provider-specific callbacks always return to hub
- Q27: Split factory implementation from dynamic MCP server refactor

Implement factory functions for OAuth endpoints (Q25):

```typescript
// server/provider-server-oauth/oauth-factories.ts
import type { OAuthProvider } from '../providers/provider-interface';
import { Request, Response } from 'express';

/**
 * Creates an authorize endpoint for a specific provider
 * Per Q25: Static routes with factory functions
 */
export function makeAuthorize(provider: OAuthProvider) {
  return async (req: Request, res: Response) => {
    const { code_challenge, code_challenge_method, state } = req.query;
    
    // Store PKCE parameters in session
    req.session.provider = provider.name;
    req.session.codeChallenge = code_challenge as string;
    
    const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
    const authUrl = provider.createAuthUrl({
      redirectUri: `${baseUrl}/auth/callback/${provider.name}`, // Per Q26: Provider-specific callback
      codeChallenge: code_challenge as string,
      codeChallengeMethod: code_challenge_method as string || 'S256',
      state: state as string,
      responseType: 'code',
    });
    
    res.redirect(authUrl);
  };
}

/**
 * Creates a callback endpoint for a specific provider
 * Per Q26: Always returns to connection hub
 */
export function makeCallback(provider: OAuthProvider, options: { onSuccess: (req: Request, tokens: any) => Promise<void> }) {
  return async (req: Request, res: Response) => {
    const callbackParams = provider.extractCallbackParams(req);
    const codeVerifier = req.session.codeVerifier;
    
    try {
      const tokens = await provider.exchangeCodeForTokens({
        code: callbackParams.code,
        codeVerifier,
      });
      
      await options.onSuccess(req, tokens);
      
      // Per Q26: Always redirect to connection hub
      res.redirect('/auth/connect');
    } catch (error) {
      console.error(`${provider.name} OAuth callback error:`, error);
      res.status(500).send(`Authentication failed: ${error.message}`);
    }
  };
}

/**
 * Handler for successful provider authentication
 * Stores tokens in session and updates connected providers list
 */
export async function hubCallbackHandler(req: Request, tokens: any): Promise<void> {
  const providerName = req.session.provider;
  
  // Store tokens in session (keyed by provider name)
  if (!req.session.providerTokens) {
    req.session.providerTokens = {};
  }
  
  req.session.providerTokens[providerName] = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  };
  
  // Track connected providers
  if (!req.session.connectedProviders) {
    req.session.connectedProviders = [];
  }
  if (!req.session.connectedProviders.includes(providerName)) {
    req.session.connectedProviders.push(providerName);
  }
}
```

Implement connection hub UI:

```typescript
// server/provider-server-oauth/consent-page.ts
export function renderConnectionHub(req: Request, res: Response): void {
  const connectedProviders = req.session.connectedProviders || [];
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Connect to MCP Bridge</title>
        <style>
          body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
          .provider { padding: 20px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; }
          .provider.connected { background: #e8f5e9; border-color: #4caf50; }
          button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
          button:disabled { opacity: 0.5; cursor: not-allowed; }
          .status { color: #4caf50; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Connect Services</h1>
        <p>Choose which services to connect:</p>
        
        <div class="provider ${connectedProviders.includes('atlassian') ? 'connected' : ''}">
          <h2>Atlassian (Jira)</h2>
          <p>Access Jira issues, attachments, and project data</p>
          ${connectedProviders.includes('atlassian') 
            ? '<span class="status">✓ Connected</span>'
            : '<button onclick="location.href=\'/auth/connect/atlassian\'">Connect Atlassian</button>'
          }
        </div>
        
        <!-- Figma provider will be added in Phase 1.4 -->
        
        <div style="margin-top: 30px;">
          <button onclick="location.href='/auth/done'" ${connectedProviders.length === 0 ? 'disabled' : ''}>
            Done
          </button>
        </div>
      </body>
    </html>
  `;
  
  res.send(html);
}

export async function handleConnectionDone(req: Request, res: Response): Promise<void> {
  const connectedProviders = req.session.connectedProviders || [];
  const providerTokens = req.session.providerTokens || {};
  
  if (connectedProviders.length === 0) {
    res.status(400).send('No providers connected');
    return;
  }
  
  // Create multi-provider JWT with nested structure per Q21
  const jwtPayload: any = {};
  for (const providerName of connectedProviders) {
    jwtPayload[providerName] = providerTokens[providerName];
  }
  
  const jwt = await createJWT(jwtPayload);
  
  // Redirect to MCP client with token
  const redirectUrl = new URL(req.session.mcpRedirectUri);
  redirectUrl.searchParams.set('access_token', jwt);
  
  res.redirect(redirectUrl.toString());
}
```

Update server.ts with static routes (Q25):

```typescript
// server/server.ts
import { makeAuthorize, makeCallback, hubCallbackHandler } from './auth/oauth-factories';
import { atlassianProvider } from './providers/atlassian';
import { renderConnectionHub, handleConnectionDone } from './auth/consent-page';

// Static routes per Q25
app.get('/auth/connect', renderConnectionHub);
app.get('/auth/connect/atlassian', makeAuthorize(atlassianProvider));
app.get('/auth/callback/atlassian', makeCallback(atlassianProvider, { onSuccess: hubCallbackHandler }));
app.get('/auth/done', handleConnectionDone);

// Figma routes will be added in Phase 1.4:
// app.get('/auth/connect/figma', makeAuthorize(figmaProvider));
// app.get('/auth/callback/figma', makeCallback(figmaProvider, { onSuccess: hubCallbackHandler }));
```

**Deliverables:**
- [ ] `makeAuthorize(provider)` factory function implemented
- [ ] `makeCallback(provider, options)` factory function implemented
- [ ] `hubCallbackHandler` function stores tokens in session
- [ ] Connection hub UI renders with Atlassian button
- [ ] Static routes registered in server.ts
- [ ] Atlassian OAuth flow goes through connection hub
- [ ] "Done" button creates multi-provider JWT
- [ ] Unit tests for factory functions

**Verification:**
- ✅ `/auth/connect` displays connection hub UI
- ✅ "Connect Atlassian" button works
- ✅ OAuth callback redirects back to `/auth/connect`
- ✅ Connected provider shows "✓ Connected" status
- ✅ "Done" button creates nested JWT and redirects to MCP client
- ✅ Factory functions are reusable for future providers
- ✅ No query parameter routing (all static routes per Q25)

---

**1.4 Add Figma Provider** (`server/providers/figma/`)

**Objective**: Add Figma as second provider and update connection hub to support both providers.

Create Figma provider as a **simple object** following the same pattern:

```typescript
// server/providers/figma/index.ts
import type { OAuthProvider, AuthUrlParams, TokenExchangeParams, StandardTokenResponse, CallbackParams } from '../provider-interface.ts';
import { registerFigmaTools } from './tools/index.ts';

export const figmaProvider: OAuthProvider = {
  name: 'figma',
  
  createAuthUrl(params: AuthUrlParams): string {
    const clientId = process.env.FIGMA_CLIENT_ID;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
    const redirectUri = params.redirectUri || `${baseUrl}/callback`;
    const scope = params.scope || process.env.FIGMA_OAUTH_SCOPES || 'files:read';
    
    const urlParams: Record<string, string> = {
      client_id: clientId!,
      response_type: params.responseType || 'code',
      redirect_uri: redirectUri,
      scope,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod,
    };
    
    if (params.state) {
      urlParams.state = params.state;
    }
    
    return `https://www.figma.com/oauth?${new URLSearchParams(urlParams).toString()}`;
  },
  
  extractCallbackParams(req: any): CallbackParams {
    const { code, state } = req.query;
    
    // Figma doesn't have URL encoding issues like Atlassian
    return {
      code: code || '',
      state,
      normalizedState: state,
    };
  },
  
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    const clientId = process.env.FIGMA_CLIENT_ID;
    const clientSecret = process.env.FIGMA_CLIENT_SECRET;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
    const redirectUri = params.redirectUri || `${baseUrl}/callback`;
    
    const response = await fetch('https://www.figma.com/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: params.code,
        redirect_uri: redirectUri,
        code_verifier: params.codeVerifier,
      }),
    });
    
    const data = await response.json();
    
    if (!data.access_token) {
      throw new Error(`Figma token exchange failed: ${JSON.stringify(data)}`);
    }
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type || 'Bearer',
      expires_in: data.expires_in || 3600,
      scope: data.scope,
      user_id: data.user_id,
    };
  },
  
  getDefaultScopes(): string[] {
    return ['files:read', 'file_comments:write'];
  },
  
  registerTools(mcp: McpServer, authContext: any): void {
    registerFigmaTools(mcp, authContext);
  },
};
```

Port Figma tools from figma-downloadable-image-mcp:
- Rename tools with `figma-` prefix per Q13:
  - `get-figma-image-download` → `figma-get-image-download`
  - `get-layers-for-a-page` → `figma-get-layers-for-page`
  - `get-metadata-for-layer` → `figma-get-metadata-for-layer`
- Update tools to use nested token access per Q22: `authInfo.figma.access_token`
- Convert from PAT authentication to OAuth
- Create `tools/index.ts` that exports `registerFigmaTools(mcp, authContext)`

Update connection hub to include Figma:
```typescript
// Add Figma option to connection hub
<div class="provider ${connectedProviders.includes('figma') ? 'connected' : ''}">
  <h2>Figma</h2>
  <p>Access Figma designs, layers, and export images</p>
  ${connectedProviders.includes('figma') 
    ? '<span class="status">✓ Connected</span>'
    : '<button onclick="location.href=\'/auth/connect/figma\'">Connect Figma</button>'
  }
</div>
```

**Deliverables:**
- [ ] `OAuthProvider` interface defined (from 1.1)
- [ ] Atlassian provider refactored and tested (from 1.2)
- [ ] Connection hub UI working with Atlassian (from 1.3)
- [ ] Figma provider implemented and tested
- [ ] All Figma tools ported with `figma-` prefix
- [ ] Connection hub updated with Figma option
- [ ] Multi-provider JWT creation working
- [ ] Unit tests for both providers

**Verification - How to Know It's Working:**
- ✅ Can connect to Atlassian only → get Atlassian tools
- ✅ Can connect to Figma only → get Figma tools
- ✅ Can connect to both → get both tool sets
- ✅ Connection hub shows both providers with status
- ✅ JWT has nested structure: `{ atlassian: {...}, figma: {...} }`
- ✅ Tools access tokens via nested path (`authInfo.figma.access_token`)
- ✅ "Done" button works with any combination of providers
- ✅ Session state preserved across multiple OAuth flows

**Migration Notes:**
- Phase 1 now complete with full multi-provider OAuth flow
- Connection hub UX validated with single provider first (1.3), then expanded (1.4)
- JWT structure uses nested format from Q21 throughout
- Tool naming follows prefix convention from Q13
- Token access uses nested pattern from Q22

---

### Phase 2: Dynamic MCP Servers

**Goal**: Refactor global MCP server to per-session instances with dynamic tool registration based on authenticated providers.

**Per Q27**: This phase focuses ONLY on dynamic MCP servers. Factory functions were completed in Phase 1.3.

**2.1 Refactor MCP Service to Per-Session Servers** (`server/mcp-service.ts`)

Current state: Global MCP server shared across all sessions.

Proposed: Create fresh MCP server instance for each session with dynamic tool registration.

```typescript
// BEFORE (server/jira-mcp/index.ts): Global MCP instance
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';

export const mcp = new McpServer(
  {
    name: 'jira-mcp-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
  }
);

// Tools registered globally at startup
registerAllTools(mcp);

// AFTER: Per-session MCP instances
// server/mcp/server-factory.ts
import type { AuthContext } from '../jira-mcp/auth-context-store';
import { atlassianProvider } from '../providers/atlassian';
import { figmaProvider } from '../providers/figma';

/**
 * Creates a fresh MCP server instance for a session
 * Registers tools dynamically based on authenticated providers in JWT
 */
export function createMcpServer(authContext: AuthContext): McpServer {
  const mcp = new McpServer(
    {
      name: 'multi-provider-mcp-bridge',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  // Dynamically register tools based on available providers in JWT
  if (authContext.atlassian) {
    console.log('  Registering Atlassian tools');
    atlassianProvider.registerTools(mcp, authContext);
  }

  if (authContext.figma) {
    console.log('  Registering Figma tools');
    figmaProvider.registerTools(mcp, authContext);
  }

  // Register combined tools only if BOTH providers are available
  if (authContext.atlassian && authContext.figma) {
    console.log('  Registering combined tools');
    registerCombinedTools(mcp, authContext);
  }

  return mcp;
}
```

**2.2 Update MCP Service to Use Dynamic Servers** (`server/mcp-service.ts`)

Modify transport creation to use per-session MCP instances:

```typescript
// server/mcp-service.ts
import { createMcpServer } from './mcp/server-factory';

export async function handleMcpPost(req: Request, res: Response): Promise<void> {
  // ... existing session detection logic ...
  
  if (!sessionId && isInitializeRequest(req.body as JSONRPCRequest)) {
    // Extract multi-provider auth info from JWT
    const authContext = await extractAuthContext(req, res);
    if (!authContext) return;

    sessionId = randomUUID();
    
    // Create per-session MCP server with dynamic tool registration
    const mcpServer = createMcpServer(authContext);
    
    // Create per-session transport connected to this MCP server instance
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });
    
    await mcpServer.connect(transport);
    
    // Store both transport and auth context
    transports.set(sessionId, transport);
    setAuthContext(sessionId, authContext);
    
    transport.onclose = () => {
      transports.delete(sessionId);
      clearAuthContext(sessionId);
    };
    
    res.setHeader('mcp-session-id', sessionId);
  }
  
  // ... rest of existing logic ...
}
```

**Deliverables:**
- [ ] `createMcpServer(authContext)` factory function
- [ ] Per-session MCP server creation in mcp-service.ts
- [ ] Dynamic tool registration based on JWT providers
- [ ] Combined tools registered only when both providers available
- [ ] Remove global MCP instance from jira-mcp/index.ts
- [ ] Unit tests for dynamic server creation

**Verification:**
- ✅ JWT with only `atlassian` provider → only Atlassian tools available
- ✅ JWT with only `figma` provider → only Figma tools available
- ✅ JWT with both providers → Atlassian + Figma + combined tools
- ✅ Each MCP session gets independent server instance
- ✅ Tools list changes based on authenticated providers
- ✅ Combined tools (`write-story`) only appear with both providers

---

### Phase 3: Combined Tools Implementation

**Goal**: Create tools that use both Atlassian and Figma providers together.

**3.1 Implement `write-story` Tool** (`server/tools/combined/write-story.ts`)
```typescript
// server/mcp/server-factory.ts
import { atlassianProvider } from '../providers/atlassian/index.ts';
import { figmaProvider } from '../providers/figma/index.ts';
import type { AuthContext } from '../jira-mcp/auth-context-store';

export function createMcpServer(authContext: AuthContext): McpServer {
  const mcp = new McpServer({ name: 'mcp-bridge', version: '1.0.0' }, { capabilities: { tools: {} } });

  // Directly use imported providers
  if (authContext.atlassian) {
    atlassianProvider.registerTools(mcp, authContext);
  }

  if (authContext.figma) {
    figmaProvider.registerTools(mcp, authContext);
  }

  return mcp;
}
```

**Option B: Provider Registry (For dynamic/plugin scenarios)**
```typescript
// server/providers/registry.ts
const providers = new Map<string, OAuthProvider>();

export function registerProvider(provider: OAuthProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): OAuthProvider {
  const provider = providers.get(name);
  if (!provider) throw new Error(`Provider ${name} not registered`);
  return provider;
}

// In server.ts startup
import { atlassianProvider } from './providers/atlassian/index.ts';
import { figmaProvider } from './providers/figma/index.ts';
import { registerProvider } from './providers/registry.ts';

registerProvider(atlassianProvider);
registerProvider(figmaProvider);

// In server-factory.ts
import { getProvider } from '../providers/registry.ts';
import type { AuthContext } from '../jira-mcp/auth-context-store';

export function createMcpServer(authContext: AuthContext): McpServer {
  const mcp = new McpServer({ name: 'mcp-bridge', version: '1.0.0' }, { capabilities: { tools: {} } });

  // Dynamic provider lookup
  if (authContext.atlassian) {
    const provider = getProvider('atlassian');
    provider.registerTools(mcp, authContext);
  }

  if (authContext.figma) {
    const provider = getProvider('figma');
    provider.registerTools(mcp, authContext);
  }

  return mcp;
}
```

**Recommendation**: Start with **Option A (Direct Imports)** for simplicity. Only use Option B if you need runtime plugin loading or dynamic provider discovery.

**Deliverables:**
- [ ] `createMcpServer` factory function
- [ ] Per-session MCP server instances
- [ ] Provider access pattern chosen (direct imports or registry)
- [ ] Updated `mcp-service.ts` for dynamic servers
- [ ] Session cleanup for MCP servers
- [ ] Integration tests for dynamic tool registration

**Verification - How to Know It's Working:**
- ✅ **Atlassian-only sessions**: Sessions with only Atlassian auth get only Jira tools
  - Test: Authenticate with Atlassian only → call `tools/list`
  - Verify: Tool list contains only Atlassian tools (no Figma tools)
  - Test: Try to call Figma tool → should fail with "tool not found"
- ✅ **Figma-only sessions**: Sessions with only Figma auth get only Figma tools
  - Test: Authenticate with Figma only → call `tools/list`
  - Verify: Tool list contains only Figma tools (no Jira tools)
  - Test: Jira tools not present in available tools
- ✅ **Multi-provider sessions**: Sessions with both providers get all tools
  - Test: Authenticate with both → call `tools/list`
  - Verify: Tool list contains Atlassian + Figma + Combined tools
  - Test: Can successfully call tools from both providers
- ✅ **Session isolation**: Multiple concurrent sessions don't interfere
  - Test: Session A with Jira-only, Session B with Figma-only simultaneously
  - Verify: Session A can't access Figma tools, Session B can't access Jira tools
  - Test: Each session gets correct tool list
- ✅ **Tool execution**: Tools receive correct provider credentials
  - Test: Call `get-jira-issue` → uses Atlassian token from session
  - Test: Call `get-figma-image-download` → uses Figma token from session
  - Verify: No cross-provider credential leakage
- ✅ **Session cleanup**: MCP servers properly disposed on session end
  - Test: Create session → close connection → verify cleanup in logs
  - Monitor: Memory usage should not grow with session churn
- ✅ **Dynamic tool registration works**: Sessions get correct tool sets
  - Test: Atlassian-only session has only Jira tools
  - Test: Figma-only session has only Figma tools  
  - Test: Multi-provider session has all tools

**Migration Notes:**
- Major architectural change: Global MCP → Per-session MCP instances
- Tool registration now dynamic based on auth context
- Provider-specific token access pattern (see Q22) implemented here
- Breaking change acceptable (users re-authenticate)

---

### Phase 4: Testing & Documentation

**Goal**: Comprehensive testing to ensure all flows work correctly and documentation is complete for users and developers.

**4.1 Integration Tests**
- [ ] Test Atlassian-only authentication flow
- [ ] Test Figma-only authentication flow
- [ ] Test multi-provider authentication flow
- [ ] Test dynamic tool registration based on providers
- [ ] Test token refresh for each provider
- [ ] Test session cleanup and MCP server disposal

**4.2 E2E Testing**
- [ ] Test with real Atlassian OAuth
- [ ] Test with real Figma OAuth
- [ ] Test with VS Code Copilot client
- [ ] Test with MCP Inspector
- [ ] Test concurrent multi-session scenarios

**4.3 Documentation**
- [ ] Update `server/readme.md` with multi-provider architecture
- [ ] Document provider interface for adding new providers
- [ ] Update environment variable documentation
- [ ] Create migration guide from single to multi-provider
- [ ] Document combined tools development pattern

**4.4 Developer Experience**
- [ ] Add provider template for future integrations
- [ ] Create debugging tools for multi-provider auth
- [ ] Enhance logging for provider-specific flows
- [ ] Add health check endpoints per provider

**Verification - How to Know It's Working:**
- ✅ **Test coverage**: All critical paths have passing tests
  - Run: `npm test` → all tests pass
  - Verify: Coverage includes all auth flows (single, multi-provider)
  - Verify: Each provider has dedicated test suite
- ✅ **Integration tests pass**: Real provider testing works
  - Run: `npm run atlassian-mcp-test` → passes (Atlassian integration)
  - Run: `npm run figma-mcp-test` → passes (Figma integration)
  - Run: `npm run multi-provider-test` → passes (both providers)
- ✅ **E2E with VS Code Copilot**: Real client integration works
  - Test: Configure Copilot with Atlassian-only → works
  - Test: Configure Copilot with both providers → works
  - Test: Use tools in Copilot chat → successful responses
- ✅ **E2E with MCP Inspector**: Debugging tool works correctly
  - Test: Connect Inspector with each auth type
  - Test: List tools → correct tools appear for each auth type
  - Test: Execute tools → successful execution
- ✅ **Concurrent sessions**: Multiple clients work simultaneously
  - Test: 2+ Inspector instances with different auth → isolated
  - Test: Memory usage stays stable with session churn
  - Monitor: No session cross-contamination in logs
- ✅ **Documentation completeness**: All scenarios documented
  - Verify: README has setup instructions for both providers
  - Verify: Migration guide covers all breaking changes (Q21, Q22, Q13 answers)
  - Verify: Developer guide shows provider abstraction pattern
  - Verify: Troubleshooting section covers common issues
- ✅ **Test coverage complete**: All critical paths tested
  - Run: All test suites pass (unit, integration, E2E)
  - Verify: Testing follows `specs/e2e-testing-strategy.md` patterns
  - Test: Both standards/ (direct HTTP) and mcp-sdk/ (real client) tests pass

**Migration Notes:**
- Breaking changes documented in migration guide
- Users must re-authenticate after deployment
- Environment variables updated for multi-provider support
- VS Code Copilot configs need updates (new endpoints, tool names)

## Authentication Flows

**CRITICAL ARCHITECTURE**: This system implements TWO SEPARATE OAuth flows that must NOT be confused:

1. **MCP Client ↔ Bridge Server**: **MCP PKCE flow** (RFC 7636) with code_challenge/code_verifier
2. **Bridge Server ↔ Providers** (Atlassian/Figma): **Server-Side OAuth** with client_secret (NO PKCE)

### Single Provider Flow
```
1. MCP Client → GET /authorize (with PKCE code_challenge) [MCP PKCE flow]
2. Server → Redirect to provider OAuth (Atlassian or Figma) using client_secret [Server-Side OAuth]
3. Provider → Redirect to /callback?code=xxx&state=yyy [Server-Side OAuth]
4. Server → IMMEDIATELY exchange code for provider tokens using client_secret [Server-Side OAuth]
5. Server → Store provider tokens in session
6. Server → Create JWT with provider credentials embedded
7. Server → Generate authorization code for MCP PKCE flow [MCP PKCE flow]
8. Server → Store JWT associated with authorization code [MCP PKCE flow]
9. Server → Redirect to MCP client with authorization code [MCP PKCE flow]
10. MCP Client → POST /access-token (with code + code_verifier for PKCE validation) [MCP PKCE flow]
11. Server → Validate PKCE, return stored JWT [MCP PKCE flow]
12. MCP Client → Use JWT for MCP requests
13. MCP Server → Register provider-specific tools
```

### Multi-Provider Flow (Connection Hub UI)
```
1. MCP Client → GET /authorize (with PKCE code_challenge) [MCP PKCE flow]
2. Server → Show connection hub page with buttons:
   - [Connect Atlassian] [Connect Figma] [Done]
3. User → Clicks "Connect Atlassian"
4. Server → Redirect to Atlassian OAuth [Server-Side OAuth]
5. Atlassian → Redirect to /callback?code=xxx&state=yyy&provider=atlassian [Server-Side OAuth]
6. Server → IMMEDIATELY exchange code for Atlassian tokens using client_secret [Server-Side OAuth]
7. Server → Store Atlassian tokens in providerTokens session
8. Server → Redirect back to connection hub (✓ Atlassian Connected)
9. User → Clicks "Connect Figma"  
10. Server → Redirect to Figma OAuth [Server-Side OAuth]
11. Figma → Redirect to /callback?code=zzz&state=yyy&provider=figma [Server-Side OAuth]
12. Server → IMMEDIATELY exchange code for Figma tokens using client_secret [Server-Side OAuth]
13. Server → Store Figma tokens in providerTokens session
14. Server → Redirect back to connection hub (✓ Figma Connected)
15. User → Clicks "Done"
16. Server → Create JWT with both Atlassian and Figma credentials embedded
17. Server → Generate authorization code for MCP PKCE flow [MCP PKCE flow]
18. Server → Store JWT associated with authorization code [MCP PKCE flow]
19. Server → Redirect to MCP client with authorization code [MCP PKCE flow]
20. MCP Client → POST /access-token (with code + code_verifier for PKCE validation) [MCP PKCE flow]
21. Server → Validate PKCE, return stored JWT [MCP PKCE flow]
22. MCP Client → Use JWT for MCP requests
23. MCP Server → Register Atlassian + Figma + Combined tools
```

**CRITICAL POINTS**:
- MCP Client ALWAYS uses **MCP PKCE flow** with the bridge server
- Provider OAuth callbacks ALWAYS exchange tokens immediately (steps 6, 12) using **Server-Side OAuth**
- Provider token exchange uses `client_secret` (**Server-Side OAuth**, NOT PKCE)
- "Done" button triggers **MCP PKCE flow** completion (steps 16-21)
- JWT contains embedded provider tokens and is returned to MCP client
- User can connect providers in any order before clicking "Done"

### Implementation Pattern: Separation of Concerns

**Problem**: Server-Side OAuth callbacks must NOT detect MCP PKCE flags and redirect immediately to MCP client. This breaks the connection hub flow.

**Solution**: Clear separation between Server-Side OAuth and MCP PKCE flow completion:

#### Server-Side OAuth Callbacks (`/auth/callback/atlassian`, `//auth/callback/figma`)
**ALWAYS** perform these steps, regardless of whether it's part of an MCP PKCE flow:
1. Extract authorization code from callback parameters
2. **IMMEDIATELY exchange code for provider tokens** using `client_secret` (Server-Side OAuth)
3. Store provider tokens in session (`req.session.providerTokens[providerName]`)
4. Add provider to connected list (`req.session.connectedProviders.push(providerName)`)
5. **ALWAYS redirect back to connection hub** (`/auth/connect`)

#### Connection Hub "Done" Button (`/auth/done`)
**ONLY** this handler completes the MCP PKCE flow:
1. Collect all provider tokens from session (`req.session.providerTokens`)
2. Create JWT with nested provider credentials (`{ atlassian: {...}, figma: {...} }`)
3. Generate MCP authorization code
4. Store JWT associated with authorization code (for PKCE validation)
5. Redirect to MCP client with authorization code and state

#### Key Principle
- **Server-Side OAuth callbacks**: Server-Side OAuth token exchange + redirect to hub
- **Done button**: MCP PKCE flow completion + redirect to MCP client
- **NO mixing**: Server-Side OAuth callbacks should never directly redirect to MCP client

#### Code Pattern

```typescript
// ❌ WRONG: Server-Side OAuth callback detects MCP PKCE flags and redirects to client
export function makeCallback(provider: OAuthProvider, options) {
  return async (req: Request, res: Response) => {
    const code = provider.extractCallbackParams(req).code;
    
    // ❌ BAD: Checking if this is MCP PKCE flow
    if (req.session.usingMcpPkce) {
      // ❌ BAD: Redirecting directly to MCP client
      res.redirect(`${req.session.mcpRedirectUri}?code=${code}`);
      return;
    }
    
    // Token exchange...
  };
}

// ✅ CORRECT: Server-Side OAuth callback ALWAYS exchanges tokens and returns to hub
export function makeCallback(provider: OAuthProvider, options) {
  return async (req: Request, res: Response) => {
    const code = provider.extractCallbackParams(req).code;
    
    // ✅ ALWAYS exchange provider's authorization code for tokens (Server-Side OAuth)
    const tokens = await provider.exchangeCodeForTokens({
      code,
      codeVerifier: req.session.codeVerifier, // Our code_verifier for Server-Side OAuth
    });
    
    // ✅ ALWAYS store tokens in session
    await options.onSuccess(req, tokens, provider.name);
    
    // ✅ ALWAYS redirect back to connection hub
    res.redirect('/auth/connect');
  };
}

// ✅ CORRECT: Done button completes MCP PKCE flow
export async function handleConnectionDone(req: Request, res: Response) {
  const providerTokens = req.session.providerTokens || {};
  
  // Create JWT with all provider tokens
  const jwt = createJWT({
    atlassian: providerTokens.atlassian,
    figma: providerTokens.figma,
  });
  
  // Generate MCP authorization code (MCP PKCE flow)
  const mcpAuthCode = generateAuthCode();
  storeMcpAuthCode(mcpAuthCode, jwt); // For PKCE validation
  
  // Redirect to MCP client with authorization code (MCP PKCE flow)
  res.redirect(`${req.session.mcpRedirectUri}?code=${mcpAuthCode}&state=${req.session.mcpState}`);
}
```

This separation ensures:
- ✅ Server-Side OAuth works independently (can test without MCP client)
- ✅ Connection hub flow works correctly (Server-Side OAuth callbacks always return to hub)
- ✅ MCP PKCE flow completes only when user clicks "Done"
- ✅ Clean architecture with single responsibility per endpoint

### Incremental Authentication Flow
```
1. User initially authenticates with only Jira
2. MCP server registers only Jira tools
3. User later wants to use Figma features
4. Client → GET /authorize?providers=figma&add=true
5. Server → Add Figma to existing session
6. Server → Issue new JWT with both providers
7. Client → Use new JWT
8. MCP server reconnects with expanded tool set
```

## Environment Variables

### New Variables
```bash
# Figma OAuth Configuration
FIGMA_CLIENT_ID=your_figma_client_id
FIGMA_CLIENT_SECRET=your_figma_client_secret
FIGMA_OAUTH_SCOPES=files:read,file_comments:write

# Multi-Provider Configuration
DEFAULT_PROVIDERS=atlassian  # Comma-separated list
ALLOW_PARTIAL_AUTH=true      # Allow single-provider authentication
REQUIRE_ALL_PROVIDERS=false  # Require all selected providers to succeed

# Existing Atlassian variables remain unchanged
VITE_JIRA_CLIENT_ID=...
JIRA_CLIENT_SECRET=...
VITE_JIRA_SCOPE=...
```

## Backward Compatibility

### Maintaining Jira-Only Support
- Default provider is `atlassian` if none specified
- Existing `/authorize` endpoint works without `providers` param
- Existing JWTs with only Atlassian credentials still valid
- Old auth flow redirects still work
- Environment variables remain backward compatible

### Migration Path
1. Deploy multi-provider code with Figma support disabled
2. Test existing Jira-only flows work unchanged
3. Configure Figma OAuth credentials
4. Enable Figma provider
5. Test multi-provider flows
6. Gradually migrate users to multi-provider auth

## Security Considerations

1. **Separate Token Storage**: Each provider's credentials stored separately in JWT
2. **Scoped Permissions**: Tools only access the provider they need
3. **Token Refresh**: Independent refresh logic per provider
4. **Session Isolation**: Per-session MCP servers prevent cross-session data leaks
5. **Provider Validation**: Validate provider names against whitelist
6. **PKCE for MCP Client**: MCP client uses PKCE (code_challenge/code_verifier) when communicating with bridge
7. **Client Secret for Providers**: Bridge uses traditional OAuth (client_secret) when communicating with providers
8. **Immediate Token Exchange**: Provider authorization codes are exchanged immediately in callbacks (not stored)
9. **JWT Storage**: JWTs are temporarily stored (associated with MCP authorization codes) until PKCE validation completes
7. **State Parameter**: Include provider ID in state to prevent callback confusion

## Performance Considerations

1. **Per-Session Overhead**: Creating MCP servers per session adds memory overhead
   - Mitigation: Implement session timeout and cleanup
   - Mitigation: Reuse tool implementations across servers

2. **Sequential OAuth**: Multi-provider auth requires multiple redirects
   - Mitigation: Allow parallel auth for advanced clients
   - Mitigation: Cache provider tokens in session for quick re-auth

3. **Dynamic Tool Registration**: Tool registration happens per session
   - Mitigation: Pre-compile tool definitions
   - Mitigation: Lazy-load heavy tool dependencies

## Testing Strategy

### Unit Tests
- Provider interface implementations
- JWT multi-provider encoding/decoding
- Token refresh per provider
- Tool registration logic

### Integration Tests
- OAuth flows for each provider
- Multi-provider callback handling
- Session cleanup and lifecycle
- Dynamic MCP server creation

### E2E Tests
- VS Code Copilot integration
- MCP Inspector compatibility
- Real OAuth provider interactions
- Concurrent session handling

## Success Criteria

- [ ] Users can authenticate with Jira only (backward compatible)
- [ ] Users can authenticate with Figma only
- [ ] Users can authenticate with both Jira and Figma
- [ ] Tools are dynamically registered based on authentication
- [ ] Combined tools work when both providers are authenticated
- [ ] Token refresh works independently per provider
- [ ] Session cleanup properly disposes MCP servers
- [ ] Performance is acceptable with per-session servers
- [ ] Documentation is complete and clear
- [ ] All tests pass (unit, integration, E2E)

## Questions

### Architecture & Design Decisions

1. **Factory Functions vs Direct Provider Usage**: Should we:
   - Use factory functions (`makeAuthorize(provider)`) for all endpoints (recommended - cleaner, testable)
   - Use direct provider imports in each endpoint (simpler but less flexible)
   - Mix both approaches based on complexity


Use factory functions

2. **Provider Registry**: Do we need a global provider registry (`getProvider('atlassian')`) or just direct imports?
   - **Registry approach**: `const provider = getProvider('atlassian')` - more dynamic but adds indirection
   - **Direct imports**: `import { atlassianProvider }` - simpler, more explicit, better tree-shaking
   - **Hybrid**: Registry for multi-provider scenarios, direct imports for single-provider

Ideally we'd avoid a registry if we can.

3. **MCP Server Lifecycle**: Should per-session MCP servers be cached and reused for the same auth context, or always created fresh? Caching could improve performance but adds complexity.

Always created fresh.

4. **Partial Authentication UX**: If a user authenticates with only Jira (not Figma), should we:
   - Show an in-app prompt to add Figma when they try to use Figma tools?
   - Silently hide Figma tools until they authenticate?
   - Show disabled Figma tools with an "Authenticate to use" message?

They won't see figma tools right as they shouldn't be registered. I think our equivalent of createMcpServer from https://github.com/bitovi/mcp-training/blob/main/training/6-streaming-mcp/src/mcp-server.ts will take the JWT (or JWT data) and only register the relevant tools.  Can you check that this is actually possible in your proposed architecture?


4. **Sequential vs Parallel OAuth**: Should we require sequential OAuth redirects (Atlassian → Figma → done), or support parallel flows where the user can complete them in any order?

parallel

5. **Combined Tool Naming**: For tools that use both providers (e.g., `attach-figma-to-jira`), what naming convention should we use? Options:
   - `figma-to-jira-*` prefix
   - `combined-*` prefix  
   - No special prefix, just descriptive names

No special prefix. These will be things like `write-story`.

### OAuth & Security

6. **JWT Size Limits**: With multiple provider credentials embedded in JWTs, we might hit size limits. Should we:
   - Keep embedding tokens (current approach, works for 2-3 providers)
   - Reference tokens by ID and store actual tokens server-side
   - Use separate JWTs per provider

Keep embedding for now.

7. **Token Refresh Strategy**: When one provider's token expires, should we:
   - Refresh only that provider's token
   - Refresh all provider tokens proactively
   - Let the client handle refresh initiation

Refresh only that providers token or both tokens, whatever is easier.

8. **Consent Page UI Pattern**: The consent page will be a connection hub with buttons:
   - "Connect Atlassian" button → triggers Atlassian OAuth flow
   - "Connect Figma" button → triggers Figma OAuth flow  
   - "Done" button → completes authentication with connected providers
   - Should we show connection status (✓ Connected) after each OAuth completes? YES
   - Should we allow disconnecting a provider before clicking Done? NO

No persistence needed - user clicks "Done" when satisfied with their connections.

9. **Provider Authentication Order**: User clicks connection buttons in any order they prefer. No enforced sequence.

### Implementation Details

10. **Figma Tool Adaptations**: The Figma tools currently use PAT authentication. What's the priority for converting them to OAuth? Should we:
    - Convert all tools to OAuth immediately (Week 3)
    - Support both PAT and OAuth with a fallback pattern
    - Only support OAuth from day one

Support OAuth. We are transitioning away from PAT immediately.

11. **Error Handling for Partial Failures**: If Atlassian auth succeeds but Figma auth fails, should we:
    - Proceed with Atlassian-only authentication
    - Fail the entire flow and require retry
    - Allow the user to skip Figma and continuE

    The user can click "done" and continue.

12. **Session Storage**: Currently auth context is in-memory. With multi-provider, should we:
    - Continue in-memory (simpler, but lost on restart)
    - Add Redis/persistent storage (more complex, survives restarts)
    - Use JWT claims only (stateless, but larger tokens)

    Continue in-memory. 

13. **Tool Name Prefixes**: Should we require provider prefixes on all tools? For example:
    - `atlassian-get-sites` vs `get-atlassian-sites` vs `get-sites`
    - `figma-get-image` vs `get-figma-image` vs `get-image`
    
    **Answer**: Single provider tool names should all be prefixed with provider name.
    - Atlassian tools: `atlassian-get-sites`, `atlassian-get-issue`, etc.
    - Figma tools: `figma-get-image`, `figma-get-layers`, etc.
    - Combined tools: No prefix (descriptive names like `write-story`)

### Testing & Rollout

14. **Backward Compatibility Testing**: What's the acceptance criteria for "backward compatible"? Should:
    - Existing VS Code Copilot configs work without changes?
    - Old JWTs still be valid for some grace period?
    - Single-provider auth be the default if no provider specified?

    no worries on backward compatability. users will be expected to restart their connection and reauth again.

15. **Provider Mocking in Tests**: Should we create mock OAuth providers for testing, or use real sandbox environments?

    See our `specs/e2e-testing-strategy.md`.

16. **Performance Benchmarks**: What's acceptable for per-session MCP server creation? Should we set targets like:
    - < 100ms for server creation
    - < 50MB memory per session
    - Support for N concurrent sessions

    Don't worry about performance for now.

### Documentation & Developer Experience

17. **Adding New Providers**: What's the ideal developer experience for adding a third provider (e.g., GitHub, Linear)? Should we provide:
    - A provider template/generator
    - Step-by-step documentation only
    - Both template and docs

    DO NOTHING HERE

18. **Combined Tool Development**: Should there be a framework/helper library for combined tools, or just documentation and examples?

    DO NOTHING HERE

19. **Local Development Setup**: For developers without Figma OAuth apps, should we:
    - Provide shared dev credentials
    - Document how to create Figma OAuth apps
    - Support a "mock Figma" mode for local dev

    DO NOTHING HERE

20. **Migration Documentation**: For existing deployments, what level of migration guidance do we need:
    - Automated migration script
    - Step-by-step manual instructions
    - Just release notes with breaking changes highlighted

    DO NOTHING HERE

### Critical Architecture Clarifications (NEW)

21. **JWT Payload Structure for Multi-Provider**: The plan shows nested provider credentials in JWT:
    ```typescript
    {
      atlassian?: { access_token, refresh_token, ... },
      figma?: { access_token, refresh_token, ... }
    }
    ```
    But current code expects flat structure:
    ```typescript
    {
      atlassian_access_token: string,
      refresh_token: string,
      exp: number
    }
    ```
    **Question**: Should we:
    - Use nested structure (breaking change, but cleaner multi-provider)
    - Use flat structure with prefixed keys (`atlassian_access_token`, `figma_access_token`)
    - Use hybrid (flat for single-provider, nested for multi-provider)?

    **Answer**: Use nested structure for cleaner multi-provider support.
    ```typescript
    interface MultiProviderJWT {
      type: 'access_token';
      iat: number;
      exp: number;
      atlassian?: {
        access_token: string;
        refresh_token: string;
        expires_at: number;
        scopes: string[];
      };
      figma?: {
        access_token: string;
        refresh_token: string;
        expires_at: number;
        scopes: string[];
      };
    }
    ```

22. **Provider-Specific Token Access in Tools**: How should tools access provider-specific tokens?
    
    **Current pattern** (Atlassian only):
    ```typescript
    const authInfo = getAuthInfoSafe(context, 'get-jira-issue');
    const token = authInfo.atlassian_access_token;
    ```
    
    **Option A - Provider-specific context objects**:
    ```typescript
    // Each provider's registerTools creates tools with closure over provider name
    export function registerAtlassianTools(mcp, authContext) {
      mcp.registerTool('get-jira-issue', schema, async (params, context) => {
        const authInfo = getAuthInfoSafe(context, 'get-jira-issue');
        const token = authInfo.atlassian.access_token; // or authInfo.atlassian_access_token
      });
    }
    ```
    
    **Option B - Provider parameter to tools**:
    ```typescript
    // Tools know their provider and request it
    const authInfo = getAuthInfoSafe(context, 'get-jira-issue', 'atlassian');
    const token = authInfo.access_token; // Generic field
    ```
    
    **Option C - Keep current flat structure**:
    ```typescript
    // Keep prefixed field names in authInfo
    const authInfo = getAuthInfoSafe(context, 'get-jira-issue');
    const token = authInfo.atlassian_access_token; // Atlassian tools use this
    const figmaToken = authInfo.figma_access_token; // Figma tools use this
    ```
    
    **Answer**: Use Option A - Provider-specific nested context objects.
    
    Tools will access tokens using nested structure matching the JWT format:
    ```typescript
    export function registerAtlassianTools(mcp, authContext) {
      mcp.registerTool('atlassian-get-issue', schema, async (params, context) => {
        const authInfo = getAuthInfoSafe(context, 'atlassian-get-issue');
        const token = authInfo.atlassian.access_token; // Nested access
      });
    }
    
    export function registerFigmaTools(mcp, authContext) {
      mcp.registerTool('figma-get-image', schema, async (params, context) => {
        const authInfo = getAuthInfoSafe(context, 'figma-get-image');
        const token = authInfo.figma.access_token; // Nested access
      });
    }
    ```
    
    This aligns with Q21's nested JWT structure and keeps tool code clean.

23. **Connection Hub Implementation Phase**: The target architecture shows `server/provider-server-oauth/consent-page.ts` for the connection hub UI, but no phase explicitly implements this. Should this be:
    - Part of Phase 2 (OAuth infrastructure)?
    - A new Phase 2.5 (Multi-Provider UI & Flow)?
    - Deferred to later (start with single-provider only)?

    **Answer**: Implement connection hub after Phase 1.2 (before adding Figma provider).
    
    This will be a new **Phase 1.3: Connection Hub UI**, inserted between:
    - **Phase 1.2**: Atlassian provider refactored ✅
    - **Phase 1.3**: Connection hub with single provider (validate UX) 🆕
    - **Phase 1.4**: Add Figma provider (multi-provider support)
    
    This approach lets us validate the connection hub UI with just Atlassian before adding Figma complexity.

24. **Multi-Provider OAuth Flow Timing**: Phase 2 has a note saying "actual multi-provider flow will be implemented in a future phase", but the Authentication Flows section shows the full multi-provider flow. When should we actually implement:
    - Connection hub UI with multiple "Connect" buttons?
    - Session state management during multi-provider flow?
    - Final JWT creation after "Done" button?
    
    Should Phase 2 focus ONLY on single-provider factory functions, with multi-provider deferred?

    **Answer**: Multi-provider OAuth flow is implemented in Phase 1.3 (Connection Hub) and Phase 1.4 (Figma provider).
    
    **Revised Phase 2 scope**: Focus on factory functions and token helpers that work with the provider pattern established in Phase 1. The multi-provider flow itself (connection hub, session management, multi-provider JWT) is already complete by end of Phase 1.

### Architecture & Implementation Clarifications (Phase 1.3 Planning)

25. **OAuth Endpoint Architecture in Phase 1.3**: The connection hub needs provider-aware OAuth routing. Which approach should we use?

    **Option A - Provider Query Parameter**:
    ```typescript
    app.get('/authorize', (req, res) => {
      const provider = req.query.provider || 'atlassian';
      // Route to provider-specific OAuth logic
    });
    ```
    
    **Option B - Dynamic Route Parameter**:
    ```typescript
    app.get('/auth/connect/:provider', (req, res) => {
      const provider = getProvider(req.params.provider);
      makeAuthorize(provider)(req, res);
    });
    ```
    
    **Option C - Static Routes with Factory Functions** (RECOMMENDED):
    ```typescript
    // Phase 1.5: Static routes - clean, explicit, type-safe
    app.get('/auth/connect/atlassian', makeAuthorize(atlassianProvider));
    app.get('/auth/connect/figma', makeAuthorize(figmaProvider));
    
    // Callbacks for hub flow
    app.get('/auth/callback/atlassian', makeCallback(atlassianProvider, {
      onSuccess: hubCallbackHandler
    }));
    app.get('/auth/callback/figma', makeCallback(figmaProvider, {
      onSuccess: hubCallbackHandler
    }));
    ```
    
    **Answer**: Use Option C - static routes with factory functions.
    
    **Benefits**:
    - ✅ Uses factory pattern from the start (no refactoring needed later)
    - ✅ No dynamic provider lookup or registry needed
    - ✅ Type-safe - can't connect to invalid provider
    - ✅ Clear, explicit routing in server.ts
    - ✅ Each provider registers its own callback URI with OAuth provider

26. **Callback Routing Strategy**: With static routes (Q25 Option C), callback routing becomes simple and explicit.

    **Implementation**:
    ```typescript
    // Callback handler for hub-initiated flows
    function hubCallbackHandler(req: Request, res: Response, tokens: StandardTokenResponse, provider: OAuthProvider): void {
      // Store tokens in session
      req.session.providerTokens = req.session.providerTokens || {};
      req.session.providerTokens[provider.name] = tokens;
      
      // Mark provider as connected
      req.session.connectedProviders = req.session.connectedProviders || [];
      if (!req.session.connectedProviders.includes(provider.name)) {
        req.session.connectedProviders.push(provider.name);
      }
      
      // Always redirect back to connection hub
      res.redirect('/auth/connect');
    }
    
    // Register provider-specific callbacks
    app.get('/auth/callback/atlassian', makeCallback(atlassianProvider, {
      onSuccess: hubCallbackHandler
    }));
    app.get('/auth/callback/figma', makeCallback(figmaProvider, {
      onSuccess: hubCallbackHandler
    }));
    ```
    
    **Answer**: Use provider-specific callback routes that always return to hub.
    
    **Benefits**:
    - ✅ No session flags needed (`isHubFlow`) - route itself indicates intent
    - ✅ Callbacks **always** return to hub (simple, consistent behavior)
    - ✅ No provider parameter parsing in callback handler
    - ✅ Each provider uses its own redirect URI: `https://server/auth/callback/atlassian`
    
    **Note**: If direct OAuth flow (bypassing hub) is needed, keep original `/authorize` and `/callback` endpoints. Otherwise, hub-only flow is simpler - user can connect one provider and click "Done" for single-provider auth.

27. **Phase 2 Scope Justification**: After Phase 1 completes (provider abstraction + connection hub + multi-provider OAuth), the system is functionally complete for multi-provider support. Phase 2 currently shows:
    - Factory function refactoring (cosmetic improvement)
    - Dynamic MCP servers (new capability)
    - Enhanced token helpers (already needed in Phase 1.3)
    
    **Question**: Should we:
    - Keep Phase 2 as "refactoring + dynamic MCP servers"
    - Merge factory functions into Phase 1.3 (implement once, correctly)
    - Split into "Phase 2: Factory Refactor" and "Phase 3: Dynamic MCP Servers"

    Split phases.

28. **AuthContext Interface Migration Timing**: Current `AuthContext` has flat structure (`atlassian_access_token`). We're changing to nested (`atlassian.access_token`). This affects:
    - `auth-context-store.ts` - interface definition
    - `auth-helpers.ts` - return types
    - All tool files - token access pattern
    - JWT creation in `tokens.ts`
    
    **Question**: Should we:
    - Update to nested structure in Phase 1.2 (all tools use `authInfo.atlassian.access_token` from start)
    - Wait until Phase 1.5 (delay breaking change until multi-provider JWT is needed)
    
    **Recommendation**: Update in 1.2 to avoid migrating tools twice.

    Update in 1.2 to avoid migrating tools twice.

29. **Session Token Security**: Connection hub stores OAuth tokens in Express session during multi-provider flow (temporary storage while user connects multiple providers).
    
    **Question**: Do we need additional encryption beyond Express session secret, or is session-based storage sufficient for the OAuth flow duration (typically < 5 minutes)?
    
    **Security considerations**:
    - Session cookies already encrypted with SESSION_SECRET
    - Tokens only in memory during active OAuth flow
    - Cleared after "Done" button creates final JWT
    - Alternative: Store encrypted tokens or token references only

    NO additional encryption. 

## Appendix: Functional vs Class-Based Approach

This plan uses a **functional factory pattern** inspired by `specs/make-oauth-reusable.md`. Here's why:

### Functional Approach (This Plan)

```typescript
// Provider is a simple object
export const atlassianProvider: OAuthProvider = {
  name: 'atlassian',
  createAuthUrl(params) { /* ... */ },
  exchangeCodeForTokens(params) { /* ... */ },
  registerTools(mcp, authContext) { /* ... */ },
};

// Factory function creates endpoint
export function makeAuthorize(provider: OAuthProvider): OAuthHandler {
  return (req, res) => {
    const authUrl = provider.createAuthUrl({ /* ... */ });
    res.redirect(authUrl);
  };
}

// Usage with explicit dependency
app.get('/authorize', makeAuthorize(atlassianProvider));
```

**Benefits:**
- ✅ Simple: No classes, inheritance, or OOP complexity
- ✅ Testable: Easy to mock providers in tests
- ✅ Explicit: Dependencies clearly visible at usage site
- ✅ Flexible: Can pass different providers to same factory
- ✅ Tree-shakeable: Unused providers eliminated by bundler

### Class-Based Approach (Alternative)

```typescript
// Provider is a class
export class AtlassianProvider implements OAuthProvider {
  name = 'atlassian';
  
  createAuthUrl(params: AuthUrlParams): string { /* ... */ }
  exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> { /* ... */ }
  registerTools(mcp: McpServer, authContext: any): void { /* ... */ }
}

// Endpoint hardcoded or uses registry
export function authorize(req: Request, res: Response): void {
  const provider = getProvider('atlassian'); // Requires global registry
  const authUrl = provider.createAuthUrl({ /* ... */ });
  res.redirect(authUrl);
}

// Usage with hidden dependency
app.get('/authorize', authorize);
```

**Drawbacks:**
- ❌ More complex: Classes, constructors, this binding
- ❌ Hidden dependencies: Provider lookup hidden in function
- ❌ Requires registry: Global state for provider management
- ❌ Harder to test: Need to set up registry before testing
- ❌ Less flexible: Can't easily use different providers

### Why Functional Wins

1. **Simplicity**: Providers are just objects with functions, not classes
2. **Explicitness**: `makeAuthorize(atlassianProvider)` clearly shows dependency
3. **Testability**: `makeAuthorize(mockProvider)` trivial to test
4. **No Magic**: No global registry, no hidden lookups, no singleton patterns
5. **TypeScript Native**: Interfaces and functions are TypeScript's sweet spot

The functional approach aligns with modern JavaScript/TypeScript best practices and makes the codebase easier to understand, test, and maintain.


