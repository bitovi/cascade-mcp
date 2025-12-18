# Quickstart Guide: Google Drive OAuth Integration

**Feature**: Google Drive OAuth and "whoami" tool  
**Estimated Setup Time**: 15 minutes  
**Date**: December 18, 2025

## Overview

This guide walks you through setting up Google Drive OAuth authentication and using the `drive-about-user` tool to retrieve authenticated user information.

### What You'll Build

- Google OAuth provider integration
- `drive-about-user` MCP tool (returns user profile)
- REST API endpoint for Google Drive user info
- Connection hub integration for multi-provider OAuth

### Prerequisites

- Node.js 18+ installed
- Google Cloud Console access
- CascadeMCP server running locally
- Basic understanding of OAuth 2.0

## Step 1: Google Cloud Console Setup

### 1.1 Create/Select a Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID for reference

### 1.2 Enable Google Drive API

1. Navigate to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click **Enable**
4. Wait for enablement to complete (~30 seconds)

### 1.3 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select user type:
   - **Internal**: For Google Workspace organizations only
   - **External**: For testing with personal Google accounts

3. Fill in required fields:
   - **App name**: "CascadeMCP Bridge" (or your preferred name)
   - **User support email**: Your email address
   - **Developer contact**: Your email address

4. Click **Save and Continue**

5. Add scopes:
   - Click **Add or Remove Scopes**
   - Search for "Google Drive API"
   - Select: `https://www.googleapis.com/auth/drive`
   - Click **Update**
   - Click **Save and Continue**

6. Add test users (for External apps):
   - Click **Add Users**
   - Enter your Google email address
   - Click **Add**
   - Click **Save and Continue**

7. Review and click **Back to Dashboard**

### 1.4 Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select application type: **Web application**
4. Configure:
   - **Name**: "CascadeMCP Google Drive"
   - **Authorized JavaScript origins**: (leave empty for now)
   - **Authorized redirect URIs**: Add:
     - `http://localhost:3000/auth/callback/google` (development)
     - Add production URL when deploying

5. Click **Create**
6. **IMPORTANT**: Download the JSON file or copy the credentials:
   - Client ID: `<numbers>.apps.googleusercontent.com`
   - Client Secret: `GOCSPX-<alphanumeric>`

7. Click **OK**

## Step 2: Environment Configuration

### 2.1 Add Environment Variables

