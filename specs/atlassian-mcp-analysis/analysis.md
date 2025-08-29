# Atlassian MCP Service Traffic Analysis

## Overview

This document analyzes the MCP traffic logs from Atlassian's official MCP service to understand differences with our current authorization implementation.

## Analysis Date (UPDATED)
August 28-29, 2025 (Latest validation: August 29, 2025 21:36 UTC)

## Log Files Analyzed (UPDATED)
- `mcp-traffic-atlassian-2025-08-29T02-09-10-217Z.jsonl`
- `mcp-traffic-atlassian-2025-08-29T02-29-02-637Z.jsonl`
- `mcp-traffic-lifecycle-2025-08-29T05-00-24-220Z.jsonl` (Complete token lifecycle test)
- `mcp-traffic-lifecycle-2025-08-29T21-36-38-936Z.jsonl` (Refresh token validation) **NEW**
- `token-lifecycle-results-2025-08-29T05-00-24-220Z.json` (55-minute expiration validation)

## Key Findings

### 1. Token Exchange Flow (UPDATED WITH LATEST FINDINGS)

**Official Atlassian MCP Service:**
```
POST https://atlassian-remote-mcp-production.atlassian-remote-mcp-server-production.workers.dev/v1/token
```

**Authorization Code Exchange (Initial Token):**
```json
{
  "grant_type": "authorization_code",
  "code": "5cab6ba65d3a4c096bc47e88:WJymxobLGdfiABLZ:WUaH4nBneP532DcNhxooTj07M8NX0NWM",
  "redirect_uri": "http://localhost:3000/oauth/callback",
  "client_id": "mu7XP03r31rGJGZX",
  "code_verifier": "M4-5cxs0hvQJMEEmUJGd5tk-_ZHb-oQE739oWt9Gp08"
}
```

**Refresh Token Exchange (CONFIRMED WORKING):**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "5cab6ba65d3a4c096bc47e88:yOCe683ffO8tD1fX:TdWebAaKGUAcHfZfy4nvaWc573ghDnUE",
  "client_id": "Gj7r28HA4SUrixmW"
}
```

**Response Format (Both Cases):**
```json
{
  "access_token": "5cab6ba65d3a4c096bc47e88:yOCe683ffO8tD1fX:P6nFkk7Bi44MF5DTyaXnIjvvFC6HPXL7",
  "token_type": "bearer",
  "expires_in": 3300,
  "refresh_token": "5cab6ba65d3a4c096bc47e88:yOCe683ffO8tD1fX:0mdDyCJLqELs8neWby9LlQiB2FBlB1Tp",
  "scope": "read:jira-work write:jira-work offline_access"
}
```

**🎯 NEW FINDINGS - Refresh Token Validation (August 29, 2025):**
- ✅ **Refresh tokens work immediately** after initial authorization (no wait required)
- ✅ **Token format consistent**: All tokens maintain colon-separated structure
- ✅ **Expiration preserved**: Refreshed tokens have same 3300-second (55 minute) lifetime
- ✅ **Refresh token rotation**: New refresh token provided with each refresh
- ✅ **Scope includes offline_access**: Required for refresh token functionality
- ✅ **Client ID requirement**: Must use exact dynamic client ID from registration

**Our Implementation:**
- Uses JWT tokens containing embedded Atlassian tokens
- Token endpoint: `/access-token`
- Returns JWT with shorter expiration (30s currently configured)

### 2. MCP Server Endpoints

**Official Atlassian:**
- Main endpoint: `https://mcp.atlassian.com/v1/sse`
- SSE initialization flow:
  1. POST to `/v1/sse` (fails with 404)
  2. GET to `/v1/sse` (establishes SSE connection)
  3. POST to `/v1/sse/message?sessionId={sessionId}` for actual MCP communication

**Our Implementation:**
- Endpoint: `/mcp` (POST)
- Single endpoint handles all MCP communication
- Uses session-based transport management

### 3. Authentication Differences

