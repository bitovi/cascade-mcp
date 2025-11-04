# OAuth Debug Logging - Deployment Summary

## What Was Changed

Comprehensive logging has been added throughout the entire Atlassian OAuth flow to help diagnose the "401 Unauthorized" error in staging.

### Files Modified

1. **server/server.ts**
   - Added environment info logging at startup
   - Added session debug middleware for `/auth` routes
   - Added `/debug/config` endpoint to verify configuration
   - Separated session middleware initialization for better control

2. **server/provider-server-oauth/authorize.ts**
   - Added detailed logging for session ID, headers, and OAuth parameters
   - Logs what's being stored in the session
   - Shows full auth URL being generated

3. **server/provider-server-oauth/callback.ts**
   - Added comprehensive callback logging
   - Logs session retrieval and verification
   - Shows token exchange preparation and results
   - Enhanced error logging with possible causes

4. **server/providers/atlassian/index.ts**
   - Added logging to `createAuthUrl()` method
   - Enhanced `extractCallbackParams()` with JWT decoding attempt
   - Dramatically expanded `exchangeCodeForTokens()` logging
   - Shows all request/response details for token exchange

5. **server/debug-helpers.ts** (NEW)
   - Helper functions for consistent logging
   - Environment info display

6. **DEBUG-OAUTH-LOGGING.md** (NEW)
   - Complete guide to understanding the logs
   - What to look for in each log section

7. **TROUBLESHOOTING-CHECKLIST.md** (NEW)
   - Step-by-step debugging process
   - Common issues and solutions
   - Quick tests to isolate problems

## How to Deploy

### Option 1: Quick Deploy (if you have auto-deploy)
```bash
git add .
git commit -m "Add comprehensive OAuth debug logging"
git push origin main
```

### Option 2: Manual Deploy to EC2
```bash
# SSH into EC2
ssh user@cascade-staging.bitovi.com

# Navigate to app directory
cd /path/to/cascade-mcp

# Pull latest changes
git pull origin main

# Rebuild if needed
npm install
npm run build

# Restart the service
pm2 restart cascade-mcp
# OR
docker-compose restart
# OR
systemctl restart cascade-mcp
```

## After Deployment

### Step 1: Check Configuration
Visit: `https://cascade-staging.bitovi.com/debug/config`

Verify all settings match your Atlassian app configuration.

### Step 2: Test Session Persistence
You can add the test endpoints from TROUBLESHOOTING-CHECKLIST.md or just proceed to the OAuth flow.

### Step 3: Attempt OAuth Flow
1. Go to `https://cascade-staging.bitovi.com/auth/connect`
2. Click "Connect to Atlassian"
3. Complete the authorization on Atlassian's site
4. Observe the error (if it still happens)

### Step 4: Collect Logs

#### If using PM2:
```bash
pm2 logs cascade-mcp --lines 500
```

#### If using Docker:
```bash
docker logs cascade-mcp --tail 500
```

#### If using systemd:
```bash
journalctl -u cascade-mcp -n 500
```

#### Or check log files:
```bash
tail -n 500 /var/log/cascade-mcp/app.log
```

### Step 5: Share the Logs

Copy ALL logs from the OAuth flow attempt. Look for these markers:
- `========== AUTHORIZE START: atlassian ==========`
- `========== CALLBACK START: atlassian ==========`
- `========== ATLASSIAN TOKEN EXCHANGE START ==========`

Share these complete sections so we can diagnose the issue.

## What to Look For

### 🔴 Critical Issues

1. **Different Session IDs**
   ```
   [AUTHORIZE] Session ID: abc123...
   [CALLBACK] Session ID: xyz789...  <-- BAD!
   ```
   This means session is not persisting.

2. **Missing Code Verifier**
   ```
   [CALLBACK] ERROR: No code verifier found in session
   ```
   This is a symptom of issue #1.

