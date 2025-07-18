/**
 * Atlassian OAuth Authorization Code Flow Helpers
 * 
 * This module provides utilities for handling the OAuth authorization code flow
 * specifically for Atlassian services like Jira.
 */

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
 * Creates an Atlassian authorization URL for the OAuth flow
 * @param {Object} params - Authorization parameters
 * @param {string} params.codeChallenge - PKCE code challenge
 * @param {string} params.codeChallengeMethod - PKCE code challenge method (e.g., 'S256')
 * @param {string} [params.state] - Optional state parameter for CSRF protection
 * @param {string} [params.responseType='code'] - OAuth response type
 * @returns {string} The complete authorization URL
 */
export function createAtlassianAuthUrl({ 
  codeChallenge, 
  codeChallengeMethod, 
  state, 
  responseType = 'code' 
}) {
  const ATLASSIAN = getAtlassianConfig();
  
  const urlParams = {
    client_id: ATLASSIAN.clientId, // Always use our Atlassian client ID for the actual auth
    response_type: responseType,
    redirect_uri: ATLASSIAN.redirectUri, // Use our server callback URI
    scope: ATLASSIAN.scopes, // Use our scopes for Atlassian
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  };
  
  // Only include state if it's defined
  if (state !== undefined) {
    urlParams.state = state;
  }

  return `${ATLASSIAN.authUrl}?` + new URLSearchParams(urlParams).toString();
}

/**
 * Extracts and normalizes callback parameters from the OAuth callback request
 * @param {Object} req - Express request object
 * @returns {Object} Object containing code, state, and normalizedState
 */
export function extractAtlassianCallbackParams(req) {
  const { code, state } = req.query;
  
  // Handle URL encoding issue: + gets decoded as space, so we need to convert back
  const normalizedState = state ? state.replace(/ /g, '+') : state;
  
  return {
    code,
    state,
    normalizedState,
  };
}

/**
 * Exchanges an authorization code for Atlassian access tokens
 * @param {Object} params - Token exchange parameters
 * @param {string} params.code - Authorization code from the callback
 * @param {string} params.codeVerifier - PKCE code verifier
 * @returns {Promise<Object>} Token response from Atlassian
 * @throws {Error} If token exchange fails
 */
export async function exchangeCodeForAtlassianTokens({ code, codeVerifier }) {
  const ATLASSIAN = getAtlassianConfig();
  
  const tokenRes = await fetch(ATLASSIAN.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: ATLASSIAN.clientId,
      client_secret: ATLASSIAN.clientSecret,
      code,
      redirect_uri: ATLASSIAN.redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  const tokenData = await tokenRes.json();
  
  if (!tokenData.access_token) {
    throw new Error(`Atlassian token exchange failed: ${JSON.stringify(tokenData)}`);
  }

  return tokenData;
}

/**
 * Get Atlassian OAuth configuration
 * @returns {Object} Atlassian OAuth configuration
 */
export { getAtlassianConfig };
