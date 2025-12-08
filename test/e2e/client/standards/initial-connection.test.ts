/**
 * Standards-Compliant Initial Connection Tests
 * 
 * WHAT THIS TESTS:
 * When a standard MCP client tries to initialize without authentication, the server should:
 * 1. Reject with 401 Unauthorized
 * 2. Include WWW-Authenticate header with RFC 9728 compliant OAuth discovery info
 * 3. Use standard 'resource_metadata' parameter (not VS Code's 'resource_metadata_url')
 * 4. Provide working OAuth metadata URLs for client discovery
 * 
 * This validates Phase 1 of the API flow where unauthenticated clients learn how to authenticate.
 * 
 * Specifications:
 * - MCP Specification 2025-06-18: https://modelcontextprotocol.io/docs/specification
 * - RFC 6750 Section 3: https://tools.ietf.org/html/rfc6750#section-3 (WWW-Authenticate Response Header Field)
 * - RFC 9728 Section 5.1: https://tools.ietf.org/html/rfc9728#section-5.1 (WWW-Authenticate Resource Metadata Parameter)
 * 
 * Implementation Reference: server/api-flow.md Phase 1 - Initial Connection
 * Module Under Test: mcp-service.js::handleMcpPost() → sendMissingAtlassianAccessToken()
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { startTestServer, stopTestServer } from '../../../../specs/shared/helpers/test-server.js';
import { validateRfc6750Compliance } from '../../../../specs/shared/helpers/assertions.js';

describe('Standards: Initial Connection', () => {
  let serverUrl: string;

  beforeAll(async () => {
    serverUrl = await startTestServer({
      testMode: true,
      logLevel: 'error', // Suppress logs during tests
      port: 3000
    });
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('MCP Initialize Without Authentication', () => {
    test('standard MCP client receives 401 with RFC 9728 compliant metadata', async () => {
      // MCP Specification 2025-06-18: initialize request format
      const initializeRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {
            roots: { listChanged: true },
            sampling: {},
            elicitation: {}
          },
          clientInfo: {
            name: 'Standard MCP Client',  // NOT "Visual Studio Code"
            version: '1.0.0'
          }
        }
      };

      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initializeRequest)
      });

      // RFC 6750 Section 3: 401 Unauthorized required for missing auth
      expect(response.status).toBe(401);

      // RFC 6750 Section 3: WWW-Authenticate header MUST be present
      const wwwAuthHeader = response.headers.get('WWW-Authenticate') ?? '';
      expect(wwwAuthHeader).toBeTruthy();

      // Validate RFC 6750 compliance
      validateRfc6750Compliance(wwwAuthHeader);

      // RFC 9728 Section 5.1: Standard resource_metadata parameter
      expect(wwwAuthHeader).toMatch(/resource_metadata="[^"]+"/);

      // VS Code specific parameter should NOT be present for standard clients
      expect(wwwAuthHeader).not.toMatch(/resource_metadata_url/);

      // Extract and validate metadata URL
      const metadataMatch = wwwAuthHeader.match(/resource_metadata="([^"]+)"/);
      expect(metadataMatch).toBeTruthy();
      const metadataUrl = metadataMatch && metadataMatch[1] ? metadataMatch[1] : '';
      expect(metadataUrl).toContain('/.well-known/oauth-protected-resource');

      // Validate metadata URL is accessible
      const metadataResponse = await fetch(metadataUrl);
      expect(metadataResponse.ok).toBe(true);

      const metadata = await metadataResponse.json() as any;
      expect(metadata.resource).toBeDefined();
      expect(metadata.authorization_servers).toBeDefined();
      expect(Array.isArray(metadata.authorization_servers)).toBe(true);
    });

    test('response includes proper cache control headers', async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18' }
        })
      });

      expect(response.status).toBe(401);

      // RFC 6750: Cache control headers for security
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
      expect(response.headers.get('Pragma')).toBe('no-cache');
      expect(response.headers.get('Expires')).toBe('0');
    });

    test('response follows JSON-RPC 2.0 error format', async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 42,
          method: 'initialize',
          params: { protocolVersion: '2025-06-18' }
        })
      });

      expect(response.status).toBe(401);

      const errorResponse = await response.json() as any;

      // JSON-RPC 2.0 error response format
      expect(errorResponse.jsonrpc).toBe('2.0');
      expect(errorResponse.id).toBe(42); // Should match request ID
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error.code).toBeDefined();
      expect(errorResponse.error.message).toBeDefined();
      expect(typeof errorResponse.error.message).toBe('string');
    });
  });

  describe('OAuth Discovery Chain Initiation', () => {
    test('metadata URL returns valid OAuth server metadata', async () => {
      // First get the metadata URL from WWW-Authenticate header
      const authResponse = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            clientInfo: { name: 'Standard MCP Client', version: '1.0.0' },
            capabilities: {}
          }
        })
      });

      const wwwAuth = authResponse.headers.get('WWW-Authenticate') ?? '';
      const metadataMatch = wwwAuth.match(/resource_metadata="([^"]+)"/) ?? ['', ''];
      const metadataUrl = metadataMatch[1];

      // RFC 9728: Resource metadata should return valid OAuth metadata
      const metadataResponse = await fetch(metadataUrl);
      expect(metadataResponse.ok).toBe(true);
      expect(metadataResponse.headers.get('Content-Type')).toMatch(/application\/json/);

      const metadata = await metadataResponse.json() as any;

      // RFC 9728 Section 3.3: Required fields
      expect(metadata.resource).toBeDefined();
      expect(metadata.authorization_servers).toBeDefined();
      expect(Array.isArray(metadata.authorization_servers)).toBe(true);
      expect(metadata.authorization_servers.length).toBeGreaterThan(0);

      // Each authorization server should have required fields
      const authServer = metadata.authorization_servers[0];
      expect(authServer).toContain(process.env.VITE_AUTH_SERVER_URL);
    });

    test('authorization server metadata contains required endpoints', async () => {
      // Get the authorization server metadata URL
      const protectedResourceResponse = await fetch(`${serverUrl}/.well-known/oauth-protected-resource`);
      const protectedResource = await protectedResourceResponse.json() as any;
      const authServerUrl = protectedResource.authorization_servers[0];

      // RFC 8414: Authorization server metadata
      const authMetadataResponse = await fetch(`${authServerUrl}/.well-known/oauth-authorization-server`);
      expect(authMetadataResponse.ok).toBe(true);

      const authMetadata = await authMetadataResponse.json() as any;

      // RFC 8414 Section 2: Required metadata fields
      expect(authMetadata.issuer).toBeDefined();
      expect(authMetadata.authorization_endpoint).toBeDefined();
      expect(authMetadata.token_endpoint).toBeDefined();
      expect(authMetadata.response_types_supported).toBeDefined();
      expect(authMetadata.response_types_supported).toContain('code');

      // PKCE support
      expect(authMetadata.code_challenge_methods_supported).toBeDefined();
      expect(authMetadata.code_challenge_methods_supported).toContain('S256');
    });
  });
});
