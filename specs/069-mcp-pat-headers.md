# 069 — Support PAT Headers in MCP Flow

## Goal

Allow MCP clients to authenticate using Personal Access Tokens (PATs) via HTTP headers — the same `X-Atlassian-Token`, `X-Figma-Token`, and `X-Google-Token` headers that the REST API already accepts — instead of requiring the OAuth PKCE flow.

**Primary use case:** GitHub's cloud-hosted Copilot agent (running on GitHub's servers) cannot perform browser-based OAuth redirects. It needs a way to pass user-provided PATs to CascadeMCP over the MCP protocol so it can call tools like `write-story`, `analyze-feature-scope`, etc. on behalf of the user.

This also enables:
- Other headless/cloud-hosted AI agents that can't do browser OAuth
- Programmatic/scripted MCP clients
- Simpler local development and testing without OAuth setup
- CI/CD pipelines using MCP directly

## Current State

### MCP Auth (OAuth only)
- `validateAuthFromRequest()` in `server/mcp-service.ts` only accepts a JWT (from `Authorization: Bearer <JWT>` or `?token=<JWT>`)
- JWT is produced by the PKCE OAuth flow and embeds provider tokens in its payload: `{ atlassian: { access_token, refresh_token, expires_at }, figma: { ... }, google: { ... } }`
- Auth context is stored per-session as an `AuthContext` object with nested `ProviderAuthInfo` per provider
- `ProviderAuthInfo` currently requires `refresh_token: string` and `expires_at: number` — PATs have neither

### REST API Auth (PAT headers)
- REST API handlers read `X-Atlassian-Token`, `X-Figma-Token`, `X-Google-Token` from request headers
- They construct provider-specific clients directly (e.g., `createAtlassianClientWithPAT(base64Credentials, siteName)`)
- They bypass `AuthContext`/`ProviderAuthInfo` entirely — each handler creates its own clients

### Key Difference
MCP tools use `getAuthInfoSafe(context)` → `AuthContext` → `provider.access_token` to build API clients.  
REST API handlers read headers directly and build clients themselves.  
To support PATs in MCP, we need to bridge the gap: construct a synthetic `AuthContext` from PAT headers so all existing MCP tools continue working unchanged.

## Implementation Plan

### Step 1: Make `ProviderAuthInfo` compatible with PATs

**File:** `server/mcp-core/auth-context-store.ts`

Make `refresh_token` and `expires_at` optional since PATs don't have these:

```typescript
export interface ProviderAuthInfo {
  access_token: string;
  refresh_token?: string;   // was: string (required)
  expires_at?: number;      // was: number (required)
  scope?: string;
  cloudId?: string;
  user_id?: string;
  authType?: 'oauth' | 'pat';  // new: distinguish for downstream use
}
```

**How to verify:** TypeScript compiles. Existing OAuth flow still works (refresh_token and expires_at are always present for OAuth tokens). Run e2e tests.

### Step 2: Update `isTokenExpired` to handle missing `expires_at`

**File:** `server/mcp-core/auth-helpers.ts`

The `hasValidProviderToken()` helper currently checks `provider.expires_at != null && provider.expires_at > now`. PATs have no `expires_at`, so they'd incorrectly appear expired.

Update to treat missing `expires_at` as "never expires":

```typescript
function hasValidProviderToken(provider: ProviderAuthInfo | undefined, now: number): boolean {
  if (!provider?.access_token) return false;
  // PATs don't have expires_at — treat as always valid
  if (provider.expires_at == null) return true;
  return provider.expires_at > now;
}
```

**How to verify:** Write a unit test: a `ProviderAuthInfo` without `expires_at` should not be considered expired. Existing OAuth tokens with `expires_at` still expire correctly.

### Step 3: Add PAT extraction helper to `mcp-service.ts`

**File:** `server/mcp-service.ts`

Add a new function `getAuthInfoFromPatHeaders()` that reads the PAT headers and constructs a synthetic `AuthContext`:

