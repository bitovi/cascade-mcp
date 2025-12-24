/**
 * Connection Done Handler
 *
 * Handles the "Done" button click from the connection hub.
 * This completes the multi-provider OAuth flow by:
 * 1. Creating JWT access token with all connected provider tokens
 * 2. Creating JWT refresh token with provider refresh tokens
 * 3. Generating an authorization code for the MCP client
 * 4. Storing both access and refresh token JWTs for code exchange
 * 5. Redirecting back to the MCP client with the code
 *
 * The MCP client then exchanges this code for both access and refresh tokens.
 *
 * Per Q21: Uses nested JWT structure { atlassian: {...}, figma: {...} }
 *
 * Flow:
 * 1. User has connected one or more providers
 * 2. User clicks "Done" button
 * 3. Create JWT access token with nested provider tokens
 * 4. Create JWT refresh token with provider refresh tokens
 * 5. Generate authorization code (single-use, 10-min expiration)
 * 6. Store code → {accessToken JWT, refreshToken JWT} mapping
 * 7. Redirect to MCP client with code + state
 * 8. MCP client calls /access-token to exchange code for both JWTs
 */

import type { Request, Response } from 'express';
import { createMCPAccessToken, createMCPRefreshToken } from '../pkce/token-helpers.js';
import { generateAuthorizationCode, storeAuthorizationCode } from '../pkce/authorization-code-store.js';

/**
 * Handles the "Done" button click
 * Creates multi-provider JWTs (access + refresh) with all connected provider tokens
 */
export async function handleConnectionDone(req: Request, res: Response): Promise<void> {
  console.log('Processing connection hub "Done" action');
  console.log('  Session state:', {
    mcpRedirectUri: req.session.mcpRedirectUri,
    usingMcpPkce: req.session.usingMcpPkce,
    mcpState: req.session.mcpState,
    mcpClientId: req.session.mcpClientId,
    connectedProviders: req.session.connectedProviders,
  });

  const connectedProviders = req.session.connectedProviders || [];
  const providerTokens = req.session.providerTokens || {};

  if (connectedProviders.length === 0) {
    console.log('  Error: No providers connected');
    res.status(400).send('No providers connected. Please connect at least one service.');
    return;
  }

  console.log(`  Creating JWTs for providers: ${connectedProviders.join(', ')}`);

  try {
    // Extract provider tokens (flat structure from session)
    const atlassianTokens = providerTokens['atlassian'];
    const figmaTokens = providerTokens['figma'];

    if (!atlassianTokens && !figmaTokens) {
      throw new Error('No provider tokens found - please connect at least one service');
    }

    // Build provider tokens object for token creation functions
    const providers: Record<string, any> = {};
    if (atlassianTokens) {
      providers.atlassian = {
        access_token: atlassianTokens.access_token,
        refresh_token: atlassianTokens.refresh_token,
        token_type: atlassianTokens.token_type || 'Bearer',
        expires_in: atlassianTokens.expires_in || 3600,
        scope: atlassianTokens.scope,
      };
      console.log('  Adding Atlassian credentials to tokens');
    }

    if (figmaTokens) {
      providers.figma = {
        access_token: figmaTokens.access_token,
        refresh_token: figmaTokens.refresh_token,
        token_type: figmaTokens.token_type || 'Bearer',
        expires_in: figmaTokens.expires_in || 7776000, // Figma default: 90 days
        scope: figmaTokens.scope,
      };
      console.log('  Adding Figma credentials to tokens');
    }

    // Create JWT access token with all provider credentials
    console.log('  Creating JWT access token');
    const accessTokenJwt = await createMCPAccessToken(providers, {
      resource: req.session.mcpResource || process.env.VITE_AUTH_SERVER_URL,
      scope: req.session.mcpScope || '',
      iss: process.env.VITE_AUTH_SERVER_URL,
    });
    console.log('  ✓ JWT access token created');

    // Create JWT refresh token with provider refresh tokens
    console.log('  Creating JWT refresh token');
    const { refreshToken: refreshTokenJwt } = await createMCPRefreshToken(providers, {
      resource: req.session.mcpResource || process.env.VITE_AUTH_SERVER_URL,
      scope: req.session.mcpScope || '',
      iss: process.env.VITE_AUTH_SERVER_URL,
    });
    console.log('  ✓ JWT refresh token created');

    // Clear session provider data (tokens now embedded in JWTs)
    delete req.session.providerTokens;
    delete req.session.connectedProviders;
    delete req.session.provider;
    delete req.session.codeVerifier;

    // Check if this was initiated by an MCP client (has redirect URI)
    if (req.session.mcpRedirectUri && req.session.usingMcpPkce) {
      // OAuth 2.0 Authorization Code Flow (RFC 6749 Section 4.1.2)
      // Generate authorization code and store BOTH access and refresh token JWTs
      const authCode = generateAuthorizationCode();
      storeAuthorizationCode(
        authCode,
        accessTokenJwt,
        req.session.mcpClientId,
        req.session.mcpRedirectUri,
        refreshTokenJwt  // Store refresh token JWT with authorization code
      );

      // Build redirect URL with code and state
      const redirectUrl = new URL(req.session.mcpRedirectUri);
      redirectUrl.searchParams.set('code', authCode);

      if (req.session.mcpState) {
        redirectUrl.searchParams.set('state', req.session.mcpState);
      }

      console.log(`  Redirecting to MCP client with authorization code: ${redirectUrl.origin}`);

      // Clear MCP session data
      delete req.session.mcpRedirectUri;
      delete req.session.mcpState;
      delete req.session.mcpClientId;
      delete req.session.mcpCodeChallenge;
      delete req.session.mcpScope;
      delete req.session.mcpResource;
      delete req.session.usingMcpPkce;

      res.redirect(redirectUrl.toString());
    } else {
      // Manual flow - display both tokens
      console.log('  Displaying tokens for manual flow');
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Complete</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                max-width: 800px;
                margin: 50px auto;
                padding: 20px;
              }
              h1 { color: #4caf50; }
              .token-section {
                margin-bottom: 30px;
              }
              .token-section h3 {
                color: #333;
                font-size: 14px;
                margin-bottom: 8px;
              }
              .token {
                background: #f5f5f5;
                padding: 15px;
                border-radius: 4px;
                word-break: break-all;
                font-family: monospace;
                font-size: 12px;
                max-height: 150px;
                overflow-y: auto;
                border: 1px solid #ddd;
              }
            </style>
          </head>
          <body>
            <h1>✓ Authentication Complete</h1>
            <p>Connected providers: ${connectedProviders.join(', ')}</p>

            <div class="token-section">
              <h3>Access Token (short-lived):</h3>
              <div class="token">${accessTokenJwt}</div>
            </div>

            <div class="token-section">
              <h3>Refresh Token (long-lived):</h3>
              <div class="token">${refreshTokenJwt}</div>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              Use the refresh token to obtain a new access token when your current one expires.
            </p>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error creating JWTs:', error);
    res.status(500).send(`Error creating authentication tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
