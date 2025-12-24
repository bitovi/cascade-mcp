/**
 * Connection Done Handler
 * 
 * Handles the "Done" button click from the connection hub.
 * This completes the multi-provider OAuth flow by:
 * 1. Creating a JWT with all connected provider tokens
 * 2. Generating an authorization code for the MCP client
 * 3. Redirecting back to the MCP client with the code
 * 
 * The MCP client then exchanges this code for the JWT containing all provider tokens.
 * 
 * Per Q21: Uses nested JWT structure { atlassian: {...}, figma: {...} }
 * 
 * Flow:
 * 1. User has connected one or more providers
 * 2. User clicks "Done" button
 * 3. Create JWT with nested provider tokens
 * 4. Generate authorization code (single-use, 10-min expiration)
 * 5. Store code → JWT mapping
 * 6. Redirect to MCP client with code + state
 * 7. MCP client calls /access-token to exchange code for JWT
 */

import type { Request, Response } from 'express';
import {
  createMultiProviderAccessToken,
  createMultiProviderRefreshToken,
  type MultiProviderTokens,
} from '../pkce/token-helpers.js';
import {
  generateAuthorizationCode,
  storeAuthorizationCode,
} from '../pkce/authorization-code-store.js';

/**
 * Handles the "Done" button click
 * Creates a multi-provider JWT with all connected provider tokens
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
  
  console.log(`  Creating JWT for providers: ${connectedProviders.join(', ')}`);
  
  try {
    // Build multi-provider tokens structure for JWT creation
    const atlassianTokens = providerTokens['atlassian'];
    const figmaTokens = providerTokens['figma'];
    
    if (!atlassianTokens && !figmaTokens) {
      throw new Error('No provider tokens found - please connect at least one service');
    }
    
    // Build MultiProviderTokens structure
    const multiProviderTokens: MultiProviderTokens = {};
    
    if (atlassianTokens && atlassianTokens.access_token && atlassianTokens.refresh_token) {
      console.log('  Adding Atlassian credentials to JWT');
      multiProviderTokens.atlassian = {
        access_token: atlassianTokens.access_token,
        refresh_token: atlassianTokens.refresh_token,
        expires_at: atlassianTokens.expires_at,
        scope: atlassianTokens.scope,
      };
    } else if (atlassianTokens) {
      console.log('  Warning: Atlassian tokens incomplete (missing access or refresh token)');
    }
    
    if (figmaTokens && figmaTokens.access_token && figmaTokens.refresh_token) {
      console.log('  Adding Figma credentials to JWT');
      multiProviderTokens.figma = {
        access_token: figmaTokens.access_token,
        refresh_token: figmaTokens.refresh_token,
        expires_at: figmaTokens.expires_at,
        scope: figmaTokens.scope,
      };
    } else if (figmaTokens) {
      console.log('  Warning: Figma tokens incomplete (missing access or refresh token)');
    }
    
    // Create JWT access token with nested provider structure
    const tokenOptions = {
      resource: req.session.mcpResource || process.env.VITE_AUTH_SERVER_URL,
      scope: req.session.mcpScope || '',
    };
    
    const jwt = await createMultiProviderAccessToken(
      multiProviderTokens,
      tokenOptions
    );
    console.log('  JWT access token created successfully');
    
    // Create JWT refresh token with nested provider refresh tokens
    const { refreshToken } = await createMultiProviderRefreshToken(
      multiProviderTokens,
      tokenOptions
    );
    console.log('  JWT refresh token created successfully');
    
    console.log(
      '  Tokens created with providers:',
      Object.keys(multiProviderTokens)
    );
    
    // Clear session provider data (tokens now embedded in JWT)
    delete req.session.providerTokens;
    delete req.session.connectedProviders;
    delete req.session.provider;
    delete req.session.codeVerifier;
    
    // Check if this was initiated by an MCP client (has redirect URI)
    if (req.session.mcpRedirectUri && req.session.usingMcpPkce) {
      // OAuth 2.0 Authorization Code Flow (RFC 6749 Section 4.1.2)
      // Generate authorization code and store JWT mapping (both access and refresh tokens)
      const authCode = generateAuthorizationCode();
      storeAuthorizationCode(
        authCode,
        jwt,
        refreshToken,
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
      // Manual flow - display the token
      console.log('  Displaying token for manual flow');
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
            <p>Your access token:</p>
            <div class="token">${jwt}</div>
            <p>Connected providers: ${connectedProviders.join(', ')}</p>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error creating JWT:', error);
    res.status(500).send(`Error creating authentication token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