```typescript
function getAuthInfoFromPatHeaders(req: Request): AuthContext | null {
  const atlassianToken = req.headers['x-atlassian-token'] as string | undefined;
  const figmaToken = req.headers['x-figma-token'] as string | undefined;
  const googleToken = req.headers['x-google-token'] as string | undefined;

  // At least one provider token must be present
  if (!atlassianToken && !figmaToken && !googleToken) {
    return null;
  }

  const authContext: AuthContext = {};

  if (atlassianToken) {
    // Atlassian PATs use Basic Auth: base64(email:api_token)
    // The existing AtlassianClient expects an access_token for OAuth,
    // but for PATs we store the raw base64 credentials
    authContext.atlassian = {
      access_token: atlassianToken,
      authType: 'pat',
    };
  }

  if (figmaToken) {
    authContext.figma = {
      access_token: figmaToken,
      authType: 'pat',
    };
  }

  if (googleToken) {
    authContext.google = {
      access_token: googleToken,
      authType: 'pat',
    };
  }

  return authContext;
}
```

**How to verify:** Unit test: passing `X-Atlassian-Token: abc123` produces an `AuthContext` with `atlassian.access_token === 'abc123'` and `atlassian.authType === 'pat'`.

### Step 4: Wire PAT extraction into `validateAuthFromRequest`

**File:** `server/mcp-service.ts`

Update the `validateAuthFromRequest()` function to try PAT headers as a third fallback:

```typescript
async function validateAuthFromRequest(req: Request, res: Response): Promise<ValidationResult> {
  // Try bearer token (JWT from OAuth) first
  let { authInfo, errored } = await getAuthInfoFromBearer(req, res);
  if (errored) { return { authInfo: null, errored: true }; }

  // Fall back to query param JWT
  if (!authInfo) {
    ({ authInfo, errored } = await getAuthInfoFromQueryToken(req, res));
    if (errored) { return { authInfo: null, errored: true }; }
  }

  // Fall back to PAT headers
  if (!authInfo) {
    authInfo = getAuthInfoFromPatHeaders(req);
    if (authInfo) {
      console.log('🔑 Using PAT header authentication', {
        providers: Object.keys(authInfo).filter(k => 
          ['atlassian', 'figma', 'google'].includes(k) && authInfo![k as keyof AuthContext]
        ),
      });
    }
  }

  // No auth found anywhere
  if (!authInfo) {
    sendMissingAtlassianAccessToken(res, req, 'anywhere');
    return { authInfo: null, errored: true };
  }

  return { authInfo, errored: false };
}
```

**How to verify:** Start the server locally. Send a POST to `/mcp` with an `initialize` body and `X-Atlassian-Token` + `X-Figma-Token` headers (no JWT). Confirm the server initializes a session successfully (returns `mcp-session-id`).

### Step 5: Handle PAT auth in downstream API clients

**The Atlassian Problem:** MCP tools call `createAtlassianClient(access_token)` which uses `Authorization: Bearer <token>` (OAuth). But PATs need `Authorization: Basic <base64>` (`createAtlassianClientWithPAT`). The `access_token` stored in `ProviderAuthInfo` for PATs is the base64-encoded `email:api_token`, not an OAuth access token.

**File:** `server/providers/atlassian/atlassian-api-client.ts`

Add a new `createAtlassianClientFromAuth()` helper that accepts `ProviderAuthInfo` and routes internally. The existing `createAtlassianClient` is left unchanged:

```typescript
export function createAtlassianClientFromAuth(
  atlassian: ProviderAuthInfo,
  siteName?: string,
): AtlassianClient {
  if (atlassian.authType === 'pat') {
    return createAtlassianClientWithPAT(atlassian.access_token, siteName);
  }
  return createAtlassianClient(atlassian.access_token);
}
```

**File:** All MCP tool call sites (~10 files)

Find all call sites of `createAtlassianClient(authInfo.atlassian.access_token)` and replace with `createAtlassianClientFromAuth`:

```typescript
// Before
const client = createAtlassianClient(authInfo.atlassian.access_token);

// After
const client = createAtlassianClientFromAuth(authInfo.atlassian, siteName);
```

`siteName` comes from the tool's existing input parameter (already accepted by all these tools). For OAuth sessions `siteName` is optional and may be `undefined`; for PAT sessions `createAtlassianClientWithPAT` will throw if it's missing, giving a clear error.

> **Note:** The `resolveCloudId` call in each tool already handles PAT vs OAuth routing — `resolveCloudId(client, cloudId, siteName)` for PAT clients hits `_edge/tenant_info` using `siteName`. No changes needed there.

