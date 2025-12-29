/**
 * Connection Done Handler
 *
 * Handles the "Done" button click from the connection hub.
 * This completes the multi-provider OAuth flow by:
 * 1. Creating JWT tokens with all connected provider tokens
 * 2. Generating an authorization code for the MCP client
 * 3. Redirecting back to the MCP client with the code
 *
 * The MCP client then exchanges this code for both access and refresh JWTs
 * containing all provider tokens.
 *
 * Per Q21: Uses nested JWT structure { atlassian: {...}, figma: {...} }
 *
 * Flow:
 * 1. User has connected one or more providers
 * 2. User clicks "Done" button
 * 3. Create access JWT with nested provider tokens
 * 4. Create refresh JWT with nested provider refresh tokens
 * 5. Generate authorization code (single-use, 10-min expiration)
 * 6. Store code → {accessJwt, refreshJwt} mapping
 * 7. Redirect to MCP client with code + state
 * 8. MCP client calls /access-token to exchange code for both JWTs
 */

import type { Request, Response } from 'express';
import {
  createMCPAccessToken,
  createMCPRefreshToken,
  type MultiProviderTokens,
  type ProviderTokenData,
} from '../pkce/token-helpers.js';
import { generateAuthorizationCode, storeAuthorizationCode } from '../pkce/authorization-code-store.js';

/**
 * Handles the "Done" button click
 * Creates multi-provider JWTs (access and refresh) with all connected provider tokens
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
    // Collect provider tokens into MultiProviderTokens format
    const providers: MultiProviderTokens = {};

    const atlassianTokens = providerTokens['atlassian'];
    const figmaTokens = providerTokens['figma'];

    if (!atlassianTokens && !figmaTokens) {
      throw new Error('No provider tokens found - please connect at least one service');
    }

    // Build providers object with token data
    if (atlassianTokens) {
      console.log('  Adding Atlassian credentials');
      providers.atlassian = {
        access_token: atlassianTokens.access_token,
        refresh_token: atlassianTokens.refresh_token,
        expires_in: atlassianTokens.expires_in,
        scope: atlassianTokens.scope,
        refresh_expires_in: atlassianTokens.refresh_expires_in,
      };
    }

    if (figmaTokens) {
      console.log('  Adding Figma credentials');
      providers.figma = {
        access_token: figmaTokens.access_token,
        refresh_token: figmaTokens.refresh_token,
        expires_in: figmaTokens.expires_in,
        scope: figmaTokens.scope,
      };
    }

    // Create token creation options
    const tokenOptions = {
      resource: req.session.mcpResource || process.env.VITE_AUTH_SERVER_URL,
      scope: req.session.mcpScope || '',
    };

    // Create access token JWT
    console.log('🔐 Creating JWT access token');
    const accessJwt = await createMCPAccessToken(providers, tokenOptions);
    console.log('  JWT access token created successfully');

    // Create refresh token JWT
    console.log('🔄 Creating JWT refresh token');
    const { refreshToken: refreshJwt } = await createMCPRefreshToken(providers, tokenOptions);
    console.log('  JWT refresh token created successfully');

    // Clear session provider data (tokens now embedded in JWTs)
    delete req.session.providerTokens;
    delete req.session.connectedProviders;
    delete req.session.provider;
    delete req.session.codeVerifier;

    // Check if this was initiated by an MCP client (has redirect URI)
    if (req.session.mcpRedirectUri && req.session.usingMcpPkce) {
      // OAuth 2.0 Authorization Code Flow (RFC 6749 Section 4.1.2)
      // Generate authorization code and store both JWT mappings
      const authCode = generateAuthorizationCode();
      storeAuthorizationCode(
        authCode,
        accessJwt,
        refreshJwt,
        req.session.mcpClientId,
        req.session.mcpRedirectUri
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
      // Manual flow - display the tokens
      console.log('  Displaying tokens for manual flow');
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Complete</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
              }
              h1 { color: #4caf50; }
              .section {
                margin-bottom: 30px;
              }
              .label {
                font-weight: bold;
                margin-bottom: 5px;
              }
              .token {
                background: #f5f5f5;
                padding: 15px;
                border-radius: 4px;
                word-break: break-all;
                font-family: monospace;
                font-size: 12px;
              }
            </style>
          </head>
          <body>
            <h1>✓ Authentication Complete</h1>
            <p>Connected providers: ${connectedProviders.join(', ')}</p>

            <div class="section">
              <div class="label">Access Token:</div>
              <div class="token">${accessJwt}</div>
            </div>

            <div class="section">
              <div class="label">Refresh Token:</div>
              <div class="token">${refreshJwt}</div>
            </div>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error creating JWTs:', error);
    res.status(500).send(`Error creating authentication tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
