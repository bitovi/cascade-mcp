/**
 * Atlassian OAuth Authorization Code Flow Helpers
 * 
 * This module provides utilities for handling the OAuth authorization code flow
 * specifically for Atlassian services like Jira.
 */

// Atlassian OAuth configuration interface
export interface AtlassianConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string;
  scopes: string | undefined;
}

// Authorization URL parameters interface
export interface AuthUrlParams {
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  responseType?: string;
}

// Callback parameters interface
export interface CallbackParams {
  code: string;
  state?: string;
  normalizedState?: string;
}

// Token exchange parameters interface
export interface TokenExchangeParams {
  code: string;
  codeVerifier: string;
}

// Atlassian token response interface
export interface AtlassianTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

// Express request interface for callback
interface CallbackRequest {
  query: {
    code?: string;
    state?: string;
  };
}

/**
 * Get Atlassian OAuth configuration
 * @returns Atlassian OAuth configuration
 */
export function getAtlassianConfig(): AtlassianConfig {
  return {
    authUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    clientId: process.env.VITE_JIRA_CLIENT_ID,
    clientSecret: process.env.JIRA_CLIENT_SECRET,
    redirectUri: (process.env.VITE_AUTH_SERVER_URL || '') + '/callback', // Server callback for MCP
    scopes: process.env.VITE_JIRA_SCOPE,
  };
}

/**
 * Creates an Atlassian authorization URL for the OAuth flow
 * @param params - Authorization parameters
 * @returns The complete authorization URL
 */
export function createAtlassianAuthUrl({ 
  codeChallenge, 
  codeChallengeMethod, 
  state, 
  responseType = 'code' 
}: AuthUrlParams): string {
  const ATLASSIAN = getAtlassianConfig();
  
  const urlParams: Record<string, string> = {
    client_id: ATLASSIAN.clientId || '', // Always use our Atlassian client ID for the actual auth
    response_type: responseType,
    redirect_uri: ATLASSIAN.redirectUri, // Use our server callback URI
    scope: ATLASSIAN.scopes || '', // Use our scopes for Atlassian
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
 * @param req - Express request object
 * @returns Object containing code, state, and normalizedState
 */
export function extractAtlassianCallbackParams(req: CallbackRequest): CallbackParams {
  const { code, state } = req.query;
  
  // Handle URL encoding issue: + gets decoded as space, so we need to convert back
  const normalizedState = state ? state.replace(/ /g, '+') : state;
  
  return {
    code: code || '',
    state,
    normalizedState,
  };
}

/**
 * Exchanges an authorization code for Atlassian access tokens
 * @param params - Token exchange parameters
 * @returns Token response from Atlassian
 * @throws Error if token exchange fails
 */
export async function exchangeCodeForAtlassianTokens({ 
  code, 
  codeVerifier 
}: TokenExchangeParams): Promise<AtlassianTokenResponse> {
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

  const tokenData = await tokenRes.json() as AtlassianTokenResponse;
  
  if (!tokenData.access_token) {
    throw new Error(`Atlassian token exchange failed: ${JSON.stringify(tokenData)}`);
  }

  return tokenData;
}
