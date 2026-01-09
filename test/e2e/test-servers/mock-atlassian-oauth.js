/**
 * Mock Atlassian OAuth Test Server
 * 
 * Standalone server that provides mock Atlassian OAuth endpoints for testing.
 * Runs on a separate port from the main bridge server to simulate real
 * external OAuth provider behavior.
 * 
 * This allows testing the complete OAuth discovery and handshake flow
 * without requiring browser interaction or real Atlassian OAuth setup.
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { config } from 'dotenv';

// Load environment variables from .env file
config({ path: '.env' });

// Store for tracking OAuth state during tests
const mockOAuthState = new Map();

/**
 * Mock Atlassian OAuth configuration
 */
export function getMockAtlassianConfig(port = 3001) {
  return {
    baseUrl: `http://localhost:${port}`,
    authUrl: `http://localhost:${port}/authorize`,
    tokenUrl: `http://localhost:${port}/token`,
    clientId: 'mock-test-client-id',
    clientSecret: 'mock-test-client-secret',
    scopes: 'read:jira-work write:jira-work offline_access'
  };
}

/**
 * Create and configure the mock Atlassian OAuth server
 * @param port - Port to run the server on (default: 3001)
 * @returns Express app configured as mock OAuth server
 */
export function createMockAtlassianServer(port = 3001) {
  const app = express();
  
  // Enable CORS for cross-origin requests from bridge server
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
  }));
  
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  
  // Mock authorization endpoint
  app.get('/authorize', (req, res) => {
    console.log('🔐 Mock Atlassian authorize endpoint called');
    
    const {
      client_id,
      response_type,
      redirect_uri,
      scope,
      code_challenge,
      code_challenge_method,
      state
    } = req.query;
    
    // Validate required OAuth parameters
    if (!client_id || !redirect_uri || !code_challenge) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters'
      });
    }
    
    // Generate mock authorization code
    const authCode = crypto.randomBytes(16).toString('base64url');
    
    // Store PKCE challenge for later verification
    mockOAuthState.set(authCode, {
      client_id,
      redirect_uri,
      scope,
      code_challenge,
      code_challenge_method,
      created_at: Date.now()
    });
    
    // In a real OAuth flow, this would redirect to authorization page
    // For testing, we auto-approve and redirect back with code
    const callbackUrl = new URL(redirect_uri);
    callbackUrl.searchParams.set('code', authCode);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }
    
    console.log(`  Generated auth code: ${authCode}`);
    console.log(`  Redirecting to: ${callbackUrl.toString()}`);
    
    // Auto-redirect (simulates user approving the authorization)
    res.redirect(callbackUrl.toString());
  });
  
  // Mock token endpoint
  app.post('/token', async (req, res) => {
    console.log('🎟️  Mock Atlassian token endpoint called');
    
    const {
      grant_type,
      client_id,
      client_secret,
      code,
      redirect_uri,
      code_verifier
    } = req.body;
    
    // Validate grant type
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported'
      });
    }
    
    // Retrieve stored OAuth state
    const oauthState = mockOAuthState.get(code);
    if (!oauthState) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code'
      });
    }
    
    // Validate PKCE challenge
    if (!code_verifier) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'code_verifier is required'
      });
    }
    
    // Verify PKCE challenge (RFC 7636)
    const computedChallenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');
    
    if (computedChallenge !== oauthState.code_challenge) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'PKCE verification failed'
      });
    }
    
    // Validate client credentials
    const mockConfig = getMockAtlassianConfig(port);
    if (client_id !== mockConfig.clientId) {
      return res.status(400).json({
        error: 'invalid_client',
        error_description: 'Invalid client_id'
      });
    }
    
    // Clean up used authorization code
    mockOAuthState.delete(code);
    
    try {
      // Generate mock Atlassian-style tokens
      // These look like real Atlassian tokens but contain PAT internally
      const mockAccessToken = generateMockAtlassianToken('access');
      const mockRefreshToken = generateMockAtlassianToken('refresh');
      
      console.log('  ✅ Generated mock Atlassian tokens');
      
      // Return OAuth-compliant token response
      res.json({
        access_token: mockAccessToken,
        refresh_token: mockRefreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: oauthState.scope || 'read:jira-work write:jira-work'
      });
      
    } catch (error) {
      console.error('  ❌ Mock token generation failed:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to generate tokens'
      });
    }
  });
  
  // Mock refresh token endpoint
  app.post('/refresh', async (req, res) => {
    console.log('🔄 Mock Atlassian refresh endpoint called');
    
    const { grant_type, refresh_token } = req.body;
    
    if (grant_type !== 'refresh_token') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only refresh_token grant type is supported'
      });
    }
    
    if (!refresh_token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'refresh_token is required'
      });
    }
    
    try {
      // Generate new mock tokens
      const newAccessToken = generateMockAtlassianToken('access');
      const newRefreshToken = generateMockAtlassianToken('refresh');
      
      console.log('  ✅ Generated refreshed mock Atlassian tokens');
      
      res.json({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read:jira-work write:jira-work'
      });
      
    } catch (error) {
      console.error('  ❌ Mock token refresh failed:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to refresh tokens'
      });
    }
  });
  
  // Mock accessible-resources endpoint (returns test Jira cloud)
  app.get('/oauth/token/accessible-resources', (req, res) => {
    console.log('  🌐 Mock accessible-resources endpoint called');
    
    // Check for Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('  ❌ Missing or invalid authorization header');
      return res.status(401).json({
        code: 401,
        message: 'Unauthorized'
      });
    }
    
    // Return mock accessible resources
    const mockResources = [
      {
        id: 'test-cloud-id-12345',
        name: 'bitovi',
        url: 'https://bitovi.atlassian.net',
        scopes: ['read:jira-work', 'write:jira-work'],
        avatarUrl: 'https://site-admin-avatar-cdn.prod.public.atl-paas.net/avatars/240/flag.png'
      }
    ];
    
    console.log('  ✅ Returning mock accessible resources:', mockResources);
    res.json(mockResources);
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      service: 'mock-atlassian-oauth',
      port,
      timestamp: new Date().toISOString() 
    });
  });
  
  // Root endpoint showing available endpoints
  app.get('/', (req, res) => {
    const config = getMockAtlassianConfig(port);
    res.json({
      service: 'Mock Atlassian OAuth Server',
      endpoints: {
        authorize: config.authUrl,
        token: config.tokenUrl,
        refresh: `${config.baseUrl}/refresh`,
        accessible_resources: `${config.baseUrl}/oauth/token/accessible-resources`,
        health: `${config.baseUrl}/health`
      },
      test_client: {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scopes: config.scopes
      }
    });
  });
  
  return app;
}

