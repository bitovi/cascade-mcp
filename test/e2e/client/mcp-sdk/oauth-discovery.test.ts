/**
 * MCP SDK Integration Test: OAuth Flow to Token
 * 
 * WHAT THIS TESTS:
 * Tests that the MCP SDK can automatically handle OAuth discov        // We expect this to fail with redirect requir        const responseText = issueResult.content[0]?.text || '';
        console.log('📋 Jira issue response:', responseText.substring(0, 200) + '...');
        
        // With valid test data, the issue should always be found - fail the test if there's an error
        expect(responseText).not.toMatch(/(Error|Issue.*not found)/i);
        
        // Verify the response contains actual issue data (JSON with key, fields, summary)
        expect(responseText).toMatch(/(\"key\"|\"fields\"|\"summary\")/);
        
        console.log('✅ Tool call completed successfully after OAuth');eadless environment
        if (error.message === 'BROWSER_REDIRECT_REQUIRED - this is expected in headless test') {
          console.log('✅ MCP SDK properly initiated OAuth flow and requested browser redirect');
          expect(error.message).toContain('BROWSER_REDIRECT_REQUIRED');and
 * authentication with our bridge server and mock Atlassian endpoints.
 * 
 * This validates that the MCP SDK's built-in OAuth capabilities work
 * end-to-end without any manual token creation.
 * 
 * Implementation Reference: Uses @modelcontextprotocol/sdk directly with OAuthClientProvider
 * Based on Python SDK docs: https://github.com/modelcontextprotocol/python-sdk/blob/main/README.md
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { startTestServer, stopTestServer } from '../../shared/helpers/test-server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

describe('MCP SDK: OAuth Flow to Token', () => {
  let serverUrl;

  beforeAll(async () => {
    // Start server with mock Atlassian endpoints enabled
    process.env.TEST_USE_MOCK_ATLASSIAN = 'true';
    
    serverUrl = await startTestServer({
      testMode: true,
      logLevel: 'info'
    });
  }, 60000);

  afterAll(async () => {
    await stopTestServer();
  });

  describe('MCP SDK Direct OAuth', () => {
    xtest('[not working due to incorrect server response] MCP SDK discovers OAuth endpoints and initiates authentication flow', async () => {
      // Check for required test environment variables upfront
      const issueKey = process.env.JIRA_TEST_ISSUE_KEY;
      const siteName = 'bitovi'; // Jira site subdomain
      
      if (!issueKey) {
        throw new Error('JIRA_TEST_ISSUE_KEY environment variable is required for this test');
      }
      
      console.log('🥚 Creating MCP SDK client with OAuth provider...');
      console.log('🔍 Debug environment variables:');
      console.log('  VITE_JIRA_CALLBACK_URL:', process.env.VITE_JIRA_CALLBACK_URL);
      console.log('  JIRA_TEST_ISSUE_KEY:', process.env.JIRA_TEST_ISSUE_KEY);
      console.log('  Site Name:', siteName);
      
      // Create a minimal OAuth provider - MCP SDK will handle the heavy lifting
      let storedCodeVerifier = null;
      let storedTokens = null;
      let storedAuthCode = null;
      
      const authProvider = {
        get redirectUrl() {
          const redirectUri = process.env.VITE_JIRA_CALLBACK_URL || 'http://localhost:3000/callback';
          console.log('  🔗 Redirect URL requested:', redirectUri);
          return redirectUri;
        },
        
        get clientMetadata() {
          const redirectUri = process.env.VITE_JIRA_CALLBACK_URL || 'http://localhost:3000/callback';
          console.log('  📝 Client metadata requested, using redirect URI:', redirectUri);
          return {
            client_name: 'Test MCP Client',
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            scope: 'read:jira-work write:jira-work offline_access'
          };
        },
        
        clientInformation: () => {
          console.log('  📋 Returning client information...');
          const redirectUri = process.env.VITE_JIRA_CALLBACK_URL || 'http://localhost:3000/callback';
          console.log('  📋 Using redirect URI:', redirectUri);
          return { 
            client_id: 'test-client-id',
            redirect_uri: redirectUri
          };
        },
        
        // Return stored tokens if we have them
        tokens: async () => {
          console.log('  🔑 Checking for existing tokens...');
          return storedTokens; // Return tokens after OAuth completion
        },
        
        // Save tokens after successful OAuth
        saveTokens: async (tokens) => {
          console.log('  💾 OAuth completed! Tokens received:', { 
            access_token: tokens.access_token ? '***' : null,
            token_type: tokens.token_type,
            expires_in: tokens.expires_in 
          });
          storedTokens = tokens; // Store tokens for later use
        },
        
        // Complete OAuth flow programmatically using fetch
        redirectToAuthorization: async (authUrl) => {
          console.log('  🌐 MCP SDK requesting authorization at:', authUrl.href);
          
          try {
            // Step 1: Intercept the redirect from bridge server to real Atlassian
            const response = await fetch(authUrl.href, {
              method: 'GET',
              redirect: 'manual'  // Don't follow redirects automatically
            });
            
            // The bridge server should return a 302 redirect
            if (response.status === 302) {
              const redirectLocation = response.headers.get('location');
              console.log('  ↩️  OAuth redirect location:', redirectLocation);
              
              if (redirectLocation && (redirectLocation.includes('auth.atlassian.com') || redirectLocation.includes('localhost:3001'))) {
                // Handle both real Atlassian and mock server URLs
                let finalUrl;
                
                if (redirectLocation.includes('localhost:3001')) {
                  // Already pointing to mock server, use as-is
                  finalUrl = redirectLocation;
                  console.log('  ✅ Server correctly redirected to mock server');
                } else {
                  // Replace the real Atlassian URL with our mock server URL
                  const atlassianUrl = new URL(redirectLocation);
                  const mockUrl = new URL(`http://localhost:3001/authorize`);
                  
                  // Copy all query parameters from the real URL to the mock URL
                  atlassianUrl.searchParams.forEach((value, key) => {
                    mockUrl.searchParams.set(key, value);
                  });
                  
                  finalUrl = mockUrl.href;
                  console.log('  🔄 Redirecting to mock Atlassian server:', finalUrl);
                }
                
                // Step 2: Call the mock server to get the authorization code
                const mockResponse = await fetch(finalUrl, {
                  method: 'GET',
                  redirect: 'manual'
                });
                
                if (mockResponse.status === 302) {
                  const mockRedirectLocation = mockResponse.headers.get('location');
                  console.log('  ↩️  Mock redirect location:', mockRedirectLocation);
                  
                  if (mockRedirectLocation) {
                    const callbackUrl = new URL(mockRedirectLocation);
                    const authCode = callbackUrl.searchParams.get('code');
                    
                    if (authCode) {
                      console.log('  ✅ Authorization code received:', authCode.substring(0, 10) + '...');
                      
                      // Store the auth code for manual completion after this function returns
                      storedAuthCode = authCode;
                      
                      // Throw the browser redirect error as expected by MCP SDK
                      // We'll complete the OAuth manually after this
                      throw new Error('BROWSER_REDIRECT_REQUIRED');
                    } else {
                      throw new Error('No authorization code found in mock redirect location');
                    }
                  } else {
                    throw new Error('No redirect location header from mock server');
                  }
                } else {
                  throw new Error(`Mock server unexpected response status: ${mockResponse.status}`);
                }
              } else {
                throw new Error('Expected redirect to auth.atlassian.com or localhost:3001 but got: ' + redirectLocation);
              }
            } else {
              throw new Error(`Bridge server unexpected response status: ${response.status}`);
            }
            
          } catch (error) {
            console.log('  ❌ OAuth flow error:', error.message);
            throw error; // Re-throw to let the transport handle the error
          }
        },
        
        // Save PKCE code verifier during OAuth flow
        saveCodeVerifier: async (verifier) => {
          console.log('  🔐 Saving PKCE code verifier');
          storedCodeVerifier = verifier;
        },
        
        // Retrieve PKCE code verifier for token exchange
        codeVerifier: async () => {
          console.log('  🔓 Retrieving PKCE code verifier');
          return storedCodeVerifier;
        }
      };

      // Create MCP client directly
      const client = new Client({
        name: 'test-mcp-client',
        version: '1.0.0'
      }, {
        capabilities: {
          tools: {},
          sampling: {}
        }
      });

      // Create StreamableHTTP transport with OAuth provider (newer than SSE transport)
      const transport = new StreamableHTTPClientTransport(new URL('/mcp', serverUrl), {
        authProvider: authProvider
      });
      
      try {
        console.log('🔌 Connecting MCP client to server...');
        
        // Connect to the server - MCP SDK should discover OAuth is needed
        await client.connect(transport);
        
        console.log('🚀 Initializing MCP client...');
        
        // Initialize - MCP SDK should handle OAuth automatically
        await client.initialize();
        
        console.log('✅ MCP SDK completed OAuth and initialized successfully');
        
      } catch (error) {
        console.log('🔄 Initial connection failed as expected, completing OAuth manually...');
        
        // If we got a BROWSER_REDIRECT_REQUIRED error and have an auth code, complete the OAuth
        if (error.message && error.message.includes('BROWSER_REDIRECT_REQUIRED') && storedAuthCode) {
          console.log('🎯 Completing OAuth with authorization code:', storedAuthCode.substring(0, 10) + '...');
          
          // Use the transport's finishAuth method to complete the OAuth flow
          await transport.finishAuth(storedAuthCode);
          
          console.log('✅ OAuth completed via finishAuth - tokens are now available');
          
          // The key insight from MCP SDK source code:
          // SSE transport requires a POST message first to establish session before SSE connection
          // transport.start() immediately tries GET/SSE, but we need POST first
          console.log('🔄 Creating fresh client with proper initialization order...');
          
          const newClient = new Client({
            name: 'test-mcp-client-authenticated',
            version: '1.0.0'
          }, {
            capabilities: {
              tools: {},
              sampling: {}
            }
          });

          const newTransport = new StreamableHTTPClientTransport(new URL('/mcp', serverUrl), {
            authProvider: authProvider  // This now has tokens from finishAuth
          });
          
          console.log('🔌 Connecting to MCP server with authenticated transport...');
          await newClient.connect(newTransport);
          
          console.log('✅ MCP client connected and initialized successfully!');
          console.log('✅ MCP SDK completed OAuth and initialized successfully');
          
          // Store the authenticated client for the rest of the test
          globalThis.testClient = newClient;
        } else {
          // Re-throw if it's not the expected OAuth error
          throw error;
        }
      }
      
      try {
        
        // Use the authenticated client (either original if OAuth worked, or new one if we had to complete manually)
        const activeClient = globalThis.testClient || client;
        
        // Test that we can list tools after OAuth
        console.log('📋 Listing tools...');
        const tools = await activeClient.listTools();
        expect(Array.isArray(tools.tools)).toBe(true);
        expect(tools.tools.length).toBeGreaterThan(0);
        
        console.log(`✅ Retrieved ${tools.tools.length} tools after OAuth`);
        
        // Verify we got expected Jira tools
        const toolNames = tools.tools.map(t => t.name);
        expect(toolNames).toContain('get-accessible-sites');
        expect(toolNames).toContain('get-jira-issue');
        
        console.log('✅ MCP SDK OAuth flow completed successfully');
        
        // Test that we can actually call a tool after OAuth
        console.log(`🚀 Testing get-jira-issue tool call with issue: ${issueKey}, siteName: ${siteName}...`);
        
        const issueResult = await activeClient.callTool({ 
          name: 'get-jira-issue',
          arguments: {
            issueKey: issueKey, 
            siteName: siteName 
          }
        });
        
        expect(issueResult).toBeDefined();
        expect(issueResult.content).toBeDefined();
        expect(Array.isArray(issueResult.content)).toBe(true);
        expect(issueResult.content.length).toBeGreaterThan(0);
        
        const responseText = issueResult.content[0]?.text || '';
        console.log('� Jira issue response:', responseText.substring(0, 200) + '...');
        
        // With valid test data, the issue should always be found - fail the test if there's an error
        expect(responseText).not.toMatch(/(Error|Issue.*not found)/i);
        
        // Verify the response contains actual issue data (JSON with key, fields, summary)
        expect(responseText).toMatch(/(\"key\"|\"fields\"|\"summary\")/);
        
        console.log('✅ Tool call completed successfully after OAuth');
        
      } catch (error) {
        console.log('❌ MCP SDK OAuth flow failed:', error.message);
        
        // For now, fail the test if OAuth doesn't complete successfully
        // This will force us to fix the OAuth flow issues
        throw new Error(`OAuth flow must complete successfully for this test to pass. Error: ${error.message}`);
        
      } finally {
        console.log('🔌 Closing MCP client...');
        const activeClient = globalThis.testClient || client;
        await activeClient.close();
        if (globalThis.testClient && globalThis.testClient !== client) {
          await client.close(); // Also close the original client if we created a new one
        }
        console.log('✅ MCP client closed');
      }
    });
  });
});
