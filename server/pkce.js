/**
 * OAuth 2.0 Authorization Server Module with PKCE Support
 * 
 * This module implements a complete OAuth 2.0 authorization server that acts as a bridge
 * between MCP clients (like VS Code Copilot) and Atlassian services. It supports the 
 * Proof Key for Code Exchange (PKCE) extension for enhanced security with public clients.
 * 
 * Key responsibilities:
 * - OAuth 2.0 Discovery: Provides well-known endpoints for client discovery and metadata
 * - Dynamic Client Registration: Allows MCP clients to register themselves (RFC 7591)
 * - Authorization Flow: Handles the OAuth authorization code flow with PKCE
 * - Token Exchange: Exchanges authorization codes for JWT tokens containing Atlassian credentials
 * - Session Management: Manages OAuth state and PKCE parameters across the flow
 * 
 * OAuth Flow Overview:
 * 1. Client Discovery: /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource
 * 2. Dynamic Registration: /register (creates client_id for MCP clients)
 * 3. Authorization: /authorize (redirects to Atlassian with PKCE parameters)
 * 4. Callback: /callback (receives auth code from Atlassian, handles MCP vs server PKCE)
 * 5. Token Exchange: /access-token (exchanges code for JWT with embedded Atlassian tokens)
 * 
 * This module contains:
 * - OAuth metadata endpoints for client discovery
 * - Dynamic client registration for MCP clients
 * - Authorization initiation with Atlassian redirect
 * - Callback handling with state validation
 * - Token exchange with JWT creation
 * - PKCE utility functions for cryptographic operations
 * 
 * Functions are ordered by their usage in the flow
 */
import crypto from 'crypto';
import { jwtSign, jwtVerify, generateCodeVerifier, generateCodeChallenge, sanitizeJwtPayload, parseJWT, sanitizeObjectWithJWTs } from './tokens.js';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';
import { createAtlassianAuthUrl, getAtlassianConfig, extractAtlassianCallbackParams, exchangeCodeForAtlassianTokens } from './atlassian-auth-code-flow.js';
import { isManualFlow, handleManualFlowCallback } from './manual-token-flow.js';



/**
 * OAuth Metadata Endpoint
 * Provides OAuth server configuration for clients
 */
export function oauthMetadata(req, res) {
  console.log('↔️ Received request for OAuth metadata');
  res.json({
    issuer: process.env.VITE_AUTH_SERVER_URL,
    authorization_endpoint: process.env.VITE_AUTH_SERVER_URL + '/authorize',
    token_endpoint: process.env.VITE_AUTH_SERVER_URL + '/access-token',
    registration_endpoint: process.env.VITE_AUTH_SERVER_URL + '/register',
    code_challenge_methods_supported: ['S256'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['read:jira-work', 'offline_access'],
  });
}

/**
 * OAuth 2.0 Protected Resource Metadata (RFC9728) for MCP discovery
 * Provides metadata about the protected resource for OAuth clients
 */
export function oauthProtectedResourceMetadata(req, res) {
  console.log('↔️ OAuth Protected Resource Metadata requested!', {
    headers: req.headers,
    query: req.query,
  });
  const baseUrl = process.env.VITE_AUTH_SERVER_URL;
  const metadata = {
    resource: baseUrl,
    authorization_servers: [`${baseUrl}/.well-known/oauth-authorization-server`],
    bearer_methods_supported: ['header', 'query'],
    resource_documentation: `${baseUrl}`,
    scopes_supported: ['read:jira-work', 'offline_access'],
    scope_documentation: {
      'read:jira-work': 'Access to read Jira issues and sites',
      offline_access: 'Refresh token access',
    },
  };
  res.json(metadata);
}

/**
 * Dynamic Client Registration Endpoint (RFC7591)
 * Allows MCP clients to register themselves dynamically
 */
export function register(req, res) {
  console.log('↔️ Received dynamic client registration request');

  try {
    const {
      redirect_uris = [],
      grant_types = ['authorization_code'],
      response_types = ['code'],
      client_name = 'MCP Client',
      token_endpoint_auth_method = 'none',
    } = req.body;

    // For MCP clients, we'll generate a simple client ID
    // In production, you'd want to store this in a database
    const clientId = `mcp_${randomUUID()}`;

    // Validate redirect URIs - accept any valid URI
    const validRedirectUris = redirect_uris.filter((uri) => {
      try {
        new URL(uri); // This will throw if URI is invalid
        return true;
      } catch {
        return false;
      }
    });

    if (validRedirectUris.length === 0) {
      return res.status(400).json({
        error: 'invalid_redirect_uri',
        error_description: 'At least one valid redirect URI is required',
      });
    }

    // Return client registration response
    res.status(201).json({
      client_id: clientId,
      client_name,
      redirect_uris: validRedirectUris,
      grant_types,
      response_types,
      token_endpoint_auth_method,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      // For public clients (like VS Code), no client_secret is issued
    });

    logger.info(`  Dynamic client registered: ${clientId} for ${client_name}`);
  } catch (error) {
    logger.error('  Client registration error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to register client',
    });
  }
}