Edit your `.env` file (or create one if it doesn't exist):

```bash
# Existing variables (keep these)
VITE_AUTH_SERVER_URL=http://localhost:3000
SESSION_SECRET=<your_session_secret>

# Add Google OAuth configuration
GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/drive
```

**Replace**:

- `GOOGLE_CLIENT_ID`: Your actual client ID from Google Console
- `GOOGLE_CLIENT_SECRET`: Your actual client secret

**Security**:

- Never commit `.env` to version control
- Add `.env` to `.gitignore`
- Use environment variables in production

### 2.2 Verify Configuration

```bash
# Check that variables are set
echo $GOOGLE_CLIENT_ID
echo $GOOGLE_CLIENT_SECRET
```

## Step 3: Test OAuth Flow (Browser)

### 3.1 Start the Server

```bash
npm run start-local
```

Wait for: `Server running on http://localhost:3000`

### 3.2 Initiate OAuth Flow

1. Open browser to: `http://localhost:3000/authorize`
2. You should see the connection hub with available providers
3. Click **"Connect Google Drive"** button
4. Browser redirects to Google sign-in page

### 3.3 Complete Authorization

1. Sign in with your Google account (must be a test user)
2. Review requested permissions:
   - "See, edit, create, and delete all of your Google Drive files"
3. Click **"Allow"**
4. Browser redirects back to connection hub
5. You should see: **"✓ Google Drive Connected"**

### 3.4 Complete Session

1. Click **"Done"** button
2. Server creates JWT token with embedded Google credentials
3. Session is complete!

## Step 4: Use the MCP Tool

### 4.1 Test via MCP Client (VS Code Copilot)

If you have VS Code Copilot configured as an MCP client:

```typescript
// In VS Code, Copilot can call:
const result = await mcpClient.callTool('drive-about-user', {});
console.log(result);
```

**Expected Output**:

```json
{
  "content": [{
    "type": "text",
    "text": "{\n  \"user\": {\n    \"kind\": \"drive#user\",\n    \"displayName\": \"Your Name\",\n    \"emailAddress\": \"you@gmail.com\",\n    \"permissionId\": \"00112233445566778899\",\n    \"photoLink\": \"https://lh3.googleusercontent.com/...\",\n    \"me\": true\n  }\n}"
  }]
}
```

### 4.2 Test via Browser Client

Open the browser MCP client (if available):

```
http://localhost:3000
```

1. Connect to Google Drive
2. Select "drive-about-user" tool from dropdown
3. Click **"Execute Tool"**
4. View results in the response panel

## Step 5: Use the REST API

### 5.1 Get Your Access Token

After completing OAuth in the browser, you need to extract your Google access token. This is typically embedded in the JWT.

For testing, you can:

1. Complete OAuth flow
2. Check browser developer console for JWT
3. Decode JWT to extract `google_access_token`

Or use the Google OAuth Playground:

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Select "Drive API v3"
3. Authorize and get access token

### 5.2 Call the REST API

```bash
# Using cURL
curl -X POST http://localhost:3000/api/drive-about-user \
  -H "Content-Type: application/json" \
  -H "X-Google-Token: ya29.a0AfH6SMC..." \
  -d '{}'
```

**Expected Response**:

```json
{
  "user": {
    "kind": "drive#user",
    "displayName": "Your Name",
    "emailAddress": "you@gmail.com",
    "permissionId": "00112233445566778899",
    "photoLink": "https://lh3.googleusercontent.com/...",
    "me": true
  }
}
```

### 5.3 Use from JavaScript

```javascript
const response = await fetch('http://localhost:3000/api/drive-about-user', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Google-Token': 'ya29.a0AfH6SMC...',
  },
  body: JSON.stringify({}),
});

const data = await response.json();
console.log(`User: ${data.user.displayName}`);
console.log(`Email: ${data.user.emailAddress}`);
```

### 5.4 Use from Python

```python
import requests

url = 'http://localhost:3000/api/drive-about-user'
headers = {
    'Content-Type': 'application/json',
    'X-Google-Token': 'ya29.a0AfH6SMC...'
}

response = requests.post(url, headers=headers, json={})
user = response.json()['user']

print(f"User: {user['displayName']}")
print(f"Email: {user['emailAddress']}")
```

## Troubleshooting

### Common Issues

#### "redirect_uri_mismatch" Error

**Problem**: OAuth callback fails with redirect URI mismatch

**Solution**:

1. Check Google Cloud Console → Credentials
2. Verify authorized redirect URI exactly matches: `http://localhost:3000/auth/callback/google`
3. No trailing slash, correct protocol (http for localhost)

#### "access_denied" Error

**Problem**: User denied consent or app not authorized

**Solution**:

1. For External apps: Add your Google account as a test user
2. Navigate to OAuth consent screen → Test users → Add users
3. Re-initiate OAuth flow

#### "invalid_client" Error

**Problem**: Wrong client ID or client secret

**Solution**:

1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
2. Check for typos or extra spaces
3. Ensure client secret is from the correct OAuth client

#### "insufficient_permissions" or 403 Error

**Problem**: OAuth scope not granted or API not enabled

**Solution**:

1. Verify Google Drive API is enabled in Cloud Console
2. Check that scope `https://www.googleapis.com/auth/drive` was granted during OAuth
3. Re-authorize to ensure all scopes are approved

#### "Invalid or expired token" (401)

**Problem**: Access token expired or invalid

**Solution**:

- Access tokens expire after 1 hour
- Re-run OAuth flow to get new token
- For production: Implement token refresh logic

### Debug Mode

Enable detailed logging:

```bash
# Add to .env
DEBUG=*

# Restart server
npm run start-local
```

Check server logs for detailed OAuth flow information.

## Next Steps

### Extend Functionality

1. **Add more Drive tools**:
   - List files: `drive-list-files`
   - Get file metadata: `drive-get-file`
   - Upload file: `drive-upload-file`

2. **Implement token refresh**:
   - Handle token expiration automatically
   - Use refresh token to get new access tokens

3. **Add caching**:
   - Cache user info for 5 minutes
   - Reduce API calls for frequently accessed data

### Production Deployment

1. **Update OAuth configuration**:
   - Add production redirect URI to Google Console
   - Use HTTPS for all OAuth redirects
   - Update `VITE_AUTH_SERVER_URL` to production domain

2. **Security hardening**:
   - Use secret manager for client secret
   - Enable rate limiting
   - Implement CORS restrictions
   - Add request validation

3. **Monitor and observe**:
   - Enable Sentry for error tracking
   - Set up CloudWatch logging
   - Monitor OAuth success rates
   - Track token expiration patterns

## Additional Resources

### Documentation

- [Google OAuth 2.0 Overview](https://developers.google.com/identity/protocols/oauth2)
- [Google Drive API v3 Reference](https://developers.google.com/drive/api/v3/reference)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
- [CascadeMCP Architecture](../../docs/deployment.md)

### Code Examples

- [Figma Provider](../../server/providers/figma/index.ts) - Similar OAuth pattern
- [Atlassian Provider](../../server/providers/atlassian/index.ts) - PKCE variant
- [Connection Hub](../../server/provider-server-oauth/connection-hub.ts) - Multi-provider setup

### Testing Tools

- [OAuth Debugger](https://oauthdebugger.com/) - Debug OAuth flows
- [JWT.io](https://jwt.io/) - Decode and inspect JWTs
- [Postman](https://www.postman.com/) - API testing

## Support

If you encounter issues not covered in this guide:

1. Check the [troubleshooting section](#troubleshooting) above
2. Review server logs for error details
3. Consult the [data model](./data-model.md) for entity specifications
4. Check [API contracts](./contracts/) for expected behavior
5. Open an issue in the repository with:
   - Steps to reproduce
   - Error messages
   - Environment details (OS, Node version, etc.)

---

**Congratulations!** You've successfully integrated Google Drive OAuth and can now retrieve user information via both MCP and REST APIs.