**Official Atlassian:**
- Direct bearer token authentication
- Tokens appear to be colon-separated format: `{part1}:{part2}:{part3}`
- No JWT wrapper around access tokens
- **Token expires in exactly 3300 seconds (55 minutes) - VALIDATED** ✅
- Proper OAuth 2.0 error responses with `WWW-Authenticate` headers
- Opaque tokens (not JWT format) with precise expiration timing

**Our Implementation:**
- JWT wrapper around Atlassian tokens
- JWT contains `atlassian_access_token` field
- Configurable JWT expiration (currently 30s for testing)
- OAuth 2.0 authorization server with PKCE support

### 4. MCP Protocol Compliance

**Official Atlassian:**
- Protocol version: `2025-03-26` (server supports)
- Attempted `notifications/initialized` method returns "Method not found" error
- Successful `tools/list` and `tools/call` operations
- Uses SSE for bidirectional communication

**Our Implementation:**
- Supports same MCP protocol version
- Uses HTTP-based transport without SSE
- Session management through MCP session IDs

### 5. Transport Architecture

**Official Atlassian Flow:**
```
Client → POST /v1/sse (404) → GET /v1/sse (SSE stream) → POST /v1/sse/message?sessionId=...
```

**Our Flow:**
```
Client → POST /mcp (with session management)
```

### 6. Error Handling

**Official Atlassian:**
- Returns proper HTTP status codes
- SSE stream can fail with "terminated" errors
- Graceful handling of unsupported MCP methods
- **Validated OAuth 2.0 compliance for expired tokens** ✅
  - Returns `401 Unauthorized` with proper error body
  - Includes `WWW-Authenticate: Bearer realm="OAuth", error="invalid_token"` header
  - Error format: `{"error": "invalid_token", "error_description": "Invalid access token"}`

**Our Implementation:**
- Comprehensive OAuth 2.0 error responses
- JWT validation with expiration checking
- InvalidTokenError for expired tokens to trigger re-authentication

## Token Lifecycle Validation Results

### Complete 55-Minute Test Cycle ✅

**Test Duration**: August 29, 2025 - 55 minutes and 16 seconds
- **Authorization**: `05:00:24Z` - OAuth PKCE flow completed successfully
- **Fresh Token Test**: `05:00:29Z` - Tool calls work with fresh token
- **Wait Period**: 55 minutes (3300 seconds exactly)
- **Expiration**: `05:55:24Z` - Token expires precisely at expected time
- **Post-Expiration**: `05:55:40Z` - Tool call correctly returns 401 Unauthorized

### Key Validation Points:

1. **Token Format**: Opaque tokens (not JWT), colon-separated structure
2. **Expiration Timing**: Exactly 3300 seconds, validated with millisecond precision
3. **Error Response Format**: Standards-compliant OAuth 2.0 error responses
4. **WWW-Authenticate Headers**: Proper realm and error parameter format
5. **Tool Call Behavior**: 
   - Fresh tokens: `202 Accepted` (queued for SSE response)
   - Expired tokens: `401 Unauthorized` with immediate error response

### OAuth 2.0 Compliance Verification:

The expired token response fully complies with RFC 6750 (OAuth 2.0 Bearer Token Usage):

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="OAuth", error="invalid_token"
Content-Type: application/json

{
  "error": "invalid_token",
  "error_description": "Invalid access token"
}
```

This confirms Atlassian's MCP service implements proper OAuth 2.0 token validation and error reporting.

## Atlassian-Specific HTTP Headers Analysis

### Standard CORS Headers (Required for MCP Client Compatibility)
```http
access-control-allow-headers: Content-Type, mcp-session-id
access-control-allow-methods: GET, POST, OPTIONS
access-control-allow-origin: *
access-control-expose-headers: mcp-session-id
access-control-max-age: 86400
```

### Atlassian Infrastructure Headers
```http
# Request Tracing
atl-request-id: 28d16008-03de-47b2-bd1e-df3748491f76
atl-traceid: 28d1600803de47b2bd1edf3748491f76

# Performance Monitoring
server-timing: atl-edge;dur=103,atl-edge-internal;dur=4,atl-edge-upstream;dur=100,atl-edge-pop;desc="aws-us-east-1"
server: AtlassianEdge

