# Refresh Token Flow Fix - Implementation Summary

## Overview

This document summarizes the implementation of proper refresh token support for the Cascade MCP connection hub OAuth flow. The fix addresses the issue where MCP clients were unable to refresh access tokens when they expired, requiring users to re-authenticate.

## Problem Statement

The original implementation had three critical issues:

1. **Connection hub did not return refresh tokens**: `access-token.ts` returned only `access_token` for connection hub codes, no `refresh_token`
2. **JWT structure mismatch**: `connection-done.ts` created nested tokens (`{ atlassian: { refresh_token } }`) but `refresh-token.ts` expected flat structure (`{ atlassian_refresh_token }`)
3. **Figma refresh not implemented**: Only Atlassian refresh was handled; Figma had no refresh support

## Solution Design

### 1. Token Helper Refactoring (token-helpers.ts)

**Changes:**
- Introduced provider-agnostic token creation functions
- Added `createMCPAccessToken()` to replace Atlassian-specific `createJiraMCPAuthToken()`
- Added `createMCPRefreshToken()` to replace Atlassian-specific `createJiraMCPRefreshToken()`
- Kept legacy functions as backwards-compatible wrappers

**Key Features:**
- Supports multiple providers (Atlassian, Figma, future providers)
- JWT access token expiration: shortest provider token expiration minus 1 minute buffer
- Proper handling of Figma's non-rotating refresh tokens vs Atlassian's rotating tokens
- Nested JWT structure maintained for consistency

**Signature Changes:**
```typescript
// New signatures (provider-agnostic)
createMCPAccessToken(providers: Record<string, ProviderTokenResponse>, options?: TokenCreationOptions)
createMCPRefreshToken(providers: Record<string, ProviderTokenResponse>, options?: TokenCreationOptions)

// Legacy signatures (still supported for backwards compatibility)
createJiraMCPAuthToken(atlassianTokens, options?)
createJiraMCPRefreshToken(atlassianTokens, options?)
```

### 2. Refresh Token Exchange - Figma Support (refresh-token.ts)

**Changes:**
- Implemented Figma refresh token endpoint integration
- Added provider-specific refresh logic for both Atlassian and Figma
- Handles API differences between providers:
  - **Atlassian**: POST to `https://auth.atlassian.com/oauth/token` with JSON body, returns new refresh_token
  - **Figma**: POST to `https://api.figma.com/v1/oauth/refresh` with form-urlencoded body, does NOT return new refresh_token

**Critical Implementation Detail - Figma Refresh Token Preservation:**
```typescript
// Figma does NOT return a new refresh_token - preserve the original!
newProviderTokens.figma = {
  access_token: responseData.access_token,
  refresh_token: refreshPayload.figma.refresh_token, // Reuse the original
  token_type: responseData.token_type || 'Bearer',
  expires_in: responseData.expires_in || 7776000,
  scope: responseData.scope,
};
```

**Error Handling Strategy:**
- If either provider refresh fails, fail the entire refresh (all-or-nothing)
- This keeps token state simple and consistent
- User must re-authenticate only once to get all providers working again

### 3. Authorization Code Store Enhancement (authorization-code-store.ts)

**Changes:**
- Updated `AuthCodeEntry` interface to store optional refresh token
- Modified `storeAuthorizationCode()` to accept refresh token parameter
- Updated `consumeAuthorizationCode()` return type from string to object:
```typescript
{ accessToken: string; refreshToken?: string } | null
```

**Backwards Compatibility:**
- Old code passing only JWT to `storeAuthorizationCode()` still works
- `refreshToken` parameter is optional

### 4. Connection Hub Access Token Response (access-token.ts)

**Changes:**
- Updated to use new `consumeAuthorizationCode()` return type
- Now extracts and returns refresh_token JWT from authorization code store:
```typescript
const response: any = {
  access_token: connectionHubTokens.accessToken,
  token_type: 'Bearer',
  expires_in: 3540,
  scope: getAtlassianConfig().scopes,
};

if (connectionHubTokens.refreshToken) {
  response.refresh_token = connectionHubTokens.refreshToken;
}
```

### 5. Connection Done Handler (connection-done.ts)

**Complete Rewrite:**
- Now creates BOTH access and refresh token JWTs
- Uses new `createMCPAccessToken()` and `createMCPRefreshToken()` functions
- Stores both JWTs in authorization code store via new `refreshToken` parameter

