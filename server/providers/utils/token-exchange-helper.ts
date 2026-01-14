/**
 * Token Exchange Helper Utilities
 * 
 * Centralizes OAuth token exchange logic to eliminate duplication across
 * provider implementations. Supports both PKCE and traditional OAuth flows,
 * with JSON and URL-encoded content types.
 */

import type { TokenExchangeParams, StandardTokenResponse, RefreshTokenParams } from './provider-interface.js';

/**
 * Configuration for token exchange request
 */
export interface TokenExchangeConfig {
  /** Token endpoint URL */
  tokenUrl: string;
  /** Environment variable name for client ID */
  clientIdEnvVar: string;
  /** Environment variable name for client secret */
  clientSecretEnvVar: string;
  /** Whether to include PKCE code_verifier */
  usePKCE: boolean;
  /** Content-Type for the request ('json' or 'form') */
  contentType: 'json' | 'form';
  /** Default token expiration in seconds if not provided by provider */
  defaultExpiresIn?: number;
  /** Redirect path for callback (e.g., '/auth/callback/figma') */
  redirectPath: string;
}

/**
 * Exchange authorization code for access/refresh tokens
 * 
 * @param config - Provider-specific configuration
 * @param params - Token exchange parameters (code, codeVerifier, redirectUri)
 * @returns Standardized token response
 * @throws Error if token exchange fails
 */