/**
 * Authorization Entry Point with PKCE
 * Initiates the OAuth flow by redirecting to Atlassian
 */
export function authorize(req, res) {
  // Get parameters from query (sent by MCP client)
  const mcpClientId = req.query.client_id; // VS Code's client ID
  const mcpRedirectUri = req.query.redirect_uri; // VS Code's redirect URI
  const mcpScope = req.query.scope;
  const responseType = req.query.response_type || 'code';
  const mcpState = req.query.state; // Use MCP client's state
  const mcpCodeChallenge = req.query.code_challenge; // MCP client's PKCE challenge
  const mcpCodeChallengeMethod = req.query.code_challenge_method;
  const mcpResource = req.query.resource; // MCP resource parameter (RFC 8707)

  console.log('↔️ GET /authorize request from MCP client:', {
    mcpClientId,
    mcpRedirectUri,
    mcpScope,
    responseType,
    mcpState,
    mcpCodeChallenge,
    mcpCodeChallengeMethod,
    mcpResource,
    queryParams: req.query,
  });

  // Use MCP client's PKCE parameters if provided, otherwise generate our own (fallback)
  let codeChallenge, codeChallengeMethod;
  let codeVerifier = null; // We don't store the verifier when using MCP's PKCE

  if (mcpCodeChallenge && mcpCodeChallengeMethod) {
    // Use the MCP client's PKCE parameters
    codeChallenge = mcpCodeChallenge;
    codeChallengeMethod = mcpCodeChallengeMethod;
    console.log('  Using MCP client PKCE parameters');
  } else {
    // Generate our own PKCE parameters (fallback for non-MCP clients)
    codeVerifier = generateCodeVerifier();
    codeChallenge = generateCodeChallenge(codeVerifier);
    codeChallengeMethod = 'S256';
    console.log('  Generated our own PKCE parameters');
  }

  // Store MCP client info in session for later use in callback
  req.session.codeVerifier = codeVerifier; // Will be null if using MCP client's PKCE
  req.session.state = mcpState; // Store the MCP client's state
  req.session.mcpClientId = mcpClientId;
  req.session.mcpRedirectUri = mcpRedirectUri; // This is VS Code's callback URI
  req.session.mcpScope = mcpScope;
  req.session.mcpResource = mcpResource; // Store the resource parameter
  req.session.usingMcpPkce = !codeVerifier; // Flag to indicate if we're using MCP's PKCE

  console.log('  Saved in session:', {
    state: mcpState,
    codeVerifier: codeVerifier ? 'present' : 'null (using MCP PKCE)',
    mcpClientId,
    mcpRedirectUri,
    mcpResource,
    usingMcpPkce: !codeVerifier,
  });

  // Build URL parameters, omitting state if it's undefined
  const url = createAtlassianAuthUrl({
    codeChallenge,
    codeChallengeMethod,
    state: mcpState,
    responseType,
  });

  console.log('  Redirecting to Atlassian:', url);
  res.redirect(url);
}

/**
 * OAuth Callback Handler
 * Handles the callback from Atlassian and exchanges code for tokens
 */