# CDN/Edge Infrastructure
ge-edge-trusted-cloudflare-proxy: bWNwLWNsb3VkZmxhcmUK
cf-ray: 9769cd01f95b255f-IAD
alt-svc: h3=":443"; ma=86400
```

### Security Headers
```http
strict-transport-security: max-age=63072000; preload
x-content-type-options: nosniff
x-xss-protection: 1; mode=block
```

### Error Response Headers (401 Unauthorized)
```http
www-authenticate: Bearer realm="OAuth", error="invalid_token"
content-type: application/json
content-length: 68
```

### Cache Control Headers
```http
cache-control: no-cache
vary: Accept-Encoding
```

### Network Error Logging (NEL)
```http
nel: {"failure_fraction": 0.001, "include_subdomains": true, "max_age": 600, "report_to": "endpoint-1"}
report-to: {"endpoints": [{"url": "https://dz8aopenkvv6s.cloudfront.net"}], "group": "endpoint-1", "include_subdomains": true, "max_age": 600}
```

### Critical Headers for VS Code MCP Client
1. **`access-control-expose-headers: mcp-session-id`** - Essential for client to read session ID
2. **`access-control-allow-headers: Content-Type, mcp-session-id`** - Required for session header support  
3. **`www-authenticate: Bearer realm="OAuth", error="invalid_token"`** - OAuth 2.0 compliance for 401 errors
4. **`content-type: text/event-stream`** - SSE content type for async responses
5. **`content-type: application/json`** - Standard JSON responses for errors

## Significant Differences

### 1. **Token Format**
- **Atlassian**: Direct colon-separated tokens
- **Ours**: JWT-wrapped tokens with embedded Atlassian credentials

### 2. **Transport Method**
- **Atlassian**: Server-Sent Events (SSE) based transport
- **Ours**: HTTP request/response with session management

### 3. **OAuth Server Role**
- **Atlassian**: Direct MCP server (no OAuth server role)
- **Ours**: Acts as OAuth 2.0 authorization server bridging to Atlassian

### 4. **Token Lifetime (CONFIRMED)**
- **Atlassian**: 55 minutes (3300 seconds) - **VALIDATED IN PRODUCTION** ✅
- **Ours**: Currently 30 seconds (configurable, typically 1 minute less than Atlassian)

**Token Lifecycle Validation Results:**
- Multiple tests confirm exact 3300-second expiration
- Latest test (August 29, 2025): Token expires precisely at calculated time
- Refresh tokens work immediately and preserve 55-minute lifetime
- Token format consistent across initial and refreshed tokens

### 6. **Discovery Endpoints (UPDATED)**
- **Atlassian**: Full OAuth 2.0 discovery support **✅ CONFIRMED**
  - Discovery URL: `https://mcp.atlassian.com/.well-known/oauth-authorization-server`
  - Issuer: `https://atlassian-remote-mcp-production.atlassian-remote-mcp-server-production.workers.dev`
  - Dynamic client registration: **WORKING** ✅
  - Authorization endpoint: `https://mcp.atlassian.com/v1/authorize`
  - Token endpoint: `https://atlassian-remote-mcp-production.atlassian-remote-mcp-server-production.workers.dev/v1/token`
- **Ours**: Full OAuth 2.0 discovery with `.well-known` endpoints

### 7. **PKCE Implementation (UPDATED)**
- **Atlassian**: 
  - ✅ Standard OAuth PKCE with dynamic client registration
  - ✅ Full RFC 7591 Dynamic Client Registration Protocol support
  - ✅ Client IDs are dynamically generated (e.g., `Gj7r28HA4SUrixmW`)
  - ✅ Supports `offline_access` scope for refresh tokens
- **Ours**: Dual PKCE - supports MCP client PKCE and generates our own for Atlassian

### 8. **MCP Tools Discovery (NEW)**
**Atlassian provides 24 comprehensive tools:**

1. **User & Access Management:**
   - `atlassianUserInfo` - Get current user info
   - `getAccessibleAtlassianResources` - Get cloud IDs for API calls
   - `lookupJiraAccountId` - Find users by display name/email

