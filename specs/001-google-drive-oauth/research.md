# Research: Google Drive OAuth Integration

**Feature**: Google Drive OAuth and "whoami" tool  
**Date**: December 18, 2025  
**Status**: Complete

## Research Questions Resolved

### Q1: OAuth 2.0 Flow Implementation

**Decision**: Implement traditional OAuth 2.0 flow with client_secret (similar to Figma pattern)

**Rationale**:
- Google Drive supports both traditional OAuth and PKCE
- For server-side applications with client_secret, traditional OAuth is standard
- Aligns with existing Figma provider pattern (which uses client_secret)
- Simpler implementation path than full PKCE for server applications

**Key Details**:
- Authorization endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
- Token exchange endpoint: `https://oauth2.googleapis.com/token`
- Refresh endpoint: Same as token exchange
- Required parameters: client_id, client_secret, redirect_uri, code, grant_type

**Alternatives Considered**:
- PKCE flow: More complex, designed for public clients without client_secret
- Device flow: Not suitable for web application integration

### Q2: OAuth Scopes for Drive Access

**Decision**: Use `https://www.googleapis.com/auth/drive` (full Drive access)

**Rationale**:
- Clarified in spec session 2025-12-18
- Provides future extensibility for additional Drive operations
- Required scope is "Restricted" level - will need app verification for public use
- Sufficient for the `about` endpoint and future file operations

**Key Details**:
- Scope grants read, write, and delete access to all Drive files
- Classified as "Restricted" sensitivity level
- Alternative scopes exist but limit functionality:
  - `drive.metadata.readonly`: Read-only metadata (less extensible)
  - `drive.readonly`: Read-only access (no write operations)
  - `drive.file`: Only files created by app (too restrictive)

**Alternatives Considered**:
- Minimal scope (`drive.metadata.readonly`): Too restrictive for future features
- Multiple scopes: Adds complexity without immediate benefit
- Incremental authorization: Requires multiple auth flows

### Q3: User Information Endpoint

**Decision**: Use `GET https://www.googleapis.com/drive/v3/about?fields=user`

**Rationale**:
- Confirmed in Jira ticket FE-662 as the required endpoint
- The `fields` parameter is **required** by Google Drive API
- Returns user information in a structured format
- Standard pattern for Drive API "whoami" operations

**Key Details**:

Response format:

```json
{
  "user": {
    "kind": "drive#user",
    "displayName": "John Doe",
    "photoLink": "https://lh3.googleusercontent.com/...",
    "me": true,
    "permissionId": "00112233445566778899",
    "emailAddress": "johndoe@example.com"
  }
}
```

Request requirements:
- Authorization header: `Bearer {access_token}`
- Required query parameter: `fields=user`
- HTTP method: GET

**Alternatives Considered**:
- OAuth2 userinfo endpoint: Different API, not Drive-specific
- People API: Requires additional API enablement

### Q4: Token Management Strategy

**Decision**: Implement reactive token refresh (on 401 errors)

**Rationale**:
- Aligns with existing Atlassian/Figma provider patterns
- Google access tokens expire after 1 hour (3600 seconds)
- Refresh tokens valid for 6 months of inactivity
- 100 refresh token limit per client requires careful management
- Simpler than proactive refresh with expiry tracking

**Key Details**:

Access tokens:
- Expiry: 1 hour (3600 seconds)
- Max size: 2048 bytes
- Format: Bearer token (e.g., `ya29.a0AfH6SMC...`)

Refresh tokens:
- Only issued on first authorization with `access_type=offline`
- Expire after 6 months of inactivity
- Maximum 100 tokens per client (oldest revoked when exceeded)
- Not returned in refresh responses

Token refresh request:

```http
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id={client_id}&
client_secret={client_secret}&
refresh_token={refresh_token}&
grant_type=refresh_token
```

**Alternatives Considered**:
- Proactive refresh: More complex, requires tracking expiry times
- Manual re-authentication: Poor user experience
- Token caching: Doesn't solve expiration issue

### Q5: Provider Architecture Pattern

**Decision**: Follow Figma provider structure (simple object implementing OAuthProvider interface)

**Rationale**:
- Maximizes code reuse with existing patterns
- Figma provider uses traditional OAuth (same as Google)
- Clear separation of concerns (OAuth, API client, tools)
- Established pattern for provider registration in connection hub

**Key Components**:

1. **Provider object** (`server/providers/google/index.ts`):
   - Implements `OAuthProvider` interface
   - Methods: `createAuthUrl`, `extractCallbackParams`, `exchangeCodeForTokens`
   - Exports provider object for connection hub registration

2. **API client** (`server/providers/google/google-api-client.ts`):
   - Client factory functions for OAuth and PAT
   - Base URL construction
   - Request helper methods
   - Error handling

3. **Tools** (`server/providers/google/tools/`):
   - `drive-about-user/` - MCP tool for user info
   - Each tool has own folder with index.ts

**Alternatives Considered**:
- Atlassian class-based pattern: More complex, not needed for simple OAuth
- Inline implementation: Poor code organization and reusability

