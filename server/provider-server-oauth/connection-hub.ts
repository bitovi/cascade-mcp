/**
 * Connection Hub UI
 * 
 * Provides a user interface for connecting multiple OAuth providers in parallel.
 * This is the central hub where users can:
 * - See which providers are available
 * - Connect to providers in any order
 * - See connection status (✓ Connected)
 * - Click "Done" when ready to create their session
 * 
 * Per Q8: Shows connection status after each OAuth completes
 * Per Q9: User clicks connection buttons in any order they prefer
 * 
 * Flow:
 * 1. MCP client calls /authorize with PKCE params → renders this hub
 * 2. User clicks "Connect Atlassian" → Server-Side OAuth flow
 * 3. After OAuth, redirects back to this hub (shows "✓ Connected")
 * 4. User clicks "Done" → handleConnectionDone creates JWT and completes MCP flow
 */

import type { Request, Response } from 'express';
import crypto from 'crypto';

/**
 * Renders the connection hub UI
 * Shows available providers with connection status
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
