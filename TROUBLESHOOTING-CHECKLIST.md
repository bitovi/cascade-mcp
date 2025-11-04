# Quick OAuth Troubleshooting Checklist

After deploying the logging changes, follow these steps:

## Step 1: Verify Configuration

Visit: `https://cascade-staging.bitovi.com/debug/config`

Check that:
- ✅ `baseUrl` is `https://cascade-staging.bitovi.com`
- ✅ `jira.clientId` matches your Atlassian app
- ✅ `jira.clientSecretPresent` is `true`
- ✅ `jira.clientSecretLength` is 64 (typical for Atlassian)
- ✅ `jira.redirectUri` is EXACTLY what's in your Atlassian app settings
- ✅ `session.secretPresent` is `true`
- ✅ `server.trustProxy` is `1` or `true`

**If any of these are wrong, fix your environment variables first!**

## Step 2: Test Session Persistence

Add these temporary test endpoints to server.ts:

```typescript
app.get('/test-session', (req, res) => {
  req.session.testValue = 'hello-' + Date.now();
  res.send(`<h1>Session Test</h1>
    <p>Session ID: ${req.sessionID}</p>
    <p>Set test value: ${req.session.testValue}</p>
    <p><a href="/test-session-check">Click here to check if session persists</a></p>
  `);
});

app.get('/test-session-check', (req, res) => {
  res.send(`<h1>Session Check</h1>
    <p>Session ID: ${req.sessionID}</p>
    <p>Test value: ${req.session.testValue || '❌ NOT FOUND - Session lost!'}</p>
    <p>${req.session.testValue ? '✅ Session persisted!' : '❌ Session was lost!'}</p>
  `);
});
```

Visit: `https://cascade-staging.bitovi.com/test-session`
Click the link to `/test-session-check`

**Expected**: Same session ID, test value found
**If failed**: Session is not persisting - this is your problem!

## Step 3: Attempt OAuth Flow

1. Go to `https://cascade-staging.bitovi.com/auth/connect`
2. Click "Connect to Atlassian"
3. Select your Jira site
4. Click "Accept"
5. Watch the server logs

## Step 4: Analyze the Logs

Search for these patterns in your logs:

### Pattern 1: Session ID Mismatch (CRITICAL!)
```bash
grep "Session ID:" logs.txt
```

Look for:
```
[AUTHORIZE] Session ID: xyz123...
[CALLBACK] Session ID: xyz123...  <-- Should be SAME!
```

**If different**: Session is being lost. Root cause is likely:
- Cookie not being set (check `X-Forwarded-Proto` header)
- Cloudflare interfering
- `trust proxy` not working
- Session cookie `secure` flag issue

### Pattern 2: Missing Code Verifier
```bash
grep "code_verifier" logs.txt
```

Should see:
```
[AUTHORIZE] Generated: abc123...
[CALLBACK] Found code_verifier in session: abc123...
```

**If "No code verifier found"**: Session was lost (see Pattern 1)

### Pattern 3: Token Exchange Error
```bash
grep "access_denied\|invalid_grant\|error_description" logs.txt
```

Common errors:
- `access_denied` + `Unauthorized`: Wrong client secret OR code_verifier mismatch
- `invalid_grant`: Code expired or code_verifier doesn't match challenge
- `invalid_client`: Wrong client ID or secret

### Pattern 4: Environment Variable Issues
```bash
grep "VITE_AUTH_SERVER_URL\|JIRA_CLIENT_SECRET" logs.txt
```

Should see the correct values at startup.

## Step 5: Compare Local vs Staging

Run the same flow locally (which works) and save the logs.

Then run on staging (which fails) and save those logs.

Compare these specific values:
1. Session IDs (same across requests?)
2. Client secret length (same?)
3. Code verifier length (same?)
4. Redirect URI (exactly the same?)
5. Base URL (correct for each environment?)

## Most Likely Issues (In Order of Probability)

### 1. Session Not Persisting (80% chance)
**Symptoms**: 
- Different session IDs between authorize and callback
- "No code verifier found in session" error

**Causes**:
- Cookie not being set as secure when it should be
- `X-Forwarded-Proto` header missing from Cloudflare/ELB
- `trust proxy` setting not working
- Cloudflare blocking/modifying cookies

**Solution**:
- Check if `X-Forwarded-Proto: https` is present in callback logs
- Try using bitovi.tools domain (no Cloudflare) to isolate issue
- Consider using a persistent session store (Redis, etc.) instead of in-memory

### 2. Wrong Client Secret (15% chance)
**Symptoms**:
- Session persists correctly
- Token exchange returns `access_denied` or `invalid_client`

**Causes**:
- Copy/paste error with client secret
- Using local app's secret in staging

**Solution**:
- Double-check `.env` file on EC2
- Verify secret length matches (should be 64 characters)
- Re-copy from Atlassian developer console

### 3. Redirect URI Mismatch (4% chance)
**Symptoms**:
- Token exchange returns `redirect_uri_mismatch`

**Causes**:
- Trailing slash difference
- http vs https
- Domain difference

**Solution**:
- Ensure EXACT match in Atlassian app settings
- Check logs for what URI is being sent vs received

### 4. Cloudflare Interference (1% chance)
**Symptoms**:
- Works on bitovi.tools but not bitovi.com

**Causes**:
- Cloudflare modifying headers or cookies
- Cloudflare security rules blocking requests

**Solution**:
- Temporarily disable Cloudflare
- Check Cloudflare security/firewall logs
- Whitelist OAuth callback URLs

## Emergency Bypass Test

To quickly determine if the issue is session-related, add this temporary code to callback.ts:

```typescript
// TEMPORARY DEBUG: Store code_verifier in query string (REMOVE AFTER DEBUGGING!)
// In authorize.ts, add to redirect URL:
const debugParam = `&debug_verifier=${encodeURIComponent(codeVerifier)}`;
res.redirect(authUrl + debugParam);

// In callback.ts, retrieve it:
const debugVerifier = req.query.debug_verifier as string;
console.log(`[DEBUG] Code verifier from URL: ${debugVerifier?.substring(0, 10)}...`);

// Use debugVerifier instead of session if session is empty
const codeVerifier = req.session.codeVerifier || debugVerifier;
```

⚠️ **WARNING**: This is insecure and should ONLY be used for debugging! Remove after finding the issue!

If this works, it confirms the session is the problem.
