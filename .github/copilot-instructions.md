# Jira MCP Auth Bridge - AI Agent Instructions


## Development Standards

- With all api changes, keep the documentation in `server/api-flow.md` up to date.

## Architecture Overview

This is an **OAuth 2.0 bridge server** that enables MCP (Model Context Protocol) clients like VS Code Copilot to access Jira through secure authentication. The system has three main components:

## Relevant Specifications

This project implements several key specifications. Always refer to these when making authentication or protocol decisions:

### OAuth 2.0 and Extensions
- **[RFC 6749 - OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)** - Core OAuth 2.0 specification
- **[RFC 7636 - PKCE (Proof Key for Code Exchange)](https://tools.ietf.org/html/rfc7636)** - Security extension for public clients
- **[RFC 6750 - OAuth 2.0 Bearer Token Usage](https://tools.ietf.org/html/rfc6750)** - Bearer token specification (error responses, WWW-Authenticate headers)
- **[RFC 7591 - Dynamic Client Registration](https://tools.ietf.org/html/rfc7591)** - For MCP client registration
- **[RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://tools.ietf.org/html/rfc8414)** - Discovery endpoints (/.well-known)

### MCP Protocol
- **[Model Context Protocol Specification](https://modelcontextprotocol.io/docs/specification)** - Core MCP specification
- **[MCP HTTP Transport](https://modelcontextprotocol.io/docs/specification/transport)** - HTTP transport layer requirements
- **[MCP Authentication](https://modelcontextprotocol.io/docs/concepts/authentication)** - OAuth integration patterns

### JWT Standards
- **[RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)** - Token format we use to wrap Atlassian credentials
- **[RFC 7515 - JSON Web Signature (JWS)](https://tools.ietf.org/html/rfc7515)** - Signature verification

### 1. OAuth 2.0 Authorization Server (`server/pkce.js`)
- Implements RFC 7636 (PKCE) for secure public client authentication
- Bridges MCP client OAuth with Atlassian's OAuth flow
- Creates JWT tokens embedding Atlassian access tokens for downstream use
- **Key Pattern**: Uses environment variable `TEST_SHORT_AUTH_TOKEN_EXP=60` to force 1-minute token expiration for testing refresh flows

### 2. MCP HTTP Transport Layer (`server/mcp-service.js`)
- Manages session-based MCP connections using `StreamableHTTPServerTransport`
- Associates authentication context with transport sessions via `mcp-session-id` headers
- **Critical Pattern**: Session lifecycle tied to transport cleanup - always use `setAuthContext(sessionId, authInfo)` when creating sessions

### 3. Jira MCP Tools (`server/jira-mcp/`)
- Four main tools: `get-accessible-sites`, `get-jira-issue`, `get-jira-attachments`, `update-issue-description`
- **Auth Pattern**: All tools use `getAuthInfoSafe(context, toolName)` which throws `InvalidTokenError` for automatic OAuth re-authentication

## Development Workflows

### Running the Server
```bash
# Normal development
npm run start-local

# Test refresh token flow (1-minute expiration)
TEST_SHORT_AUTH_TOKEN_EXP=60 npm run start-local

# Docker development
docker-compose up --build
```

### Testing Authentication Flows
```bash
# Run integration tests against official Atlassian MCP service (60 min duration)
npm run atlassian-mcp-test

# Quick test against official Atlassian MCP service (10 min duration, 10s intervals)
npm run atlassian-mcp-test-quick

# Note: These test scripts connect to https://mcp.atlassian.com/v1/sse (official Atlassian MCP service)
# NOT the local bridge server. They validate token lifecycle against the real Atlassian service.
```

### Environment Setup
Required environment variables (see `scripts/generate-build-env.sh`):
- `VITE_AUTH_SERVER_URL` - OAuth server base URL
- `VITE_JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET` - Atlassian OAuth credentials
- `VITE_JIRA_SCOPE` - Jira permissions scope
- `SESSION_SECRET` - Express session encryption key

## Critical Patterns & Conventions

### JWT Token Structure
- **Access tokens**: Embed Atlassian access tokens in JWT payload as `atlassian_access_token`
- **Refresh tokens**: Embed Atlassian refresh tokens as `atlassian_refresh_token` with `type: 'refresh_token'`
- **Expiration logic**: JWT expires 1 minute before underlying Atlassian token (configurable via `TEST_SHORT_AUTH_TOKEN_EXP`)

### Error Handling for OAuth Re-authentication
```javascript
// ALWAYS use this pattern in MCP tools
try {
  const authInfo = getAuthInfoSafe(context, 'tool-name');
  // ... use authInfo.atlassian_access_token
} catch (error) {
  if (error.constructor.name === 'InvalidTokenError') {
    throw error; // Re-throw for MCP OAuth re-auth flow
  }
  // Handle other errors as tool errors
}
```

### Session Management
- Use `mcp-session-id` header for transport identification
- Always call `setAuthContext(sessionId, authInfo)` when creating sessions
- Clean up with `clearAuthContext(sessionId)` on transport close

### Authentication Context Flow
1. MCP client sends JWT in `Authorization: Bearer <token>` header
2. `mcp-service.js` validates JWT and extracts Atlassian credentials
3. Auth context stored per session: `authContextStore.set(sessionId, authInfo)`
4. Tools retrieve context: `getAuthInfo(context)` → uses session ID to lookup stored auth

## Integration Points

### Atlassian APIs
- **Token Exchange**: `https://auth.atlassian.com/oauth/token` for access/refresh token operations
- **Sites API**: `https://api.atlassian.com/oauth/token/accessible-resources` for cloud ID resolution
- **Jira REST API**: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/` for issue operations
- **Official Atlassian MCP Service**: `https://mcp.atlassian.com/v1/sse` - Used for integration testing and validation

### MCP Client Integration
- **Discovery**: `/.well-known/oauth-protected-resource` for MCP client registration
- **Registration**: `/register` endpoint for dynamic client registration (RFC 7591)
- **Transport**: `/mcp` endpoint handles all MCP protocol communication

### Compliance Notes
- **CORS Headers**: Must match Atlassian's specification for VS Code compatibility (see `specs/atlassian-mcp-analysis/analysis.md`)
- **Error Responses**: Must follow RFC 6750 for OAuth 2.0 bearer token errors
- **Session Management**: Proper `mcp-session-id` header exposure required for MCP clients
- **Token Format**: Atlassian uses colon-separated opaque tokens (74 chars), we wrap them in JWTs

### File Structure Significance
- `server/jira-mcp/tool-*.js` - Individual MCP tool implementations (register with `mcp.addTool()`)
- `server/atlassian-auth-code-flow.js` - Atlassian-specific OAuth utilities
- `server/tokens.js` - JWT utilities with token sanitization for logging
- `specs/atlassian-mcp-analysis/` - Integration tests against **official Atlassian MCP service** (`https://mcp.atlassian.com/v1/sse`) for token lifecycle validation
- `specs/atlassian-mcp-analysis/analysis.md` - Comprehensive analysis of Atlassian's MCP implementation including refresh tokens, CORS requirements, and compliance details

### Reference Documentation
- All OAuth 2.0 implementations must follow the RFCs listed in the specifications section above
- MCP transport and authentication patterns documented in official MCP specification
- Atlassian-specific implementation details documented in `specs/atlassian-mcp-analysis/analysis.md`
- CORS configuration must match Atlassian's exact headers for VS Code compatibility

## Debugging & Logging

### Key Log Patterns
- `🧪 TEST MODE` - Indicates test token expiration is active
- `♻️ Reusing existing transport` - Session reuse (normal)
- `🥚 New MCP initialization` - Fresh client connection
- `🔑 Atlassian token exchange successful` - OAuth flow completion

### Common Issues
- **401 errors**: Check `InvalidTokenError` throwing in tools - should trigger automatic re-auth
- **Session cleanup**: Ensure transport `onclose` handlers call `clearAuthContext()`
- **PKCE failures**: Verify `code_challenge`/`code_verifier` pairs in OAuth flow