export async function performTokenExchange(
  config: TokenExchangeConfig,
  params: TokenExchangeParams
): Promise<StandardTokenResponse> {
  // Extract provider name from tokenUrl for logging
  const providerName = config.tokenUrl.includes('atlassian') ? 'ATLASSIAN' : 
                       config.tokenUrl.includes('figma') ? 'FIGMA' : 'GOOGLE';

  console.log(`\n========== ${providerName} TOKEN EXCHANGE START ==========`);
  console.log(`[${providerName}] Preparing token exchange request...`);

  const clientId = process.env[config.clientIdEnvVar];
  const clientSecret = process.env[config.clientSecretEnvVar];
  const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
  const redirectUri = params.redirectUri || `${baseUrl}${config.redirectPath}`;

  console.log(`[${providerName}] Environment variables:`);
  console.log(`[${providerName}]   - Client ID: ${clientId?.substring(0, 10)}...`);
  console.log(`[${providerName}]   - Client Secret: ${clientSecret ? 'present (length: ' + clientSecret.length + ')' : 'MISSING'}`);
  console.log(`[${providerName}]   - Redirect URI: ${redirectUri}`);

  // Build request body
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: clientId!,
    client_secret: clientSecret!,
    code: params.code,
    redirect_uri: redirectUri,
  };

  // Add PKCE code_verifier if required
  if (config.usePKCE) {
    body.code_verifier = params.codeVerifier;
    console.log(`[${providerName}] PKCE enabled - code_verifier length: ${params.codeVerifier.length}`);
  }

  console.log(`[${providerName}] Token request (redacted):`, {
    grant_type: body.grant_type,
    client_id: body.client_id.substring(0, 10) + '...',
    code: body.code.substring(0, 20) + '...',
    redirect_uri: body.redirect_uri,
    code_verifier: config.usePKCE ? body.code_verifier.substring(0, 10) + '...' : 'N/A',
  });

  // Determine headers and body encoding
  const headers: Record<string, string> = {};
  let requestBody: string;

  if (config.contentType === 'json') {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    requestBody = new URLSearchParams(body).toString();
  }

  console.log(`[${providerName}] Making POST request to: ${config.tokenUrl}`);
  console.log(`[${providerName}] Content-Type: ${headers['Content-Type']}`);

  // Make token exchange request
  let tokenRes: Response;
  try {
    tokenRes = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: requestBody,
    });
  } catch (err: any) {
    console.error(`[${providerName}] FATAL: Network error:`, err.message);
    throw new Error(`Network error contacting ${providerName}: ${err.message}`);
  }

  console.log(`[${providerName}] Response status: ${tokenRes.status} ${tokenRes.statusText}`);

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    console.error(`[${providerName}] Token exchange failed (${tokenRes.status}): ${errorText}`);
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errorText}`);
  }

  const tokenData = (await tokenRes.json()) as any;

  console.log(`[${providerName}] Response:`, {
    hasAccessToken: !!tokenData.access_token,
    hasRefreshToken: !!tokenData.refresh_token,
    tokenType: tokenData.token_type,
    expiresIn: tokenData.expires_in,
    scope: tokenData.scope,
  });

  // Validate response has access token
  if (!tokenData.access_token) {
    console.error(`[${providerName}] ERROR: No access_token in response`);
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }

  console.log(`[${providerName}] Token exchange successful!`);
  console.log(`[${providerName}] Access token (first 20 chars): ${tokenData.access_token.substring(0, 20)}...`);
  console.log(`========== ${providerName} TOKEN EXCHANGE END ==========\n`);

  // Return standardized response
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_type: tokenData.token_type || 'Bearer',
    expires_in: tokenData.expires_in || config.defaultExpiresIn || 3600,
    scope: tokenData.scope,
    user_id: tokenData.user_id,
  };
}

/**
 * Configuration for token refresh request
 */
export interface TokenRefreshConfig {
  /** Token refresh endpoint URL */
  tokenUrl: string;
  /** Environment variable name for client ID */
  clientIdEnvVar: string;
  /** Environment variable name for client secret */
  clientSecretEnvVar: string;
  /** Content-Type for the request ('json' or 'form') */
  contentType: 'json' | 'form';
  /** Whether to use HTTP Basic Auth (Figma-specific) */
  useBasicAuth?: boolean;
  /** Whether provider rotates refresh tokens (returns new one) */
  rotatesRefreshToken: boolean;
  /** Default token expiration in seconds if not provided by provider */
  defaultExpiresIn?: number;
}

/**
 * Refresh an access token using a refresh token
 * 
 * @param config - Provider-specific configuration
 * @param params - Refresh parameters including the refresh token
 * @returns New access token and refresh token (new if rotated, original if not)
 * @throws Error if token refresh fails
 */
export async function performTokenRefresh(
  config: TokenRefreshConfig,
  params: RefreshTokenParams
): Promise<StandardTokenResponse> {
  // Extract provider name from tokenUrl for logging
  const providerName = config.tokenUrl.includes('atlassian') ? 'ATLASSIAN' : 
                       config.tokenUrl.includes('figma') ? 'FIGMA' : 'GOOGLE';

  console.log(`[${providerName}] Refreshing access token`);
  console.log(`[${providerName}]   - Refresh token length: ${params.refreshToken.length}`);
  console.log(`[${providerName}]   - Using endpoint: ${config.tokenUrl}`);

  const clientId = process.env[config.clientIdEnvVar]!;
  const clientSecret = process.env[config.clientSecretEnvVar]!;

  // Determine headers and body
  const headers: Record<string, string> = {};
  let requestBody: string;

  if (config.useBasicAuth) {
    // Figma uses HTTP Basic Auth for refresh
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${basicAuth}`;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    // Note: Figma refresh endpoint only requires refresh_token in body
    // No grant_type, client_id, or client_secret needed (those are in Basic Auth)
    requestBody = new URLSearchParams({
      refresh_token: params.refreshToken,
    }).toString();
  } else if (config.contentType === 'json') {
    // Atlassian uses JSON
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: params.refreshToken,
    });
  } else {
    // Google uses form-encoded
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    requestBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: params.refreshToken,
      grant_type: 'refresh_token',
    }).toString();
  }

  // Make refresh request
  let response: Response;
  try {
    response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers,
      body: requestBody,
    });
  } catch (err: any) {
    console.error(`[${providerName}] FATAL: Network error:`, err.message);
    throw new Error(`Network error refreshing ${providerName} token: ${err.message}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${providerName}] Token refresh failed:`, {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(`${providerName} token refresh failed (${response.status}): ${errorText}`);
  }

  const tokenData = (await response.json()) as any;
  console.log(`[${providerName}] Token refresh successful:`, {
    hasAccessToken: !!tokenData.access_token,
    hasRefreshToken: !!tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
  });

  // Return standardized response
  // If provider doesn't rotate refresh tokens, return the original one
  return {
    access_token: tokenData.access_token,
    refresh_token: config.rotatesRefreshToken && tokenData.refresh_token 
      ? tokenData.refresh_token 
      : params.refreshToken,
    token_type: tokenData.token_type || 'Bearer',
    expires_in: tokenData.expires_in || config.defaultExpiresIn || 3600,
    scope: tokenData.scope,
  };
}
