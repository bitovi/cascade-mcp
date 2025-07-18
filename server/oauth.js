import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import { jwtSign, jwtVerify } from './tokens.js';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';

// Atlassian OAuth configuration
function getAtlassianConfig() {
  return {
    authUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    clientId: process.env.VITE_JIRA_CLIENT_ID,
    clientSecret: process.env.JIRA_CLIENT_SECRET,
    redirectUri: process.env.VITE_AUTH_SERVER_URL + '/callback', // Server callback for MCP
    scopes: process.env.VITE_JIRA_SCOPE,
  };
}

/**
 * OAuth Metadata Endpoint
 * Provides OAuth server configuration for clients
 */
export function oauthMetadata(req, res) {
  console.log('Received request for OAuth metadata');
  res.json({
    issuer: process.env.VITE_AUTH_SERVER_URL,
    authorization_endpoint: process.env.VITE_AUTH_SERVER_URL + '/authorize',
    token_endpoint: process.env.VITE_AUTH_SERVER_URL + '/access-token',
    registration_endpoint: process.env.VITE_AUTH_SERVER_URL + '/register',
    code_challenge_methods_supported: ['S256'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['read:jira-work', 'offline_access'],
  });
}

/**
 * Authorization Entry Point with PKCE
 * Initiates the OAuth flow by redirecting to Atlassian
 */
export function authorize(req, res) {
  const ATLASSIAN = getAtlassianConfig();

  // Get parameters from query (sent by MCP client)
  const mcpClientId = req.query.client_id; // VS Code's client ID
  const mcpRedirectUri = req.query.redirect_uri; // VS Code's redirect URI
  const mcpScope = req.query.scope;
  const responseType = req.query.response_type || 'code';
  const mcpState = req.query.state; // Use MCP client's state
  const mcpCodeChallenge = req.query.code_challenge; // MCP client's PKCE challenge
  const mcpCodeChallengeMethod = req.query.code_challenge_method;
  const mcpResource = req.query.resource; // MCP resource parameter (RFC 8707)

  console.log('GET /authorize request from MCP client:', {
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
    console.log('Using MCP client PKCE parameters');
  } else {
    // Generate our own PKCE parameters (fallback for non-MCP clients)
    codeVerifier = generateCodeVerifier();
    codeChallenge = generateCodeChallenge(codeVerifier);
    codeChallengeMethod = 'S256';
    console.log('Generated our own PKCE parameters');
  }

  // Store MCP client info in session for later use in callback
  req.session.codeVerifier = codeVerifier; // Will be null if using MCP client's PKCE
  req.session.state = mcpState; // Store the MCP client's state
  req.session.mcpClientId = mcpClientId;
  req.session.mcpRedirectUri = mcpRedirectUri; // This is VS Code's callback URI
  req.session.mcpScope = mcpScope;
  req.session.mcpResource = mcpResource; // Store the resource parameter
  req.session.usingMcpPkce = !codeVerifier; // Flag to indicate if we're using MCP's PKCE

  console.log('Storing in session:', {
    state: mcpState,
    codeVerifier: codeVerifier ? 'present' : 'null (using MCP PKCE)',
    mcpClientId,
    mcpRedirectUri,
    mcpResource,
    usingMcpPkce: !codeVerifier,
  });

  // Build URL parameters, omitting state if it's undefined
  const urlParams = {
    client_id: ATLASSIAN.clientId, // Always use our Atlassian client ID for the actual auth
    response_type: responseType,
    redirect_uri: ATLASSIAN.redirectUri, // Use our server callback URI
    scope: ATLASSIAN.scopes, // Use our scopes for Atlassian
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  };
  
  // Only include state if it's defined
  if (mcpState !== undefined) {
    urlParams.state = mcpState;
  }

  const url = `${ATLASSIAN.authUrl}?` + new URLSearchParams(urlParams).toString();

  console.log('Redirecting to Atlassian:', url);
  res.redirect(url);
}

/**
 * OAuth Callback Handler
 * Handles the callback from Atlassian and exchanges code for tokens
 */
export async function callback(req, res) {
  const { code, state } = req.query;

  console.log('OAuth callback received:', {
    code: code ? 'present' : 'missing',
    state,
    sessionState: req.session.state,
    sessionData: {
      codeVerifier: req.session.codeVerifier ? 'present' : 'missing',
      mcpClientId: req.session.mcpClientId,
      mcpRedirectUri: req.session.mcpRedirectUri,
    },
  });

  // Handle URL encoding issue: + gets decoded as space, so we need to convert back
  const normalizedReceivedState = state ? state.replace(/ /g, '+') : state;
  
  // State validation: both should be undefined or both should match
  const stateMatches = normalizedReceivedState === req.session.state;

  if (!code || !stateMatches) {
    console.error('State or code validation failed:', {
      hasCode: !!code,
      stateMatch: stateMatches,
      receivedState: state,
      normalizedReceivedState,
      expectedState: req.session.state,
    });
    return res.status(400).send('Invalid state or code');
  }
  const ATLASSIAN = getAtlassianConfig();
  const mcpRedirectUri = req.session.mcpRedirectUri;
  const usingMcpPkce = req.session.usingMcpPkce;

  // If we're using MCP's PKCE, we can't do the token exchange here
  // because we don't have the code verifier. Instead, we need to pass
  // the authorization code back to the MCP client so it can complete the exchange.
  if (usingMcpPkce && mcpRedirectUri) {
    console.log('Using MCP PKCE - redirecting code back to MCP client');

    // Clear session data
    delete req.session.codeVerifier;
    delete req.session.state;
    delete req.session.mcpClientId;
    delete req.session.mcpRedirectUri;
    delete req.session.mcpScope;
    delete req.session.mcpResource;
    delete req.session.usingMcpPkce;

    // Redirect back to MCP client with the authorization code
    const redirectUrl = `${mcpRedirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(normalizedReceivedState)}`;
    console.log('Redirecting to MCP client with auth code:', redirectUrl);
    return res.redirect(redirectUrl);
  }
  return;

  // Otherwise, handle token exchange ourselves (legacy flow)
  try {
    const tokenRes = await fetch(ATLASSIAN.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: ATLASSIAN.clientId,
        client_secret: ATLASSIAN.clientSecret,
        code,
        redirect_uri: ATLASSIAN.redirectUri,
        code_verifier: req.session.codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      return res.status(500).send('Token exchange failed');
    }

    // Create JWT with embedded Atlassian token
    const jwt = await jwtSign({
      sub: 'user-' + randomUUID(), // Replace with real user ID if available
      iss: process.env.VITE_AUTH_SERVER_URL,
      aud: process.env.VITE_AUTH_SERVER_URL,
      scope: ATLASSIAN.scopes,
      atlassian_access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    });

    // Get the MCP client info from session
    const mcpRedirectUri = req.session.mcpRedirectUri;
    const mcpClientId = req.session.mcpClientId;
    const originalState = req.session.state; // Use the original stored state

    console.log('OAuth callback complete (legacy flow):', {
      mcpClientId,
      mcpRedirectUri,
      hasJwt: !!jwt,
    });

    // Clear session data
    delete req.session.codeVerifier;
    delete req.session.state;
    delete req.session.mcpClientId;
    delete req.session.mcpRedirectUri;
    delete req.session.mcpScope;
    delete req.session.mcpResource;
    delete req.session.usingMcpPkce;
    delete req.session.mcpClientId;
    delete req.session.mcpRedirectUri;
    delete req.session.mcpScope;

    // If this was a VS Code MCP client request, redirect back to VS Code
    if (mcpRedirectUri /*&& mcpRedirectUri.startsWith('vscode://')*/) {
      // Use the MCP client's redirect URI with the original state
      const redirectUrl = `${mcpRedirectUri}?code=${encodeURIComponent(jwt)}&state=${encodeURIComponent(originalState)}`;
      console.log('Redirecting to VS Code MCP client:', redirectUrl);
      return res.redirect(redirectUrl);
    } else {
      console.log('No MCP redirect URI found or not a vscode:// URI:', mcpRedirectUri);
    }

    // Otherwise, display the JWT for manual use
    res.send(`<pre>Your JWT (use in Authorization header):\n\n${jwt}</pre>`);
  } catch (error) {
    logger.error('Callback error:', error);
    res.status(500).send('Authentication failed');
  }
}

/**
 * JWT-Protected Jira Issues Endpoint
 * Fetches Jira issues using the JWT token containing Atlassian access token
 */
export async function jiraIssues(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = auth.slice('Bearer '.length);
  try {
    // Decode JWT to get Atlassian token
    const payload = await jwtVerify(token);
    const atlassianToken = payload.atlassian_access_token;

    if (!atlassianToken) {
      return res.status(401).json({ error: 'No Atlassian token in JWT' });
    }

    // Get accessible sites
    const siteResponse = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${atlassianToken}` },
    });
    const sites = await siteResponse.json();

    if (!sites.length) {
      return res.status(400).json({ error: 'No accessible Jira sites' });
    }

    const cloudId = sites[0].id;

    // Fetch issues
    const issuesResponse = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`, {
      headers: {
        Authorization: `Bearer ${atlassianToken}`,
        Accept: 'application/json',
      },
    });

    const issues = await issuesResponse.json();
    res.json(issues);
  } catch (err) {
    logger.error('JWT verification or Jira API error:', err);
    res.status(500).json({ error: 'Failed to fetch Jira issues' });
  }
}

/**
 * Dynamic Client Registration Endpoint (RFC7591)
 * Allows MCP clients to register themselves dynamically
 */
export function register(req, res) {
  console.log('Received dynamic client registration request:', req.body);

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

    // Validate redirect URIs (MCP clients should use vscode:// scheme)
    const validRedirectUris = redirect_uris.filter(
      (uri) => uri.startsWith('vscode://') || uri.startsWith('http://localhost'),
    );

    if (validRedirectUris.length === 0) {
      return res.status(400).json({
        error: 'invalid_redirect_uri',
        error_description: 'At least one valid redirect URI is required',
      });
    }

    // Return client registration response
    res.json({
      client_id: clientId,
      client_name,
      redirect_uris: validRedirectUris,
      grant_types,
      response_types,
      token_endpoint_auth_method,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      // For public clients (like VS Code), no client_secret is issued
    });

    logger.info(`Dynamic client registered: ${clientId} for ${client_name}`);
  } catch (error) {
    logger.error('Client registration error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to register client',
    });
  }
}