3. **Wrong Client Secret**
   ```
   [ATLASSIAN]   - JIRA_CLIENT_SECRET: present (length: 32)  <-- Should be 64!
   ```

4. **Redirect URI Mismatch**
   ```
   [AUTHORIZE]   - Redirect URI: https://cascade-staging.bitovi.com/auth/callback/atlassian
   [CALLBACK]   - Redirect URI: http://cascade-staging.bitovi.com/auth/callback/atlassian
   ```
   Note the http vs https!

### 🟡 Warning Signs

1. **Missing X-Forwarded-Proto Header**
   ```
   [SESSION]   - X-Forwarded-Proto: undefined  <-- Should be 'https'
   ```

2. **req.secure is false**
   ```
   [SESSION]   - req.secure: false  <-- Should be true in production
   ```

3. **Cookie not present on callback**
   ```
   [CALLBACK] Request headers:
     cookie: 'missing'  <-- BAD!
   ```

## Expected Successful Flow

When working correctly, you should see:

```
========== ENVIRONMENT INFO ==========
VITE_AUTH_SERVER_URL: https://cascade-staging.bitovi.com
VITE_JIRA_CLIENT_ID: RmxA7rE1Dr... (length: 32)
JIRA_CLIENT_SECRET: present (length: 64)
========== ENVIRONMENT INFO END ==========

========== AUTHORIZE START: atlassian ==========
[AUTHORIZE] Session ID: s%3AUniqueSessionId123...
[AUTHORIZE] Generated OAuth parameters:
[AUTHORIZE]   - code_verifier: abcdef1234... (length: 43)
[AUTHORIZE]   - code_challenge: ghijkl5678... (length: 43)
[AUTHORIZE] Stored in session (ID: s%3AUniqueSessionId123...)
========== AUTHORIZE END: atlassian ==========

[... user redirected to Atlassian, authenticates, then redirected back ...]

========== CALLBACK START: atlassian ==========
[CALLBACK] Session ID: s%3AUniqueSessionId123...  <-- SAME as before!
[CALLBACK] Found code_verifier in session: abcdef1234... (length: 43)
[CALLBACK] Preparing token exchange...
========== CALLBACK END: atlassian SUCCESS ==========
```

## Quick Diagnosis Tree

```
Does /debug/config show correct values?
├─ NO → Fix environment variables first!
└─ YES → Continue...

Is session ID the same between authorize and callback?
├─ NO → Session persistence issue (see below)
└─ YES → Continue...

Does callback find code_verifier in session?
├─ NO → Session lost (even though ID matches - check session store)
└─ YES → Continue...

Does token exchange return error?
├─ access_denied → Wrong client secret or code_verifier mismatch
├─ invalid_grant → Code expired or already used
├─ invalid_client → Wrong client ID/secret
└─ redirect_uri_mismatch → URI doesn't match Atlassian app
```

## If Session is the Issue

Most likely cause: **Cookie not being set correctly**

### Quick Fix Options:

1. **Check Cloudflare Settings**
   - Disable Cloudflare temporarily
   - Or use bitovi.tools domain instead

2. **Verify Proxy Settings**
   ```typescript
   // In server.ts, change from:
   app.set('trust proxy', 1);
   
   // To:
   app.set('trust proxy', true);
   ```

3. **Try Different Cookie Settings**
   ```typescript
   cookie: {
     secure: process.env.NODE_ENV === 'production', // Instead of 'auto'
     httpOnly: true,
     sameSite: 'lax',
     domain: '.bitovi.com', // Add explicit domain
     maxAge: 24 * 60 * 60 * 1000,
   }
   ```

4. **Use Persistent Session Store**
   Install and configure Redis for session storage (recommended for production anyway):
   ```bash
   npm install connect-redis redis
   ```

## Contact Info

After you deploy and test, share:
1. Output from `/debug/config`
2. Full logs from one failed OAuth attempt
3. Whether the session test endpoints worked
4. Any differences you notice between local and staging

This will help pinpoint the exact issue!