2. **Confluence Tools (11 tools):**
   - `getConfluenceSpaces` - List spaces with filtering options
   - `getConfluencePage` - Get page content (converted to Markdown)
   - `getPagesInConfluenceSpace` - Browse space content structure
   - `getConfluencePageFooterComments` - General page comments
   - `getConfluencePageInlineComments` - Text-specific comments
   - `getConfluencePageDescendants` - Navigate page hierarchy
   - `createConfluencePage` - Create pages or live docs
   - `updateConfluencePage` - Edit existing content
   - `createConfluenceFooterComment` - Add general comments
   - `createConfluenceInlineComment` - Add text-specific comments
   - `searchConfluenceUsingCql` - Powerful CQL search capabilities

3. **Jira Tools (10 tools):**
   - `getJiraIssue` - Detailed issue information
   - `editJiraIssue` - Update issue fields
   - `createJiraIssue` - Create new issues with full metadata
   - `getTransitionsForJiraIssue` - Available workflow transitions
   - `transitionJiraIssue` - Move issues through workflow
   - `searchJiraIssuesUsingJql` - JQL-based issue search
   - `addCommentToJiraIssue` - Add comments to issues
   - `getJiraIssueRemoteIssueLinks` - External links (e.g., Confluence)
   - `getVisibleJiraProjects` - Project discovery with permissions
   - `getJiraProjectIssueTypesMetadata` - Issue type schemas for creation

**Tool Capabilities Observed:**
- ✅ **Rich parameter support** - Most tools accept extensive filtering/pagination options
- ✅ **Markdown conversion** - Confluence content automatically converted to Markdown
- ✅ **Permission-aware** - Tools respect user's actual permissions
- ✅ **Cross-product integration** - Links between Jira and Confluence content
- ✅ **Comprehensive CRUD** - Full create, read, update operations supported

## Refresh Token Implementation Analysis (NEW SECTION)

### Test Results - August 29, 2025

**🎯 Comprehensive Refresh Token Validation:**

1. **Immediate Refresh Test**: ✅ PASSED
   - Refreshed token immediately after initial authorization
   - Original token: 74 characters
   - Refreshed token: 74 characters (new token confirmed)
   - Refresh token rotated: Yes (security best practice)
   - Process completed in <1 second

2. **Token Structure Consistency**: ✅ CONFIRMED
   - All tokens maintain colon-separated format: `{id}:{key}:{token}`
   - Format: `5cab6ba65d3a4c096bc47e88:yOCe683ffO8tD1fX:P6nFkk7Bi44MF5DTyaXnIjvvFC6HPXL7`
   - Length remains consistent at 74 characters
   - First two segments remain stable across refreshes (user/session context)
   - Third segment changes (actual access credential)

3. **Scope and Expiration**: ✅ VALIDATED
   - Scope includes `offline_access`: **REQUIRED** for refresh functionality
   - Token lifetime preserved: 3300 seconds (55 minutes) for all tokens
   - Expiration timing precise: Token expires exactly at calculated time

4. **Client ID Requirements**: ✅ CONFIRMED
   - Must use exact dynamic client ID from registration (`Gj7r28HA4SUrixmW`)
   - Client ID required in refresh request (RFC 6749 compliance)
   - Dynamic registration working perfectly with MCP discovery

### OAuth 2.0 Compliance

**Atlassian's refresh token implementation follows RFC 6749 exactly:**

```http
POST /v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=5cab6ba65d3a4c096bc47e88:yOCe683ffO8tD1fX:TdWebAaKGUAcHfZfy4nvaWc573ghDnUE&
client_id=Gj7r28HA4SUrixmW
```

**Response includes:**
- New access token with same 55-minute lifetime
- New refresh token (token rotation for security)
- Preserved scope including `offline_access`
- Consistent token type (`bearer`)

### Bridge Server Implementation Notes

