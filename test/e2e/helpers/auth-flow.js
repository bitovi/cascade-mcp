/**
 * Authentication Flow Helpers
 * 
 * Utilities for OAuth PKCE flow and PAT bypass mode testing.
 * Supports both automated testing (PAT bypass) and manual OAuth flow.
 */

import crypto from 'crypto';

/**
 * Create a JWT token containing PAT for bypass testing
 * This simulates the bridge server's JWT format but uses PAT instead of OAuth tokens
 * @param {string} patToken - Atlassian Personal Access Token
 * @returns {Promise<string>} JWT token containing the PAT
 */
export async function createPATBypassToken(patToken) {
  // Import JWT utilities from the bridge server
  const { jwtSign } = await import('../../../server/tokens.js');
  
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

/**
 * Complete PKCE OAuth flow with support for both automated (PAT) and manual modes
 * @param {Object} metadata - OAuth server metadata from discovery (optional)
 * @returns {Promise<Object>} Token response with access_token and refresh_token
 */
export async function completePkceFlow(metadata = null) {
  // Check if PAT bypass mode is enabled for automated testing
  if (process.env.TEST_USE_PAT_BYPASS === 'true' && process.env.ATLASSIAN_TEST_PAT) {
    console.log('🔧 Using PAT bypass mode for automated testing');
    
    // Create a JWT token that contains the PAT as the Atlassian access token
    // This bypasses the OAuth flow but allows testing real Jira API calls
    const patToken = await createPATBypassToken(process.env.ATLASSIAN_TEST_PAT);
    
    return {
      access_token: patToken,
      refresh_token: patToken, // Same token for simplicity in tests
      token_type: 'Bearer',
      expires_in: 3600,
      scope: process.env.VITE_JIRA_SCOPE || 'read:jira-work'
    };
  }
  
  // Check if mock Atlassian endpoints are enabled
  if (process.env.TEST_USE_MOCK_ATLASSIAN === 'true') {
    console.log('🧪 Using mock Atlassian OAuth flow for testing');
    return await completeMockOAuthFlow();
  }
  
  // Manual OAuth flow for comprehensive testing
  console.log('🌐 Using manual OAuth flow (requires browser interaction)');
  throw new Error('Manual OAuth flow not implemented yet - use PAT bypass or mock OAuth mode');
}

/**
 * Complete mock OAuth flow that simulates real OAuth discovery and handshake
 * Uses external mock Atlassian server running on separate port
 * @returns {Promise<Object>} Token response with access_token and refresh_token
 */
export async function completeMockOAuthFlow() {
  const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
  
  try {
    // 1. Discover OAuth metadata from bridge server (like real MCP clients would)
    console.log('  📋 Discovering OAuth metadata from bridge server...');
    const metadataUrl = `${baseUrl}/.well-known/oauth-authorization-server`;
    const metadataResponse = await fetch(metadataUrl);
    
    if (!metadataResponse.ok) {
      throw new Error(`OAuth metadata discovery failed: ${metadataResponse.status}`);
    }
    
    const oauthMetadata = await metadataResponse.json();
    console.log(`    Issuer: ${oauthMetadata.issuer}`);
    console.log(`    Authorization endpoint: ${oauthMetadata.authorization_endpoint}`);
    console.log(`    Token endpoint: ${oauthMetadata.token_endpoint}`);
    
    // 2. Generate PKCE challenge
    console.log('  🔐 Generating PKCE challenge...');
    const { codeVerifier, codeChallenge } = generatePkceChallenge();
    const state = crypto.randomBytes(16).toString('base64url');
    
    // 3. Build authorization URL (this will point to mock Atlassian server)
    const authUrl = new URL(oauthMetadata.authorization_endpoint);
    authUrl.searchParams.set('client_id', process.env.TEST_ATLASSIAN_CLIENT_ID || 'mock-test-client-id');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', `${baseUrl}/callback`);
    authUrl.searchParams.set('scope', 'read:jira-work write:jira-work offline_access');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    
    console.log(`    Authorization URL: ${authUrl.toString()}`);
    
    // 4. Simulate authorization against mock Atlassian server
    console.log('  🔄 Calling mock Atlassian authorization endpoint...');
    const authResponse = await fetch(authUrl.toString(), {
      method: 'GET',
      redirect: 'manual' // Don't follow redirects automatically
    });
    
    // Extract authorization code from redirect location
    if (authResponse.status !== 302) {
      throw new Error(`Authorization failed: ${authResponse.status}`);
    }
    
    const location = authResponse.headers.get('location');
    if (!location) {
      throw new Error('No redirect location in authorization response');
    }
    
    const callbackUrl = new URL(location);
    const authCode = callbackUrl.searchParams.get('code');
    const returnedState = callbackUrl.searchParams.get('state');
    
    if (!authCode) {
      throw new Error('No authorization code in callback URL');
    }
    
    if (returnedState !== state) {
      throw new Error('State parameter mismatch');
    }
    
    console.log(`    Authorization code: ${authCode}`);
    
    // 5. Exchange code for tokens using bridge server's token endpoint
    console.log('  🎟️  Exchanging code for tokens via bridge server...');
    const tokenResponse = await fetch(oauthMetadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.TEST_ATLASSIAN_CLIENT_ID || 'mock-test-client-id',
        client_secret: process.env.TEST_ATLASSIAN_CLIENT_SECRET || 'mock-test-client-secret',
        code: authCode,
        redirect_uri: `${baseUrl}/callback`,
        code_verifier: codeVerifier
      })
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorData}`);
    }
    
    const tokens = await tokenResponse.json();
    console.log('    ✅ Mock OAuth flow completed successfully');
    
    return tokens;
    
  } catch (error) {
    console.error('❌ Mock OAuth flow failed:', error.message);
    throw error;
  }
}

/**
 * Generate PKCE challenge and verifier pair
 * @returns {Object} Object with codeVerifier and codeChallenge
 */
export function generatePkceChallenge() {
  // RFC 7636 Section 4.1: code_verifier MUST be minimum 43 characters, maximum 128
  // Character set: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  
  // RFC 7636 Section 4.2: code_challenge = BASE64URL(SHA256(code_verifier))
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

/**
 * Extract OAuth metadata URL from WWW-Authenticate header
 * @param {string} wwwAuthHeader - WWW-Authenticate header value
 * @returns {string|null} OAuth metadata URL or null if not found
 */
export function extractOAuthMetadataUrl(wwwAuthHeader) {
  // RFC 9728 Section 5.1: resource_metadata parameter
  const standardMatch = wwwAuthHeader.match(/resource_metadata="([^"]+)"/);
  if (standardMatch) {
    return standardMatch[1];
  }
  
  // VS Code Copilot deviation: resource_metadata_url parameter
  const vscodeMatch = wwwAuthHeader.match(/resource_metadata_url="([^"]+)"/);
  if (vscodeMatch) {
    return vscodeMatch[1];
  }
  
  return null;
}