**For Figma:** Figma PATs work the same as OAuth tokens (both use `Authorization: Bearer <token>`). No client changes needed.

**For Google:** Google PATs use encrypted service account JSON, not access tokens. This requires the existing `parseOptionalGoogleToken()` / decryption flow from the REST API. Re-use that same decryption logic.

**How to verify:** Using a PAT token, call a simple MCP tool like `atlassian-get-sites` and confirm it works. For Atlassian, the response from the tenant_info endpoint should return the cloudId. For Figma, `figma-get-user` should return user info.

### Step 6: Handle siteName resolution for PAT-based Atlassian requests

**Problem:** OAuth Atlassian clients use `api.atlassian.com/ex/jira/{cloudId}` which doesn't need a siteName. PAT clients need `{siteName}.atlassian.net` which requires knowing the siteName.

**Current pattern:** MCP tools already accept `siteName` as a tool input parameter (e.g., `write-story` has `siteName?: string`). The REST API also takes `siteName` in the request body — there is no `X-Atlassian-Site` header.

**Options (pick one):**

**Option A: Rely on existing `siteName` tool parameter (recommended)**  
No new header needed. Tools already pass `siteName` to `createAtlassianClient` / `resolveCloudId`. For PAT auth, the tool just needs to ensure `siteName` is provided (required instead of optional).

**Option B: Add an `X-Atlassian-Site` header**  
Store siteName on the `AuthContext` at session creation so tools don't need to pass it per-call. More convenient but adds a new header that doesn't exist in the REST API pattern.

Recommendation: **Option A** — no changes needed to the auth layer. Just make `siteName` required when `authType === 'pat'` at the tool validation level.

### Step 7: Skip `WWW-Authenticate` / OAuth re-auth for PAT sessions

**File:** `server/mcp-core/auth-helpers.ts`

When a PAT-based tool gets a 401 from a provider API, it should NOT throw `InvalidTokenError` (which triggers OAuth re-auth). Instead, it should return a clear error message that the PAT is invalid/expired.

Add a check in `getAuthInfo()`:

```typescript
export function getAuthInfo(context: any): AuthContext | null {
  const authInfo = getAuthInfoFromStore(context);

  // Skip expiration check for PAT auth — PATs don't have expiration in our store
  const isPat = authInfo?.atlassian?.authType === 'pat' || 
                authInfo?.figma?.authType === 'pat' || 
                authInfo?.google?.authType === 'pat';
  
  if (authInfo && !isPat && isTokenExpired(authInfo)) {
    throw new InvalidTokenError('The access token expired and re-authentication is needed.');
  }

  return authInfo;
}
```

**How to verify:** Use an invalid PAT. Confirm you get a tool error (not a 401 with `WWW-Authenticate` that triggers an OAuth popup).

### Step 8: Update documentation

**File:** `server/readme.md`

Add a section documenting PAT authentication for MCP:

- List the supported headers: `X-Atlassian-Token`, `X-Figma-Token`, `X-Google-Token`, `X-Atlassian-Site`
- Note that PAT auth bypasses OAuth PKCE entirely
- Note that at least one provider token must be present
- Include an example curl command for initializing an MCP session with PATs

**How to verify:** Follow the documentation to set up a PAT-authenticated MCP session from scratch.

## Summary of Files Changed

| File | Change |
|------|--------|
| `server/mcp-core/auth-context-store.ts` | Make `refresh_token`, `expires_at` optional; add `authType` field |
| `server/mcp-core/auth-helpers.ts` | Handle missing `expires_at`; skip OAuth re-auth for PATs |
| `server/mcp-service.ts` | Add `getAuthInfoFromPatHeaders()`; wire into `validateAuthFromRequest()` |
| `server/providers/atlassian/atlassian-api-client.ts` | Route to PAT client based on `authType` |
| MCP tool call sites | Replace `createAtlassianClient(token)` with `createAtlassianClientFromAuth(authInfo.atlassian, siteName)` |
| `server/readme.md` | Document PAT authentication for MCP |

## Questions

1. For Atlassian PAT auth, should `siteName` come from: (A) the existing `siteName` tool parameter — already accepted by most tools, no auth-layer changes needed, or (B) a new `X-Atlassian-Site` header stored on the session — more convenient so it doesn't need to be passed per tool call? 

