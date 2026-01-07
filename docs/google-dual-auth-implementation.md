# Google Client Dual Authentication Support

## Summary

Enhanced the Google Drive API client to support both OAuth 2.0 and Service Account authentication, following the same pattern used by Atlassian and Figma clients.

## Changes Made

### 1. Updated Google API Client (`server/providers/google/google-api-client.ts`)

**Added:**
- `authType` property to `GoogleClient` interface (`'oauth' | 'service-account'`)
- `createGoogleClientWithServiceAccount()` function for service account auth
- Support for JWT token generation from service account credentials

**Pattern:**
```typescript
// OAuth (user delegation)
const client = createGoogleClient(oauthAccessToken);

// Service Account (server-to-server)
const credentials = JSON.parse(fs.readFileSync('google.json', 'utf-8'));
const client = await createGoogleClientWithServiceAccount(credentials);

// Both return GoogleClient interface with same methods
const userInfo = await client.fetchAboutUser();
```

### 2. Updated Types (`server/providers/google/types.ts`)

**Added:**
- `GoogleServiceAccountCredentials` interface for google.json structure

### 3. Updated MCP Tool (`server/providers/google/tools/drive-about-user.ts`)

**Changed:**
- Now uses `createGoogleClient()` instead of direct fetch
- Logs `authType` in completion message
- Simplified error handling (handled by client)

### 4. Created Test Script (`scripts/api/drive-about-user.ts`)

**Purpose:**
- Manual testing of drive-about-user with service account
- Similar to `scripts/api/write-next-story.ts`

**Usage:**
```bash
node --import ./loader.mjs scripts/api/drive-about-user.ts
```

**Configuration:**
- Reads credentials from `google.json` (project root)
- Returns user info for the service account

## Authentication Comparison

| Provider   | OAuth | Alternative Auth        | Notes |
|------------|-------|-------------------------|-------|
| Atlassian  | ✅    | PAT (Basic Auth)        | Base64-encoded email:token |
| Figma      | ✅    | PAT (Bearer token)      | Personal access token |
| Google     | ✅    | Service Account (JWT)   | Server-to-server via google.json |

## Key Differences: Google vs Others

### Atlassian/Figma Pattern
- PAT is just a different token format
- Both use same Bearer/Basic auth headers
- Both hit same API endpoints

### Google Pattern
- Service Account uses JWT → Access Token exchange
- Requires `googleapis` package for JWT creation
- Service account must be explicitly granted access to resources
- Returns same API responses (Drive user info)

## Future Enhancements

### Planned (per user request)
- Service account will be able to access files shared with it
- API calls will work for both OAuth and Service Account users

### Implementation Notes
When adding new Google Drive API methods to `GoogleClient`:
1. Add method to interface
2. Implement in both `createGoogleClient()` and service account's returned client
3. Both should use the same access token (OAuth token or JWT-generated token)

## Testing

### Manual Testing (Service Account)
```bash
# Test drive-about-user with service account
node --import ./loader.mjs scripts/api/drive-about-user.ts

# Expected output:
# ✅ User Information Retrieved!
# 📧 Email: cascade-mcp-dev@bitovi-cascade-mcp-test.iam.gserviceaccount.com
```

### MCP Testing (OAuth)
The MCP tool continues to work with OAuth tokens from the auth context:
```javascript
// In MCP client (VS Code Copilot, Claude Desktop)
// Uses OAuth flow → JWT with google.access_token
// Tool extracts token and creates OAuth client
```

## Files Changed

1. `server/providers/google/google-api-client.ts` - Added service account support
2. `server/providers/google/types.ts` - Added service account types
3. `server/providers/google/tools/drive-about-user.ts` - Uses client pattern
4. `scripts/api/drive-about-user.ts` - New test script (service account)

## References

- Atlassian client pattern: `server/providers/atlassian/atlassian-api-client.ts`
- Service account example: `scripts/api/google-drive.ts`
- Write-next-story script: `scripts/api/write-next-story.ts`
