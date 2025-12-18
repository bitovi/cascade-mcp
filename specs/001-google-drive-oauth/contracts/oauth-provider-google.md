# OAuth Provider Contract: Google Drive

**Provider Name**: `google`  
**Purpose**: OAuth 2.0 authentication for Google Drive API access  
**Date**: December 18, 2025

## Provider Interface

Implements the `OAuthProvider` interface defined in `server/providers/provider-interface.ts`.

### Interface Implementation

```typescript
// server/providers/google/index.ts

import type { McpServer } from '../../mcp-core/mcp-types.js';
import type { 
  OAuthProvider, 
  AuthUrlParams, 
  TokenExchangeParams, 
  StandardTokenResponse, 
  CallbackParams 
} from '../provider-interface.js';

export const googleProvider: OAuthProvider = {
  name: 'google',
  
  createAuthUrl(params: AuthUrlParams): string,
  extractCallbackParams(req: any): CallbackParams,
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse>,
  getDefaultScopes(): string[],
  registerTools(mcp: McpServer, authContext: any): void,
};
```

## Method Specifications

### 1. createAuthUrl()

Creates the Google OAuth authorization URL for user consent.

**Signature**:

```typescript
createAuthUrl(params: AuthUrlParams): string
```

**Parameters**:

```typescript
interface AuthUrlParams {
  redirectUri?: string;
  state?: string;
  scope?: string;
  responseType?: string;
  codeChallenge?: string; // Not used for Google (traditional OAuth)
  codeChallengeMethod?: string; // Not used for Google
}
```

**Returns**: Full Google authorization URL

**Implementation**:

```typescript
createAuthUrl(params: AuthUrlParams): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
  const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/google`;
  const scope = params.scope || process.env.GOOGLE_OAUTH_SCOPES!;
  
  // Google uses traditional OAuth 2.0 with client_secret
  // PKCE parameters (codeChallenge) are ignored
  const urlParams: Record<string, string> = {
    client_id: clientId!,
    response_type: params.responseType || 'code',
    redirect_uri: redirectUri,
    scope,
    access_type: 'offline', // Required for refresh tokens
  };
  
  if (params.state) {
    urlParams.state = params.state;
  }
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(urlParams).toString()}`;
}
```

**Example URL**:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=123456.apps.googleusercontent.com&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback%2Fgoogle&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&access_type=offline&state=abc123xyz
```

### 2. extractCallbackParams()

Extracts OAuth callback parameters from the redirect request.

**Signature**:

```typescript
extractCallbackParams(req: any): CallbackParams
```

**Parameters**:

- `req`: Express request object with query parameters

**Returns**:

```typescript
interface CallbackParams {
  code: string;
  state?: string;
  normalizedState?: string;
}
```

**Implementation**:

```typescript
extractCallbackParams(req: any): CallbackParams {
  const { code, state } = req.query;
  
  return {
    code: code || '',
    state,
    normalizedState: state, // Google doesn't have URL encoding quirks like Atlassian
  };
}
```

**Note**: Unlike Atlassian provider, Google doesn't have special URL encoding behavior for state parameter.

### 3. exchangeCodeForTokens()

Exchanges authorization code for access and refresh tokens.

**Signature**:

```typescript
async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse>
```

**Parameters**:

```typescript
interface TokenExchangeParams {
  code: string;
  redirectUri?: string;
  codeVerifier?: string; // Not used for Google (traditional OAuth)
}
```

**Returns**:

```typescript
interface StandardTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id?: string;
}
```

**Implementation**:

```typescript
async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
  const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/google`;
  
  // Google uses traditional OAuth 2.0 - NO code_verifier needed
  // Authentication is via client_id + client_secret only
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      code: params.code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  
  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Google token exchange failed (${tokenRes.status}): ${errorText}`);
  }
  
  const tokenData = await tokenRes.json();
  
  if (!tokenData.access_token) {
    throw new Error(`Google token exchange failed: ${JSON.stringify(tokenData)}`);
  }
  
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_type: tokenData.token_type || 'Bearer',
    expires_in: tokenData.expires_in || 3600, // Google default: 1 hour
    scope: tokenData.scope,
  };
}
```

**Token Exchange Request**:

```http
POST https://oauth2.googleapis.com/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

client_id=123456.apps.googleusercontent.com&
client_secret=GOCSPX-abc123&
code=4/0AfH6...&
redirect_uri=http://localhost:3000/auth/callback/google&
grant_type=authorization_code
```

**Token Exchange Response**:

```json
{
  "access_token": "ya29.a0AfH6SMC...",
  "expires_in": 3599,
  "refresh_token": "1//0gH...",
  "scope": "https://www.googleapis.com/auth/drive",
  "token_type": "Bearer"
}
```

### 4. getDefaultScopes()

Returns the default OAuth scopes for Google Drive.

**Signature**:

```typescript
getDefaultScopes(): string[]
```

**Returns**: Array of scope URLs

**Implementation**:

```typescript
getDefaultScopes(): string[] {
  return ['https://www.googleapis.com/auth/drive'];
}
```

**Note**: Full Drive access scope as specified in clarification session.

### 5. registerTools()

Registers Google Drive MCP tools with the MCP server.

**Signature**:

```typescript
registerTools(mcp: McpServer, authContext: any): void
```

**Parameters**:

- `mcp`: MCP server instance
- `authContext`: Authentication context with Google credentials

**Implementation**:

```typescript
registerTools(mcp: McpServer, authContext: any): void {
  registerGoogleTools(mcp, authContext);
}
```

**Delegates to**:

```typescript
// server/providers/google/tools/index.ts
export function registerGoogleTools(mcp: McpServer, authContext: any): void {
  registerDriveAboutUserTool(mcp, authContext);
  // Future tools will be registered here
}
```

## Environment Variables

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=<client_id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-<secret>
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/drive

# Reused from existing configuration
VITE_AUTH_SERVER_URL=http://localhost:3000
```