export async function callback(req, res) {
  const { code, state, normalizedState } = extractAtlassianCallbackParams(req);

  console.log('↔️ OAuth callback received:', {
    code: code ? 'present' : 'missing',
    state,
    sessionState: req.session.state,
    sessionData: {
      codeVerifier: req.session.codeVerifier ? 'present' : 'missing',
      mcpClientId: req.session.mcpClientId,
      mcpRedirectUri: req.session.mcpRedirectUri,
      manualFlow: req.session.manualFlow ? 'present' : 'missing',
    },
  });

  // Check if this is a manual flow callback
  if (isManualFlow(req)) {
    return await handleManualFlowCallback(req, res, { code, normalizedState });
  }

  // State validation: both should be undefined or both should match
  const stateMatches = normalizedState === req.session.state;

  if (!code || !stateMatches) {
    console.error('  State or code validation failed:', {
      hasCode: !!code,
      stateMatch: stateMatches,
      receivedState: state,
      normalizedState,
      expectedState: req.session.state,
    });
    return res.status(400).send('Invalid state or code');
  }
  const mcpRedirectUri = req.session.mcpRedirectUri;
  const usingMcpPkce = req.session.usingMcpPkce;

  // If we're using MCP's PKCE, we can't do the token exchange here
  // because we don't have the code verifier. Instead, we need to pass
  // the authorization code back to the MCP client so it can complete the exchange.
  if (usingMcpPkce && mcpRedirectUri) {
    console.log(' Using MCP PKCE - redirecting code back to MCP client');

    // Clear session data
    delete req.session.codeVerifier;
    delete req.session.state;
    delete req.session.mcpClientId;
    delete req.session.mcpRedirectUri;
    delete req.session.mcpScope;
    delete req.session.mcpResource;
    delete req.session.usingMcpPkce;

    // Redirect back to MCP client with the authorization code
    const redirectUrl = `${mcpRedirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(normalizedState)}`;
    console.log(' Redirecting to MCP client with auth code:', redirectUrl);
    return res.redirect(redirectUrl);
  }

  // If we reach here, it means we have an invalid state:
  // - No MCP redirect URI, or
  // - Not using MCP PKCE (which shouldn't happen with MCP clients)
  console.error('  Invalid callback state:', {
    usingMcpPkce,
    mcpRedirectUri: mcpRedirectUri ? 'present' : 'missing',
  });
  
  return res.status(400).send('Invalid OAuth callback state - missing redirect URI or invalid PKCE configuration');
}

/**
 * OAuth token endpoint for MCP clients (POST)
 * Handles token exchange for both authorization_code and refresh_token grant types
 * 
 * Per RFC 6749 Section 3.2, the token endpoint is used by the client to obtain an access token
 * by presenting its authorization grant or refresh token. This implementation supports:
 * - authorization_code grant (RFC 6749 Section 4.1.3)
 * - refresh_token grant (RFC 6749 Section 6)
 * 
 * @see https://tools.ietf.org/html/rfc6749#section-3.2
 * @see https://tools.ietf.org/html/rfc6749#section-4.1.3
 * @see https://tools.ietf.org/html/rfc6749#section-6
 */
export async function accessToken(req, res) {
  console.log('↔️ OAuth token exchange request:', {
    body: sanitizeObjectWithJWTs(req.body),
    contentType: req.headers['content-type'],
  });

  try {
    const { grant_type, code, client_id, code_verifier, resource, refresh_token } = req.body;

    // Handle different grant types
    if (grant_type === 'authorization_code') {
      return await handleAuthorizationCodeGrant(req, res, { code, client_id, code_verifier, resource });
    } else if (grant_type === 'refresh_token') {
      return await handleRefreshTokenGrant(req, res, { refresh_token, client_id, resource });
    } else {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code and refresh_token grant types are supported',
      });
    }
  } catch (error) {
    console.error('OAuth token error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during token exchange',
    });
  }
}

/**
 * Handle authorization code grant type
 */
