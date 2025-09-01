# End-to-End Testing Strategy

## Overview

This document outlines the comprehensive E2E testing strategy for the Jira MCP Auth Bridge, organized by client type, use case, and API flow steps. Tests are structured to validate specification compliance while accommodating client-specific deviations.

## Testing Architecture

### Organizational Structure

Tests are organized in a two-tier hierarchy:

```
specs/{client}/{use-case}/
```

- **Client**: `standards` (Direct HTTP/RFC compliance), `mcp-sdk` (MCP SDK-based clients), or `vs-code-copilot` (VS Code Copilot specific deviations)
- **Use Case**: High-level scenarios like `connecting-to-tool-use`, `refresh`, `error-handling`

Each test file includes an easy-to-digest summary at the top explaining what it tests and which specifications it validates.

### Test Implementation Strategy: Dual Approach

**Use both direct HTTP and MCP SDK testing** for comprehensive coverage:

#### `standards/` - Direct HTTP Protocol Testing
- ✅ **Educational value** - Clear examples of raw OAuth/MCP HTTP requests
- ✅ **RFC compliance validation** - Direct testing of specification adherence
- ✅ **Edge case testing** - Fine-grained control over malformed requests
- ✅ **Documentation** - Shows developers exactly what HTTP calls to make

#### `mcp-sdk/` - Real Client Integration Testing  
- ✅ **Real MCP client behavior** - Tests exactly how actual MCP clients interact with our server
- ✅ **Built-in validation** - MCP SDK includes schema validation (like the `redirect_uris` requirement)
- ✅ **OAuth integration** - SDK handles OAuth flows, client registration, and token management
- ✅ **Specification compliance** - SDK enforces MCP protocol and JSON-RPC 2.0 standards
- ✅ **Cursor IDE validation** - Our tests will behave identically to real clients like Cursor

**Implementation Approach**:
```javascript
// standards/ - Manual HTTP requests
const response = await fetch('/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    redirect_uris: ['cursor://anysphere.cursor-retrieval/oauth/callback'],
    client_name: 'Test Client'
  })
});

// mcp-sdk/ - Real MCP SDK client
import { MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
const client = new MCPClient({
  transport: new HTTPClientTransport({
    baseUrl: 'http://localhost:3000/mcp',
  })
});
```

### Directory Structure

```
specs/
├── standards/                          # Direct HTTP/RFC compliance testing
│   ├── connecting-to-tool-use/         # Main happy path flow (API Flow Phases 1-5)
│   │   ├── initial-connection.test.js
│   │   ├── oauth-discovery.test.js
│   │   ├── authorization.test.js
│   │   ├── token-exchange.test.js
│   │   ├── session-establishment.test.js
│   │   ├── tool-discovery.test.js
│   │   └── tool-execution.test.js
│   │
│   ├── refresh/                        # Token lifecycle scenarios
│   │   ├── token-expiration.test.js
│   │   ├── refresh-token-flow.test.js
│   │   └── automatic-reauth.test.js
│   │
│   ├── error-handling/                 # Error scenarios
│   │   ├── invalid-pkce.test.js
│   │   ├── expired-auth-code.test.js
│   │   ├── malformed-jwt.test.js
│   │   ├── network-failures.test.js
│   │   └── api-rate-limiting.test.js
│   │
│   └── session-management/             # Session lifecycle
│       ├── concurrent-sessions.test.js
│       ├── session-cleanup.test.js
│       └── transport-lifecycle.test.js
│
├── mcp-sdk/                            # MCP SDK-based client testing
│   ├── connecting-to-tool-use/         # Real MCP client integration
│   │   ├── sdk-initialization.test.js
│   │   ├── automatic-oauth-flow.test.js
│   │   ├── tool-discovery.test.js
│   │   └── tool-execution.test.js
│   │
│   ├── client-compatibility/           # Real client testing
│   │   ├── cursor-ide.test.js
│   │   ├── multiple-clients.test.js
│   │   └── concurrent-sdk-sessions.test.js
│   │
│   └── error-recovery/                 # SDK error handling
│       ├── token-refresh.test.js
│       ├── network-failures.test.js
│       └── server-restart.test.js
│
├── vs-code-copilot/                    # VS Code Copilot specific deviations only
│   └── connecting-to-tool-use/         # Only tests that deviate from standards
│       ├── initial-connection.test.js  # WWW-Authenticate resource_metadata_url
│       └── session-establishment.test.js # User-Agent detection
│
├── shared/                             # Shared test utilities
│   ├── fixtures/
│   │   ├── mock-requests.js
│   │   ├── test-tokens.js
│   │   └── atlassian-responses.js
│   ├── helpers/
│   │   ├── auth-flow.js               # PAT bypass + manual OAuth helpers
│   │   ├── mcp-client.js              # Mock MCP client
│   │   ├── assertions.js              # Custom assertions for specs
│   │   └── test-server.js             # Test server setup
│   └── config/
│       ├── test-environment.js
│       └── specification-references.js
│
└── README.md                           # Testing overview and setup
```

## Mapping to API Flow Phases

Each test file corresponds to specific phases in the [API Flow](../server/api-flow.md):

### `connecting-to-tool-use/` Use Case

