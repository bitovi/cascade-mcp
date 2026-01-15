# Traditional OAuth Module

This module handles **Server-Side OAuth flows** between the bridge server and OAuth providers (Atlassian, Figma, Google, etc.). This is **separate** from the MCP PKCE flow.

## Two OAuth Flows in this System

### 1. MCP PKCE Flow (`server/pkce/`)
- **Parties**: MCP Client ↔ Bridge Server
- **Purpose**: Authenticate MCP client and provide access to MCP tools
- **Standard**: RFC 7636 (PKCE for OAuth 2.0)
- **Client Type**: Public client (no client_secret)
- **Token Format**: JWT containing provider credentials

### 2. Traditional OAuth Flow (`server/traditional-oauth/`)
- **Parties**: Bridge Server ↔ OAuth Providers
- **Purpose**: Obtain provider access tokens to call their APIs
- **Standard**: RFC 6749 (OAuth 2.0) with optional PKCE
- **Client Type**: Confidential client (uses client_secret)
- **Token Format**: Provider-specific (varies by provider)

## Module Structure

```
server/traditional-oauth/
├── README.md                    # This file
├── url-builder.ts               # Build OAuth authorization URLs
├── token-exchange.ts            # Exchange codes for tokens, refresh tokens
├── types.ts                     # Shared OAuth types
└── route-handlers/              # Express route handlers for OAuth flows
    ├── authorize.ts             # Initiate OAuth flow (redirect to provider)
    ├── callback.ts              # Handle provider callback (exchange code)
    ├── connection-hub.ts        # UI for connecting multiple providers
    ├── connection-done.ts       # Complete multi-provider connection
    └── index.ts                 # Export all route handlers
```

## Core Utilities

### `url-builder.ts`
Builds OAuth authorization URLs with consistent parameter handling:
- Supports both PKCE and non-PKCE flows
- Handles provider-specific query parameters
- Environment-aware redirect URIs

### `token-exchange.ts`
Handles token exchange and refresh:
- `performTokenExchange()` - Exchange authorization code for access/refresh tokens
- `performTokenRefresh()` - Refresh an expired access token
- Supports JSON and form-encoded content types
- Handles provider-specific behaviors (Basic Auth, token rotation)

## Route Handlers

### `makeAuthorize(provider)`
Factory function that creates OAuth authorization endpoints:
- Generates code_verifier/code_challenge for provider OAuth
- Stores OAuth session parameters
- Redirects user to provider's authorization URL
- **Example**: `app.get('/auth/connect/atlassian', makeAuthorize(atlassianProvider))`

### `makeCallback(provider, options)`
Factory function that creates OAuth callback endpoints:
- Validates callback parameters and state
- Exchanges authorization code for access/refresh tokens
- Stores provider tokens in session
- Redirects back to connection hub
- **Example**: `app.get('/auth/callback/atlassian', makeCallback(atlassianProvider, { onSuccess: hubCallbackHandler }))`

### `renderConnectionHub(req, res)`
Renders the multi-provider connection UI:
- Shows available providers with connection status
- Allows users to connect providers in any order
- Auto-redirects when all required providers are connected
- **Example**: `app.get('/auth/connect', renderConnectionHub)`

### `handleConnectionDone(req, res)`
Handles the "Done" button from connection hub:
- Creates JWT with all connected provider tokens
- Generates authorization code for MCP client
- Redirects back to MCP client with code
- **Example**: `app.get('/auth/done', handleConnectionDone)`

## Usage in Providers

Providers import utilities from this module to define their OAuth behavior:

```typescript
// In server/providers/atlassian/index.ts
import { buildOAuthUrl } from '../../traditional-oauth/url-builder.js';
import { performTokenExchange } from '../../traditional-oauth/token-exchange.js';

export const atlassianProvider: OAuthProvider = {
  name: 'atlassian',
  
  createAuthUrl: (params) => buildOAuthUrl(
    {
      baseUrl: 'https://auth.atlassian.com/authorize',
      clientIdEnvVar: 'VITE_JIRA_CLIENT_ID',
      scopeEnvVar: 'VITE_JIRA_SCOPE',
      usePKCE: true,
      additionalParams: {
        audience: 'api.atlassian.com',
        prompt: 'consent',
      },
    },
    params,
    '/auth/callback/atlassian'
  ),
  
  exchangeCodeForTokens: (params) => performTokenExchange(
    {
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      clientIdEnvVar: 'VITE_JIRA_CLIENT_ID',
      clientSecretEnvVar: 'JIRA_CLIENT_SECRET',
      usePKCE: true,
      contentType: 'json',
      redirectPath: '/auth/callback/atlassian',
    },
    params
  ),
};
```

## Provider Configuration Pattern

Providers define their OAuth behavior but **do not implement** the core OAuth logic. They simply provide configuration:

1. **Provider defines**: Authorization URL parameters, token endpoint URL, PKCE usage
2. **Traditional OAuth implements**: URL building, token exchange, session management
3. **Route handlers orchestrate**: Complete OAuth flows using provider configs

This separation ensures:
- No OAuth logic duplication across providers
- Consistent behavior (error handling, logging, security)
- Easy addition of new providers
- Testable components

## Relationship to Other Modules

- **`server/pkce/`**: Uses this module's route handlers to complete MCP OAuth flow
- **`server/providers/`**: Defines provider-specific OAuth configurations
- **`server/mcp-core/`**: Manages MCP session context (separate from OAuth sessions)
- **`server/auth/`**: Handles PAT-based authentication (alternative to OAuth)

## Key Patterns

### Factory Functions
Use factory pattern for route handlers to avoid code duplication:
```typescript
app.get('/auth/connect/atlassian', makeAuthorize(atlassianProvider));
app.get('/auth/connect/figma', makeAuthorize(figmaProvider));
```

### Session Management
OAuth parameters stored in Express session:
- `req.session.codeVerifier` - Server-side code verifier
- `req.session.providerTokens` - Provider access/refresh tokens
- `req.session.connectedProviders` - List of connected providers

### Multi-Provider Support
Connection hub allows users to connect multiple providers in a single OAuth flow, creating a JWT with nested provider tokens.