### Q6: Google Cloud Console Configuration

**Decision**: Standard OAuth 2.0 web application setup

**Rationale**:
- Well-documented process in Google Cloud Console
- Requires enabling Google Drive API
- OAuth consent screen configuration mandatory
- Redirect URI validation is strict (HTTPS required except localhost)

**Required Steps**:

1. Enable Google Drive API in Cloud Console
2. Configure OAuth consent screen:
   - App name, support email, developer contact
   - Add scope: `https://www.googleapis.com/auth/drive`
   - For external users: requires app verification (restricted scope)
3. Create OAuth client credentials (Web application type)
4. Configure authorized redirect URIs:
   - Pattern: `{VITE_AUTH_SERVER_URL}/auth/callback/google`
   - Example: `http://localhost:3000/auth/callback/google` (dev)
   - Production must use HTTPS
5. Store credentials securely:
   - `GOOGLE_CLIENT_ID` - Public identifier
   - `GOOGLE_CLIENT_SECRET` - Must be kept secret

**Environment Variables Needed**:

```bash
GOOGLE_CLIENT_ID=<client_id>
GOOGLE_CLIENT_SECRET=<client_secret>
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/drive
```

**Security Considerations**:
- Never commit client_secret to version control
- Use environment variables or secret managers
- Validate redirect URIs strictly
- Implement state parameter for CSRF protection
- Handle 100 refresh token limit (revoke old tokens)

**Alternatives Considered**:
- Service account: Not suitable for user-specific OAuth
- API key only: Cannot access user-specific data

## Implementation Patterns from Existing Providers

### Pattern Reuse from Figma Provider

**createAuthUrl()** - Construct Google authorization URL:

```typescript
createAuthUrl(params: AuthUrlParams): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
  const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/google`;
  const scope = params.scope || process.env.GOOGLE_OAUTH_SCOPES!;
  
  // Google uses traditional OAuth 2.0 - similar to Figma
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

**exchangeCodeForTokens()** - Exchange auth code for tokens:

```typescript
async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
  const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/google`;
  
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
  
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_type: tokenData.token_type || 'Bearer',
    expires_in: tokenData.expires_in || 3600, // Google default: 1 hour
    scope: tokenData.scope,
  };
}
```

### Pattern Reuse from Atlassian Provider

**API Client Factory** - Create authenticated API client:

```typescript
// server/providers/google/google-api-client.ts
export function createGoogleClient(accessToken: string) {
  return {
    async fetchAboutUser() {
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Drive API error: ${response.status}`);
      }
      
      return response.json();
    }
  };
}
```

### Connection Hub Integration

Add Google provider to connection hub's REQUIRED_PROVIDERS:

```typescript
// server/provider-server-oauth/connection-hub.ts
const REQUIRED_PROVIDERS = ['atlassian', 'figma', 'google'] as const;
```

Register provider in main server:

```typescript
// server/server.ts or provider initialization file
import { googleProvider } from './providers/google/index.js';

// Register with connection hub
providerRegistry.register('google', googleProvider);
```

## Architecture Decisions Summary

| Decision Area | Choice | Rationale |
|---------------|--------|-----------|
| OAuth Flow | Traditional OAuth 2.0 with client_secret | Aligns with Figma pattern, simpler for server apps |
| OAuth Scope | `https://www.googleapis.com/auth/drive` | Full access for future extensibility (per clarification) |
| Provider Structure | Simple object implementing OAuthProvider | Consistent with Figma, maximizes code reuse |
| API Client Pattern | Factory function returning methods | Consistent with AtlassianClient pattern |
| Token Refresh | Reactive (on 401 error) | Standard pattern across providers |
| Tool Organization | Separate folder per tool | Follows modular architecture principle |
| User Info Endpoint | Drive API `/about?fields=user` | Required in spec, standard Drive API pattern |

## Technical Specifications

### API Endpoints

| Purpose | Endpoint | Method |
|---------|----------|--------|
| Authorization | `https://accounts.google.com/o/oauth2/v2/auth` | GET |
| Token Exchange | `https://oauth2.googleapis.com/token` | POST |
| Token Refresh | `https://oauth2.googleapis.com/token` | POST |
| User Info | `https://www.googleapis.com/drive/v3/about?fields=user` | GET |

### Environment Variables

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=<your_client_id>
GOOGLE_CLIENT_SECRET=<your_client_secret>
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/drive

# Existing variables (reused)
VITE_AUTH_SERVER_URL=<server_base_url>
```

### Dependencies

No new npm packages required:
- Uses Node.js native `fetch` for HTTP requests
- Leverages existing provider interface
- Reuses existing session management
- Reuses existing JWT token wrapping

## Next Steps

With research complete, proceed to:
1. ✅ Phase 1: Define data model for Google Drive entities
2. ✅ Phase 1: Create API contracts for MCP tool and REST endpoint
3. ✅ Phase 1: Generate quickstart guide
4. ✅ Phase 1: Update agent context with Google Drive technology
5. ✅ Complete Technical Context section in plan.md
6. ✅ Validate Constitution Check compliance