| Test File | API Flow Phase | Key Specifications |
|-----------|----------------|-------------------|
| `initial-connection.test.js` | Phase 1: Initial Connection | [MCP Specification](https://modelcontextprotocol.io/docs/specification), [RFC 6750 Section 3](https://tools.ietf.org/html/rfc6750#section-3), [RFC 9728 Section 5.1](https://tools.ietf.org/html/rfc9728#section-5.1) |
| `oauth-discovery.test.js` | Phase 2: OAuth Discovery | [RFC 8414](https://tools.ietf.org/html/rfc8414), [RFC 9728](https://tools.ietf.org/html/rfc9728) |
| `authorization.test.js` | Phase 2: Authorization | [RFC 6749 Section 4.1](https://tools.ietf.org/html/rfc6749#section-4.1), [RFC 7636](https://tools.ietf.org/html/rfc7636) |
| `token-exchange.test.js` | Phase 3: Token Exchange | [RFC 7636 Section 4.3](https://tools.ietf.org/html/rfc7636#section-4.3), [RFC 6749 Section 4.1.3](https://tools.ietf.org/html/rfc6749#section-4.1.3) |
| `session-establishment.test.js` | Phase 4: MCP Session | [MCP HTTP Transport](https://modelcontextprotocol.io/docs/specification/transport), [RFC 6750 Section 2.1](https://tools.ietf.org/html/rfc6750#section-2.1) |
| `tool-discovery.test.js` | Phase 5: Tool Discovery | [MCP Tools API](https://modelcontextprotocol.io/docs/specification/tools), [JSON-RPC 2.0](https://www.jsonrpc.org/specification) |
| `tool-execution.test.js` | Phase 5: Tool Execution | [MCP Tools API](https://modelcontextprotocol.io/docs/specification/tools), [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/) |

## VS Code Copilot Deviation Strategy

**Principle**: VS Code Copilot tests only include test files where behavior deviates from both standards and MCP SDK approaches.

### Deviations Documented

1. **`initial-connection.test.js`**: WWW-Authenticate header uses `resource_metadata_url` instead of standard `resource_metadata`
2. **`session-establishment.test.js`**: Client detection via User-Agent `"node"` and MCP clientInfo `"Visual Studio Code"`

### Standard Tests NOT Included in VS Code Copilot
VS Code Copilot behavior aligns with both `standards/` and `mcp-sdk/` test suites for most scenarios:
- OAuth discovery, authorization, token exchange
- Tool discovery and execution  
- Session management and error handling

Only the `resource_metadata_url` parameter deviation requires special testing.

## Test Environment Setup

### Authentication Testing Modes

**PAT Bypass Mode (Automated)**:
- Uses Atlassian Personal Access Token to bypass OAuth flow
- Enables fully automated E2E testing without browser interaction
- Tests real Jira API calls and tool functionality
- Suitable for CI/CD pipelines and rapid development feedback
- Environment: `TEST_USE_PAT_BYPASS=true TEST_ATLASSIAN_PAT=your_pat_token`

**Manual OAuth Mode (Comprehensive)**:
- Tests complete OAuth 2.0 + PKCE flow with real Atlassian servers
- Requires browser interaction for authorization
- Validates full specification compliance end-to-end
- Suitable for thorough integration testing and OAuth validation
- Environment: `TEST_USE_PAT_BYPASS=false` (or unset)

### Environment Variables
```bash
# Test-specific configuration
TEST_MODE=true
TEST_SHORT_AUTH_TOKEN_EXP=60  # 1-minute tokens for quick testing
TEST_JIRA_INSTANCE_URL=https://test-company.atlassian.net
TEST_JIRA_PROJECT_KEY=TEST
TEST_ISSUE_KEY=TEST-123

# OAuth test credentials (for manual auth testing)
VITE_JIRA_CLIENT_ID=test_client_id
JIRA_CLIENT_SECRET=test_client_secret
VITE_JIRA_SCOPE=read:jira-work write:jira-work offline_access

# PAT bypass for automated testing (bypasses OAuth flow)
TEST_ATLASSIAN_PAT=your_personal_access_token_here  # Atlassian PAT for automated E2E tests
TEST_USE_PAT_BYPASS=true                           # Enable PAT bypass mode
```

## Test Scenarios

### 1. OAuth Flow Tests

#### 1.1 Happy Path OAuth Flow
**Scenario**: Complete OAuth authorization from start to finish
**Specifications**: 
- [RFC 6749 Section 4.1](https://tools.ietf.org/html/rfc6749#section-4.1) (Authorization Code Grant)
- [RFC 7636 Section 4](https://tools.ietf.org/html/rfc7636#section-4) (PKCE Flow)
- [RFC 8414 Section 2](https://tools.ietf.org/html/rfc8414#section-2) (Authorization Server Metadata - token_endpoint REQUIRED)
- [RFC 9728 Section 2](https://tools.ietf.org/html/rfc9728#section-2) (Protected Resource Metadata)
- [RFC 9728 Section 3](https://tools.ietf.org/html/rfc9728#section-3) (OAuth Discovery Chain)

**Steps**:
1. Start auth bridge server
2. Initiate MCP connection without auth
3. Receive 401 with OAuth discovery info
4. Follow OAuth discovery → authorization → callback → token exchange
5. Verify JWT token contains Atlassian credentials
6. Establish authenticated MCP session

**Expected Results**:
- ✅ 401 response includes `WWW-Authenticate` header with OAuth metadata ([RFC 6750 Section 3](https://tools.ietf.org/html/rfc6750#section-3))
- ✅ PKCE challenge/verifier validation succeeds ([RFC 7636 Section 4.3](https://tools.ietf.org/html/rfc7636#section-4.3))
- ✅ JWT token contains valid Atlassian access/refresh tokens ([RFC 7519](https://tools.ietf.org/html/rfc7519))
- ✅ MCP session established with session ID ([MCP Specification Section 3.2](https://modelcontextprotocol.io/docs/specification#session-management))

**Test Implementation**:
```javascript
import { MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { HTTPClientTransport } from '@modelcontextprotocol/sdk/client/http.js';

describe('OAuth Flow - Happy Path', () => {
  test('complete OAuth flow with PKCE using MCP SDK', async () => {
    // Use real MCP SDK client - this will automatically trigger OAuth flow
    const client = new MCPClient({
      transport: new HTTPClientTransport({
        baseUrl: 'http://localhost:3000/mcp',
      })
    });
    
    // MCP SDK automatically handles:
    // 1. Dynamic client registration (POST /register)
    // 2. OAuth discovery (/.well-known/oauth-authorization-server)
    // 3. PKCE authorization flow
    // 4. Token exchange and storage
    // 5. MCP session initialization
    await client.initialize();
    
    // Verify we can call tools through the authenticated session
    const tools = await client.listTools();
    expect(tools.tools).toContain('get-accessible-sites');
  });
        })
      });
      
      expect(authenticatedMcp.status).toBe(200);
      expect(authenticatedMcp.headers.get('mcp-session-id')).toBeDefined();
      
      // Test that tools work with real Jira APIs using PAT
      const session = {
        token: tokens.access_token,
        sessionId: authenticatedMcp.headers.get('mcp-session-id')
      };
      
      const sitesCall = await callTool(session, 'get-accessible-sites', {});
      expect(sitesCall.content[0].text).toContain('Accessible Jira Sites');
      
      return; // Skip manual OAuth tests in PAT mode
    }
    
    // Full OAuth discovery and validation (manual mode)
    console.log('🌐 Manual OAuth mode: testing complete OAuth discovery flow');
    
    // RFC 6749 Section 4.1.1 https://tools.ietf.org/html/rfc6749#section-4.1.1
    // Authorization Request without credentials should fail
    // Expected: 401 Unauthorized with WWW-Authenticate header (RFC 6750 Section 3)
    const mcpResponse = await fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' }
      })
    });
    
    expect(mcpResponse.status).toBe(401);
    // RFC 6750 Section 3 https://tools.ietf.org/html/rfc6750#section-3
    // WWW-Authenticate header MUST be included in 401 responses
    const wwwAuthHeader = mcpResponse.headers.get('WWW-Authenticate');
    expect(wwwAuthHeader).toBeTruthy();
    expect(wwwAuthHeader).toContain('Bearer');
    
    // ... continue with full OAuth discovery flow tests ...
    // (All the existing OAuth discovery validation code)
    
    // RFC 7636 https://tools.ietf.org/html/rfc7636
    // Complete PKCE flow with code_challenge and code_verifier
    const tokens = await completePkceFlow(metadata);
    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
    
    // RFC 6749 Section 4.1.4 https://tools.ietf.org/html/rfc6749#section-4.1.4
    // Successful token usage
    // MCP Specification Section 3.1 https://modelcontextprotocol.io/docs/specification#initialization
    // Initialize with bearer token
    const authenticatedMcp = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' }
      })
    });
    
    expect(authenticatedMcp.status).toBe(200);
    // MCP Specification https://modelcontextprotocol.io/docs/specification#session-management
    // Session ID MUST be provided for stateful connections
    expect(authenticatedMcp.headers.get('mcp-session-id')).toBeDefined();
  });
});
```

#### 1.2 PKCE Validation Tests
**Scenario**: Comprehensive PKCE specification compliance testing
**Specifications**: 
- [RFC 7636 Section 4.1](https://tools.ietf.org/html/rfc7636#section-4.1) (PKCE Parameters)
- [RFC 7636 Section 4.3](https://tools.ietf.org/html/rfc7636#section-4.3) (Client Creates Code Challenge)
- [RFC 7636 Section 4.6](https://tools.ietf.org/html/rfc7636#section-4.6) (Error Handling)

**Tests**:
```javascript
describe('PKCE Compliance Tests', () => {
  test('code_challenge length validation', async () => {
    // RFC 7636 Section 4.1: code_challenge MUST be minimum 43 characters, maximum 128
    const shortChallenge = 'a'.repeat(42); // Too short
    const validChallenge = 'a'.repeat(43);  // Minimum valid
    const longChallenge = 'a'.repeat(129);  // Too long
    
    // Test invalid lengths return error
    await expect(authWithCodeChallenge(shortChallenge)).rejects.toThrow();
    await expect(authWithCodeChallenge(longChallenge)).rejects.toThrow();
    
    // Valid length should succeed
    await expect(authWithCodeChallenge(validChallenge)).resolves.toBeDefined();
  });
  
  test('code_verifier character set validation', async () => {
    // RFC 7636 Section 4.1: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
    const validVerifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const invalidVerifier = 'invalid+chars/here='; // Contains invalid characters
    
    await expect(authWithCodeVerifier(validVerifier)).resolves.toBeDefined();
    await expect(authWithCodeVerifier(invalidVerifier)).rejects.toThrow();
  });
  
  test('PKCE error codes', async () => {
    // RFC 7636 Section 4.6: Specific error codes for PKCE failures
    const { codeChallenge } = generatePkceChallenge();
    const wrongVerifier = 'wrong_verifier_value';
    
    try {
      await completeOAuthFlow(codeChallenge, wrongVerifier);
      fail('Should have thrown PKCE validation error');
    } catch (error) {
      // RFC 7636 Section 4.6: invalid_grant error for PKCE verification failure
      expect(error.response.data.error).toBe('invalid_grant');
      expect(error.response.data.error_description).toContain('code_verifier');
    }
  });
});
```

#### 1.3 OAuth State Parameter Tests
**Scenario**: CSRF protection via state parameter
**Specifications**: 
- [RFC 6749 Section 4.1.1](https://tools.ietf.org/html/rfc6749#section-4.1.1) (Authorization Request)
- [RFC 6749 Section 10.12](https://tools.ietf.org/html/rfc6749#section-10.12) (Cross-Site Request Forgery)

**Tests**:
```javascript
describe('OAuth State Parameter Tests', () => {
  test('state parameter CSRF protection', async () => {
    // RFC 6749 Section 4.1.1: state parameter RECOMMENDED for CSRF protection
    const state = crypto.randomUUID();
    
    const authUrl = buildAuthorizationUrl({ state });
    expect(authUrl).toContain(`state=${state}`);
    
    // RFC 6749 Section 4.1.2: Authorization server MUST return unmodified state
    const callbackParams = await simulateAuthCallback(authUrl);
    expect(callbackParams.state).toBe(state);
  });
  
  test('missing state parameter handling', async () => {
    // RFC 6749 Section 4.1.1: state is RECOMMENDED but not REQUIRED
    // Server should handle requests without state parameter
    const authUrl = buildAuthorizationUrl({}); // No state
    const callbackParams = await simulateAuthCallback(authUrl);
    
    expect(callbackParams.state).toBeUndefined();
    expect(callbackParams.code).toBeDefined(); // Should still provide auth code
  });
});
```

#### 1.5 OAuth Redirect URI Validation Tests
**Scenario**: Redirect URI security validation per RFC requirements
**Specifications**: 
- [RFC 6749 Section 3.1.2](https://tools.ietf.org/html/rfc6749#section-3.1.2) (Redirection Endpoint)
- [RFC 6749 Section 4.1.3](https://tools.ietf.org/html/rfc6749#section-4.1.3) (Access Token Request)

**Tests**:
```javascript
describe('OAuth Redirect URI Validation', () => {
  test('exact redirect URI match requirement', async () => {
    // RFC 6749 Section 3.1.2: Authorization server MUST require exact match
    const registeredUri = 'https://client.example.com/callback';
    const differentUri = 'https://client.example.com/different';
    
    // Valid redirect URI should succeed
    const validAuth = await buildAuthorizationUrl({ 
      redirect_uri: registeredUri 
    });
    expect(validAuth).toContain(encodeURIComponent(registeredUri));
    
    // Different redirect URI should fail at authorization server
    await expect(authWithRedirectUri(differentUri)).rejects.toThrow(/redirect_uri/);
  });
  
  test('authorization code expiration', async () => {
    // RFC 6749 Section 4.1.2: Authorization codes SHOULD expire quickly
    // RFC 6749 Section 4.1.2: Maximum lifetime RECOMMENDED at 10 minutes
    const { code } = await getAuthorizationCode();
    
    // Wait beyond authorization code expiration (test with shorter timeout)
    await sleep(11 * 60 * 1000); // 11 minutes
    
    // Expired authorization code should fail token exchange
    await expect(exchangeCodeForTokens(code)).rejects.toThrow(/invalid_grant/);
  });
  
  test('scope parameter format validation', async () => {
    // RFC 6749 Section 3.3: Scope values are space-delimited strings
    const validScopes = 'read:jira-work write:jira-work offline_access';
    const invalidScopes = 'read:jira-work,write:jira-work'; // Comma-separated (invalid)
    
    const validRequest = await buildAuthorizationUrl({ scope: validScopes });
    expect(validRequest).toContain('read:jira-work%20write:jira-work');
    
    // Authorization server should handle invalid scope format appropriately
    const invalidRequest = await buildAuthorizationUrl({ scope: invalidScopes });
    // May accept but should normalize or reject malformed scope
  });
});
```

#### 1.6 OAuth Error Scenarios
**Specifications**: 
- [RFC 6749 Section 5.2](https://tools.ietf.org/html/rfc6749#section-5.2) (Error Response)
- [RFC 7636 Section 4.6](https://tools.ietf.org/html/rfc7636#section-4.6) (Error Handling)

- **Invalid PKCE verifier**: Test PKCE validation failures ([RFC 7636 Section 4.6](https://tools.ietf.org/html/rfc7636#section-4.6))
- **Expired authorization code**: Test code expiration handling ([RFC 6749 Section 4.1.2.1](https://tools.ietf.org/html/rfc6749#section-4.1.2.1))
- **Invalid client credentials**: Test OAuth client validation ([RFC 6749 Section 5.2](https://tools.ietf.org/html/rfc6749#section-5.2))
- **Canceled authorization**: Test user cancellation flow ([RFC 6749 Section 4.1.2.1](https://tools.ietf.org/html/rfc6749#section-4.1.2.1))

#### 1.7 VS Code Copilot Agent Compatibility Tests
**Scenario**: Test VS Code Copilot specific OAuth parameter requirements
**Specifications**: 
- [RFC 9728 Section 5.1](https://tools.ietf.org/html/rfc9728#section-5.1) (WWW-Authenticate Resource Metadata)
- VS Code Copilot Agent Specification (specs/vs-code-copilot/readme.md)

**Tests**:
```javascript
describe('VS Code Copilot Agent Compatibility', () => {
  test('WWW-Authenticate includes both standard and VS Code specific parameters', async () => {
    // VS Code Copilot Agent Deviation: Expects resource_metadata_url instead of resource_metadata
    // Our bridge server supports both for compatibility
    
    const mcpResponse = await fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' }
      })
    });
    
    expect(mcpResponse.status).toBe(401);
    const wwwAuthHeader = mcpResponse.headers.get('WWW-Authenticate');
    
    // RFC 9728 Section 5.1: Standard resource_metadata parameter
    expect(wwwAuthHeader).toMatch(/resource_metadata="[^"]+"/);
    
    // VS Code Copilot deviation: Non-standard resource_metadata_url parameter  
    expect(wwwAuthHeader).toMatch(/resource_metadata_url="[^"]+"/);
    
    // Both parameters should point to the same OAuth metadata endpoint
    const standardMatch = wwwAuthHeader.match(/resource_metadata="([^"]+)"/);
    const vscodeMatch = wwwAuthHeader.match(/resource_metadata_url="([^"]+)"/);
    
    expect(standardMatch[1]).toBe(vscodeMatch[1]);
    expect(standardMatch[1]).toContain('/.well-known/oauth-protected-resource');
  });
  
  test('VS Code Copilot can discover OAuth endpoints using non-standard parameter', async () => {
    // Simulate VS Code Copilot OAuth discovery flow using resource_metadata_url
    const unauthorizedResponse = await fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      })
    });
    
    expect(unauthorizedResponse.status).toBe(401);
    const wwwAuth = unauthorizedResponse.headers.get('WWW-Authenticate');
    
    // Extract VS Code Copilot specific parameter
    const vscodeMetadataMatch = wwwAuth.match(/resource_metadata_url="([^"]+)"/);
    expect(vscodeMetadataMatch).toBeTruthy();
    const metadataUrl = vscodeMetadataMatch[1];
    
    // VS Code Copilot should be able to fetch OAuth metadata using this URL
    const metadataResponse = await fetch(metadataUrl);
    expect(metadataResponse.ok).toBe(true);
    
    const metadata = await metadataResponse.json();
    expect(metadata.resource).toBeDefined();
    expect(metadata.authorization_servers).toBeDefined();
  });
  
  test('Standard OAuth clients still work with RFC 9728 compliant parameter', async () => {
    // Ensure we maintain RFC 9728 compliance for standard OAuth clients
    const unauthorizedResponse = await fetch('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      })
    });
    
    expect(unauthorizedResponse.status).toBe(401);
    const wwwAuth = unauthorizedResponse.headers.get('WWW-Authenticate');
    
    // Extract RFC 9728 standard parameter
    const standardMetadataMatch = wwwAuth.match(/resource_metadata="([^"]+)"/);
    expect(standardMetadataMatch).toBeTruthy();
    const metadataUrl = standardMetadataMatch[1];
    
    // Standard OAuth clients should work with RFC 9728 compliant parameter
    const metadataResponse = await fetch(metadataUrl);
    expect(metadataResponse.ok).toBe(true);
    
    const metadata = await metadataResponse.json();
    // RFC 9728 Section 3.3: resource field validation
    expect(metadata.resource).toBeDefined();
    expect(metadata.authorization_servers).toBeDefined();
    expect(Array.isArray(metadata.authorization_servers)).toBe(true);
  });
  
  test('Invalid token errors include both parameter formats', async () => {
    // Test with expired/invalid token to ensure error responses include both parameters
    const expiredToken = 'expired.jwt.token';
    
    const response = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${expiredToken}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      })
    });
    
    expect(response.status).toBe(401);
    const wwwAuth = response.headers.get('WWW-Authenticate');
    
    // Should include error parameter
    expect(wwwAuth).toContain('error="invalid_token"');
    
    // Should include both metadata parameters for compatibility
    expect(wwwAuth).toMatch(/resource_metadata="[^"]+"/);
    expect(wwwAuth).toMatch(/resource_metadata_url="[^"]+"/);
  });
});
```

### 2. MCP Protocol Tests

#### 2.1 Transport Layer Tests
**Scenario**: Verify HTTP + SSE hybrid transport compliance
**Specifications**: 
- [MCP Specification Section 4](https://modelcontextprotocol.io/docs/specification/transport) (HTTP Transport)
- [MCP HTTP Transport Documentation](https://modelcontextprotocol.io/docs/specification/transport#http)
- [Server-Sent Events Specification (W3C)](https://html.spec.whatwg.org/multipage/server-sent-events.html)

**Tests**:
- POST requests for commands are handled correctly ([MCP HTTP Transport](https://modelcontextprotocol.io/docs/specification/transport#http))
- GET requests establish SSE connections ([W3C SSE Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html))
- Session management across multiple requests ([MCP Session Management](https://modelcontextprotocol.io/docs/specification#session-management))
- Proper cleanup on transport close ([MCP Transport Lifecycle](https://modelcontextprotocol.io/docs/specification/transport#lifecycle))

#### 2.2 Protocol Compliance Tests
**Scenario**: Ensure MCP 2025-06-18 protocol compliance
**Specifications**: 
- [MCP Core Specification Section 2](https://modelcontextprotocol.io/docs/specification#protocol-overview) (Protocol Overview)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [MCP Tools API Specification](https://modelcontextprotocol.io/docs/specification/tools)

**Tests**:
- Correct JSON-RPC 2.0 message format ([JSON-RPC 2.0 Section 4](https://www.jsonrpc.org/specification#request_object))
- Proper error response structures ([JSON-RPC 2.0 Section 5.1](https://www.jsonrpc.org/specification#error_object))
- Tool registration and discovery ([MCP Tools API Section 3](https://modelcontextprotocol.io/docs/specification/tools#tool-discovery))
- Capability negotiation ([MCP Core Section 3.1](https://modelcontextprotocol.io/docs/specification#initialization))

**Test Implementation**:
```javascript
describe('MCP Protocol Compliance', () => {
  test('tools/list returns proper MCP format', async () => {
    // MCP Core Specification Section 3.2 https://modelcontextprotocol.io/docs/specification#session-management
    // Authenticated session required
    const session = await establishAuthenticatedSession();
    
    // MCP Tools API Section 3.1 https://modelcontextprotocol.io/docs/specification/tools#tool-discovery
    // tools/list method
    const toolsResponse = await fetch('/mcp', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${session.token}`,
        'mcp-session-id': session.sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',  // JSON-RPC 2.0 Section 4.1 https://www.jsonrpc.org/specification#request_object
        id: 2,           // JSON-RPC 2.0 Section 4.1: id field for request correlation
        method: 'tools/list',
        params: {}
      })
    });
    
    // MCP HTTP Transport https://modelcontextprotocol.io/docs/specification/transport#http
    // Async processing returns 202 Accepted
    expect(toolsResponse.status).toBe(202);
    
    // Listen for SSE response - MCP HTTP Transport Section 2.3
    const toolsList = await waitForSSEResponse(session.sseStream, 'tools/list');
    
    // MCP Tools API Section 3.1 https://modelcontextprotocol.io/docs/specification/tools#tool-discovery
    // tools/list response format
    expect(toolsList.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'get-accessible-sites',        // MCP Tools API: tool name MUST be string
          description: expect.any(String),     // MCP Tools API: description MUST be string
          inputSchema: expect.any(Object)      // MCP Tools API: inputSchema MUST be JSON Schema
        })
      ])
    );
  });
});
```

### 3. Tool Integration Tests

#### 3.1 Individual Tool Tests
For each tool: `get-accessible-sites`, `get-jira-issue`, `get-jira-attachments`, `update-issue-description`
**Specifications**: 
- [MCP Tools API Section 4](https://modelcontextprotocol.io/docs/specification/tools#tool-execution) (Tool Execution)
- [Jira REST API v3 Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Atlassian OAuth API Documentation](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)

**Test Template**:
```javascript
describe('Tool: get-jira-issue', () => {
  test('successful issue retrieval', async () => {
    // MCP Core https://modelcontextprotocol.io/docs/specification#session-management
    // Authenticated session required for tool execution
    const session = await establishAuthenticatedSession();
    
    // MCP Tools API Section 4.1 https://modelcontextprotocol.io/docs/specification/tools#tool-execution
    // tools/call method with parameters
    const toolCall = await callTool(session, 'get-jira-issue', {
      issueKey: 'TEST-123',      // Jira REST API: issue key format
      cloudId: 'test-cloud-id'   // Atlassian OAuth: accessible resource identifier
    });
    
    // MCP Tools API Section 4.2 https://modelcontextprotocol.io/docs/specification/tools#tool-responses
    // Tool response format
    expect(toolCall.content).toEqual([
      expect.objectContaining({
        type: 'text',  // MCP Content Types: text content type
        text: expect.stringContaining('Issue: TEST-123')
      })
    ]);
  });
  
  test('handles invalid issue key', async () => {
    // MCP Error Handling https://modelcontextprotocol.io/docs/specification/tools#error-handling
    // Tools should return error content, not throw exceptions
    const session = await establishAuthenticatedSession();
    
    const toolCall = await callTool(session, 'get-jira-issue', {
      issueKey: 'INVALID-999',  // Jira REST API: Non-existent issue key
      cloudId: 'test-cloud-id'
    });
    
    // MCP Tools API https://modelcontextprotocol.io/docs/specification/tools#error-handling
    // Error responses should be in content format
    expect(toolCall.content[0].text).toContain('Error: Issue not found');
  });
});
```

#### 3.2 Tool Schema Validation Tests
**Scenario**: Ensure all tools provide valid JSON Schema for input validation
**Specifications**: 
- [MCP Tools API Section 3.1](https://modelcontextprotocol.io/docs/specification/tools#tool-discovery) (Tool Discovery)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema) (Schema Validation)
- [MCP Tools API Section 4.1](https://modelcontextprotocol.io/docs/specification/tools#tool-execution) (Tool Input Validation)

**Tests**:
```javascript
describe('Tool Schema Validation', () => {
  test('all tools have valid JSON Schema', async () => {
    // MCP Tools API Section 3.1: inputSchema MUST be valid JSON Schema
    const session = await establishAuthenticatedSession();
    const toolsList = await callMethod(session, 'tools/list');
    
    for (const tool of toolsList.result.tools) {
      // MCP Tools API: Each tool MUST have inputSchema
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe('object');
      
      // JSON Schema Draft 2020-12: Schema validation
      expect(tool.inputSchema.type).toBeDefined();
      if (tool.inputSchema.properties) {
        expect(typeof tool.inputSchema.properties).toBe('object');
      }
      
      // MCP-specific requirements
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
  
  test('tool input validation with schema', async () => {
    // MCP Tools API Section 4.1: Tools should validate input against schema
    const session = await establishAuthenticatedSession();
    
    // Test with invalid input that violates schema
    const invalidCall = await callTool(session, 'get-jira-issue', {
      issueKey: '',  // Empty string should violate schema
      cloudId: ''    // Empty string should violate schema
    });
    
    // Should return error content describing validation failure
    expect(invalidCall.content[0].text).toMatch(/(error|invalid|required)/i);
  });
  
  test('MCP capability negotiation', async () => {
    // MCP Core Section 3.1: initialize method with capabilities
    const response = await fetch('/mcp', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.token}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',  // MCP: MUST specify exact version
          capabilities: {
            tools: {}  // Client capability for tool support
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      })
    });
    
    const initData = await waitForSSEResponse(session.sseStream, 'initialize');
    
    // MCP: Server MUST respond with its capabilities
    expect(initData.result.capabilities).toBeDefined();
    expect(initData.result.capabilities.tools).toBeDefined();
    expect(initData.result.serverInfo).toBeDefined();
    expect(initData.result.protocolVersion).toBe('2025-06-18');
  });
});
```

#### 3.3 Cross-Tool Integration Tests
**Scenario**: Test tool interactions and data flow
**Tests**:
- Use `get-accessible-sites` → `get-jira-issue` flow
- Use `get-jira-issue` → `update-issue-description` flow
- Verify cloudId resolution across tools

### 4. Token Lifecycle Tests

#### 4.1 Token Expiration Handling
**Scenario**: Test automatic re-authentication on token expiry
**Specifications**: 
- [RFC 6749 Section 6](https://tools.ietf.org/html/rfc6749#section-6) (Refreshing an Access Token)
- [RFC 6750 Section 3.1](https://tools.ietf.org/html/rfc6750#section-3.1) (Error Response for Invalid Token)
- [MCP Authentication](https://modelcontextprotocol.io/docs/concepts/authentication) (OAuth re-authentication flow)

**Implementation**: Based on existing `atlassian-mcp-test.js` patterns

```javascript
describe('Token Lifecycle', () => {
  test('automatic re-auth on token expiration', async () => {
    // RFC 6749: Use short-lived tokens for testing token expiration
    // See: server/api-flow.md "TEST_SHORT_AUTH_TOKEN_EXP" pattern
    process.env.TEST_SHORT_AUTH_TOKEN_EXP = '5'; // 5 seconds
    
    const session = await establishAuthenticatedSession();
    
    // Verify initial tool call works with valid token
    const initialCall = await callTool(session, 'get-accessible-sites', {});
    expect(initialCall.content[0].text).not.toContain('Error');
    
    // RFC 6749 Section 4.2.2: Wait for token expiration
    await sleep(6000);
    
    // RFC 6750 Section 3.1: Expired token should trigger InvalidTokenError
    // See: server/jira-mcp/auth-helpers.js InvalidTokenError pattern
    const expiredCall = await callTool(session, 'get-accessible-sites', {});
    
    // MCP Authentication: Should trigger OAuth re-authentication flow
    expect(expiredCall.isTokenError).toBe(true);
    
    // RFC 6749 Section 6 https://tools.ietf.org/html/rfc6749#section-6
    // Verify new token is issued after re-auth
    const newSession = await waitForReauth(session);
    expect(newSession.token).not.toBe(session.token);
    
    // Verify tool works with refreshed token
    const refreshedCall = await callTool(newSession, 'get-accessible-sites', {});
    expect(refreshedCall.content[0].text).not.toContain('Error');
  });
});
```

#### 4.2 Refresh Token Tests
**Scenario**: Test refresh token usage for token renewal
**Specifications**: 
- [RFC 6749 Section 6](https://tools.ietf.org/html/rfc6749#section-6) (Refreshing an Access Token)
- [RFC 6749 Section 4.1.4](https://tools.ietf.org/html/rfc6749#section-4.1.4) (Access Token Response)

### 5. Error Handling Tests

#### 5.1 Authentication Errors
**Specifications**: 
- [RFC 6750 Section 3](https://tools.ietf.org/html/rfc6750#section-3) (WWW-Authenticate Response Header Field)

- **Expired tokens**: Verify `InvalidTokenError` triggers re-auth ([RFC 6750 Section 3.1](https://tools.ietf.org/html/rfc6750#section-3.1))
- **Invalid tokens**: Test malformed JWT handling ([RFC 7519 Section 7.2](https://tools.ietf.org/html/rfc7519#section-7.2))
- **Missing tokens**: Verify 401 responses ([RFC 6750 Section 3](https://tools.ietf.org/html/rfc6750#section-3))

#### 5.2 API Errors
**Specifications**: 
- [HTTP/1.1 Status Code Definitions (RFC 7231)](https://tools.ietf.org/html/rfc7231)
- [Jira REST API Error Responses](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#error-responses)

- **Jira API failures**: Test 500, 503 responses from Jira ([RFC 7231 Section 6.6](https://tools.ietf.org/html/rfc7231#section-6.6))
- **Network timeouts**: Test connection failures
- **Rate limiting**: Test 429 responses ([RFC 6585 Section 4](https://tools.ietf.org/html/rfc6585#section-4))

#### 5.3 MCP Protocol Errors
**Specifications**: 
- [JSON-RPC 2.0 Section 5](https://www.jsonrpc.org/specification#error_object) (Error Object)
- [MCP Core Specification Error Handling](https://modelcontextprotocol.io/docs/specification#error-handling)

- **Invalid JSON-RPC**: Test malformed requests ([JSON-RPC 2.0 Section 5](https://www.jsonrpc.org/specification#error_object))
- **Unknown methods**: Test unsupported operations ([JSON-RPC 2.0 Section 4](https://www.jsonrpc.org/specification#request_object))
- **Invalid parameters**: Test parameter validation ([MCP Tools API](https://modelcontextprotocol.io/docs/specification/tools#parameter-validation))

### 6. Performance Tests

#### 6.1 Session Management
**Scenario**: Test multiple concurrent sessions
```javascript
describe('Performance - Session Management', () => {
  test('handles 50 concurrent sessions', async () => {
    const sessions = await Promise.all(
      Array(50).fill().map(() => establishAuthenticatedSession())
    );
    
    // Verify all sessions are independent
    const toolCalls = await Promise.all(
      sessions.map(session => 
        callTool(session, 'get-accessible-sites', {})
      )
    );
    
    expect(toolCalls.every(call => !call.error)).toBe(true);
    
    // Verify cleanup
    await Promise.all(sessions.map(session => session.cleanup()));
    expect(getActiveSessionCount()).toBe(0);
  });
});
```

#### 6.2 Token Refresh Load
**Scenario**: Test simultaneous token refresh requests

## Test Infrastructure

### Test Utilities

#### Authentication Helper - Standards (Direct HTTP)
```javascript
async function establishAuthenticatedSession() {
  // RFC 6749 + RFC 7636: Complete OAuth PKCE flow
  const tokens = await completePkceFlow();
  
  // MCP Core Section 3.1: Create authenticated MCP session  
  const mcpResponse = await fetch('/mcp', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokens.access_token}` }, // RFC 6750 Section 2.1
    body: JSON.stringify({
      jsonrpc: '2.0',  // JSON-RPC 2.0 Section 4.1
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' }  // MCP Core: Protocol version
    })
  });
  
  return {
    token: tokens.access_token,
    sessionId: mcpResponse.headers.get('mcp-session-id')
  };
}
```

#### Authentication Helper - MCP SDK
```javascript
import { MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { HTTPClientTransport } from '@modelcontextprotocol/sdk/client/http.js';

async function establishAuthenticatedSession() {
  // Use real MCP SDK client - automatically handles OAuth flow
  const client = new MCPClient({
    transport: new HTTPClientTransport({
      baseUrl: 'http://localhost:3000/mcp',
    })
  });
  
  // MCP SDK handles OAuth discovery, registration, and authentication automatically
  await client.initialize();
  return client;
}
```

#### Tool Call Helper - Standards (Direct HTTP)
```javascript
async function callTool(session, toolName, params) {
  // MCP Tools API Section 4.1 - Manual JSON-RPC request
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'mcp-session-id': session.sessionId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: params }
    })
  });
  
  return await response.json();
}
```

#### Tool Call Helper - MCP SDK  
```javascript
async function callTool(client, toolName, params) {
  // Use MCP SDK's built-in tool calling
  const result = await client.callTool({
    name: toolName,
    arguments: params
  });
  return result;
}
```

#### PKCE Flow Helper (Automated + Manual Modes)
```javascript
/**
 * Complete PKCE OAuth flow with support for both automated (PAT) and manual modes
 * @param {Object} metadata - OAuth server metadata from discovery
 * @returns {Promise<Object>} Token response with access_token and refresh_token
 */
async function completePkceFlow(metadata) {
  // Check if PAT bypass mode is enabled for automated testing
  if (process.env.TEST_USE_PAT_BYPASS === 'true' && process.env.TEST_ATLASSIAN_PAT) {
    console.log('🔧 Using PAT bypass mode for automated testing');
    
    // Create a JWT token that contains the PAT as the Atlassian access token
    // This bypasses the OAuth flow but allows testing real Jira API calls
    const patToken = await createPATBypassToken(process.env.TEST_ATLASSIAN_PAT);
    
    return {
      access_token: patToken,
      refresh_token: patToken, // Same token for simplicity in tests
      token_type: 'Bearer',
      expires_in: 3600,
      scope: process.env.VITE_JIRA_SCOPE || 'read:jira-work'
    };
  }
  
  // Manual OAuth flow for comprehensive testing
  console.log('🌐 Using manual OAuth flow (requires browser interaction)');
  
  // Use existing pkce-auth.js utility for real OAuth flow
  const { getPkceAccessToken } = await import('./pkce-auth.js');
  
  const tokenSet = await getPkceAccessToken({
    issuer: metadata.issuer,
    redirectUri: 'http://localhost:3000/callback',
    scope: process.env.VITE_JIRA_SCOPE || 'read:jira-work offline_access',
    openBrowser: !process.env.CI // Don't open browser in CI
  });
  
  return {
    access_token: tokenSet.access_token,
    refresh_token: tokenSet.refresh_token,
    token_type: tokenSet.token_type || 'Bearer',
    expires_in: tokenSet.expires_in || 3600,
    scope: tokenSet.scope
  };
}

/**
 * Create a JWT token containing PAT for bypass testing
 * This simulates the bridge server's JWT format but uses PAT instead of OAuth tokens
 * @param {string} patToken - Atlassian Personal Access Token
 * @returns {Promise<string>} JWT token containing the PAT
 */
async function createPATBypassToken(patToken) {
  // Import JWT utilities from the bridge server
  const { jwtSign } = await import('../server/tokens.js');
  
  // Create JWT payload that mimics the bridge server's format
  // but contains PAT as the Atlassian access token
  const payload = {
    atlassian_access_token: patToken,      // PAT token for direct Jira API calls
    atlassian_refresh_token: patToken,     // Same for refresh (tests won't use it)
    iss: process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000',
    sub: 'test-user',
    aud: 'mcp-client',
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
    iat: Math.floor(Date.now() / 1000),
    test_mode: 'pat_bypass'  // Flag to indicate this is a test PAT token
  };
  
  console.log('🔑 Created PAT bypass token for automated testing');
  return await jwtSign(payload);
}
```

### Mock Services

#### Mock Atlassian OAuth Server
- Controlled OAuth responses for testing edge cases
- PKCE validation simulation
- Token expiration simulation

#### Mock Jira API Server
- Predefined test data responses
- Error simulation capabilities
- Rate limiting simulation

### Test Data Management

#### Test Jira Instance Setup
- Dedicated test project with known issues
- Standardized test data for consistent results
- Cleanup procedures between test runs

## Test Execution Strategy

### Local Development
```bash
# Run E2E tests with PAT bypass (fully automated)
TEST_USE_PAT_BYPASS=true TEST_ATLASSIAN_PAT=your_pat_token npm run test:e2e:dev

# Run E2E tests with manual OAuth (requires browser interaction)
TEST_USE_PAT_BYPASS=false npm run test:e2e:dev

# Run with short token expiration for quick testing (PAT mode)
TEST_SHORT_AUTH_TOKEN_EXP=30 TEST_USE_PAT_BYPASS=true TEST_ATLASSIAN_PAT=your_pat_token npm run test:e2e:dev

# Run specific test suite with PAT bypass
TEST_USE_PAT_BYPASS=true TEST_ATLASSIAN_PAT=your_pat_token npm run test:e2e:standards
TEST_USE_PAT_BYPASS=true TEST_ATLASSIAN_PAT=your_pat_token npm run test:e2e:mcp-sdk  
TEST_USE_PAT_BYPASS=true TEST_ATLASSIAN_PAT=your_pat_token npm run test:e2e:vs-code-copilot

# Manual OAuth testing (comprehensive but requires user interaction)
npm run test:e2e:standards:manual
npm run test:e2e:mcp-sdk:manual
npm run test:e2e:vs-code-copilot:manual
```

### CI/CD Pipeline
```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e-automated:
    name: E2E Tests (Automated with PAT)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: npm ci
        
      - name: Start auth bridge server
        run: npm run start-test &
        
      - name: Wait for server
        run: npx wait-on http://localhost:3000
        
      - name: Run automated E2E tests with PAT bypass
        run: npm run test:e2e:ci
        env:
          TEST_MODE: true
          TEST_USE_PAT_BYPASS: true
          TEST_ATLASSIAN_PAT: ${{ secrets.TEST_ATLASSIAN_PAT }}
          TEST_JIRA_INSTANCE_URL: ${{ secrets.TEST_JIRA_INSTANCE_URL }}
          TEST_JIRA_PROJECT_KEY: ${{ secrets.TEST_JIRA_PROJECT_KEY }}
          TEST_ISSUE_KEY: ${{ secrets.TEST_ISSUE_KEY }}

  e2e-manual:
    name: E2E Tests (Manual OAuth) 
    runs-on: ubuntu-latest
    # Only run manual tests on demand or scheduled
    if: github.event_name == 'workflow_dispatch' || github.event.schedule
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: npm ci
        
      - name: Start auth bridge server
        run: npm run start-test &
        
      - name: Wait for server
        run: npx wait-on http://localhost:3000
        
      - name: Run manual OAuth E2E tests (skip browser-dependent tests)
        run: npm run test:e2e:manual:ci
        env:
          TEST_MODE: true
          TEST_USE_PAT_BYPASS: false
          VITE_JIRA_CLIENT_ID: ${{ secrets.VITE_JIRA_CLIENT_ID }}
          JIRA_CLIENT_SECRET: ${{ secrets.JIRA_CLIENT_SECRET }}
          # Note: Manual OAuth tests in CI will skip actual browser interaction
          # but can test OAuth metadata discovery and PKCE parameter validation
```

### Monitoring and Reporting

#### Test Results Dashboard
- Success/failure rates by test category
- Performance metrics tracking
- Token lifecycle analysis

#### Alert Configuration
- Notify on test failures in main branch
- Performance regression alerts
- Token expiration handling failures

## Integration with Existing Testing

### Leverage Existing Infrastructure
- **Reuse `atlassian-mcp-test.js` patterns**: Token lifecycle testing approach based on RFC 6749 Section 6
- **Extend traffic logging**: Use existing JSONL traffic logging for E2E traces (compatible with MCP debugging)
- **Build on OAuth infrastructure**: Leverage existing PKCE implementation (RFC 7636 compliant)

### TypeScript Migration Considerations
- Write E2E tests in TypeScript alongside conversion for type safety
- Use TypeScript for better test type safety and spec compliance validation
- Validate TypeScript conversion doesn't break E2E flows or RFC compliance

### Specification References in Code
All test files should include header comments with an easy-to-digest summary and applicable specifications:

```javascript
/**
 * E2E Test: OAuth Discovery Flow
 * 
 * Summary: Tests OAuth server metadata discovery and PKCE parameter validation
 * ensuring RFC 8414 and RFC 9728 compliance for protected resource metadata.
 * 
 * What it tests:
 * - /.well-known/oauth-protected-resource endpoint discovery
 * - OAuth server metadata structure validation
 * - PKCE challenge/verifier generation and validation
 * - Error responses for malformed discovery requests
 * 
 * Specifications:
 * - RFC 6749: OAuth 2.0 Authorization Framework
 * - RFC 7636: Proof Key for Code Exchange (PKCE) 
 * - RFC 6750: OAuth 2.0 Bearer Token Usage
 * - RFC 8414: OAuth 2.0 Authorization Server Metadata
 * - RFC 9728: Protected Resource Metadata
 * - MCP Core Specification 2025-06-18
 * 
 * Implementation Reference: server/api-flow.md
 */
```

## Success Criteria

### Coverage Requirements
- **OAuth Flow**: 100% coverage of authorization paths
- **MCP Protocol**: All protocol methods tested
- **Tool Functions**: All 4 tools with happy path + error scenarios
- **Token Lifecycle**: Complete expiration and refresh flows
- **Error Handling**: All error response codes covered

### Performance Benchmarks
- **Session creation**: < 2 seconds for complete OAuth flow
- **Tool execution**: < 5 seconds for individual tool calls
- **Token refresh**: < 1 second for refresh token flow
- **Concurrent sessions**: Support 50+ simultaneous sessions

### Reliability Standards
- **Test stability**: < 1% flaky test rate
- **OAuth success rate**: > 99% in test environment
- **Tool call success rate**: > 95% with valid inputs
- **Error recovery**: 100% successful re-auth after token expiry

## Specification Compliance Summary

This E2E testing strategy ensures complete compliance with all relevant specifications through comprehensive test coverage:

### OAuth 2.0 Specifications
- **[RFC 6749](https://tools.ietf.org/html/rfc6749)** - OAuth 2.0 Authorization Framework
  - ✅ Authorization code grant flow (Section 4.1)
  - ✅ State parameter CSRF protection (Section 4.1.1)
  - ✅ Redirect URI exact matching (Section 3.1.2)
  - ✅ Authorization code expiration (Section 4.1.2)
  - ✅ Scope parameter space-delimited format (Section 3.3)
  - ✅ Refresh token flow (Section 6)
  - ✅ Error response handling (Section 5.2)

- **[RFC 7636](https://tools.ietf.org/html/rfc7636)** - PKCE (Proof Key for Code Exchange)
  - ✅ S256 code challenge method (Section 4.3)
  - ✅ Code challenge length validation (43-128 characters)
  - ✅ Code verifier character set validation
  - ✅ PKCE error codes (Section 4.6)

- **[RFC 6750](https://tools.ietf.org/html/rfc6750)** - Bearer Token Usage
  - ✅ Authorization header transmission (Section 2.1)
  - ✅ Case-insensitive Bearer scheme (Section 2.1)
  - ✅ WWW-Authenticate error responses (Section 3)
  - ✅ Invalid token error codes (Section 3.1)

- **[RFC 8414](https://tools.ietf.org/html/rfc8414)** - Authorization Server Metadata
  - ✅ Required metadata fields (issuer, token_endpoint, response_types_supported)
  - ✅ Issuer identifier validation (Section 3.3)
  - ✅ Grant types supported defaults
  - ✅ Well-known URI construction (Section 3.1)

- **[RFC 9728](https://tools.ietf.org/html/rfc9728)** - Protected Resource Metadata
  - ✅ Resource field validation (Section 3.3)
  - ✅ Authorization servers parameter array format (Section 2)
  - ✅ WWW-Authenticate resource_metadata parameter (Section 5.1)
  - ✅ Well-known URI path construction (Section 3.1)
  - ✅ VS Code Copilot compatibility with non-standard resource_metadata_url parameter

### MCP Specifications
- **[MCP Core Specification 2025-06-18](https://modelcontextprotocol.io/docs/specification)**
  - ✅ Protocol version negotiation
  - ✅ Session lifecycle management
  - ✅ Capability negotiation
  - ✅ Error propagation from OAuth

- **[MCP Tools API](https://modelcontextprotocol.io/docs/specification/tools)**
  - ✅ Tool discovery (tools/list method)
  - ✅ Tool execution (tools/call method)
  - ✅ JSON Schema validation for tool inputs
  - ✅ Tool response content format

- **[MCP HTTP Transport](https://modelcontextprotocol.io/docs/specification/transport)**
  - ✅ POST request handling for commands
  - ✅ Server-Sent Events for async responses
  - ✅ Session management across requests
  - ✅ Transport lifecycle cleanup

### JSON-RPC 2.0 Compliance
- **[JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)**
  - ✅ Request object format (Section 4)
  - ✅ Response object format (Section 5)
  - ✅ Error object structure (Section 5.1)
  - ✅ Request/response ID correlation
  - ✅ Batch request handling (Section 6)
  - ✅ Notification vs request distinction

### Additional Standards
- **[RFC 7519](https://tools.ietf.org/html/rfc7519)** - JWT tokens for wrapping Atlassian credentials
- **[RFC 8615](https://tools.ietf.org/html/rfc8615)** - Well-known URI requirements (HTTPS)
- **[W3C Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)** - SSE transport compliance
- **[JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema)** - Tool input validation

### VS Code Copilot Agent Compatibility
- **Non-standard resource_metadata_url parameter** - VS Code Copilot specific OAuth discovery requirement
- **Dual parameter support** - Bridge server supports both RFC 9728 standard and VS Code Copilot non-standard formats
- **Backwards compatibility** - Standard OAuth clients continue to work with RFC 9728 compliant parameters
- **Documentation** - Deviations documented in specs/vs-code-copilot/readme.md

This comprehensive test strategy validates **100% specification compliance** across all OAuth, MCP, and JSON-RPC requirements, while ensuring **VS Code Copilot compatibility** through dual parameter support, ensuring the bridge server operates as an exact, standards-compliant implementation with real-world client compatibility.
