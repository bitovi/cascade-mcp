# Jira MCP Auth Bridge - AI Agent Instructions


## Development Standards

- With all api changes or file changes, keep the documentation in `server/readme.md` up to date.

### Code Organization for MCP Tools

**Folder Structure:**
- Complex MCP tools should have their own folder under `server/providers/{provider}/tools/{tool-name}/`
  - Use own folder for: Multi-step workflows, tools with sampling hooks, tools with helper modules
  - Simple single-step tools can remain as single files
- Each tool folder contains:
  - `index.ts` - Exports the tool registration function
  - `{tool-name}.ts` - Main tool implementation file
  - `{helper-name}.ts` - Semi-specific helper modules (parsers, validators, formatters, etc.)

**Main Tool File Structure (`{tool-name}.ts`):**
1. **Top section**: Imports and type definitions
2. **Middle section**: Tool registration function (orchestration only - calls helper functions)
3. **Bottom section**: Step helper functions in execution order

**Helper Function Guidelines:**
- **Semi-specific helpers** (parsers, validators, domain logic) → Separate module files
  - Example: `shell-story-parser.ts` with `parseShellStoriesFromAdf()` and `addCompletionMarkerToShellStory()` functions
  - Definition: Could be used by different workflows, minimal dependencies on external state/parameters
  - Benefits: Testable, reusable, maintainable
  - Export types/interfaces used across modules
  - Export functions for testing: `export function parseShellStoriesFromAdf(...)`, `export function addCompletionMarkerToShellStory(...)`