/**
 * Generate mock Atlassian-style tokens
 * Uses JIRA_TEST_ACCESS_TOKEN if available, otherwise generates mock tokens
 * @param {string} type - Token type ('access' or 'refresh')
 * @returns {string} Mock token string
 */
function generateMockAtlassianToken(type) {
  // Use real test token if available
  if (type === 'access' && process.env.ATLASSIAN_TEST_PAT) {
    console.log('  Using ATLASSIAN_TEST_PAT for mock response');
    return process.env.ATLASSIAN_TEST_PAT;
  }
  
  // Generate mock token format for testing
  // Real Atlassian tokens are 74-character colon-separated strings
  // Format: {prefix}:{random_part}:{suffix}
  const prefix = type === 'access' ? 'ATATT' : 'ATART';
  const randomPart = crypto.randomBytes(28).toString('base64url');
  const suffix = crypto.randomBytes(8).toString('base64url');
  
  // Truncate to match real Atlassian token length
  const token = `${prefix}:${randomPart}:${suffix}`.substring(0, 74);
  
  return token;
}

/**
 * Start the mock Atlassian OAuth server
 * @param {number} port - Port to run on (default: 3001)
 * @returns {Promise<number>} Actual port the server is running on
 */
export async function startMockAtlassianServer(port = 3001) {
  return new Promise((resolve, reject) => {
    const app = createMockAtlassianServer(port);
    
    const server = app.listen(port, () => {
      console.log(`🧪 Mock Atlassian OAuth server running on port ${port}`);
      resolve(port);
    });
    
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`Port ${port} in use, trying ${port + 1}...`);
        startMockAtlassianServer(port + 1).then(resolve).catch(reject);
      } else {
        reject(error);
      }
    });
    
    // Store server reference for cleanup
    global.mockAtlassianServer = server;
  });
}

/**
 * Stop the mock Atlassian OAuth server
 * @returns {Promise<void>}
 */
export async function stopMockAtlassianServer() {
  return new Promise((resolve) => {
    const server = global.mockAtlassianServer;
    if (server) {
      server.close(() => {
        console.log('🛑 Mock Atlassian OAuth server stopped');
        global.mockAtlassianServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
