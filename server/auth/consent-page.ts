/**
 * Connection Hub UI and Handler
 * 
 * Provides a user interface for connecting multiple OAuth providers in parallel.
 * Per Q8, Q9: User clicks "Connect" buttons in any order, then "Done" when satisfied.
 */

import type { Request, Response } from 'express';
import { createJiraMCPAuthToken } from '../pkce/token-helpers.js';
import { generateAuthorizationCode, storeAuthorizationCode } from '../pkce/authorization-code-store.js';

/**
 * Renders the connection hub UI
 * Shows available providers with connection status
 * 
 * Per Q8: Shows connection status (✓ Connected) after each OAuth completes
 * Per Q9: User clicks connection buttons in any order they prefer
 */
export function renderConnectionHub(req: Request, res: Response): void {
  console.log('Rendering connection hub');
  
  const connectedProviders = req.session.connectedProviders || [];
  console.log(`  Currently connected providers: ${connectedProviders.join(', ') || 'none'}`);
  
  // Store MCP client's PKCE parameters from query string (only on first visit)
  // These were sent by the MCP client when initiating the OAuth flow
  // On subsequent visits (after provider callbacks), preserve existing session values
  if (req.query.code_challenge && !req.session.mcpCodeChallenge) {
    console.log('  Storing MCP client PKCE parameters from query');
    req.session.mcpCodeChallenge = req.query.code_challenge as string;
    req.session.mcpCodeChallengeMethod = req.query.code_challenge_method as string || 'S256';
    req.session.mcpState = req.query.state as string;
    req.session.mcpRedirectUri = req.query.redirect_uri as string;
    req.session.mcpClientId = req.query.client_id as string;
    req.session.mcpScope = req.query.scope as string;
    req.session.mcpResource = req.query.resource as string;
    
    // CRITICAL: Do NOT generate a code verifier when MCP client provides code_challenge
    // The MCP client has its own code_verifier and will provide it during token exchange
    req.session.codeVerifier = null;
    req.session.usingMcpPkce = true;
    console.log('  Using MCP client PKCE (no server-side code_verifier)');
  } else if (!req.query.code_challenge && !req.session.mcpCodeChallenge && !req.session.codeVerifier) {
    // For non-MCP flows (browser-based), generate our own PKCE code verifier
    // Only if we haven't already set up either MCP PKCE or server-side PKCE
    const codeVerifier = generateCodeVerifier();
    req.session.codeVerifier = codeVerifier;
    req.session.usingMcpPkce = false;
    console.log('  Generated server-side PKCE code_verifier');
  } else {
    // Returning to connection hub after provider OAuth - preserve existing session
    console.log('  Preserving existing session configuration:', {
      usingMcpPkce: req.session.usingMcpPkce,
      hasMcpRedirectUri: !!req.session.mcpRedirectUri,
      hasCodeVerifier: !!req.session.codeVerifier,
    });
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Connect Services - MCP Bridge</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          h1 {
            color: #333;
            margin-bottom: 10px;
          }
          p {
            color: #666;
            margin-bottom: 30px;
          }
          .provider {
            background: white;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            transition: all 0.2s;
          }
          .provider.connected {
            border-color: #4caf50;
            background-color: #f1f8f4;
          }
          .provider h2 {
            margin: 0 0 10px 0;
            color: #333;
            font-size: 18px;
          }
          .provider p {
            margin: 0 0 15px 0;
            color: #666;
            font-size: 14px;
          }
          button {
            background-color: #1976d2;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          }
          button:hover {
            background-color: #1565c0;
          }
          button:disabled {
            background-color: #ccc;
            cursor: not-allowed;
          }
          .status {
            color: #4caf50;
            font-weight: 600;
            font-size: 16px;
          }
          .done-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #e0e0e0;
          }
          .done-button {
            background-color: #4caf50;
            font-size: 16px;
            padding: 12px 30px;
          }
          .done-button:hover {
            background-color: #45a049;
          }
          .done-button:disabled {
            background-color: #ccc;
          }
        </style>
      </head>
      <body>
        <h1>Connect Services</h1>
        <p>Choose which services to connect for your MCP session:</p>
        
        <div class="provider ${connectedProviders.includes('atlassian') ? 'connected' : ''}">
          <h2>Atlassian (Jira)</h2>
          <p>Access Jira issues, attachments, and project data</p>
          ${connectedProviders.includes('atlassian') 
            ? '<span class="status">✓ Connected</span>'
            : '<button onclick="location.href=\'/auth/connect/atlassian\'">Connect Atlassian</button>'
          }
        </div>
        
        <div class="provider ${connectedProviders.includes('figma') ? 'connected' : ''}">
          <h2>Figma</h2>
          <p>Access Figma designs, files, and user information</p>
          ${connectedProviders.includes('figma') 
            ? '<span class="status">✓ Connected</span>'
            : '<button onclick="location.href=\'/auth/connect/figma\'">Connect Figma</button>'
          }
        </div>
        
        <div class="done-section">
          <button class="done-button" onclick="location.href='/auth/done'" ${connectedProviders.length === 0 ? 'disabled' : ''}>
            Done - Create Session
          </button>
          ${connectedProviders.length === 0 
            ? '<p style="color: #999; font-size: 12px; margin-top: 10px;">Connect at least one service to continue</p>' 
            : ''
          }
        </div>
      </body>
    </html>
  `;
  
  res.send(html);
}

/**
 * Handles the "Done" button click
 * Creates a multi-provider JWT with all connected provider tokens
 * 
 * Per Q21: Uses nested JWT structure { atlassian: {...}, figma: {...} }
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
    // Build nested JWT payload per Q21
    // Structure: { atlassian: { access_token, refresh_token, expires_at, scope }, figma: {...} }
    
    // For now, we use the createJiraMCPAuthToken function which expects Atlassian tokens
    // This will be refactored in Phase 2 to support arbitrary providers
    const atlassianTokens = providerTokens['atlassian'];
    
    if (!atlassianTokens) {
      throw new Error('No Atlassian tokens found - connection hub requires Atlassian authentication');
    }
    
    // Create JWT - the createJiraMCPAuthToken function already creates nested structure
    const jwt = await createJiraMCPAuthToken({
      access_token: atlassianTokens.access_token,
      refresh_token: atlassianTokens.refresh_token || '',
      token_type: 'Bearer',
      expires_in: Math.floor((atlassianTokens.expires_at - Date.now()) / 1000),
      scope: atlassianTokens.scope || '',
    }, { 
      resource: req.session.mcpResource 
    });
    
    console.log('  JWT created successfully');
    
    // Clear session provider data (tokens now embedded in JWT)
    delete req.session.providerTokens;
    delete req.session.connectedProviders;
    delete req.session.provider;
    delete req.session.codeVerifier;
    
    // Check if this was initiated by an MCP client (has redirect URI)
    if (req.session.mcpRedirectUri && req.session.usingMcpPkce) {
      // OAuth 2.0 Authorization Code Flow (RFC 6749 Section 4.1.2)
      // Generate authorization code and store JWT mapping
      const authCode = generateAuthorizationCode();
      storeAuthorizationCode(
        authCode,
        jwt,
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

/**
 * Generates a random code verifier for PKCE
 * Used by the connection hub to initiate OAuth flows
 */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Buffer.from(array)
    .toString('base64url')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
