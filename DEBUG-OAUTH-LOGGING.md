# OAuth Flow Debug Logging Guide

## Overview
Comprehensive logging has been added throughout the Atlassian OAuth flow to help diagnose the "401 Unauthorized" error happening in staging but not locally.

## What Was Added

### 1. Session Configuration Logging (server.ts)
- Logs session settings at startup
- Shows trust proxy configuration
- Warns about in-memory session store
- Added debug middleware for `/auth` routes that logs:
  - Session ID on every request
  - Cookie presence
  - `req.secure` status
  - `X-Forwarded-Proto` header
  - Whether session cookie will be secure

### 2. Authorization Flow Logging (authorize.ts)
Logs when user clicks "Connect to Atlassian":
- **Session Info**: Session ID, request headers (host, x-forwarded-proto, etc.)
- **Generated Parameters**: code_verifier, code_challenge, state (with lengths)
- **Session Storage**: What's being stored in the session
- **Environment**: Base URL, redirect URI
- **Auth URL**: The full URL being sent to Atlassian

### 3. Callback Flow Logging (callback.ts)
Logs when Atlassian redirects back to your server:
- **Session Info**: Session ID, request URL, headers
- **Callback Parameters**: Authorization code, state, any errors
- **Session Retrieval**: Whether code_verifier was found in session
- **Token Exchange Preparation**: All parameters being sent
- **Token Response**: What was received from Atlassian
- **Error Details**: Full error messages and possible causes

### 4. Atlassian Provider Logging (providers/atlassian/index.ts)
#### createAuthUrl:
- Input parameters
- Environment variables (client ID, base URL, scope)
- Final redirect URI and scope values

#### extractCallbackParams:
- Raw query parameters
- Extracted code and state values
- State normalization (if needed)

#### exchangeCodeForTokens:
- Environment variables (with sensitive data masked)
- Complete token request body (with sensitive data masked)
- HTTP response status and headers
- Response body analysis
- Detailed error diagnostics if token exchange fails

### 5. Token Storage Logging (callback.ts - hubCallbackHandler)
- Session ID
- Token metadata (lengths, expiration)
- Connected providers list
- Storage confirmation

## Key Things to Look For in Your Logs

### 1. **Session Persistence Issue**
Look for different Session IDs between authorize and callback:
```
[AUTHORIZE] Session ID: abc123...
[CALLBACK] Session ID: xyz789...  <-- DIFFERENT! This is the problem!
```

If the Session IDs are different, the session is not being preserved across the redirect. This would explain the "No code verifier found in session" error.

**Possible causes:**
- Cookie not being set properly (secure flag mismatch)
- Cloudflare interfering with cookies
- Session cookie domain mismatch
- Session store not persisting (in-memory store issue)

### 2. **Cookie/Secure Flag Issues**
Check these logs:
```
[SESSION]   - req.secure: false  <-- Should be true in production!
[SESSION]   - X-Forwarded-Proto: https  <-- Should be present
[SESSION]   - Session cookie will be secure: true  <-- Should be true
```

If `req.secure` is false and `X-Forwarded-Proto` is missing, the session cookie won't be set as secure, which could cause issues.

### 3. **Client Secret Mismatch**
Look for the length of your client secret:
```
[ATLASSIAN]   - JIRA_CLIENT_SECRET: present (length: 64)
```

Compare local vs staging. Atlassian client secrets should be the same length. If different, you might be using the wrong secret.

### 4. **Redirect URI Mismatch**
Compare what's sent to Atlassian vs what's in the callback:
```
[AUTHORIZE]   - Redirect URI: https://cascade-staging.bitovi.com/auth/callback/atlassian
[CALLBACK]   - Redirect URI: https://cascade-staging.bitovi.com/auth/callback/atlassian
```

These MUST match EXACTLY (including trailing slashes, http vs https, etc.)

### 5. **Code Verifier Mismatch**
Check if the code_verifier is found:
```
[CALLBACK] Found code_verifier in session: 9nrU_a0h2c... (length: 43)
```

If you see "No code verifier found in session", this means the session was lost.

### 6. **Atlassian Error Response**
If token exchange fails, look for:
```
[ATLASSIAN] Full error response: {
  "error": "access_denied",
  "error_description": "Unauthorized"
}
```

Common Atlassian errors:
- `invalid_grant`: Code has expired or been used, or code_verifier doesn't match
- `invalid_client`: Client ID or secret is wrong
- `access_denied`: Usually means code_verifier/challenge mismatch
- `redirect_uri_mismatch`: Redirect URI doesn't match registration

## Most Likely Issues Based on "Works locally, not in staging"

### Issue #1: Session Cookie Not Being Set (MOST LIKELY)
**Symptom**: Different session IDs between authorize and callback

**Cause**: Cloudflare or ELB might be stripping headers or the `secure` flag isn't being set correctly

**Solution**: 
- Check if `X-Forwarded-Proto: https` header is present in callback
- Verify `trust proxy` is working correctly
- Consider using a different session cookie domain or sameSite setting
- Test with bitovi.tools (non-Cloudflare) to isolate Cloudflare issues

### Issue #2: Environment Variables Wrong
**Symptom**: Client secret length different between local and staging

**Cause**: Wrong Atlassian app credentials in staging environment

**Solution**: Double-check `.env` file or environment variables on EC2

### Issue #3: Redirect URI Case Sensitivity or Protocol Mismatch
**Symptom**: Exact redirect URI mismatch in logs

**Cause**: Cloudflare might be forcing HTTPS or changing the URL

**Solution**: Ensure Atlassian app registration uses exact URL with https://

## Next Steps

1. **Deploy these changes** to staging
2. **Attempt authentication** on staging
3. **Copy ALL logs** from the OAuth flow (search for `==========` in logs)
4. **Share logs** and we can pinpoint the exact issue
5. **Compare** logs between local (working) and staging (broken)

## Quick Test Ideas

### Test 1: Session Persistence
Add this after the session middleware:
```typescript
app.get('/test-session', (req, res) => {
  req.session.test = 'hello';
  res.send(`Session ID: ${req.sessionID}, Test value: ${req.session.test}`);
});

app.get('/test-session-check', (req, res) => {
  res.send(`Session ID: ${req.sessionID}, Test value: ${req.session.test || 'NOT FOUND'}`);
});
```

Visit `/test-session` then `/test-session-check`. If the session ID changes or test value is "NOT FOUND", sessions aren't persisting.

### Test 2: Bypass Cloudflare
Try using the bitovi.tools domain (non-Cloudflare) for the entire flow. If it works, Cloudflare is the issue.

### Test 3: Check EC2 Logs
```bash
# SSH into EC2 and check logs
tail -f /var/log/your-app.log  # or wherever logs go
# or if using Docker:
docker logs -f container-name
```