**Flow:**
1. Extract provider tokens from session
2. Create JWT access token with `createMCPAccessToken()`
3. Create JWT refresh token with `createMCPRefreshToken()`
4. Store authorization code with both JWTs
5. Redirect to MCP client with code

**Manual Flow Enhancement:**
- Now displays both access and refresh tokens for manual testing
- Improved UI with separate sections for each token type

## Token Structure Examples

### Access Token JWT Payload
```json
{
  "sub": "user-abc123",
  "iss": "https://cascade.example.com",
  "aud": "https://cascade.example.com",
  "scope": "read:jira-work write:jira-work offline_access",
  "exp": 1700000000,
  "atlassian": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_at": 1700003600,
    "scope": "read:jira-work write:jira-work offline_access"
  },
  "figma": {
    "access_token": "17b7a2a8-1234-5678-...",
    "refresh_token": "17b7a2a8-5678-1234-...",
    "expires_at": 1788000000,
    "scope": "file_content:read file_comments:read"
  }
}
```

### Refresh Token JWT Payload
```json
{
  "type": "refresh_token",
  "sub": "user-abc123",
  "iss": "https://cascade.example.com",
  "aud": "https://cascade.example.com",
  "scope": "read:jira-work write:jira-work offline_access",
  "exp": 1788000000,
  "atlassian": {
    "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
  },
  "figma": {
    "refresh_token": "17b7a2a8-5678-1234-..."
  }
}
```

## RFC 6749 Compliance

All changes maintain compliance with RFC 6749 OAuth 2.0 specification:

- ✅ Token expiration properly set and communicated
- ✅ Refresh token grant type support
- ✅ Single-use authorization codes (preserved in code store)
- ✅ Token rotation for providers that support it (Atlassian)
- ✅ Token reuse for providers that don't rotate (Figma)
- ✅ Bearer token usage
- ✅ Proper error responses with error codes and descriptions

## Testing Scenarios

### Scenario 1: Single Provider Refresh (Atlassian)
1. User connects only Atlassian
2. System creates access token with Atlassian credentials
3. System creates refresh token with Atlassian refresh_token
4. Access token expires
5. Client calls `/access-token` with refresh_token grant
6. System refreshes Atlassian tokens, creates new JWTs
7. Returns new access and refresh tokens

**Expected Result:** ✓ Seamless refresh

### Scenario 2: Single Provider Refresh (Figma)
1. User connects only Figma
2. System creates access token with Figma credentials
3. System creates refresh token with Figma refresh_token
4. Access token expires
5. Client calls `/access-token` with refresh_token grant
6. System refreshes Figma tokens, **preserves original refresh_token**
7. Returns new access token and same refresh_token

**Expected Result:** ✓ Seamless refresh with preserved refresh_token