- **Broad workflow steps** → Exported functions at bottom of main file, in execution order
  - Example: `fetchEpicAndExtractShellStories()`, `findNextUnwrittenStory()`, `validateDependencies()`
  - These orchestrate the tool's main workflow steps
  - Keep main handler clean by delegating to these functions
  - Export for testing: `export async function fetchEpicAndExtractShellStories(...)`
  - Functions should throw descriptive errors (don't return error objects)

**Utility Function Placement:**
- **General utilities** (date formatting, string manipulation) → `server/utils/` (to be created as needed)
- **Provider-specific utilities** (Jira helpers, Figma helpers) → `server/providers/{provider}/` directory
- **Tool-specific but reusable** (parsers, validators) → Separate module in tool folder

**Example Structure:**
```
server/providers/combined/tools/write-next-story/
├── index.ts                    # export { registerWriteNextStoryTool }
├── write-next-story.ts         # Main tool + workflow step functions at bottom
└── shell-story-parser.ts       # Semi-specific helper (parser logic)
```

## Architecture Overview

This is an **OAuth 2.0 bridge server** that enables MCP (Model Context Protocol) clients like VS Code Copilot to access Jira through secure authentication. The system has three main components:

### Dual Interface Pattern (MCP + REST API)

Tools are exposed via **both** MCP protocol and REST API without code duplication:

**Pattern:**
- `server/providers/{provider}/tools/{tool}/core-logic.ts` - Shared business logic (`executeWriteShellStories`, etc.)
- `server/providers/{provider}/tools/{tool}/{tool}.ts` - MCP tool wrapper (uses OAuth context)
- `server/api/{tool}.ts` - REST API wrapper (uses PAT headers)

**New tools should support both interfaces.** Copy existing patterns from `write-shell-stories` or `analyze-feature-scope`.

### Authentication: OAuth vs PAT

| Method | Used By | Auth Header | Token Source |
|--------|---------|-------------|--------------|
| **OAuth** | MCP clients (VS Code Copilot, Claude Desktop) | `Authorization: Bearer <JWT>` | Our PKCE OAuth flow |
| **PAT** | REST API, scripts, server-to-server | `X-Atlassian-Token`, `X-Figma-Token` | User's personal access tokens |

**PKCE Bridge Pattern (MCP OAuth):**
1. MCP client initiates PKCE OAuth with our server (`server/pkce/`)
2. We initiate traditional OAuth with providers (Atlassian, Figma)
3. Provider tokens embedded in JWT returned to MCP client
4. MCP client sends JWT → we extract provider tokens → call provider APIs

### LLM Integration for Tools

Tools needing AI can work with **both** auth methods:
- **MCP**: Uses MCP sampling (client provides LLM) OR falls back to `X-Anthropic-Token` header
- **REST API**: Requires `X-Anthropic-Token` (or other LLM provider header)

Use `createProviderFromHeaders()` for REST API, `ToolDependencies.llmClient` for shared logic.

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

### 1. OAuth 2.0 Authorization Server (`server/pkce.ts`)
- Implements RFC 7636 (PKCE) for secure public client authentication
- Bridges MCP client OAuth with Atlassian's OAuth flow
- Creates JWT tokens embedding Atlassian access tokens for downstream use
- **Key Pattern**: Uses environment variable `TEST_SHORT_AUTH_TOKEN_EXP=60` to force 1-minute token expiration for testing refresh flows

### 2. MCP HTTP Transport Layer (`server/mcp-service.ts`)
- Manages session-based MCP connections using `StreamableHTTPServerTransport`
- Associates authentication context with transport sessions via `mcp-session-id` headers
- **Critical Pattern**: Session lifecycle tied to transport cleanup - always use `setAuthContext(sessionId, authInfo)` when creating sessions

### 3. Jira MCP Tools (`server/jira-mcp/`)
- Four main tools: `get-accessible-sites`, `get-jira-issue`, `get-jira-attachments`, `update-issue-description`
- **Auth Pattern**: All tools use `getAuthInfoSafe(context, toolName)` which throws `InvalidTokenError` for automatic OAuth re-authentication

## Development Workflows

### Running Commands
**Prefer VS Code tasks over terminal commands.** Tasks allow checking logs at any time without blocking. Use `create_and_run_task` or `run_task` tools instead of `run_in_terminal` for:
- Long-running processes (servers, watchers)
- Build commands
- Any command whose output you may need to review later

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

### Console Logging Format
- **First console.log in a function**: No additional indentation (aligned with function body)
- **Subsequent console.logs in the same function**: Message content should have 2 additional spaces

```javascript
export function myFunction() {
  console.log('First message'); // No extra indentation
  
  if (condition) {
    console.log('  Second message'); // Content has 2 extra spaces
    console.log('  Third message');  // Content has 2 extra spaces
  }
}
```

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
2. `mcp-service.ts` validates JWT and extracts Atlassian credentials
3. Auth context stored per session: `authContextStore.set(sessionId, authInfo)`
4. Tools retrieve context: `getAuthInfo(context)` → uses session ID to lookup stored auth

## Integration Points

### Atlassian APIs
- **Token Exchange**: `https://auth.atlassian.com/oauth/token` for access/refresh token operations
- **Sites API (OAuth only)**: `https://api.atlassian.com/oauth/token/accessible-resources` for cloud ID resolution with OAuth tokens
- **Cloud ID Resolution (OAuth + PAT)**: `https://{siteName}.atlassian.net/_edge/tenant_info` - Works with both OAuth Bearer tokens and PAT Basic Auth to retrieve cloudId
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
- `server/jira-mcp/tool-*.ts` - Individual MCP tool implementations (register with `mcp.addTool()`)
- `server/atlassian-auth-code-flow.ts` - Atlassian-specific OAuth utilities
- `server/tokens.ts` - JWT utilities with token sanitization for logging
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

## Frontend (Browser MCP Client)

**Purpose:** Provides a simple way to test MCP tools without setting up an external MCP client (VS Code Copilot, Claude Desktop, etc.).

### Structure
- `src/` - React frontend (Vite + TypeScript)
  - `main.tsx` - Entry point
  - `react/App.tsx` - Main component, MCP connection logic
  - `react/components/` - UI (ConnectionPanel, ToolSelector, ToolForm, ProgressLog, ResultDisplay)
  - `react/hooks/` - `useConfig`, `useMcpClient`
  - `mcp-client/` - Browser MCP client implementation

### Commands
- `npm run dev` - Run server (3000) + Vite client (5173) concurrently
- `npm run dev:client` - Vite only
- `npm run build` - Build to `dist/client/`

### Dev Proxy (`vite.config.ts`)
Routes `/mcp`, `/api`, `/auth`, `/.well-known`, `/register` → `localhost:3000`

### Production Serving (`server/server.ts`)
Express serves `dist/client/` if `index.html` exists, else fallback HTML.
