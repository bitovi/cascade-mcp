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
    console.log(`OAuth callback received for provider: ${provider.name}`);
    
    try {
      const callbackParams = provider.extractCallbackParams(req);
      
      if (!callbackParams.code) {
        throw new Error('No authorization code received');
      }
      
      // Get the code_verifier we generated when initiating this provider's OAuth flow
      // (This is OUR code_verifier for Server-Side OAuth, NOT the MCP client's code_verifier)
      const codeVerifier = req.session.codeVerifier;
      
      if (!codeVerifier) {
        throw new Error('No code verifier found in session - OAuth flow not properly initiated');
      }
      
      console.log(`  Exchanging ${provider.name} authorization code for tokens`);
      
      const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
      
      // ALWAYS exchange the provider's authorization code for access/refresh tokens
      // This uses Server-Side OAuth with client_secret (NOT MCP PKCE)
      const tokens = await provider.exchangeCodeForTokens({
        code: callbackParams.code,
        codeVerifier: codeVerifier,
        redirectUri: `${baseUrl}/auth/callback/${provider.name}`,
      });
      
      console.log(`  Token exchange successful for ${provider.name}`);
      
      // Store tokens in session (called by hubCallbackHandler)
      await options.onSuccess(req, tokens, provider.name);
      
      // ALWAYS redirect back to connection hub to show "✓ Connected" status
      // The hub will remain open until user clicks "Done"
      console.log(`  Redirecting back to connection hub`);
      res.redirect('/auth/connect');
      
    } catch (error) {
      console.error(`${provider.name} OAuth callback error:`, error);
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
  console.log(`Storing tokens for provider: ${providerName}`);
  
  // Store tokens in session (keyed by provider name)
  if (!req.session.providerTokens) {
    req.session.providerTokens = {};
  }
  
  req.session.providerTokens[providerName] = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
    scope: tokens.scope,
  };
  
  // Track connected providers
  if (!req.session.connectedProviders) {
    req.session.connectedProviders = [];
  }
  if (!req.session.connectedProviders.includes(providerName)) {
    req.session.connectedProviders.push(providerName);
  }
  
  console.log(`  Provider ${providerName} now connected`);
  console.log(`  Connected providers: ${req.session.connectedProviders.join(', ')}`);
}
