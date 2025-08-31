# OAuth 2.0 PKCE Authorization Server Module

This module implements a complete **OAuth 2.0 authorization server** that acts as a bridge between MCP (Model Context Protocol) clients (like VS Code Copilot) and Atlassian services. It supports the Proof Key for Code Exchange (PKCE) extension for enhanced security with public clients.

## Overview

The OAuth 2.0 PKCE module serves as a secure bridge that enables MCP clients to access Jira through proper OAuth authentication. The system handles the complete OAuth flow while embedding Atlassian credentials in JWT tokens for downstream use.

### Key Responsibilities

- **OAuth 2.0 Discovery**: Provides well-known endpoints for client discovery and metadata
- **Dynamic Client Registration**: Allows MCP clients to register themselves (RFC 7591)
- **Authorization Flow**: Handles the OAuth authorization code flow with PKCE
- **Token Exchange**: Exchanges authorization codes for JWT tokens containing Atlassian credentials
- **Session Management**: Manages OAuth state and PKCE parameters across the flow

## OAuth Flow Overview

The complete OAuth flow consists of these steps:

1. **Client Discovery**: `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`
2. **Dynamic Registration**: `/register` (creates client_id for MCP clients)
3. **Authorization**: `/authorize` (redirects to Atlassian with PKCE parameters)
4. **Callback**: `/callback` (receives auth code from Atlassian, handles MCP vs server PKCE)
5. **Token Exchange**: `/access-token` (exchanges code for JWT with embedded Atlassian tokens)

## Module Architecture

The OAuth implementation is split into specialized modules for maintainability and clear separation of concerns:

### Core Modules

#### [`types.ts`](./types.ts) - Type Definitions
- **Purpose**: TypeScript interfaces and type definitions for OAuth flow
- **Specifications**: RFC 6749, RFC 7636, RFC 7591, Express.js session extensions
- **Key Features**:
  - Express session data extensions for OAuth state management
  - OAuth handler function signatures for consistent implementation
  - Request/response type definitions for all grant types
  - Error response structures following OAuth 2.0 specification

#### [`discovery.ts`](./discovery.ts) - Discovery & Registration
- **Purpose**: OAuth server metadata and dynamic client registration
- **Specifications**: RFC 8414, RFC 9728, RFC 7591, MCP discovery patterns
- **Key Features**:
  - OAuth server metadata endpoint (`.well-known/oauth-authorization-server`)
  - Protected resource metadata for MCP clients (`.well-known/oauth-protected-resource`)
  - Dynamic client registration allowing MCP clients to obtain client_id
  - PKCE method advertisement and scope documentation

#### [`authorize.ts`](./authorize.ts) - Authorization Endpoint
- **Purpose**: Initiate OAuth flow with PKCE parameter handling
- **Specifications**: RFC 6749 (4.1.1), RFC 7636, RFC 8707, Atlassian OAuth patterns
- **Key Features**:
  - Accept authorization requests from MCP clients with PKCE
  - Validate and store MCP client parameters (client_id, redirect_uri, state)
  - Generate or passthrough PKCE code_challenge for Atlassian
  - Store OAuth session state for callback validation

#### [`callback.ts`](./callback.ts) - Authorization Callback
- **Purpose**: Handle OAuth callback from Atlassian authorization server
- **Specifications**: RFC 6749 (4.1.2), RFC 6749 (10.12), RFC 7636, manual flow detection
- **Key Features**:
  - Receive authorization code and state from Atlassian callback
  - Validate OAuth state parameter to prevent CSRF attacks
  - Handle MCP client PKCE flow by passing code back to MCP client
  - Clean up OAuth session state after successful callback

#### [`access-token.ts`](./access-token.ts) - Token Exchange Endpoint
- **Purpose**: Handle token exchange for authorization code and refresh token grants
- **Specifications**: RFC 6749 (3.2, 4.1.3, 6), RFC 7636, RFC 6750
- **Key Features**:
  - Handle authorization_code grant type with PKCE verification
  - Exchange authorization codes with Atlassian for access tokens
  - Create JWT access tokens embedding Atlassian credentials
  - Create JWT refresh tokens for token rotation
  - Return OAuth-compliant token responses

#### [`refresh-token.ts`](./refresh-token.ts) - Refresh Token Handler
- **Purpose**: Handle refresh token grant for renewing access tokens
- **Specifications**: RFC 6749 (6, 10.4), RFC 7519, Atlassian OAuth integration
- **Key Features**:
  - Verify and decode JWT refresh tokens from MCP clients
  - Extract embedded Atlassian refresh tokens from JWT payload
  - Exchange Atlassian refresh tokens for new access tokens
  - Create new JWT tokens with token rotation
  - Handle Atlassian API errors with OAuth-compliant responses

