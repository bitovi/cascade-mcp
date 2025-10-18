/**
 * Atlassian (Jira) OAuth Provider
 * 
 * Implements the OAuthProvider interface for Atlassian Cloud authentication.
 * Handles OAuth 2.0 PKCE flow with Atlassian-specific quirks and requirements.
 */

import type { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import type { 
  OAuthProvider, 
  AuthUrlParams, 
  TokenExchangeParams, 
  StandardTokenResponse, 
  CallbackParams 
} from '../provider-interface.js';

/**
 * Atlassian Provider Object
 * Simple object (not a class) implementing the OAuthProvider interface
 */
export const atlassianProvider: OAuthProvider = {
  name: 'atlassian',
  
  /**
   * Create Atlassian OAuth authorization URL
   * @param params - Authorization parameters including PKCE challenge
   * @returns Full Atlassian authorization URL
   */
  createAuthUrl(params: AuthUrlParams): string {
    const clientId = process.env.VITE_JIRA_CLIENT_ID;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
    const redirectUri = params.redirectUri || `${baseUrl}/callback`;
    const scope = params.scope || process.env.VITE_JIRA_SCOPE || 'read:jira-work write:jira-work offline_access';
    
    const urlParams: Record<string, string> = {
      client_id: clientId!,
      response_type: params.responseType || 'code',
      redirect_uri: redirectUri,
      scope,
      code_challenge: params.codeChallenge,
      code_challenge_method: params.codeChallengeMethod,
    };
    
    if (params.state) {
      urlParams.state = params.state;
    }
    
    return `https://auth.atlassian.com/authorize?${new URLSearchParams(urlParams).toString()}`;
  },
  
  /**
   * Extract callback parameters from OAuth redirect
   * Handles Atlassian-specific URL encoding quirk: + gets decoded as space
   * @param req - Express request object
   * @returns Extracted and normalized callback parameters
   */
  extractCallbackParams(req: any): CallbackParams {
    const { code, state } = req.query;
    
    // Handle Atlassian-specific URL encoding: + gets decoded as space
    const normalizedState = state ? state.replace(/ /g, '+') : state;
    
    return {
      code: code || '',
      state,
      normalizedState,
    };
  },
  
  /**
   * Exchange authorization code for Atlassian access/refresh tokens
   * @param params - Token exchange parameters including code verifier
   * @returns Standardized token response
   */
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    const clientId = process.env.VITE_JIRA_CLIENT_ID;
    const clientSecret = process.env.JIRA_CLIENT_SECRET;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
    const redirectUri = params.redirectUri || `${baseUrl}/callback`;
    
    const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: params.code,
        redirect_uri: redirectUri,
        code_verifier: params.codeVerifier,
      }),
    });
    
    const tokenData = await tokenRes.json() as any;
    
    if (!tokenData.access_token) {
      throw new Error(`Atlassian token exchange failed: ${JSON.stringify(tokenData)}`);
    }
    
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      scope: tokenData.scope,
    };
  },
  
  /**
   * Get default OAuth scopes for Atlassian
   * @returns Array of scope strings
   */
  getDefaultScopes(): string[] {
    return ['read:jira-work', 'write:jira-work', 'offline_access'];
  },
  
  /**
   * Register Atlassian-specific MCP tools
   * Tools will be registered with 'atlassian-' prefix per Q13
   * @param mcp - MCP server instance
   * @param authContext - Authentication context with Atlassian credentials
   */
  registerTools(mcp: McpServer, authContext: any): void {
    // TODO: Will be implemented when tools are moved to providers/atlassian/tools/
    // For now, tools are still in jira-mcp/ and registered globally
    console.log('Atlassian provider: registerTools called (not yet implemented)');
  },
};
