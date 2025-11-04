# OAuth Debug Logging Update

This update adds comprehensive logging throughout the Atlassian OAuth flow to diagnose the "401 Unauthorized" error occurring in staging but not locally.

## Quick Start

1. **Deploy the changes** (see [DEPLOYMENT-SUMMARY.md](./DEPLOYMENT-SUMMARY.md))
2. **Check configuration** at `/debug/config`
3. **Attempt OAuth flow** at `/auth/connect`
4. **Collect and analyze logs** (see [TROUBLESHOOTING-CHECKLIST.md](./TROUBLESHOOTING-CHECKLIST.md))

## Documentation

- **[DEPLOYMENT-SUMMARY.md](./DEPLOYMENT-SUMMARY.md)** - What changed, how to deploy, what to expect
- **[DEBUG-OAUTH-LOGGING.md](./DEBUG-OAUTH-LOGGING.md)** - Detailed guide to understanding the logs
- **[TROUBLESHOOTING-CHECKLIST.md](./TROUBLESHOOTING-CHECKLIST.md)** - Step-by-step debugging process

## New Endpoints

### `/debug/config` (GET)
Returns current configuration for debugging:
```json
{
  "environment": "production",
  "baseUrl": "https://cascade-staging.bitovi.com",
  "jira": {
    "clientId": "RmxA7rE1Dr...",
    "clientSecretPresent": true,
    "clientSecretLength": 64,
    "redirectUri": "https://cascade-staging.bitovi.com/auth/callback/atlassian"
  },
  "session": {
    "secretPresent": true,
    "secretLength": 32
  },
  "server": {
    "trustProxy": 1,
    "port": 3000
  }
}
```

⚠️ **Remove this endpoint in production after debugging!**

## What to Look For in Logs

### 1. Session ID Consistency
```
[AUTHORIZE] Session ID: abc123...
[CALLBACK] Session ID: abc123...  <-- Should match!
```

### 2. Code Verifier Presence
```
[CALLBACK] Found code_verifier in session: xyz789... (length: 43)
```

### 3. Token Exchange Error Details
```
[ATLASSIAN] Full error response: {"error": "access_denied", ...}
```

## Most Likely Issues

1. **Session not persisting** (80%) - Different session IDs between requests
2. **Wrong client secret** (15%) - Token exchange returns `access_denied`
3. **Redirect URI mismatch** (4%) - URLs don't match exactly
4. **Cloudflare interference** (1%) - Modifying cookies or headers

## After Finding the Issue

Once you've identified the problem from the logs, we can implement the fix. Common fixes:

- **Session issue**: Use Redis for session storage
- **Client secret**: Update environment variables
- **Redirect URI**: Update Atlassian app settings
- **Cloudflare**: Bypass or configure properly

## Cleanup

After resolving the issue, consider:
1. Remove `/debug/config` endpoint (security)
2. Reduce logging verbosity (performance)
3. Keep only critical error logging
