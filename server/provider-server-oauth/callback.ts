/**
 * Server-Side OAuth Callback Endpoint Factory
 * 
 * Handles OAuth callbacks from providers after user authorization.
 * This is SEPARATE from the MCP PKCE flow - it handles the bridge server
 * receiving access tokens from providers (Atlassian, Figma, etc.).
 * 
 * Key Responsibilities:
 * - Validate callback parameters and state
 * - Exchange authorization code for access/refresh tokens
 * - Store provider tokens in session
 * - Redirect back to connection hub
 * 
 * Usage:
 *   app.get('/auth/callback/atlassian', makeCallback(atlassianProvider, { 
 *     onSuccess: hubCallbackHandler 
 *   }));
 */

import type { Request, Response } from 'express';
import type { OAuthProvider, StandardTokenResponse } from '../providers/provider-interface.js';

/**
 * Creates a callback endpoint for a specific provider
 * Per Q26: Always returns to connection hub
 * Per Implementation Pattern: ALWAYS exchanges tokens and redirects to hub
 * 
 * This function handles Server-Side OAuth callbacks (NOT MCP PKCE flow completion).
 * It ALWAYS:
 * 1. Exchanges provider authorization code for tokens (using client_secret)
 * 2. Stores tokens in session via onSuccess handler
 * 3. Redirects back to connection hub
 * 
 * The MCP PKCE flow is completed separately by the "Done" button handler.
 * 
 * @param provider - The OAuth provider configuration
 * @param options - Callback options including success handler
 * @returns Express route handler
 */