async function handleAuthorizationCodeGrant(req, res, { code, client_id, code_verifier, resource }) {
  if (!code) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing authorization code',
    });
  }

  if (!code_verifier) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing code_verifier for PKCE',
    });
  }

  // Exchange the authorization code for Atlassian tokens
  let tokenData;
  try {
    tokenData = await exchangeCodeForAtlassianTokens({ 
      code, 
      codeVerifier: code_verifier 
    });
    
    console.log('  🔑 Atlassian token exchange successful:', sanitizeObjectWithJWTs(tokenData));
  } catch (error) {
    console.error('Atlassian token exchange failed:', error.message);
    return res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Authorization code is invalid or expired',
    });
  }

  // Create JWT access token with embedded Atlassian token
  const jwt = await createJiraMCPAuthToken(tokenData, {
    resource: resource || process.env.VITE_AUTH_SERVER_URL
  });

  // Create refresh token
  const { refreshToken } = await createJiraMCPRefreshToken(tokenData, {
    resource: resource || process.env.VITE_AUTH_SERVER_URL
  });

  // Return OAuth-compliant response with actual JWT expiration time
  const jwtExpiresIn = Math.max(60, (tokenData.expires_in || 3600) - 60);
  return res.json({
    access_token: jwt,
    token_type: 'Bearer',
    expires_in: jwtExpiresIn,
    refresh_token: refreshToken,
    scope: getAtlassianConfig().scopes,
  });
}

/**
 * Handle refresh token grant type by calling the existing refresh token logic
 */
async function handleRefreshTokenGrant(req, res, { refresh_token, client_id, resource }) {
  console.log('🔄 REFRESH TOKEN FLOW - Routing refresh token request from /access-token to refresh handler');
  
  // Reconstruct the request object for the refresh token handler
  // We need to preserve the original request structure but modify the body
  const refreshReq = {
    ...req,
    body: {
      grant_type: 'refresh_token',
      refresh_token,
      client_id,
      scope: req.body.scope
    },
    headers: req.headers || {} // Ensure headers exist
  };
  
  // Call the existing refresh token logic
  return await refreshToken(refreshReq, res);
}

/**
 * OAuth refresh token endpoint (POST)
 * Handles refresh token grant type to get new access tokens
 */