### Scenario 3: Multi-Provider Refresh (Success)
1. User connects both Atlassian and Figma
2. System creates access token with both providers' credentials
3. System creates refresh token with both providers' refresh_tokens
4. Either access token expires (Atlassian's 1-hour default)
5. Client calls `/access-token` with refresh_token grant
6. System successfully refreshes BOTH:
   - Atlassian: receives new refresh_token
   - Figma: reuses original refresh_token
7. Returns new JWTs with refreshed credentials

**Expected Result:** ✓ Both providers refreshed, JWTs updated

### Scenario 4: Multi-Provider Refresh (Partial Failure)
1. User connects both Atlassian and Figma
2. Later, Figma revokes the refresh token
3. Access token expires
4. Client calls `/access-token` with refresh_token grant
5. System attempts refresh:
   - Atlassian: succeeds, returns new refresh_token
   - Figma: fails with invalid_grant (revoked refresh_token)
6. System detects failure from either provider
7. Returns error: "Token refresh failed: Figma: Invalid refresh token"

**Expected Result:** ✓ Entire refresh fails, user must re-authenticate once to reconnect both providers

## Migration Guide

### For Token Usage (No Changes Required)
- Existing code using old `createJiraMCPAuthToken()` continues to work
- Legacy functions automatically call new provider-agnostic functions

### For OAuth Handlers (Update Recommended)
```typescript
// Old way (still works)
const jwt = await createJiraMCPAuthToken(atlassianTokens, options);
const { refreshToken } = await createJiraMCPRefreshToken(atlassianTokens, options);

// New way (recommended for multiple providers)
const jwt = await createMCPAccessToken(
  { atlassian: atlassianTokens, figma: figmaTokens },
  options
);
const { refreshToken } = await createMCPRefreshToken(
  { atlassian: atlassianTokens, figma: figmaTokens },
  options
);
```

### For Authorization Code Store
```typescript
// Now returns object instead of string
const tokens = consumeAuthorizationCode(code);
if (tokens) {
  const accessToken = tokens.accessToken;
  const refreshToken = tokens.refreshToken;  // May be undefined if not stored
}
```

## Files Modified

1. **server/pkce/token-helpers.ts**
   - Added `ProviderTokenResponse`, `FigmaTokenResponse` interfaces
   - Added `createMCPAccessToken()` function (provider-agnostic)
   - Added `createMCPRefreshToken()` function (provider-agnostic)
   - Kept legacy functions for backwards compatibility

2. **server/pkce/refresh-token.ts**
   - Updated imports to include new token helper functions
   - Refactored token refresh logic to support multiple providers
   - Added Figma refresh endpoint integration
   - Implemented all-or-nothing error handling

3. **server/pkce/authorization-code-store.ts**
   - Updated `AuthCodeEntry` interface with optional `refreshToken` field
   - Updated `storeAuthorizationCode()` signature with optional refresh token
   - Updated `consumeAuthorizationCode()` return type to include refresh token

4. **server/pkce/access-token.ts**
   - Updated to handle new `consumeAuthorizationCode()` return type
   - Modified response to include `refresh_token` when available

5. **server/provider-server-oauth/connection-done.ts**
   - Complete rewrite to create both access and refresh token JWTs
   - Uses new `createMCPAccessToken()` and `createMCPRefreshToken()`
   - Stores both JWTs in authorization code store
   - Updated manual flow display to show both tokens

## Configuration

No additional environment variables required. Existing configuration is sufficient:
- `JWT_SECRET` - for signing JWTs
- `VITE_AUTH_SERVER_URL` - for token audience/issuer
- `FIGMA_CLIENT_ID` and `FIGMA_CLIENT_SECRET` - for Figma refresh (existing)
- `VITE_JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET` - for Atlassian refresh (existing)

## Security Considerations

1. **Figma Refresh Token Preservation**: The code explicitly preserves Figma's non-rotating refresh tokens, which is correct per Figma's API spec. These tokens remain valid indefinitely and do not expire.

2. **All-or-Nothing Refresh**: If any provider's refresh fails, the entire operation fails. This prevents partial token updates that could lead to inconsistent states.

3. **JWT Expiration**: Access tokens expire at the earliest provider token expiration minus 1 minute, ensuring no edge cases where clients have "valid" JWTs but provider credentials are expired.

4. **Single-Use Authorization Codes**: Preserved per RFC 6749 - codes are deleted after consumption and cannot be reused.

## Logging & Debugging

The implementation includes comprehensive logging for debugging refresh flows:
- Per-provider refresh attempt logging
- Success/failure messages for each provider
- Detailed error messages for troubleshooting
- Token expiration information

Enable debug logging with:
```bash
LOG_LEVEL=debug npm run dev
```

## Future Enhancements

1. **Additional Providers**: New providers can be added by:
   - Implementing their refresh endpoint in `refresh-token.ts`
   - Adding their refresh token to `ProviderTokenResponse`
   - Updating `connection-done.ts` to handle their tokens

2. **Selective Provider Refresh**: Could allow clients to selectively refresh only certain providers while keeping others unchanged (currently all-or-nothing).

3. **Token Rotation Analytics**: Could track refresh patterns and token usage for monitoring and alerting.

4. **Refresh Token Rotation**: Could implement rolling refresh token rotation for enhanced security if providers support it.

## Verification Checklist

- [x] Token helper functions support multiple providers
- [x] Figma refresh token endpoint properly integrated
- [x] Figma refresh tokens are preserved (not rotated)
- [x] Atlassian refresh tokens are properly rotated
- [x] Access token expiration uses shortest provider token expiration
- [x] Refresh token JWTs created separately from access tokens
- [x] Authorization code store returns both access and refresh tokens
- [x] Access token endpoint returns refresh_token for connection hub flow
- [x] Connection done handler creates both JWT types
- [x] Error handling is all-or-nothing for multi-provider refresh
- [x] RFC 6749 compliance maintained
- [x] Backwards compatibility preserved for legacy code
- [x] Comprehensive logging for debugging
