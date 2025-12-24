# Fix Refresh Token Flow for Connection Hub

## Problem Statement

The connection hub OAuth flow is missing proper refresh token support. When an MCP client's access token expires, it cannot refresh and must re-authenticate.

### Current Issues

1. **No refresh token returned in token exchange response**
   - `access-token.ts` returns only `access_token` for connection hub codes (lines 68-76)
   - OAuth clients expect a `refresh_token` in the response to use later

2. **JWT structure mismatch between creation and consumption**
   - `connection-done.ts` creates JWTs with **nested structure**: `{ atlassian: { refresh_token: "..." } }`
   - `refresh-token.ts` expects **flat structure**: `{ atlassian_refresh_token: "..." }`
   - This means even if we returned a refresh token, the refresh flow would fail

3. **Connection hub only creates access token JWT**
   - `connection-done.ts` creates a single JWT with embedded provider tokens
   - It doesn't create a separate refresh token JWT with `type: 'refresh_token'`

4. **No Figma refresh implementation**
   - `refresh-token.ts` only handles Atlassian refresh
   - Figma uses a different endpoint and auth pattern than Atlassian

### Current Token Flow

```
1. User connects providers via connection hub
2. connection-done.ts creates JWT with nested structure:
   {
     sub: "user-xxx",
     atlassian: { access_token, refresh_token, expires_at },
     figma: { access_token, refresh_token, expires_at },
     exp: <shortest_provider_expiration>
   }
3. JWT stored in authorization code store
4. MCP client exchanges code at /access-token
5. access-token.ts returns: { access_token: <JWT>, token_type, expires_in, scope }
   ❌ NO refresh_token returned!
6. When access token expires, client has no way to refresh
```

### Expected Token Flow (per RFC 6749)

```
1-4. Same as above
5. access-token.ts returns: 
   { 
     access_token: <JWT>, 
     refresh_token: <refresh_JWT>,  ← MISSING
     token_type, 
     expires_in, 
     scope 
   }
6. When access token expires, client calls /access-token with:
   { grant_type: "refresh_token", refresh_token: <refresh_JWT> }
7. refresh-token.ts extracts provider refresh tokens from JWT
8. Exchanges with providers for new access tokens
9. Returns new access_token + refresh_token
```

## Design Decisions

Based on requirements discussion:

1. **Token Expiration Strategy**: Set JWT access token to expire when the **first** of Figma or Atlassian's access token expires. Always refresh both providers together.

2. **Refresh Failure Handling**: If one provider's refresh succeeds but another fails, **fail the entire refresh** (user must re-authenticate). This keeps the token state simple and consistent.

3. **Token Helper Refactoring**: Refactor existing Atlassian-specific functions (`createJiraMCPAuthToken`) to be **provider-agnostic**. Don't add new functions alongside - replace the existing ones.

4. **Refresh Token Structure**: Single refresh token JWT containing **all provider refresh tokens** (same pattern as access tokens).

## Provider Refresh API Differences

### Atlassian Refresh
- **Endpoint**: `POST https://auth.atlassian.com/oauth/token`
- **Auth Method**: `client_id` + `client_secret` in request body (JSON)
- **Request Body**: `{ grant_type: "refresh_token", client_id, client_secret, refresh_token }`
- **Response**: Returns **new `refresh_token`** with each refresh (rotating refresh tokens)

### Figma Refresh  
- **Endpoint**: `POST https://api.figma.com/v1/oauth/refresh` (different endpoint, not `/token`!)
- **Auth Method**: HTTP Basic Auth header: `Authorization: Basic <base64(client_id:client_secret)>`
- **Request Body**: `refresh_token=<token>` (form-urlencoded)
- **Response**: Returns only `access_token`, `token_type`, `expires_in` - **NO new refresh_token**
- **⚠️ Critical**: The same refresh token remains valid indefinitely and **must be reused** on subsequent refreshes. Our code must preserve the original Figma refresh token when creating new JWT refresh tokens.

## Implementation Plan

### Step 1: Add `refreshAccessToken()` to OAuthProvider Interface

The `OAuthProvider` interface currently has no method for refreshing tokens. We need to add one that handles provider-specific refresh flows.

**File:** `server/providers/provider-interface.ts`

**Changes:**
1. Add `RefreshTokenParams` interface:
```typescript
export interface RefreshTokenParams {
  refreshToken: string;
}
```