Leaning toward Option A since it matches how tools already work.

2. Should PAT auth be allowed in production, or only when an env var like `ALLOW_MCP_PAT_AUTH=true` is set? (Security consideration: PATs in headers could be logged by proxies.)

A: In production.  No env var. 

3. For the Google token: the REST API expects `X-Google-Token` to be RSA-encrypted service account JSON. Should MCP PAT auth use the same encrypted format, or also support raw service account JSON for simpler local dev?

Yes, same format.

4. Should we support mixing OAuth + PAT in the same session? (e.g., OAuth for Atlassian, PAT for Figma.)

A: No. The fallback chain in `validateAuthFromRequest()` (JWT → query JWT → PAT headers) means only one auth method is used per request — they aren't merged. If a JWT is present, PAT headers are ignored. A session is either fully OAuth or fully PAT. No OAuth flow should be triggered for PAT sessions.



5. The `createAtlassianClient()` call sites need to be updated to pass `authType` and `siteName`. There are ~10 MCP tool call sites (e.g., `analyze-feature-scope.ts`, `extract-linked-resources.ts`, `confluence-analyze-page.ts`, `atlassian-update-issue-description.ts`, etc.).

**Where `siteName` comes from:** Every tool already accepts `siteName` as an optional input parameter from the LLM/caller (e.g. `"bitovi"` from `bitovi.atlassian.net`). Today, it's passed to `resolveCloudId(client, cloudId, siteName)` — which for PAT clients already uses it to hit `https://{siteName}.atlassian.net/_edge/tenant_info` to fetch the cloudId. For the PAT client creation itself, `siteName` is also needed at construction time because the base URL is `https://{siteName}.atlassian.net/rest/api/3/` (not the OAuth gateway). So `siteName` flows: LLM input → tool params → both `createAtlassianClientFromAuth` (for PAT) and `resolveCloudId`.

A: **Option B** — add `createAtlassianClientFromAuth(atlassian: ProviderAuthInfo, siteName?)` that handles routing internally. Call sites pass the whole `ProviderAuthInfo` object; routing logic is centralized; existing `createAtlassianClient` is unchanged.

Details for the two options considered:

**Option A: Update each call site to pass explicit parameters**

Change the `createAtlassianClient` signature to accept `authType` and `siteName`:

```typescript
// atlassian-api-client.ts
export function createAtlassianClient(
  token: string,
  authType?: 'oauth' | 'pat',
  siteName?: string,
): AtlassianClient {
  if (authType === 'pat') {
    return createAtlassianClientWithPAT(token, siteName);
  }
  // existing OAuth logic...
}
```

Every call site changes from:
```typescript
const client = createAtlassianClient(authInfo.atlassian.access_token);
```
to:
```typescript
const client = createAtlassianClient(
  authInfo.atlassian.access_token,
  authInfo.atlassian.authType,
  siteName,
);
```

**Option B: New `createAtlassianClientFromAuth()` helper, call sites pass `ProviderAuthInfo`**

Add a new function that accepts `ProviderAuthInfo` directly and routes internally:

```typescript
// atlassian-api-client.ts
export function createAtlassianClientFromAuth(
  atlassian: ProviderAuthInfo,
  siteName?: string,
): AtlassianClient {
  if (atlassian.authType === 'pat') {
    return createAtlassianClientWithPAT(atlassian.access_token, siteName);
  }
  return createAtlassianClient(atlassian.access_token);
}
```

Every call site changes from:
```typescript
const client = createAtlassianClient(authInfo.atlassian.access_token);
```
to:
```typescript
const client = createAtlassianClientFromAuth(authInfo.atlassian, siteName);
```

**Comparison:**

| | Option A | Option B |
|---|---|---|
| Call site diff | Pass 2 extra args | Pass whole `ProviderAuthInfo` object |
| Routing logic | Duplicated at call site | Centralized in one helper |
| Existing `createAtlassianClient` | Modified (signature change) | Unchanged |
| Call sites that skip `authType` | Could forget to pass it | N/A — `authType` is on the object |

Option B chosen: routing logic lives in one place, call sites can't accidentally omit `authType`, and the existing `createAtlassianClient` is left unchanged (REST API and other non-auth-context callers are unaffected).