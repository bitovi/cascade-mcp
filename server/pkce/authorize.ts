/**
 * OAuth 2.0 Authorization Endpoint with PKCE Support
 * 
 * This module implements the OAuth 2.0 authorization endpoint that initiates the
 * authorization flow by redirecting clients to Atlassian's authorization server.
 * It handles PKCE parameters from MCP clients and manages OAuth state.
 * 
 * Specifications Implemented:
 * - RFC 6749 Section 4.1.1 - Authorization Request (authorization_code flow)
 * - RFC 7636 - PKCE for OAuth Public Clients (code_challenge/code_verifier)
 * - RFC 8707 - Resource Indicators for OAuth 2.0 (resource parameter)
 * - Atlassian OAuth 2.0 integration patterns
 * 
 * Key Responsibilities:
 * - Accept authorization requests from MCP clients with PKCE parameters
 * - Validate and store MCP client parameters (client_id, redirect_uri, state)
 * - Generate or passthrough PKCE code_challenge for Atlassian authorization
 * - Store OAuth session state for callback validation
 * - Construct and redirect to Atlassian authorization URL
 * 
 * OAuth Flow Step: 3. Authorization Request
 * Takes MCP client authorization request and bridges it to Atlassian's OAuth flow.
 */

import { Request, Response } from 'express';
import { 
  generateCodeVerifier, 
  generateCodeChallenge
} from '../tokens.ts';
import type { OAuthHandler } from './types.ts';
import { renderConnectionHub } from '../traditional-oauth/route-handlers/index.js';

/**
 * Type guard to ensure query parameter is a string
 */
function getStringParam(param: unknown): string | undefined {
  return typeof param === 'string' ? param : undefined;
}

/**
 * Authorization Endpoint
 * Initiates the OAuth 2.0 authorization flow by redirecting to Atlassian
 */
export const authorize: OAuthHandler = (req: Request, res: Response): void => {
  // Get parameters from query (sent by MCP client) with type guards
  const mcpClientId = getStringParam(req.query.client_id);
  const mcpRedirectUri = getStringParam(req.query.redirect_uri);
  const mcpScope = getStringParam(req.query.scope);
  const responseType = getStringParam(req.query.response_type) || 'code';
  const mcpState = getStringParam(req.query.state);
  const mcpCodeChallenge = getStringParam(req.query.code_challenge);
  const mcpCodeChallengeMethod = getStringParam(req.query.code_challenge_method);
  const mcpResource = getStringParam(req.query.resource);

  console.log('↔️ GET /authorize request from MCP client:', {
    mcpClientId,
    mcpRedirectUri,
    mcpScope,
    responseType,
    mcpState,
    mcpCodeChallenge,
    mcpCodeChallengeMethod,
    mcpResource,
    queryParams: req.query,
  });

  // Use MCP client's PKCE parameters if provided, otherwise generate our own (fallback)
  let codeChallenge: string;
  let codeChallengeMethod: string;
  let codeVerifier: string | null = null; // We don't store the verifier when using MCP's PKCE

  if (mcpCodeChallenge && mcpCodeChallengeMethod) {
    // Use the MCP client's PKCE parameters
    codeChallenge = mcpCodeChallenge;
    codeChallengeMethod = mcpCodeChallengeMethod;
    console.log('  Using MCP client PKCE parameters');
  } else {
    // Generate our own PKCE parameters (fallback for non-MCP clients)
    codeVerifier = generateCodeVerifier();
    codeChallenge = generateCodeChallenge(codeVerifier);
    codeChallengeMethod = 'S256';
    console.log('  Generated our own PKCE parameters');
  }

  // Store MCP client info in session for later use in callback
  req.session.codeVerifier = codeVerifier; // Will be null if using MCP client's PKCE
  req.session.state = mcpState; // Store the MCP client's state
  req.session.mcpClientId = mcpClientId;
  req.session.mcpRedirectUri = mcpRedirectUri; // This is VS Code's callback URI
  req.session.mcpScope = mcpScope;
  req.session.mcpResource = mcpResource; // Store the resource parameter
  req.session.usingMcpPkce = !codeVerifier; // Flag to indicate if we're using MCP's PKCE

  console.log('  Saved in session:', {
    state: mcpState,
    codeVerifier: codeVerifier ? 'present' : 'null (using MCP PKCE)',
    mcpClientId,
    mcpRedirectUri,
    mcpResource: mcpResource || 'undefined',
    usingMcpPkce: !codeVerifier,
  });

  // Per Authentication Flows section: Show connection hub for multi-provider flow
  // The hub will display provider connection buttons and handle the multi-provider OAuth
  console.log('  Rendering connection hub for multi-provider selection');
  renderConnectionHub(req, res);
};
