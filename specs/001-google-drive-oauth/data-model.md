# Data Model: Google Drive OAuth Integration

**Feature**: Google Drive OAuth and "whoami" tool  
**Date**: December 18, 2025  
**Reference**: [research.md](research.md)

## Entity Definitions

### 1. GoogleOAuthCredentials

Represents the OAuth 2.0 credentials for an authenticated Google Drive user session.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `access_token` | string | Yes | Bearer token for API requests (max 2048 bytes, expires in 1 hour) |
| `refresh_token` | string | Conditional | Token for obtaining new access tokens (only on first auth with `access_type=offline`) |
| `token_type` | string | Yes | Always "Bearer" for Google OAuth |
| `expires_in` | number | Yes | Seconds until access token expires (typically 3600) |
| `scope` | string | Yes | Space-delimited granted scopes (e.g., "https://www.googleapis.com/auth/drive") |
| `issued_at` | number | No | Unix timestamp when token was issued (for tracking) |

**Validation Rules**:

- `access_token` must be non-empty string
- `expires_in` must be positive integer
- `scope` must contain at minimum `https://www.googleapis.com/auth/drive`
- `token_type` must equal "Bearer"

**Lifecycle**:

- Created: During OAuth callback after successful token exchange
- Updated: When access token is refreshed
- Destroyed: When user revokes access or tokens expire

**Storage**:

- Embedded in JWT payload as `google_access_token` and `google_refresh_token`
- JWT expires 1 minute before underlying Google token
- Session storage during OAuth flow completion

**Security**:

- Never log full tokens (use `sanitizeTokenForLogging()`)
- Store in memory during request lifecycle
- Persist only in encrypted session or JWT

### 2. DriveUser

Represents an authenticated Google Drive user's profile information.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `kind` | string | Yes | Always "drive#user" for Drive API responses |
| `displayName` | string | Yes | User's display name (e.g., "John Doe") |
| `emailAddress` | string | Yes | User's email address |
| `permissionId` | string | Yes | Unique identifier used in Drive permissions |
| `photoLink` | string | No | URL to user's profile photo |
| `me` | boolean | Yes | Always true (indicates current user) |

**Source**: Google Drive API `/about?fields=user` endpoint response

**Validation Rules**:

- `kind` must equal "drive#user"
- `emailAddress` must be valid email format
- `me` must be true

**Usage**:

- Returned by `drive-about-user` MCP tool
- Used to verify authentication status
- Display user identity in connection hub

**Example**:

```json
{
  "kind": "drive#user",
  "displayName": "John Doe",
  "emailAddress": "johndoe@example.com",
  "permissionId": "00112233445566778899",
  "photoLink": "https://lh3.googleusercontent.com/...",
  "me": true
}
```

### 3. GoogleProviderConfig

Represents the configuration for the Google Drive OAuth provider within CascadeMCP.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Always "google" (provider identifier) |
| `clientId` | string | Yes | OAuth client ID from Google Cloud Console (env: `GOOGLE_CLIENT_ID`) |
| `clientSecret` | string | Yes | OAuth client secret (env: `GOOGLE_CLIENT_SECRET`) |
| `scopes` | string[] | Yes | OAuth scopes to request (env: `GOOGLE_OAUTH_SCOPES`) |
| `authUrl` | string | Yes | Google authorization endpoint URL |
| `tokenUrl` | string | Yes | Google token exchange/refresh endpoint URL |
| `redirectUri` | string | Yes | OAuth callback URL (constructed from `VITE_AUTH_SERVER_URL`) |

**Constants**:

```typescript
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/drive'];
```

**Validation Rules**:

- `clientId` must be non-empty
- `clientSecret` must be non-empty and never logged
- `scopes` must include at least one scope
- `redirectUri` must match Google Cloud Console configuration
- All URLs must use HTTPS (except localhost for development)

**Lifecycle**:

- Loaded: On server startup from environment variables
- Validated: During provider registration
- Used: Throughout OAuth flow and API requests

**Security**:

- `clientSecret` stored only in environment variables
- Never include `clientSecret` in logs or client responses
- Validate redirect URI against whitelist

### 4. OAuthAuthorizationRequest

Represents parameters for initiating Google OAuth authorization flow.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `client_id` | string | Yes | Google OAuth client ID |
| `response_type` | string | Yes | Always "code" for authorization code flow |
| `redirect_uri` | string | Yes | Callback URL (must match Google console config) |
| `scope` | string | Yes | Space-delimited scopes |
| `access_type` | string | Yes | "offline" to receive refresh token |
| `state` | string | Yes | CSRF protection token |
| `prompt` | string | No | "consent", "select_account", or omitted |

**Example URL**:

```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=123456.apps.googleusercontent.com
  &response_type=code
  &redirect_uri=http://localhost:3000/auth/callback/google
  &scope=https://www.googleapis.com/auth/drive
  &access_type=offline
  &state=abc123xyz
```

**Validation**:

- `state` must be unique per request (UUID recommended)
- `redirect_uri` must match Google Cloud Console configuration exactly
- `scope` must not be empty

### 5. OAuthTokenExchangeRequest

Represents parameters for exchanging authorization code for tokens.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `client_id` | string | Yes | Google OAuth client ID |
| `client_secret` | string | Yes | Google OAuth client secret |
| `code` | string | Yes | Authorization code from callback |
| `redirect_uri` | string | Yes | Must match the redirect_uri used in authorization |
| `grant_type` | string | Yes | Always "authorization_code" |