## Connection Hub Integration

### Registration

```typescript
// server/provider-server-oauth/connection-hub.ts

// Add Google to required providers
const REQUIRED_PROVIDERS = ['atlassian', 'figma', 'google'] as const;
```

### Provider Registry

```typescript
// server/server.ts or provider initialization

import { googleProvider } from './providers/google/index.js';
import { figmaProvider } from './providers/figma/index.js';
import { atlassianProvider } from './providers/atlassian/index.js';

const providers = new Map<string, OAuthProvider>();
providers.set('google', googleProvider);
providers.set('figma', figmaProvider);
providers.set('atlassian', atlassianProvider);
```

## Key Differences from Other Providers

### vs. Figma Provider

**Similarities**:

- Both use traditional OAuth 2.0 with client_secret
- Both ignore PKCE parameters (codeChallenge, codeVerifier)
- Similar token exchange flow

**Differences**:

- Google requires `access_type=offline` for refresh tokens
- Google uses different endpoint URLs
- Google access tokens expire in 1 hour (Figma: 90 days default)
- Google has 100 refresh token limit per client

### vs. Atlassian Provider

**Similarities**:

- Both follow OAuth 2.0 standard
- Both return access and refresh tokens
- Similar provider interface implementation

**Differences**:

- Atlassian uses PKCE (code_challenge/code_verifier)
- Google uses traditional OAuth with client_secret only
- Google doesn't have URL encoding quirks in state parameter
- Google requires `access_type=offline` parameter
- Different token endpoints and authorization URLs

## OAuth Flow Sequence

```
1. User clicks "Connect Google Drive" in connection hub
   ↓
2. Server calls googleProvider.createAuthUrl()
   ↓
3. User redirected to Google consent screen
   ↓
4. User approves → Google redirects to /auth/callback/google?code=...&state=...
   ↓
5. Server calls googleProvider.extractCallbackParams()
   ↓
6. Server calls googleProvider.exchangeCodeForTokens()
   ↓
7. Google returns access_token and refresh_token
   ↓
8. Server stores tokens in session
   ↓
9. User redirected back to connection hub (shows "✓ Connected")
   ↓
10. User clicks "Done" → JWT created with embedded Google tokens
   ↓
11. JWT returned to MCP client
```

## Error Handling

### Authorization Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| `access_denied` | User denied consent | Re-initiate OAuth flow |
| `redirect_uri_mismatch` | URI doesn't match Google console config | Fix configuration |
| `invalid_client` | Wrong client_id | Fix environment variables |

### Token Exchange Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| `invalid_grant` | Expired or used authorization code | Re-initiate OAuth flow |
| `invalid_client` | Wrong client_secret | Fix environment variables |
| `unauthorized_client` | Client not authorized for grant type | Check Google console configuration |

## Testing

### Unit Tests

```typescript
// server/providers/google/index.test.ts

describe('Google OAuth Provider', () => {
  describe('createAuthUrl', () => {
    it('should create valid authorization URL', () => {
      const url = googleProvider.createAuthUrl({
        redirectUri: 'http://localhost:3000/auth/callback/google',
        state: 'test_state_123',
        scope: 'https://www.googleapis.com/auth/drive',
      });
      
      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000');
      expect(url).toContain('state=test_state_123');
      expect(url).toContain('access_type=offline');
    });
  });
  
  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'ya29.test_token',
          refresh_token: '1//test_refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/drive',
        }),
      });
      global.fetch = mockFetch;
      
      const result = await googleProvider.exchangeCodeForTokens({
        code: 'test_code',
        redirectUri: 'http://localhost:3000/auth/callback/google',
      });
      
      expect(result.access_token).toBe('ya29.test_token');
      expect(result.refresh_token).toBe('1//test_refresh');
      expect(result.expires_in).toBe(3600);
    });
  });
});
```

## Compliance

### OAuth 2.0 Standards

- ✅ RFC 6749 compliant
- ✅ Uses authorization code grant type
- ✅ Proper redirect URI validation
- ✅ State parameter for CSRF protection

### CascadeMCP Standards

- ✅ Implements OAuthProvider interface
- ✅ Follows Figma provider pattern (traditional OAuth)
- ✅ Proper error handling and logging
- ✅ Environment-based configuration
- ✅ Token sanitization in logs

## Related Contracts

- [MCP Tool Contract](./mcp-tool-drive-about-user.md) - Drive about user tool
- [REST API Contract](./rest-api-drive-about-user.md) - REST API endpoint
- [Google API Client Contract](./google-api-client.md) - API client interface