2. Add `refreshAccessToken()` method to `OAuthProvider` interface:
```typescript
/**
 * Refresh an access token using a refresh token
 * Handles provider-specific refresh flows (different endpoints, auth methods)
 * @param params - Refresh parameters including the refresh token
 * @returns New access token and optionally new refresh token
 * 
 * NOTE: Some providers (Atlassian) rotate refresh tokens on each refresh,
 * while others (Figma) reuse the same refresh token indefinitely.
 * The returned refresh_token should be:
 * - The NEW refresh token if provider rotates (Atlassian)
 * - The ORIGINAL refresh token if provider doesn't rotate (Figma)
 */
refreshAccessToken?(params: RefreshTokenParams): Promise<StandardTokenResponse>;
```

**Verification:**
- TypeScript compiles
- Interface updated

### Step 2: Implement `refreshAccessToken()` in Figma Provider

**File:** `server/providers/figma/index.ts`

**Changes:**
Add `refreshAccessToken()` to `figmaProvider` object:
```typescript
async refreshAccessToken(params: RefreshTokenParams): Promise<StandardTokenResponse> {
  const clientId = process.env.FIGMA_CLIENT_ID!;
  const clientSecret = process.env.FIGMA_CLIENT_SECRET!;
  
  // Figma uses HTTP Basic Auth for refresh
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const response = await fetch('https://api.figma.com/v1/oauth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
    }).toString(),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Figma token refresh failed (${response.status}): ${errorText}`);
  }
  
  const tokenData = await response.json() as any;
  // Figma response: { access_token, token_type, expires_in } - NO refresh_token!
  
  return {
    access_token: tokenData.access_token,
    // ⚠️ KEY: Figma doesn't return a refresh token, so we return the ORIGINAL 
    // input token. This ensures the caller gets a valid refresh_token to embed
    // in the new JWT, even though Figma didn't provide one.
    refresh_token: params.refreshToken,
    token_type: tokenData.token_type || 'Bearer',
    expires_in: tokenData.expires_in || 7776000,
  };
},
```

**Why this works:**
1. Figma's `/oauth/refresh` endpoint returns `{ access_token, token_type, expires_in }` - **no refresh_token**
2. The same refresh token remains valid indefinitely for Figma
3. By returning `params.refreshToken` (the input), we ensure:
   - The `StandardTokenResponse` always has a `refresh_token` field
   - The caller (`refresh-token.ts`) doesn't need special logic per provider
   - The original Figma refresh token gets embedded in the new JWT

**Verification:**
- Manually call with valid Figma refresh token
- Verify new access_token returned
- Verify returned refresh_token === input refresh_token

### Step 3: Implement `refreshAccessToken()` in Atlassian Provider

**File:** `server/providers/atlassian/index.ts` (or wherever Atlassian provider is)

**Changes:**
Add `refreshAccessToken()` to atlassian provider:
```typescript
async refreshAccessToken(params: RefreshTokenParams): Promise<StandardTokenResponse> {
  const ATLASSIAN_CONFIG = getAtlassianConfig();
  
  const response = await fetch(ATLASSIAN_CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: ATLASSIAN_CONFIG.clientId,
      client_secret: ATLASSIAN_CONFIG.clientSecret,
      refresh_token: params.refreshToken,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Atlassian token refresh failed (${response.status}): ${errorText}`);
  }
  
  const tokenData = await response.json() as any;
  
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,  // Atlassian rotates - return NEW token
    token_type: tokenData.token_type || 'Bearer',
    expires_in: tokenData.expires_in || 3600,
    scope: tokenData.scope,
  };
},
```

**Verification:**
- Manually call with valid Atlassian refresh token
- Verify new access_token returned
- Verify returned refresh_token !== input refresh_token (rotation)

### Step 4: Refactor `token-helpers.ts` to Support Multi-Provider

**Current State:**
- `createJiraMCPAuthToken()` already creates JWTs with nested structure: `{ atlassian: { access_token, ... } }`
- `createJiraMCPRefreshToken()` creates refresh tokens with nested structure: `{ atlassian: { refresh_token } }`
- Both functions only support Atlassian

**File:** `server/pkce/token-helpers.ts`

**Changes:**
1. Define `MultiProviderTokens` interface:
```typescript
interface ProviderTokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
}

interface MultiProviderTokens {
  atlassian?: ProviderTokenData;
  figma?: ProviderTokenData;
}
```

2. Create `createMultiProviderAccessToken(tokens: MultiProviderTokens, options)`:
   - Build JWT payload with nested provider structure
   - Calculate expiration as **minimum** of all provider `expires_at` values (minus 60s buffer)
   - Set `exp` to the calculated minimum

3. Create `createMultiProviderRefreshToken(tokens: MultiProviderTokens, options)`:
   - Build JWT payload with `type: 'refresh_token'`
   - Include `atlassian: { refresh_token }` and/or `figma: { refresh_token }`
   - Calculate expiration from provider refresh token lifetimes

4. Keep existing `createJiraMCPAuthToken` and `createJiraMCPRefreshToken` as wrappers that call the new multi-provider functions (for backward compatibility with existing PKCE flow callers)

**Verification:**
- TypeScript compiles
- Unit test: Create token with both providers, decode JWT, verify nested structure
- Unit test: Create token with only Atlassian, verify only Atlassian in JWT
- Unit test: Verify `exp` is set to minimum provider expiration

### Step 5: Update `connection-done.ts` to Create Refresh Token

**Current State:**
- Creates JWT payload manually (lines 60-97)
- Stores only access token in authorization code store
- Does NOT create a refresh token

**File:** `server/provider-server-oauth/connection-done.ts`

**Changes:**
1. Import `createMultiProviderAccessToken` and `createMultiProviderRefreshToken` from token-helpers
2. Replace manual JWT creation with `createMultiProviderAccessToken()` call
3. Also create refresh token JWT using `createMultiProviderRefreshToken()`
4. Update `storeAuthorizationCode()` call to pass both tokens

**Also update:** `server/auth/consent-page.ts` (another caller of `storeAuthorizationCode`)
- Same pattern: create refresh token alongside access token
- Pass both to `storeAuthorizationCode()`

**Verification:**
- Console.log both JWTs after creation
- Decode access token: verify nested structure `{ atlassian: {...}, figma: {...} }`
- Decode refresh token: verify `type: 'refresh_token'` and nested refresh tokens

### Step 6: Update Authorization Code Store

**Current State:**
- `AuthCodeEntry` has: `{ jwt: string, expiresAt, clientId, redirectUri }`
- `storeAuthorizationCode(code, jwt, ...)` stores single JWT
- `consumeAuthorizationCode(code)` returns `string | null`

**File:** `server/pkce/authorization-code-store.ts`

**Changes:**
1. Update `AuthCodeEntry` interface:
```typescript
interface AuthCodeEntry {
  accessToken: string;  // renamed from jwt
  refreshToken?: string;  // NEW
  expiresAt: number;
  clientId?: string;
  redirectUri?: string;
}
```

2. Update `storeAuthorizationCode()` signature:
```typescript
export function storeAuthorizationCode(
  code: string, 
  accessToken: string,
  refreshToken?: string,
  clientId?: string,
  redirectUri?: string
): void
```

3. Update `consumeAuthorizationCode()` return type:
```typescript
interface AuthCodeResult {
  accessToken: string;
  refreshToken?: string;
}
export function consumeAuthorizationCode(code: string): AuthCodeResult | null
```

**Verification:**
- Store with both tokens, retrieve, verify both returned
- Store with only access token, retrieve, verify refreshToken is undefined

### Step 7: Update `access-token.ts` to Return Refresh Token

**Current State:**
- `handleAuthorizationCodeGrant()` calls `consumeAuthorizationCode(code)`
- Returns only `{ access_token, token_type, expires_in, scope }`

**File:** `server/pkce/access-token.ts`

**Changes:**
1. Update `consumeAuthorizationCode()` call to destructure result:
```typescript
const result = consumeAuthorizationCode(code);
if (!result) { /* error handling */ }
const { accessToken, refreshToken } = result;
```

2. Include refresh_token in response if present:
```typescript
res.json({
  access_token: accessToken,
  token_type: 'Bearer',
  expires_in: 3540,
  scope: getAtlassianConfig().scopes,
  ...(refreshToken && { refresh_token: refreshToken }),
});
```

**Verification:**
- Complete connection hub flow
- Capture token exchange response
- Verify response includes both `access_token` and `refresh_token`
- Decode `refresh_token` JWT and verify `type: 'refresh_token'`

### Step 8: Update `refresh-token.ts` for Multi-Provider Refresh

**Current State:**
- Expects flat structure: `refreshPayload.atlassian_refresh_token`
- Only refreshes Atlassian tokens
- Creates new tokens using `createJiraMCPAuthToken`/`createJiraMCPRefreshToken`

**File:** `server/pkce/refresh-token.ts`

**Changes:**
1. Update JWT payload extraction to use nested structure:
```typescript
const atlassianRefreshToken = refreshPayload.atlassian?.refresh_token;
const figmaRefreshToken = refreshPayload.figma?.refresh_token;
```

2. Refresh using provider interface (replaces inline Atlassian code):
```typescript
import { atlassianProvider } from '../providers/atlassian/index.js';
import { figmaProvider } from '../providers/figma/index.js';

// Refresh each provider using the standard interface
if (atlassianRefreshToken) {
  newAtlassianTokens = await atlassianProvider.refreshAccessToken({ 
    refreshToken: atlassianRefreshToken 
  });
}

if (figmaRefreshToken) {
  newFigmaTokens = await figmaProvider.refreshAccessToken({ 
    refreshToken: figmaRefreshToken 
  });
  // Note: figmaProvider.refreshAccessToken already returns the original 
  // refresh_token per Figma's non-rotating behavior
}
```

3. **Fail-fast on any provider error**: If either refresh fails, return error immediately (don't partial-refresh)

4. Create new tokens using multi-provider functions:
```typescript
const multiProviderTokens: MultiProviderTokens = {};
if (newAtlassianTokens) {
  multiProviderTokens.atlassian = {
    access_token: newAtlassianTokens.access_token,
    refresh_token: newAtlassianTokens.refresh_token,  // Provider handles rotation
    expires_at: calculateExpiresAt(newAtlassianTokens.expires_in),
    scope: newAtlassianTokens.scope,
  };
}
if (newFigmaTokens) {
  multiProviderTokens.figma = {
    access_token: newFigmaTokens.access_token,
    refresh_token: newFigmaTokens.refresh_token,  // Provider handles non-rotation
    expires_at: calculateExpiresAt(newFigmaTokens.expires_in),
    scope: newFigmaTokens.scope,
  };
}

const newAccessToken = await createMultiProviderAccessToken(multiProviderTokens, options);
const { refreshToken: newRefreshToken } = await createMultiProviderRefreshToken(multiProviderTokens, options);
```

**Verification:**
- Create test JWT with nested structure manually
- Call `/access-token` with `grant_type: refresh_token`
- Verify new `access_token` and `refresh_token` returned
- Decode both and verify nested structure preserved
- Verify both provider APIs were called (check logs)

### Step 9: End-to-End Integration Test

Test the complete flow from connection hub through multiple refresh cycles.

**Manual Test Steps:**

1. **Setup**: Start server with `TEST_SHORT_AUTH_TOKEN_EXP=60` (1-minute expiration)

2. **Initial Connection**:
   - Connect via VS Code Copilot MCP client
   - Complete connection hub flow (connect both Atlassian and Figma)
   - Verify initial token response includes `refresh_token`
   - Decode tokens and verify structure

3. **First Refresh Cycle** (wait ~1 minute):
   - Verify MCP client automatically calls refresh endpoint
   - Server logs show both Atlassian and Figma refresh API calls
   - New tokens returned and client continues working

4. **Second Refresh Cycle** (wait another ~1 minute):
   - Verify refresh works again (proves token rotation working)
   - Verify Figma reuses the **same original refresh token** (no rotation)
   - Verify Atlassian uses the **new refresh token** from previous refresh (rotation)
   - Decode new JWT refresh token and confirm Figma refresh_token unchanged

5. **Provider API Calls**:
   - Call a Jira tool (verify Atlassian token works)
   - Call a Figma tool (verify Figma token works)

**Verification Checklist:**
- [ ] Initial token response has `refresh_token`
- [ ] Server logs show "🔄 REFRESH TOKEN FLOW" with both providers
- [ ] MCP client continues working after token expiration
- [ ] No re-authentication prompt shown
- [ ] Both Jira and Figma tools work after refresh

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `server/providers/provider-interface.ts` | Add | Add `refreshAccessToken()` to OAuthProvider interface |
| `server/providers/figma/index.ts` | Add | Implement `refreshAccessToken()` (returns original refresh_token) |
| `server/providers/atlassian/index.ts` | Add | Implement `refreshAccessToken()` (returns new refresh_token) |
| `server/pkce/token-helpers.ts` | Add + Refactor | Add multi-provider token creation functions |
| `server/provider-server-oauth/connection-done.ts` | Modify | Create refresh token, use new helpers |
| `server/auth/consent-page.ts` | Modify | Create refresh token, pass to store |
| `server/pkce/authorization-code-store.ts` | Modify | Store and return both tokens |
| `server/pkce/access-token.ts` | Modify | Return `refresh_token` in response |
| `server/pkce/refresh-token.ts` | Modify | Use provider interface, nested structure |

## Questions

1. Should we support single-provider connections (e.g., only Atlassian connected) with refresh, or require both providers to be connected?
   - **Current assumption**: Support either/both - refresh whatever providers are present in the JWT

2. When Figma tokens are near expiration but Atlassian tokens are still valid, should we proactively refresh both, or only refresh the expiring provider?
   - **Current assumption**: Always refresh all providers together when any access token expires (keeps logic simple)

3. Should we add automated tests for the refresh flow, or is manual E2E testing sufficient for now?
   - **Current assumption**: Manual E2E testing with `TEST_SHORT_AUTH_TOKEN_EXP=60` is sufficient for initial implementation