export async function refreshToken(req, res) {
  console.log('↔️ OAuth refresh token request:', {
    body: sanitizeObjectWithJWTs(req.body),
    contentType: req.headers['content-type'],
  });

  try {
    const { grant_type, refresh_token, client_id, scope } = req.body;
    
    console.log('🔄 REFRESH TOKEN FLOW - Starting validation:', {
      grant_type,
      has_refresh_token: !!refresh_token,
      refresh_token_length: refresh_token?.length,
      refresh_token_prefix: refresh_token ? refresh_token.substring(0, 20) + '...' : 'none',
      client_id,
      scope,
      request_headers: Object.keys(req.headers),
    });

    if (grant_type !== 'refresh_token') {
      console.log('🔄 REFRESH TOKEN FLOW - ERROR: Unsupported grant type:', grant_type);
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only refresh_token grant type is supported',
      });
    }

    if (!refresh_token) {
      console.log('🔄 REFRESH TOKEN FLOW - ERROR: Missing refresh token in request body');
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing refresh_token',
      });
    }

    // Verify and decode the refresh token
    let refreshPayload;
    console.log('🔄 REFRESH TOKEN FLOW - Attempting to verify JWT refresh token');
    try {
      refreshPayload = await jwtVerify(refresh_token);
      console.log('🔄 REFRESH TOKEN FLOW - JWT verification successful:', {
        type: refreshPayload.type,
        sub: refreshPayload.sub,
        exp: refreshPayload.exp,
        iss: refreshPayload.iss,
        aud: refreshPayload.aud,
        scope: refreshPayload.scope,
        has_atlassian_refresh_token: !!refreshPayload.atlassian_refresh_token,
        atlassian_refresh_token_length: refreshPayload.atlassian_refresh_token?.length,
        atlassian_refresh_token_prefix: refreshPayload.atlassian_refresh_token ? 
          refreshPayload.atlassian_refresh_token.substring(0, 20) + '...' : 'none',
        payload_keys: Object.keys(refreshPayload),
      });
    } catch (error) {
      console.error('🔄 REFRESH TOKEN FLOW - ERROR: JWT verification failed:', {
        error_name: error.constructor.name,
        error_message: error.message,
        error_stack: error.stack,
        refresh_token_sample: refresh_token ? refresh_token.substring(0, 50) + '...' : 'none',
      });
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired refresh token',
      });
    }

    // Validate it's actually a refresh token
    console.log('🔄 REFRESH TOKEN FLOW - Validating token type:', {
      expected_type: 'refresh_token',
      actual_type: refreshPayload.type,
      type_match: refreshPayload.type === 'refresh_token',
    });
    
    if (refreshPayload.type !== 'refresh_token') {
      console.log('🔄 REFRESH TOKEN FLOW - ERROR: Token is not a refresh token:', {
        type: refreshPayload.type,
        expected: 'refresh_token',
      });
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Token is not a refresh token',
      });
    }

    // Check if refresh token is expired
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExp = refreshPayload.exp ? refreshPayload.exp - now : null;
    console.log('🔄 REFRESH TOKEN FLOW - Checking expiration:', {
      current_timestamp: now,
      token_exp: refreshPayload.exp,
      time_until_expiration_seconds: timeUntilExp,
      time_until_expiration_minutes: timeUntilExp ? Math.round(timeUntilExp / 60) : null,
      is_expired: refreshPayload.exp && now >= refreshPayload.exp,
    });
    
    if (refreshPayload.exp && now >= refreshPayload.exp) {
      console.log('🔄 REFRESH TOKEN FLOW - ERROR: Refresh token has expired');
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Refresh token has expired',
      });
    }

    // Use the Atlassian refresh token to get a new access token
    let newAtlassianTokens;
    try {
      const ATLASSIAN_CONFIG = getAtlassianConfig();
      console.log('🔄 REFRESH TOKEN FLOW - Making request to Atlassian token endpoint:', {
        atlassian_token_url: ATLASSIAN_CONFIG.tokenUrl,
        atlassian_client_id: ATLASSIAN_CONFIG.clientId,
        has_client_secret: !!ATLASSIAN_CONFIG.clientSecret,
        client_secret_length: ATLASSIAN_CONFIG.clientSecret?.length,
        atlassian_refresh_token_length: refreshPayload.atlassian_refresh_token?.length,
        atlassian_refresh_token_prefix: refreshPayload.atlassian_refresh_token ? 
          refreshPayload.atlassian_refresh_token.substring(0, 20) + '...' : 'none',
      });
      
      const atlassianRequestBody = {
        grant_type: 'refresh_token',
        client_id: ATLASSIAN_CONFIG.clientId,
        client_secret: ATLASSIAN_CONFIG.clientSecret,
        refresh_token: refreshPayload.atlassian_refresh_token,
      };
      
      console.log('🔄 REFRESH TOKEN FLOW - Atlassian request body:', {
        grant_type: atlassianRequestBody.grant_type,
        client_id: atlassianRequestBody.client_id,
        has_client_secret: !!atlassianRequestBody.client_secret,
        has_refresh_token: !!atlassianRequestBody.refresh_token,
        refresh_token_sample: atlassianRequestBody.refresh_token ? 
          atlassianRequestBody.refresh_token.substring(0, 30) + '...' : 'none',
      });
      
      console.log('  Using Atlassian refresh token to get new access token');
      const tokenRes = await fetch(ATLASSIAN_CONFIG.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(atlassianRequestBody),
      });

      console.log('🔄 REFRESH TOKEN FLOW - Atlassian response received:', {
        status: tokenRes.status,
        status_text: tokenRes.statusText,
        ok: tokenRes.ok,
        headers: Object.fromEntries(tokenRes.headers.entries()),
      });

      newAtlassianTokens = await tokenRes.json();
      
      console.log('🔄 REFRESH TOKEN FLOW - Atlassian response body:', {
        has_access_token: !!newAtlassianTokens.access_token,
        has_refresh_token: !!newAtlassianTokens.refresh_token,
        expires_in: newAtlassianTokens.expires_in,
        token_type: newAtlassianTokens.token_type,
        scope: newAtlassianTokens.scope,
        error: newAtlassianTokens.error,
        error_description: newAtlassianTokens.error_description,
        response_keys: Object.keys(newAtlassianTokens),
      });
      
      if (!newAtlassianTokens.access_token) {
        const errorDetails = {
          atlassian_error: newAtlassianTokens.error,
          atlassian_error_description: newAtlassianTokens.error_description,
          full_response: newAtlassianTokens,
          http_status: tokenRes.status,
        };
        console.error('🔄 REFRESH TOKEN FLOW - ERROR: No access token in Atlassian response:', errorDetails);
        throw new Error(`Atlassian refresh failed: ${JSON.stringify(errorDetails)}`);
      }
      
      console.log('  🔑 Atlassian refresh token exchange successful:', sanitizeObjectWithJWTs(newAtlassianTokens));
    } catch (error) {
      console.error('🔄 REFRESH TOKEN FLOW - ERROR: Atlassian refresh token exchange failed:', {
        error_name: error.constructor.name,
        error_message: error.message,
        error_stack: error.stack,
        is_fetch_error: error.name === 'FetchError' || error.code === 'FETCH_ERROR',
      });
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Failed to refresh Atlassian access token',
      });
    }

    // Create new access token with new Atlassian tokens
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT access token');
    const newAccessToken = await createJiraMCPAuthToken(newAtlassianTokens, {
      resource: refreshPayload.aud,
      scope: refreshPayload.scope,
      sub: refreshPayload.sub,
      iss: refreshPayload.iss
    });
    console.log('🔄 REFRESH TOKEN FLOW - New JWT access token created:', {
      token_length: newAccessToken?.length,
      token_prefix: newAccessToken ? newAccessToken.substring(0, 20) + '...' : 'none',
    });

    // Create new refresh token (Atlassian always provides a new rotating refresh token)
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT refresh token');
    const { refreshToken: newRefreshToken } = await createJiraMCPRefreshToken(newAtlassianTokens, {
      resource: refreshPayload.aud,
      scope: refreshPayload.scope,
      sub: refreshPayload.sub,
      iss: refreshPayload.iss
    });
    console.log('🔄 REFRESH TOKEN FLOW - New JWT refresh token created:', {
      token_length: newRefreshToken?.length,
      token_prefix: newRefreshToken ? newRefreshToken.substring(0, 20) + '...' : 'none',
    });

    console.log('🔄 REFRESH TOKEN FLOW - SUCCESS: OAuth refresh token exchange successful for client:', client_id);

    // Return new tokens
    const jwtExpiresIn = Math.max(60, (newAtlassianTokens.expires_in || 3600) - 60);
    const responsePayload = {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: jwtExpiresIn,
      refresh_token: newRefreshToken,
      scope: refreshPayload.scope,
    };
    
    console.log('🔄 REFRESH TOKEN FLOW - Final response:', {
      has_access_token: !!responsePayload.access_token,
      has_refresh_token: !!responsePayload.refresh_token,
      expires_in: responsePayload.expires_in,
      token_type: responsePayload.token_type,
      scope: responsePayload.scope,
    });
    
    return res.json(responsePayload);

  } catch (error) {
    console.error('🔄 REFRESH TOKEN FLOW - FATAL ERROR: Unexpected error during refresh flow:', {
      error_name: error.constructor.name,
      error_message: error.message,
      error_stack: error.stack,
    });
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during token refresh',
    });
  }
}