#### [`token-helpers.ts`](./token-helpers.ts) - JWT Token Utilities
- **Purpose**: Create and manage JWT tokens with embedded Atlassian credentials
- **Specifications**: RFC 7519, RFC 6749, MCP authentication requirements
- **Key Features**:
  - Create JWT access tokens with embedded `atlassian_access_token`
  - Create JWT refresh tokens with embedded `atlassian_refresh_token`
  - Calculate appropriate token expiration times (1 minute buffer)
  - Handle test mode short expiration for refresh flow testing
  - Maintain proper OAuth claims (aud, iss, sub, exp, scope)

## Specifications Implemented

This module implements several key OAuth 2.0 and related specifications:

### OAuth 2.0 Core and Extensions
- **[RFC 6749 - OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)** - Core OAuth 2.0 specification
- **[RFC 7636 - PKCE (Proof Key for Code Exchange)](https://tools.ietf.org/html/rfc7636)** - Security extension for public clients
- **[RFC 6750 - OAuth 2.0 Bearer Token Usage](https://tools.ietf.org/html/rfc6750)** - Bearer token specification
- **[RFC 7591 - Dynamic Client Registration](https://tools.ietf.org/html/rfc7591)** - For MCP client registration
- **[RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://tools.ietf.org/html/rfc8414)** - Discovery endpoints
- **[RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://tools.ietf.org/html/rfc9728)** - Resource discovery
- **[RFC 8707 - Resource Indicators for OAuth 2.0](https://tools.ietf.org/html/rfc8707)** - Resource parameter support

### JWT and Security Standards  
- **[RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)** - Token format for credential embedding
- **[RFC 7515 - JSON Web Signature (JWS)](https://tools.ietf.org/html/rfc7515)** - Token signature verification

### MCP Protocol Integration
- **[Model Context Protocol Specification](https://modelcontextprotocol.io/docs/specification)** - Core MCP specification
- **[MCP Authentication](https://modelcontextprotocol.io/docs/concepts/authentication)** - OAuth integration patterns

## Key Features

### PKCE Security Model
The implementation supports two PKCE modes:
- **MCP Client PKCE**: Uses PKCE parameters provided by MCP clients (preferred)
- **Server PKCE**: Fallback mode where server generates PKCE parameters

### JWT Token Structure
- **Access Tokens**: Embed Atlassian access tokens in JWT payload as `atlassian_access_token`
- **Refresh Tokens**: Embed Atlassian refresh tokens as `atlassian_refresh_token` with `type: 'refresh_token'`
- **Expiration Logic**: JWT expires 1 minute before underlying Atlassian token

### Session Management
- OAuth state and PKCE parameters stored in Express sessions
- Session cleanup after successful authorization flows
- Cross-Site Request Forgery (CSRF) protection via state validation

### Error Handling
- OAuth-compliant error responses following RFC 6750
- Proper error codes and descriptions for debugging
- Graceful handling of Atlassian API failures

## Integration Points

### Atlassian APIs
- **Token Exchange**: `https://auth.atlassian.com/oauth/token`
- **Sites API**: `https://api.atlassian.com/oauth/token/accessible-resources`
- **Jira REST API**: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`

### MCP Client Integration
- **Discovery**: Well-known endpoints for MCP client registration
- **Registration**: Dynamic client registration for VS Code and other MCP clients
- **Transport**: Full OAuth flow integration with MCP authentication

## Development Notes

### Testing Token Expiration
Set `TEST_SHORT_AUTH_TOKEN_EXP=60` to force 1-minute token expiration for testing refresh flows.

### Console Logging Format
- First console.log in a function: No additional indentation
- Subsequent console.logs: Message content has 2 additional spaces

### Critical Patterns
- Always use `InvalidTokenError` in MCP tools for automatic OAuth re-authentication
- Proper session lifecycle management with cleanup on transport close
- JWT token sanitization for secure logging

## Files and Functions

The module contains functions ordered by their usage in the OAuth flow:

- **Discovery Functions**: `oauthMetadata`, `oauthProtectedResourceMetadata`, `dynamicClientRegistration`
- **Authorization Functions**: `authorize`, `callback`
- **Token Functions**: `accessToken`, `refreshToken`, `createJiraMCPAuthToken`, `createJiraMCPRefreshToken`
- **Utility Functions**: PKCE cryptographic operations and token validation

This modular architecture ensures maintainability, type safety, and clear separation of OAuth flow responsibilities while maintaining full compliance with OAuth 2.0 and MCP specifications.