**Request Format**:

```http
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id={client_id}&
client_secret={client_secret}&
code={code}&
redirect_uri={redirect_uri}&
grant_type=authorization_code
```

**Response**: Returns `GoogleOAuthCredentials`

### 6. OAuthTokenRefreshRequest

Represents parameters for refreshing an expired access token.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `client_id` | string | Yes | Google OAuth client ID |
| `client_secret` | string | Yes | Google OAuth client secret |
| `refresh_token` | string | Yes | Refresh token from original authorization |
| `grant_type` | string | Yes | Always "refresh_token" |

**Request Format**:

```http
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

client_id={client_id}&
client_secret={client_secret}&
refresh_token={refresh_token}&
grant_type=refresh_token
```

**Response**: Returns new `GoogleOAuthCredentials` (without refresh_token)

**Note**: Refresh token is NOT returned in refresh response; reuse existing refresh token.

## Data Relationships

```
GoogleProviderConfig
  ↓ (used to create)
OAuthAuthorizationRequest
  ↓ (returns authorization code)
OAuthTokenExchangeRequest
  ↓ (returns)
GoogleOAuthCredentials
  ↓ (used to call)
Drive API /about?fields=user
  ↓ (returns)
DriveUser
```

## State Transitions

### OAuth Flow States

1. **Uninitialized**: No OAuth session exists
2. **Authorization Requested**: User redirected to Google consent screen
3. **Authorization Granted**: User approved, code received at callback
4. **Token Exchange**: Exchanging code for access/refresh tokens
5. **Authenticated**: Valid access token available
6. **Token Expired**: Access token expired (401 error received)
7. **Refreshing**: Using refresh token to obtain new access token
8. **Revoked**: User revoked access or refresh token expired

### Token Lifecycle

```
[Initial Authorization]
         ↓
   [Access Token Valid] ← ← ← ← ← ← ← ← ← ←
         ↓ (after 1 hour)                   ↑
   [Access Token Expired]                   ↑
         ↓                                   ↑
   [Refresh Token Used]                     ↑
         ↓                                   ↑
   [New Access Token] → → → → → → → → → → →
```

## Validation Constraints

### Access Token Validation

- Length: Must be ≤ 2048 bytes
- Format: Base64-encoded string starting with "ya29."
- Expiry: Must have `expires_in` > 0
- Never empty or null

### Refresh Token Validation

- Length: Must be ≤ 512 bytes
- Format: Opaque string starting with "1//"
- Persistence: Only available on first auth with `access_type=offline`
- Count limit: Maximum 100 per Google Cloud project

### Email Validation

- Format: RFC 5322 compliant email address
- Domain: Any valid domain (not restricted to Google domains)
- Uniqueness: Email identifies unique user

### Scope Validation

- Format: Space-delimited list of scope URLs
- Required: Must include `https://www.googleapis.com/auth/drive`
- Verification: "Restricted" scopes require Google app verification for public apps

## Error States

### OAuth Errors

| Error Code | Trigger | Recovery |
|------------|---------|----------|
| `invalid_grant` | Expired/revoked authorization code or refresh token | Re-authenticate user |
| `invalid_client` | Wrong client_id or client_secret | Fix environment configuration |
| `redirect_uri_mismatch` | Redirect URI doesn't match Google console | Update Google console or fix configuration |
| `access_denied` | User denied OAuth consent | Inform user, retry with explanation |
| `invalid_request` | Missing required parameter | Fix request parameters |

### API Errors

| Status Code | Trigger | Recovery |
|-------------|---------|----------|
| 401 Unauthorized | Expired or invalid access token | Refresh token or re-authenticate |
| 403 Forbidden | Insufficient scope permissions | Request additional scopes |
| 404 Not Found | Invalid API endpoint or resource | Fix API request |
| 429 Too Many Requests | Rate limit exceeded | Implement exponential backoff |
| 500 Server Error | Google API error | Retry with exponential backoff |

## Implementation Notes

### TypeScript Interfaces

Location: `server/providers/google/types.ts`

```typescript
export interface GoogleOAuthCredentials {
  access_token: string;
  refresh_token?: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  issued_at?: number;
}

export interface DriveUser {
  kind: 'drive#user';
  displayName: string;
  emailAddress: string;
  permissionId: string;
  photoLink?: string;
  me: true;
}

export interface DriveAboutResponse {
  user: DriveUser;
}
```

### Database/Storage

**Not Required**: This feature does not require persistent database storage.

- OAuth credentials stored in JWT (short-lived)
- Session data stored in Express session (memory/Redis)
- No user profile persistence needed

**Future Considerations**: If adding user management, consider:

- PostgreSQL for user accounts and OAuth token storage
- Redis for session management at scale
- Encryption for stored refresh tokens

### Caching Strategy

**Not Required for Phase 1**: The `drive-about-user` tool returns current state.

**Future Considerations**:

- Cache user info for 5 minutes to reduce API calls
- Invalidate cache on 401 errors
- Store in `cache/google-drive/` directory (similar to Figma pattern)

## Next Steps

Data model complete. Proceed to:

1. ✅ Create API contracts defining MCP tool schema and REST endpoint
2. ✅ Generate quickstart guide for developers
3. ✅ Update agent context with Google Drive technology