/**
 * Helper function to decode Atlassian JWT refresh token and extract expiration
 * @param {string} refreshToken - The JWT refresh token from Atlassian
 * @returns {number|null} - The expiration timestamp or null if can't decode
 */
function extractAtlassianRefreshTokenExpiration(refreshToken) {
  try {
    // Decode the JWT refresh token from Atlassian (don't verify signature, just extract payload)
    const refreshTokenParts = refreshToken.split('.');
    if (refreshTokenParts.length === 3) {
      const payload = JSON.parse(Buffer.from(refreshTokenParts[1], 'base64').toString());
      if (payload.exp) {
        console.log('  Using Atlassian JWT refresh token expiration with 1-day buffer');
        console.log('  Atlassian refresh token expires:', new Date(payload.exp * 1000).toISOString());
        return payload.exp - 86400; // 1 day buffer
      }
    }
  } catch (error) {
    console.log('  Could not decode Atlassian refresh token JWT:', error.message);
  }
  return null;
}

/**
 * Creates a Jira MCP access token (JWT) with embedded Atlassian credentials
 * @param {Object} atlassianTokens - Token data from Atlassian
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.resource] - The resource parameter (audience) 
 * @param {string} [options.scope] - The token scope
 * @param {string} [options.sub] - Subject (user ID)
 * @param {string} [options.iss] - Issuer
 * @returns {Promise<string>} - The signed JWT access token
 */
