# VS Code Copilot Agent Specification Deviations

## Overview

This document outlines the specific deviations and requirements that VS Code Copilot's MCP agent implementation has from the official OAuth and MCP specifications. These deviations require special handling in our bridge server to ensure compatibility.

## OAuth 2.0 Specification Deviations

### Resource Metadata Parameter Naming

**Official Specification**: [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://tools.ietf.org/html/rfc9728)

**Standard Parameter**: `resource_metadata`
- RFC 9728 Section 5.1 defines the `resource_metadata` parameter for WWW-Authenticate headers
- Used for OAuth protected resource discovery chain

**VS Code Copilot Deviation**: `resource_metadata_url`
- VS Code Copilot agent expects `resource_metadata_url` instead of the standard `resource_metadata`
- **Critical**: VS Code breaks when it sees both parameters in the same header
- This is a non-standard parameter name that deviates from RFC 9728

**Detection Methods**:
- HTTP User-Agent header: `"user-agent": "node"`
- MCP initialize request: `clientInfo.name === "Visual Studio Code"`

**Impact**: 
- Bridge server must detect VS Code clients using User-Agent and MCP clientInfo
- Send only `resource_metadata_url` for VS Code to avoid breaking their parser
- Send only `resource_metadata` for standard OAuth clients (RFC 9728 compliance)
- VS Code Copilot specifically requires `resource_metadata_url`

**Implementation Strategy**:
```javascript
// Detect VS Code by User-Agent header and MCP clientInfo
function isVSCodeClient(req) {
  // VS Code sends "user-agent": "node"
  if (req.headers['user-agent'] === 'node') return true;
  
  // VS Code MCP initialize includes clientInfo.name: "Visual Studio Code"
  if (req.body?.params?.clientInfo?.name === 'Visual Studio Code') return true;
  
  return false;
}

// Send appropriate parameter based on client type
const wwwAuthValue = isVSCodeClient(req)
  ? `Bearer realm="mcp", resource_metadata_url="${metadataUrl}"`     // VS Code only
  : `Bearer realm="mcp", resource_metadata="${metadataUrl}"`;       // RFC 9728 standard
```

## MCP Protocol Compatibility

### Transport Layer
- VS Code Copilot follows standard MCP HTTP transport requirements
- No deviations observed in JSON-RPC 2.0 message format
- Standard session management via `mcp-session-id` headers

### Authentication Flow
- Follows standard OAuth 2.0 bearer token transmission (RFC 6750 Section 2.1)
- Expects standard MCP authentication error responses
- **Deviation**: Requires non-standard `resource_metadata_url` parameter in WWW-Authenticate headers

## Testing Requirements

### VS Code Copilot Specific Tests
- Test that `resource_metadata_url` parameter is present in 401 responses
- Verify VS Code Copilot can successfully discover OAuth endpoints using non-standard parameter
- Validate that standard OAuth clients still work with `resource_metadata` parameter
- Ensure both parameters point to the same metadata endpoint

### Compatibility Testing
- Test against both VS Code Copilot agent and standard MCP clients
- Verify OAuth discovery works for both parameter formats
- Validate no conflicts arise from supporting both parameters

## Test Files in This Directory

This directory contains test files that validate VS Code Copilot specific deviations from standard OAuth and MCP specifications:

- **`connecting-to-tool-use/`** - Tests for OAuth discovery and session establishment that deviate from standards
  - `initial-connection.test.js` - Tests WWW-Authenticate header with `resource_metadata_url` parameter
  - `session-establishment.test.js` - Tests VS Code client detection via User-Agent and MCP clientInfo

## Compliance Notes

### RFC Adherence
- Our implementation maintains full RFC 9728 compliance by including the standard `resource_metadata` parameter for standard clients
- The additional `resource_metadata_url` parameter is an extension for VS Code Copilot compatibility
- No standard OAuth behavior is modified or broken

### Future Considerations
- Monitor VS Code Copilot updates for potential alignment with RFC 9728
- Consider submitting feedback to VS Code team about standard compliance
- Maintain backwards compatibility for existing VS Code Copilot deployments

## References

- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://tools.ietf.org/html/rfc9728)
- [RFC 6750 - OAuth 2.0 Bearer Token Usage](https://tools.ietf.org/html/rfc6750)
- [MCP Specification 2025-06-18](https://modelcontextprotocol.io/docs/specification)
- [VS Code Copilot MCP Documentation](https://code.visualstudio.com/docs/copilot/copilot-extensibility-overview)

## Change Log

- **2025-08-30**: Initial documentation of `resource_metadata_url` deviation
- **2025-08-30**: Implemented dual parameter support in bridge server
- **2025-08-30**: Reorganized into vs-code-copilot directory structure for E2E testing
