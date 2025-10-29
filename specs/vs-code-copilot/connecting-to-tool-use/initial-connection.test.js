/**
 * VS Code Copilot Initial Connection Deviation Tests
 * 
 * DEVIATION FOCUS: Tests only VS Code specific behaviors that differ from RFC standards
 * 
 * Specifications:
 * - RFC 9728 Section 5.1: https://tools.ietf.org/html/rfc9728#section-5.1 (Standard resource_metadata)
 * - VS Code Copilot Agent Spec: specs/vs-code-copilot/readme.md (Non-standard resource_metadata_url)
 * 
 * Implementation Reference: server/mcp-service.js::isVSCodeClient() → createWwwAuthenticate()
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { startTestServer, stopTestServer } from '../../shared/helpers/test-server.js';

describe('VS Code: Initial Connection Deviations', () => {
  let serverUrl;

  beforeAll(async () => {
    serverUrl = await startTestServer({ testMode: true, logLevel: 'error' });
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('VS Code Client Detection via clientInfo', () => {
    test('VS Code identified by clientInfo.name receives resource_metadata_url parameter', async () => {
      // VS Code Copilot MCP initialize request format
      const vsCodeInitializeRequest = {
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
            name: 'Visual Studio Code',  // VS Code identifier
            version: '1.103.2'
          }
        }
      };

      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'node'  // VS Code's user agent
        },
        body: JSON.stringify(vsCodeInitializeRequest)
      });

      expect(response.status).toBe(401);

      const wwwAuthHeader = response.headers.get('WWW-Authenticate');
      expect(wwwAuthHeader).toBeTruthy();

      // VS Code Copilot Deviation: Should contain non-standard resource_metadata_url
      expect(wwwAuthHeader).toMatch(/resource_metadata_url="[^"]+"/);

      // VS Code Compatibility: Should NOT contain standard resource_metadata to avoid parsing conflicts
      expect(wwwAuthHeader).not.toMatch(/resource_metadata="[^"]+"[^_]/); // Negative lookbehind for _url

      // Extract and validate metadata URL works
      const metadataMatch = wwwAuthHeader.match(/resource_metadata_url="([^"]+)"/);
      expect(metadataMatch).toBeTruthy();
      const metadataUrl = metadataMatch[1];

      // URL should still work for OAuth discovery
      const metadataResponse = await fetch(metadataUrl);
      expect(metadataResponse.ok).toBe(true);
    });
  });

  describe('VS Code Client Detection via User-Agent', () => {
    test('User-Agent "node" triggers VS Code parameter usage when no clientInfo present', async () => {
      // Request with VS Code User-Agent but NO clientInfo (fallback scenario)
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'node'  // VS Code's distinctive user agent
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {
              roots: { listChanged: true },
              sampling: {},
              elicitation: {}
            }
            // No clientInfo - triggers User-Agent fallback detection
          }
        })
      });

      expect(response.status).toBe(401);

      const wwwAuthHeader = response.headers.get('WWW-Authenticate');
      
      // Should use VS Code parameter due to User-Agent fallback when no clientInfo
      expect(wwwAuthHeader).toMatch(/resource_metadata_url="[^"]+"/);
      expect(wwwAuthHeader).not.toMatch(/resource_metadata="[^"]+"[^_]/);
    });
  });

  describe('Parameter Compatibility Prevention', () => {
    test('VS Code client receives only resource_metadata_url parameter', async () => {
      const vsCodeRequest = {
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
          clientInfo: { name: 'Visual Studio Code', version: '1.103.2' }
        }
      };

      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'node'
        },
        body: JSON.stringify(vsCodeRequest)
      });

      const wwwAuth = response.headers.get('WWW-Authenticate');

      // Should contain Bearer scheme and realm
      expect(wwwAuth).toMatch(/^Bearer realm="mcp"/);

      // Should contain VS Code specific parameter
      const vsCodeParamMatch = wwwAuth.match(/resource_metadata_url="([^"]+)"/);
      expect(vsCodeParamMatch).toBeTruthy();

      // Should NOT contain standard parameter (avoid conflicts)
      const standardParamMatch = wwwAuth.match(/resource_metadata="([^"]+)"(?!_url)/);
      expect(standardParamMatch).toBeFalsy();

      // Verify the URL structure is correct
      const metadataUrl = vsCodeParamMatch[1];
      expect(metadataUrl).toContain('/.well-known/oauth-protected-resource');
      expect(metadataUrl).toMatch(/^https?:\/\//);
    });

    test('non-VS Code client still receives standard RFC 9728 parameter', async () => {
      // Verify that our VS Code detection doesn't break standard clients
      const standardRequest = {
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
          clientInfo: { name: 'Standard MCP Client', version: '1.0.0' }
        }
      };

      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'StandardClient/1.0'  // NOT VS Code user agent
        },
        body: JSON.stringify(standardRequest)
      });

      const wwwAuth = response.headers.get('WWW-Authenticate');

      // Should contain standard RFC 9728 parameter
      expect(wwwAuth).toMatch(/resource_metadata="[^"]+"/);

      // Should NOT contain VS Code specific parameter
      expect(wwwAuth).not.toMatch(/resource_metadata_url/);
    });
  });

  describe('OAuth Discovery Still Works', () => {
    test('VS Code can complete OAuth discovery using non-standard parameter', async () => {
      // Get the VS Code specific metadata URL
      const vsCodeResponse = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'node'
        },
        body: JSON.stringify({
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
            clientInfo: { name: 'Visual Studio Code', version: '1.103.2' }
          }
        })
      });

      const wwwAuth = vsCodeResponse.headers.get('WWW-Authenticate');
      const metadataMatch = wwwAuth.match(/resource_metadata_url="([^"]+)"/);
      const metadataUrl = metadataMatch[1];

      // OAuth discovery should work normally
      const metadataResponse = await fetch(metadataUrl);
      expect(metadataResponse.ok).toBe(true);

      const metadata = await metadataResponse.json();
      expect(metadata.resource).toBeDefined();
      expect(metadata.authorization_servers).toBeDefined();

      // Authorization server metadata should be accessible
      const authServerUrl = `${metadata.authorization_servers[0]}/.well-known/oauth-authorization-server`;
      const authResponse = await fetch(authServerUrl);
      expect(authResponse.ok).toBe(true);
      const authMetadata = await authResponse.json();
      expect(authMetadata.authorization_endpoint).toBeDefined();
      expect(authMetadata.token_endpoint).toBeDefined();
    });
  });
});