async function createJiraMCPAuthToken(atlassianTokens, options = {}) {
  const ATLASSIAN_CONFIG = getAtlassianConfig();
  
  // Calculate JWT expiration: 1 minute before Atlassian token expires
  const atlassianExpiresIn = atlassianTokens.expires_in || 3600;
  const jwtExpiresIn = process.env.TEST_SHORT_AUTH_TOKEN_EXP ? 
    parseInt(process.env.TEST_SHORT_AUTH_TOKEN_EXP) : 
    Math.max(60, atlassianExpiresIn - 60);
    
  const jwtExpirationTime = Math.floor(Date.now() / 1000) + jwtExpiresIn;
  
  if (process.env.TEST_SHORT_AUTH_TOKEN_EXP) {
    console.log(`🧪 TEST MODE: Creating JWT token with ${jwtExpiresIn}s expiration (expires at ${new Date(jwtExpirationTime * 1000).toISOString()})`);
  }

  // Create JWT with embedded Atlassian token
  const jwt = await jwtSign({
    sub: options.sub || ('user-' + randomUUID()),
    iss: options.iss || process.env.VITE_AUTH_SERVER_URL,
    aud: options.resource || process.env.VITE_AUTH_SERVER_URL,
    scope: options.scope || ATLASSIAN_CONFIG.scopes,
    atlassian_access_token: atlassianTokens.access_token,
    refresh_token: atlassianTokens.refresh_token,
    exp: jwtExpirationTime
  });

  return jwt;
}

/**
 * Creates a Jira MCP refresh token (JWT) with embedded Atlassian refresh token
 * @param {Object} atlassianTokens - Token data from Atlassian
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.resource] - The resource parameter (audience)
 * @param {string} [options.scope] - The token scope
 * @param {string} [options.sub] - Subject (user ID)
 * @param {string} [options.iss] - Issuer
 * @returns {Promise<Object>} - Object with refreshToken and expiresIn
 */
async function createJiraMCPRefreshToken(atlassianTokens, options = {}) {
  const ATLASSIAN_CONFIG = getAtlassianConfig();
  
  // Calculate refresh token expiration to match Atlassian's refresh token lifetime
  let refreshTokenExp;
  
  // Try to decode Atlassian's JWT refresh token to get actual expiration
  if (atlassianTokens.refresh_token) {
    refreshTokenExp = extractAtlassianRefreshTokenExpiration(atlassianTokens.refresh_token);
  }
  
  // Fallback if we couldn't decode the JWT or no refresh token
  if (!refreshTokenExp) {
    if (atlassianTokens.refresh_expires_in) {
      // Use refresh_expires_in if provided
      refreshTokenExp = Math.floor(Date.now() / 1000) + atlassianTokens.refresh_expires_in - 86400; // 1 day buffer
      console.log('  Using Atlassian refresh_expires_in with 1-day buffer');
    } else {
      // Fallback to 90 days (common for Atlassian refresh tokens)
      refreshTokenExp = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
      console.log('  Using 90-day fallback for refresh token expiration');
    }
  }

  // Create a refresh token (longer-lived, contains Atlassian refresh token)
  const refreshToken = await jwtSign({
    type: 'refresh_token',
    sub: options.sub || ('user-' + randomUUID()),
    iss: options.iss || process.env.VITE_AUTH_SERVER_URL,
    aud: options.resource || process.env.VITE_AUTH_SERVER_URL,
    scope: options.scope || ATLASSIAN_CONFIG.scopes,
    atlassian_refresh_token: atlassianTokens.refresh_token,
    exp: refreshTokenExp
  });

  return {
    refreshToken,
    expiresIn: refreshTokenExp - Math.floor(Date.now() / 1000)
  };
}