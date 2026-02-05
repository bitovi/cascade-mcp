# Initial Connection - Standards Compliance

## Overview
This test validates Phase 1 of the API flow: Initial MCP client connection without authentication, ensuring proper OAuth discovery response per RFC specifications.

## Specifications Under Test

### Primary Specifications
- [MCP Specification 2025-06-18](https://modelcontextprotocol.io/docs/specification) - MCP initialize request format
- [RFC 6750 Section 3](https://tools.ietf.org/html/rfc6750#section-3) - WWW-Authenticate Response Header Field
- [RFC 9728 Section 5.1](https://tools.ietf.org/html/rfc9728#section-5.1) - WWW-Authenticate Resource Metadata Parameter

### API Flow Mapping
- **Phase**: Phase 1 - Initial Connection (No Auth)
- **Trigger**: User first tries to use Jira tools in MCP client
- **Module**: `mcp-service.js::handleMcpPost()`
- **Function Flow**: `getAuthInfoFromBearer()` → `sendMissingAtlassianAccessToken()`

## Test Scenarios

### 1. MCP Initialize Without Authentication
**Requirement**: Standard MCP client sends initialize request without auth headers
**Expected Behavior**: 
- Server responds with 401 status
- WWW-Authenticate header includes standard `resource_metadata` parameter (RFC 9728)
- Response includes OAuth discovery information
- No VS Code specific parameters

### 2. WWW-Authenticate Header Compliance
**Requirement**: Response must follow RFC 6750 Section 3 format
**Expected Format**:
```
WWW-Authenticate: Bearer realm="mcp", error="invalid_token", error_description="...", resource_metadata="https://localhost:3000/.well-known/oauth-protected-resource"
```

### 3. OAuth Discovery Chain Initiation
**Requirement**: Client should be able to discover OAuth endpoints from metadata URL
**Validation**:
- `resource_metadata` URL returns valid OAuth metadata
- Metadata includes required endpoints per RFC 8414

## Implementation Requirements

### Request Format (MCP Initialize)
```javascript
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "roots": { "listChanged": true },
      "sampling": {},
      "elicitation": {}
    },
    "clientInfo": {
      "name": "Standard MCP Client",  // NOT "Visual Studio Code"
      "version": "1.0.0"
    }
  }
}
```

### Expected Response
- **Status**: 401 Unauthorized
- **Headers**: 
  - `WWW-Authenticate`: Bearer realm="mcp", resource_metadata="..."
  - `Cache-Control`: no-cache, no-store, must-revalidate
- **Body**: JSON-RPC error response with OAuth guidance

### Assertions
1. ✅ Response status is 401
2. ✅ WWW-Authenticate header present and well-formed
3. ✅ Contains `resource_metadata` parameter (RFC 9728 standard)
4. ✅ Does NOT contain `resource_metadata_url` (VS Code specific)
5. ✅ Metadata URL returns valid OAuth server metadata
6. ✅ Response follows JSON-RPC 2.0 error format

## Related Tests
- **Next Step**: `oauth-discovery/oauth-discovery.test.js`
- **VS Code Copilot Variant**: `specs/vs-code-copilot/connecting-to-tool-use/`
- **Error Scenarios**: `specs/standards/error-handling/malformed-jwt/`