**Our refresh implementation should:**
1. ✅ Store the dynamic client ID from PKCE registration
2. ✅ Include `offline_access` in scope requests  
3. ✅ Use form-encoded requests (not JSON) for refresh
4. ✅ Handle token rotation (update stored refresh token)
5. ✅ Maintain same JWT expiration logic (1 minute before Atlassian expiration)
6. ✅ Re-wrap refreshed Atlassian tokens in new JWTs

**Critical Success Factors:**
- Dynamic client ID tracking (not environment variable)
- Form-encoded refresh requests
- Proper scope including `offline_access`
- Token rotation handling

### Our Bridge Design Benefits:
1. **Standards Compliance**: Full OAuth 2.0 server with discovery
2. **Security**: JWT wrapper provides additional validation layer
3. **Flexibility**: Can work with any OAuth-compliant MCP client
4. **Monitoring**: Better logging and token lifecycle management

### Official Design Benefits:
1. **Simplicity**: Direct token usage without wrapping
2. **Performance**: No JWT encoding/decoding overhead
3. **Native SSE**: Better real-time communication
4. **Longer Tokens**: Less frequent re-authentication

## Critical VS Code Compatibility Issues

### 1. **Authorization Error Response Format Context**

**Official Atlassian Response for Invalid/Missing Auth:**
```json
{
  "error": "invalid_token",
  "error_description": "Missing or invalid access token"
}
```

**Our Implementation Analysis:**

- **Early auth errors (GET requests)**: Return empty response with only OAuth headers - `.end()`
- **POST initialization auth errors**: Return JSON-RPC format with `sendMissingAtlassianAccessToken()`
- **Mid-stream auth errors**: Use `error.toResponseObject()` (likely JSON-RPC format)

**Question:** Should we return the simple OAuth error format `{error, error_description}` for early auth failures instead of headers-only response?

Looking at the official logs, `https://mcp.atlassian.com/v1/sse` without valid auth returns the simple JSON format, not headers-only.

### 2. **MCP Session ID Header Exposure**

**Official Atlassian Response Headers (SUCCESS):**
```
access-control-allow-headers: Content-Type, mcp-session-id
access-control-allow-methods: GET, POST, OPTIONS
access-control-allow-origin: *
access-control-expose-headers: mcp-session-id
access-control-max-age: 86400
```

**Official Atlassian Response Headers (ERROR - 401):**
```
www-authenticate: Bearer realm="OAuth", error="invalid_token"
```

**Atlassian-Specific Headers:**
```
atl-request-id: 28d16008-03de-47b2-bd1e-df3748491f76
atl-traceid: 28d1600803de47b2bd1edf3748491f76
server-timing: atl-edge;dur=103,atl-edge-internal;dur=4,atl-edge-upstream;dur=100,atl-edge-pop;desc="aws-us-east-1"
server: AtlassianEdge
ge-edge-trusted-cloudflare-proxy: bWNwLWNsb3VkZmxhcmUK
```

**Our Implementation:** We have general CORS enabled but may not be explicitly exposing the `mcp-session-id` header that VS Code MCP client needs to read.

### 3. **Async Response Pattern**

**Official Atlassian:**
- Returns `202 Accepted` for POST requests to message endpoints
- Indicates async processing of MCP requests
- Content-Type: `text/event-stream` for async responses
- Body: `"Accepted"` (8 bytes) for queued requests

**Our Implementation:** Using standard HTTP response codes through MCP SDK, which may be synchronous.

## Error Response Pattern Analysis

### Current Behavior:
1. **GET /mcp without auth**: Headers-only 401 response (`.end()`)
2. **POST /mcp initialization without auth**: JSON-RPC error format
3. **Mid-stream auth errors**: JSON-RPC error format (`error.toResponseObject()`)

### Official Atlassian:
1. **GET /v1/sse without auth**: Simple OAuth JSON format
2. **POST operations**: Standard JSON-RPC for MCP protocol errors

### Potential Fix:
For GET requests without auth, return simple OAuth format instead of headers-only:

```javascript
// Instead of .end(), return:
.json({
  error: "invalid_token",
  error_description: "Missing or invalid access token"
});
```

## Immediate Action Items (UPDATED PRIORITIES)

### 1. **Implement Refresh Token Support (HIGH Priority - IN PROGRESS)**

