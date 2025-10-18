/**
 * OAuth Factory Functions for Multi-Provider Support
 * 
 * Creates reusable OAuth endpoints for any provider that implements the OAuthProvider interface.
 * Per Q25: Static routes with factory functions for clean, explicit, type-safe routing.
 */

import type { Request, Response } from 'express';
import type { OAuthProvider, StandardTokenResponse } from '../providers/provider-interface.js';

/**
 * Creates an authorize endpoint for a specific provider
 * Per Q25: Static routes with factory functions
 * 
 * Usage:
 *   app.get('/auth/connect/atlassian', makeAuthorize(atlassianProvider));
 */
export function makeAuthorize(provider: OAuthProvider) {
  return async (req: Request, res: Response) => {
    console.log(`Starting OAuth flow for provider: ${provider.name}`);
    
    // Use PKCE parameters stored in session from connection hub
    // The MCP client sent these to /auth/connect, and we stored them
    const codeChallenge = req.session.mcpCodeChallenge;
    const codeChallengeMethod = req.session.mcpCodeChallengeMethod || 'S256';
    const state = req.session.mcpState;
    
    if (!codeChallenge) {
      console.error('  Error: No code_challenge found in session');
      res.status(400).send('Missing PKCE parameters. Please restart the OAuth flow from /auth/connect');
      return;
    }
    
    // Store provider-specific OAuth state
    req.session.provider = provider.name;
    req.session.codeChallenge = codeChallenge;
    req.session.codeChallengeMethod = codeChallengeMethod;
    req.session.state = state;
    
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
      
      // Check if this is an MCP client PKCE flow
      const usingMcpPkce = req.session.usingMcpPkce;
      const mcpRedirectUri = req.session.mcpRedirectUri;
      
      if (usingMcpPkce && mcpRedirectUri) {
        // MCP PKCE Flow: We don't have the code_verifier, so we can't do token exchange
        // Instead, redirect back to MCP client with the authorization code
        // The MCP client will call /access-token with its code_verifier
        console.log('  MCP PKCE flow detected - redirecting code back to MCP client');
        
        // Use the original MCP state from session, not the one from Atlassian callback
        // This ensures we return exactly what the MCP client sent us
        const mcpState = req.session.mcpState;
        
        // Build redirect URL with code and original state
        let redirectUrl = `${mcpRedirectUri}?code=${encodeURIComponent(callbackParams.code)}`;
        if (mcpState) {
          redirectUrl += `&state=${encodeURIComponent(mcpState)}`;
        }
        
        console.log(`  Redirecting to MCP client: ${redirectUrl}`);
        console.log(`  Using original MCP state: ${mcpState}`);
        res.redirect(redirectUrl);
        return;
      }
      
      // Browser/Server PKCE Flow: We have the code_verifier, so do token exchange
      const codeVerifier = req.session.codeVerifier;
      
      if (!codeVerifier) {
        throw new Error('No code verifier found in session (not MCP PKCE flow)');
      }
      
      console.log(`  Exchanging code for ${provider.name} tokens`);
      
      const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
      const tokens = await provider.exchangeCodeForTokens({
        code: callbackParams.code,
        codeVerifier: codeVerifier,
        redirectUri: `${baseUrl}/auth/callback/${provider.name}`,
      });
      
      console.log(`  Token exchange successful for ${provider.name}`);
      
      // Call success handler (e.g., store tokens in session)
      await options.onSuccess(req, tokens, provider.name);
      
      // Per Q26: Always redirect back to connection hub
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