export function makeCallback(
  provider: OAuthProvider,
  options: { onSuccess: (req: Request, tokens: StandardTokenResponse, providerName: string) => Promise<void> }
) {
  return async (req: Request, res: Response) => {
    console.log(`\n========== CALLBACK START: ${provider.name} ==========`);
    console.log(`[CALLBACK] OAuth callback received for provider: ${provider.name}`);
    console.log(`[CALLBACK] Session ID: ${req.sessionID}`);
    console.log(`[CALLBACK] Request URL: ${req.url}`);
    console.log(`[CALLBACK] Request headers:`, {
      host: req.headers.host,
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
      origin: req.headers.origin,
      referer: req.headers.referer,
      cookie: req.headers.cookie ? 'present' : 'missing'
    });

    try {
      const callbackParams = provider.extractCallbackParams(req);

      console.log(`[CALLBACK] Extracted callback params:`);
      console.log(`[CALLBACK]   - code: ${callbackParams.code ? callbackParams.code.substring(0, 20) + '...' : 'MISSING'}`);
      console.log(`[CALLBACK]   - state: ${callbackParams.state ? callbackParams.state.substring(0, 20) + '...' : 'MISSING'}`);
      console.log(`[CALLBACK]   - normalizedState: ${callbackParams.normalizedState ? callbackParams.normalizedState.substring(0, 20) + '...' : 'MISSING'}`);
      console.log(`[CALLBACK]   - error: ${req.query.error || 'none'}`);
      console.log(`[CALLBACK]   - error_description: ${req.query.error_description || 'none'}`);

      if (!callbackParams.code) {
        console.error(`[CALLBACK] ERROR: No authorization code received`);
        throw new Error('No authorization code received');
      }

      console.log(`[CALLBACK] Checking session for stored OAuth parameters...`);
      console.log(`[CALLBACK] Session contents:`, {
        provider: req.session.provider,
        hasCodeVerifier: !!req.session.codeVerifier,
        codeVerifierPreview: req.session.codeVerifier?.substring(0, 10),
        hasState: !!req.session.state,
        statePreview: req.session.state?.substring(0, 10),
        hasCodeChallenge: !!req.session.codeChallenge,
        codeChallengePreview: req.session.codeChallenge?.substring(0, 10),
      });
      
      // Log the FULL code_challenge we sent during authorization
      if (req.session.codeChallenge) {
        console.log(`[CALLBACK] CRITICAL: Code challenge we sent to Atlassian during auth: ${req.session.codeChallenge}`);
        console.log(`[CALLBACK] This should match what Atlassian expects when we send the code_verifier`);
      }

      // Get the code_verifier we generated when initiating this provider's OAuth flow
      // (This is OUR code_verifier for Server-Side OAuth, NOT the MCP client's code_verifier)
      const codeVerifier = req.session.codeVerifier;

      if (!codeVerifier) {
        console.error(`[CALLBACK] ERROR: No code verifier found in session`);
        console.error(`[CALLBACK] Session ID: ${req.sessionID}`);
        console.error(`[CALLBACK] This could mean:`);
        console.error(`[CALLBACK]   1. Session was lost (not preserved across requests)`);
        console.error(`[CALLBACK]   2. Different session ID between authorize and callback`);
        console.error(`[CALLBACK]   3. Session store issue (memory store doesn't persist)`);
        throw new Error('No code verifier found in session - OAuth flow not properly initiated');
      }

      console.log(`[CALLBACK] Found code_verifier in session: ${codeVerifier.substring(0, 10)}... (length: ${codeVerifier.length})`);

      const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
      const redirectUri = `${baseUrl}/auth/callback/${provider.name}`;

      console.log(`[CALLBACK] Preparing token exchange:`);
      console.log(`[CALLBACK]   - Base URL: ${baseUrl}`);
      console.log(`[CALLBACK]   - Redirect URI: ${redirectUri}`);
      console.log(`[CALLBACK]   - Code (first 20 chars): ${callbackParams.code.substring(0, 20)}...`);
      console.log(`[CALLBACK]   - Code verifier (first 10 chars): ${codeVerifier.substring(0, 10)}...`);
      console.log(`[CALLBACK] Exchanging ${provider.name} authorization code for tokens...`);

      // ALWAYS exchange the provider's authorization code for access/refresh tokens
      // This uses Server-Side OAuth with client_secret (NOT MCP PKCE)
      const tokens = await provider.exchangeCodeForTokens({
        code: callbackParams.code,
        codeVerifier: codeVerifier,
        redirectUri: redirectUri,
      });

      console.log(`[CALLBACK] Token exchange successful for ${provider.name}`);
      console.log(`[CALLBACK] Received tokens:`, {
        hasAccessToken: !!tokens.access_token,
        accessTokenPreview: tokens.access_token?.substring(0, 20),
        hasRefreshToken: !!tokens.refresh_token,
        refreshTokenPreview: tokens.refresh_token?.substring(0, 20),
        tokenType: tokens.token_type,
        expiresIn: tokens.expires_in,
        scope: tokens.scope,
      });

      // Store tokens in session (called by hubCallbackHandler)
      console.log(`[CALLBACK] Calling onSuccess handler to store tokens...`);
      await options.onSuccess(req, tokens, provider.name);

      // ALWAYS redirect back to connection hub to show "✓ Connected" status
      // The hub will remain open until user clicks "Done"
      console.log(`[CALLBACK] Redirecting back to connection hub`);
      console.log(`========== CALLBACK END: ${provider.name} SUCCESS ==========\n`);
      res.redirect('/auth/connect');

    } catch (error) {
      console.error(`\n========== CALLBACK ERROR: ${provider.name} ==========`);
      console.error(`[CALLBACK] ${provider.name} OAuth callback error:`, error);
      console.error(`[CALLBACK] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      console.error(`[CALLBACK] Session ID at error: ${req.sessionID}`);
      console.error(`========== CALLBACK ERROR END ==========\n`);
      res.status(500).send(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
}

/**
 * Handler for successful provider authentication
 * Stores tokens in session and updates connected providers list
 * 
 * Called by makeCallback after successful token exchange
 * 
 * @param req - Express request with session
 * @param tokens - Standard token response from provider
 * @param providerName - Name of the provider (e.g., 'atlassian', 'figma')
 */
export async function hubCallbackHandler(
  req: Request,
  tokens: StandardTokenResponse,
  providerName: string
): Promise<void> {
  console.log(`\n========== HUB CALLBACK HANDLER START: ${providerName} ==========`);
  console.log(`[HUB] Storing tokens for provider: ${providerName}`);
  console.log(`[HUB] Session ID: ${req.sessionID}`);
  console.log(`[HUB] Tokens to store:`, {
    hasAccessToken: !!tokens.access_token,
    accessTokenLength: tokens.access_token?.length,
    hasRefreshToken: !!tokens.refresh_token,
    refreshTokenLength: tokens.refresh_token?.length,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
  });

  // Store tokens in session (keyed by provider name)
  if (!req.session.providerTokens) {
    console.log(`[HUB] Initializing providerTokens object in session`);
    req.session.providerTokens = {};
  }

  const expiresAt = Date.now() + (tokens.expires_in * 1000);
  const expiresAtDate = new Date(expiresAt);

  req.session.providerTokens[providerName] = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope,
  };

  console.log(`[HUB] Stored tokens for ${providerName}:`);
  console.log(`[HUB]   - Expires at: ${expiresAtDate.toISOString()} (in ${Math.round(tokens.expires_in / 60)} minutes)`);
  console.log(`[HUB]   - Scope: ${tokens.scope}`);

  // Track connected providers
  if (!req.session.connectedProviders) {
    console.log(`[HUB] Initializing connectedProviders array in session`);
    req.session.connectedProviders = [];
  }
  if (!req.session.connectedProviders.includes(providerName)) {
    req.session.connectedProviders.push(providerName);
    console.log(`[HUB] Added ${providerName} to connected providers list`);
  } else {
    console.log(`[HUB] ${providerName} was already in connected providers list`);
  }

  console.log(`[HUB] Provider ${providerName} now connected`);
  console.log(`[HUB] Connected providers: ${req.session.connectedProviders.join(', ')}`);
  console.log(`========== HUB CALLBACK HANDLER END: ${providerName} ==========\n`);
}
