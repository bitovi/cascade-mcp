/**
 * OAuth Factory Functions for Multi-Provider Support
 * 
 * CRITICAL: This file handles Server-Side OAuth flows ONLY.
 * 
 * TWO SEPARATE OAuth FLOWS in this system:
 * 1. MCP PKCE Flow (MCP Client ↔ Bridge): Handled in /server/pkce/*.ts
 * 2. Server-Side OAuth (Bridge ↔ Providers): Handled HERE in oauth-factories.ts
 * 
 * This file creates reusable Server-Side OAuth endpoints for any provider 
 * that implements the OAuthProvider interface.
 * 
 * Per Q25: Static routes with factory functions for clean, explicit, type-safe routing.
 */

import type { Request, Response } from 'express';
import type { OAuthProvider, StandardTokenResponse } from '../providers/provider-interface.js';
import { generateCodeVerifier, generateCodeChallenge } from '../tokens.js';

/**
 * Creates an authorize endpoint for a specific provider (Server-Side OAuth)
 * Per Q25: Static routes with factory functions
 * 
 * This initiates Server-Side OAuth with the provider (NOT MCP PKCE flow).
 * It generates its OWN code_verifier/code_challenge for the provider OAuth flow.
 * 
 * Usage:
 *   app.get('/auth/connect/atlassian', makeAuthorize(atlassianProvider));
 */
export function makeAuthorize(provider: OAuthProvider) {
  return async (req: Request, res: Response) => {
    console.log(`Starting Server-Side OAuth flow for provider: ${provider.name}`);
    
    // Generate OUR code_verifier for Server-Side OAuth with this provider
    // This is SEPARATE from the MCP client's code_verifier (which is for MCP PKCE flow)
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const codeChallengeMethod = 'S256';
    
    // Generate state for this provider's OAuth flow
    const state = generateCodeVerifier(); // Random state value
    
    // Store Server-Side OAuth parameters for callback validation
    req.session.provider = provider.name;
    req.session.codeVerifier = codeVerifier; // OUR code_verifier for provider OAuth
    req.session.codeChallenge = codeChallenge;
    req.session.codeChallengeMethod = codeChallengeMethod;
    req.session.state = state;
    
    console.log(`  Generated code_verifier for Server-Side OAuth with ${provider.name}`);
    
    const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
    const authUrl = provider.createAuthUrl({
      redirectUri: `${baseUrl}/auth/callback/${provider.name}`, // Per Q26: Provider-specific callback
      codeChallenge: codeChallenge,
      codeChallengeMethod: codeChallengeMethod,
      state: state,
      responseType: 'code',
    });
    
    console.log(`  Redirecting to ${provider.name} OAuth URL`);
    res.redirect(authUrl);
  };
}

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
 * Usage:
 *   app.get('/auth/callback/atlassian', makeCallback(atlassianProvider, { 
 *     onSuccess: hubCallbackHandler 
 *   }));
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
