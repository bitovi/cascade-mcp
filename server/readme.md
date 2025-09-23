## Module Responsibilities

- **server.ts** - Application Bootstrap  
  Express app setup with middleware configuration and route registration.  
  *Example*: Route registration for `/mcp` endpoints and direct imports from PKCE modules

- **mcp-service.ts** - MCP Transport Layer  
  Manages MCP HTTP transport, authentication extraction, and session lifecycle.  
  *Example*: `handleMcpPost()` - Main MCP request handler

- **pkce/** - OAuth 2.0 Server Implementation (Modular)  
  Modular OAuth 2.0 authorization server with PKCE support split across specialized modules:
  - **pkce/discovery.ts** - OAuth metadata endpoints and dynamic client registration
  - **pkce/authorize.ts** - Authorization endpoint with PKCE parameter handling
  - **pkce/callback.ts** - OAuth callback handler for authorization code processing
  - **pkce/access-token.ts** - Token exchange endpoint for authorization and refresh grants
  - **pkce/refresh-token.ts** - Refresh token grant handler with Atlassian token refresh
  - **pkce/token-helpers.ts** - JWT token creation utilities for MCP-compatible tokens

- **atlassian-auth-code-flow.ts** - Atlassian OAuth Integration  
  HTTP client for Atlassian OAuth API calls and token management.  
  *Example*: `exchangeCodeForTokens()` - Exchange auth code for access tokens

- **tokens.ts** - JWT Token Management  
  Creates and validates JWT tokens that wrap Atlassian credentials for bridge authentication.  
  *Example*: `createJWT()` - Create JWT wrapper for Atlassian tokens

- **jira-mcp/index.ts** - MCP Server Core  
  Initializes MCP server with tools and manages authentication context per session.  
  *Example*: `setAuthContext()` - Store auth info per session

- **jira-mcp/auth-helpers.ts** - Tool Authentication  
  Provides safe authentication retrieval for tools with automatic re-auth on token expiration.  
  *Example*: `getAuthInfoSafe()` - Safe auth retrieval that throws `InvalidTokenError`

- **jira-mcp/tool-*.ts** - Individual Tool Handlers  
  Implements specific Jira operations like fetching issues, sites, and updating descriptions.  
  *Example*: `tool-get-accessible-sites.ts::handler()` - Fetch Atlassian sites

## Key Authentication Patterns

### JWT Token Structure
```javascript
{
  "sub": "user-{uuid}",
  "iss": "http://localhost:3000", 
  "aud": "http://localhost:3000",
  "scope": "read:jira-work write:jira-work offline_access",
  "atlassian_access_token": "eyJraWQ...", // Embedded Atlassian token
  "refresh_token": "eyJraWQ...",           // Embedded refresh token
  "iat": 1756506221,
  "exp": 1756509761                       // JWT expiration (1min before Atlassian)
}
```

### Session Flow Pattern
1. **Transport Creation**: `StreamableHTTPServerTransport` with unique session ID
2. **Auth Storage**: `setAuthContext(sessionId, authInfo)` stores JWT payload
3. **Tool Access**: `getAuthInfoSafe(context)` retrieves via session ID
4. **Error Handling**: `InvalidTokenError` triggers OAuth re-authentication
5. **Cleanup**: `clearAuthContext(sessionId)` on transport close

### Error Recovery
- **401 Responses**: Include `WWW-Authenticate` header with OAuth metadata
- **Token Expiration**: Tools throw `InvalidTokenError` for automatic refresh
- **Session Management**: Proper cleanup prevents memory leaks

## Available MCP Tools

### Core Jira Tools
- **`get-accessible-sites`** - Retrieves all Jira sites accessible to the authenticated user
- **`get-jira-issue`** - Fetches detailed information about a specific Jira issue 
- **`get-jira-attachments`** - Downloads and returns attachments from a Jira issue as base64-encoded content
- **`update-issue-description`** - Updates a Jira issue description with markdown content, with optional attachment upload support

### Enhanced Attachment Support
The `update-issue-description` tool now supports simultaneous description updates and attachment uploads:

```typescript
// Example usage with attachments
{
  "issueKey": "PROJ-123",
  "description": "## Bug Report\n\nScreenshot: ![Error Screenshot](./error.png)",
  "attachments": [
    {
      "filename": "error.png",
      "content": "iVBORw0KGgoAAAANSUhEUgAAAA...", // base64
      "mimeType": "image/png", 
      "markdownRef": "./error.png"
    }
  ]
}
```

**Workflow:**
1. Uploads attachments to Jira first
2. Replaces markdown image references with Jira URLs
3. Converts updated markdown to ADF format
4. Updates the issue description

**Benefits:**
- Atomic operation (description + attachments)
- Automatic URL replacement in markdown
- Comprehensive success reporting with attachment details

## Integration Points

### External APIs
- **Atlassian OAuth**: `https://auth.atlassian.com/oauth/token` ([RFC 6749](https://tools.ietf.org/html/rfc6749))
- **Atlassian Sites**: `https://api.atlassian.com/oauth/token/accessible-resources` ([Atlassian OAuth API](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/))
- **Jira REST API**: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/` ([Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/))

### MCP Protocol Compliance
- **Protocol Version**: `2025-06-18` ([MCP Specification](https://modelcontextprotocol.io/docs/specification))
- **Transport**: HTTP + SSE hybrid ([MCP HTTP Transport](https://modelcontextprotocol.io/docs/specification/transport))
- **Authentication**: OAuth 2.0 with JWT bearer tokens ([RFC 6750](https://tools.ietf.org/html/rfc6750), [RFC 7519](https://tools.ietf.org/html/rfc7519))
- **Tools**: JSON-RPC 2.0 compatible tool interface ([JSON-RPC 2.0](https://www.jsonrpc.org/specification), [MCP Tools API](https://modelcontextprotocol.io/docs/specification/tools))

### VS Code Client Compatibility
- **Client Detection**: User-Agent `"node"` and MCP clientInfo `"Visual Studio Code"` ([VS Code Copilot Agent Spec](../specs/vs-code-copilot/readme.md))
- **OAuth Parameters**: Conditional `resource_metadata_url` vs `resource_metadata` ([RFC 9728 Section 5.1](https://tools.ietf.org/html/rfc9728#section-5.1))

## References

### OAuth 2.0 and Extensions
- [RFC 6749 - OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)
- [RFC 6750 - OAuth 2.0 Bearer Token Usage](https://tools.ietf.org/html/rfc6750)
- [RFC 7636 - Proof Key for Code Exchange (PKCE)](https://tools.ietf.org/html/rfc7636)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://tools.ietf.org/html/rfc8414)
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://tools.ietf.org/html/rfc9728)

### JWT and Security
- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 7515 - JSON Web Signature (JWS)](https://tools.ietf.org/html/rfc7515)

### MCP Protocol
- [Model Context Protocol Specification](https://modelcontextprotocol.io/docs/specification)
- [MCP HTTP Transport](https://modelcontextprotocol.io/docs/specification/transport)
- [MCP Tools API](https://modelcontextprotocol.io/docs/specification/tools)
- [MCP Authentication](https://modelcontextprotocol.io/docs/concepts/authentication)

### JSON-RPC and Web Standards
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema)
- [Server-Sent Events (W3C)](https://html.spec.whatwg.org/multipage/server-sent-events.html)

### Atlassian APIs
- [Atlassian OAuth 2.0 (3LO) Apps](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Atlassian Connect Framework](https://developer.atlassian.com/cloud/jira/platform/connect/)

### Project-Specific Documentation
- [VS Code Copilot Agent Specification](../specs/vs-code-copilot/readme.md)
- [E2E Testing Strategy](../specs/e2e-testing-strategy.md)
- [Atlassian MCP Analysis](../specs/atlassian-mcp-analysis/analysis.md)