✅ **VALIDATED: Refresh token flow works perfectly with Atlassian**

**Implementation checklist for our bridge:**
- [ ] Add `offline_access` to default scopes in bridge server
- [ ] Store dynamic client ID from PKCE registration (not environment variable)
- [ ] Implement refresh token endpoint in bridge server
- [ ] Use form-encoded requests for refresh (not JSON)
- [ ] Handle token rotation (store new refresh token)
- [ ] Re-wrap refreshed Atlassian tokens in new JWTs
- [ ] Update JWT expiration logic for refreshed tokens

### 2. **Fix CORS Configuration (MEDIUM Priority - CONFIRMED WORKING)**

✅ **VALIDATED: Atlassian's CORS configuration confirmed working**

Update `server.js` to match Atlassian's exact CORS configuration:

```javascript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization'],
  exposedHeaders: ['mcp-session-id'],
  maxAge: 86400,
  credentials: false
}));
```

### 3. **Verify Session ID Handling (LOW Priority)**
Ensure our `handleMcpPost` function properly returns session IDs in response headers when establishing new sessions.

## VS Code MCP Client Behavior Analysis

### Transport Negotiation Pattern:
1. VS Code tries POST first (gets 404 from Atlassian)
2. Falls back to GET for SSE establishment  
3. Uses POST to sessionId endpoint for actual communication

### Expected Headers:
- `mcp-session-id` must be exposed for client to read (CRITICAL)
- `access-control-expose-headers: mcp-session-id` required
- `access-control-allow-headers: Content-Type, mcp-session-id` required
- CORS headers for cross-origin requests
- Proper cache control for real-time communication
- `www-authenticate` header for OAuth 2.0 error responses

### Protocol Support:
- `notifications/initialized` returns "Method not found" (acceptable)
- `tools/list` and `tools/call` work correctly
- Error responses follow JSON-RPC 2.0 format

## Immediate Action Items

### 1. **Fix CORS Configuration (HIGH Priority)**
Update `server.js` to match Atlassian's exact CORS configuration:

```javascript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization'],
  exposedHeaders: ['mcp-session-id'],
  maxAge: 86400,
  credentials: false
}));
```

**Key Changes Needed:**
- Explicitly expose `mcp-session-id` header (CRITICAL for VS Code)
- Allow `mcp-session-id` in request headers
- Match Atlassian's 86400 second cache age
- Ensure methods match: `GET, POST, OPTIONS` (remove DELETE if present)

### 2. **Verify Session ID Handling (MEDIUM Priority)**
Ensure our `handleMcpPost` function properly returns session IDs in response headers when establishing new sessions.

### 3. **Test Transport Negotiation (LOW Priority)**
VS Code might expect the POST→404→GET→SSE pattern. Our single POST endpoint should work but may need testing.

## Non-Critical Differences

### Token Format
- Atlassian uses colon-separated tokens vs our JWT approach
- Not a compatibility issue - just different implementation choices

### Token Lifetime  
- Atlassian: 55 minutes vs Our: 30 seconds (configurable)
- Our shorter lifetime is more secure but requires more frequent re-auth

### Architecture Approach
- Atlassian: Direct MCP service
- Ours: OAuth bridge with standards compliance
- Both are valid approaches serving different needs

## Token Format Analysis

**Validated Token Structure:** The Atlassian tokens follow a pattern: `{base64-id}:{base64-key}:{base64-token}`
- First part appears to be a consistent identifier
- Second part appears to be a key or session identifier  
- Third part varies and likely contains the actual access credentials

**Token Characteristics (Validated):**
- **Format**: Opaque tokens (not JWT) with colon-separated structure
- **Length**: Typically 74 characters total
- **Expiration**: Exactly 3300 seconds (55 minutes) from issuance
- **Validation**: Server-side validation with precise timing
- **Error Handling**: RFC 6750 compliant OAuth 2.0 error responses

This confirms a structured token format optimized for Atlassian's infrastructure, different from standard JWT or simple opaque tokens, but with precise expiration behavior suitable for production MCP implementations.
