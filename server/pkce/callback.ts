/**
 * OAuth 2.0 Authorization Callback Handler
 * 
 * This module handles the OAuth callback from Atlassian's authorization server,
 * receiving the authorization code and managing the redirect flow back to MCP clients.
 * It validates OAuth state and handles different PKCE scenarios.
 * 
 * Specifications Implemented:
 * - RFC 6749 Section 4.1.2 - Authorization Response (callback handling)
 * - RFC 6749 Section 10.12 - Cross-Site Request Forgery (state validation)
 * - RFC 7636 - PKCE flow coordination between MCP client and Atlassian
 * - Manual token flow detection for browser-based authorization
 * 
 * Key Responsibilities:
 * - Receive authorization code and state from Atlassian callback
 * - Validate OAuth state parameter to prevent CSRF attacks
 * - Handle MCP client PKCE flow by passing code back to MCP client
 * - Detect and route manual authorization flows appropriately
 * - Clean up OAuth session state after successful callback
 * 
 * OAuth Flow Step: 4. Authorization Callback
 * Receives Atlassian's response and coordinates the next step based on PKCE configuration.
 */

import { Request, Response } from 'express';
import { extractAtlassianCallbackParams } from '../atlassian-auth-code-flow.ts';
import { isManualFlow, handleManualFlowCallback } from '../manual-token-flow.ts';
import type { OAuthHandler } from './types.ts';

/**
 * OAuth Callback Handler
 * Receives authorization code from Atlassian and redirects to MCP client
 */
export const callback: OAuthHandler = async (req: Request, res: Response): Promise<void> => {
  const { code, state, normalizedState } = extractAtlassianCallbackParams(req);

  console.log('↔️ OAuth callback received:', {
    code: code ? 'present' : 'missing',
    state,
    sessionState: req.session.state,
    sessionData: {
      codeVerifier: req.session.codeVerifier ? 'present' : 'missing',
      mcpClientId: req.session.mcpClientId,
      mcpRedirectUri: req.session.mcpRedirectUri,
      manualFlow: req.session.manualFlow ? 'present' : 'missing',
    },
  });

  // Check if this is a manual flow callback
  if (isManualFlow(req)) {
    if (!code || !normalizedState) {
      res.status(400).send('Missing code or state for manual flow');
      return;
    }
    await handleManualFlowCallback(req, res, { code, normalizedState });
    return;
  }

  // State validation: both should be undefined or both should match
  const stateMatches = normalizedState === req.session.state;
  
  // For MCP clients using their own PKCE, state parameter is optional
  const isMcpPkceFlow = req.session.usingMcpPkce;
  const stateValidationPassed = isMcpPkceFlow ? true : stateMatches;

  if (!code || !stateValidationPassed) {
    console.error('  State or code validation failed:', {
      hasCode: !!code,
      stateMatch: stateMatches,
      isMcpPkceFlow,
      stateValidationPassed,
      receivedState: state,
      normalizedState,
      expectedState: req.session.state,
    });
    res.status(400).send('Invalid OAuth callback state - missing redirect URI or invalid PKCE configuration');
    return;
  }
  
  const mcpRedirectUri = req.session.mcpRedirectUri;
  const usingMcpPkce = req.session.usingMcpPkce;

  // If we're using MCP's PKCE, we can't do the token exchange here
  // because we don't have the code verifier. Instead, we need to pass
  // the authorization code back to the MCP client so it can complete the exchange.
  if (usingMcpPkce && mcpRedirectUri) {
    console.log('  Using MCP PKCE - redirecting code back to MCP client');

    // Clear session data
    delete req.session.codeVerifier;
    delete req.session.state;
    delete req.session.mcpClientId;
    delete req.session.mcpRedirectUri;
    delete req.session.mcpScope;
    delete req.session.mcpResource;
    delete req.session.usingMcpPkce;

    // Redirect back to MCP client with the authorization code
    // Include state only if it was provided
    let redirectUrl = `${mcpRedirectUri}?code=${encodeURIComponent(code)}`;
    if (normalizedState) {
      redirectUrl += `&state=${encodeURIComponent(normalizedState)}`;
    }
    console.log('  Redirecting to MCP client with auth code:', redirectUrl);
    res.redirect(redirectUrl);
    return;
  }

  // If we reach here, it means we have an invalid state:
  // - No MCP redirect URI, or
  // - Not using MCP PKCE (which shouldn't happen with MCP clients)
  console.error('  Invalid callback state:', {
    usingMcpPkce,
    mcpRedirectUri: mcpRedirectUri ? 'present' : 'missing',
  });
  
  res.status(400).send('Invalid OAuth callback state - missing redirect URI or invalid PKCE configuration');
};
