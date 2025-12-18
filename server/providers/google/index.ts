/**
 * Google Drive OAuth Provider
 * 
 * Implements the OAuthProvider interface for Google Drive authentication.
 * Handles Server-Side OAuth 2.0 flow with client_secret (NOT MCP PKCE).
 * Bridge generates its own code_verifier for provider authentication.
 */

import type { McpServer } from '../../mcp-core/mcp-types.js';
import type { 
  OAuthProvider, 
  AuthUrlParams, 
  TokenExchangeParams, 
  StandardTokenResponse, 
  CallbackParams 
} from '../provider-interface.js';
import { registerGoogleTools } from './tools/index.js';

/**
 * Google Drive Provider Object
 * Simple object (not a class) implementing the OAuthProvider interface
 */
export const googleProvider: OAuthProvider = {
  name: 'google',
  
  /**
   * Create Google OAuth authorization URL
   * NOTE: Google uses traditional OAuth 2.0 with client_secret, NOT PKCE
   * @param params - Authorization parameters (PKCE params ignored for Google)
   * @returns Full Google authorization URL
   */
  createAuthUrl(params: AuthUrlParams): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
    const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/google`;
    const scope = params.scope || process.env.GOOGLE_OAUTH_SCOPES!;
    
    // Google uses traditional OAuth 2.0 - DO NOT include PKCE parameters
    // Request offline access to receive refresh token
    const urlParams: Record<string, string> = {
      client_id: clientId!,
      response_type: params.responseType || 'code',
      redirect_uri: redirectUri,
      scope,
      access_type: 'offline', // Request refresh token
    };
    
    if (params.state) {
      urlParams.state = params.state;
    }
    
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(urlParams).toString()}`;
  },
  
  /**
   * Extract callback parameters from OAuth redirect
   * @param req - Express request object
   * @returns Extracted callback parameters
   */
  extractCallbackParams(req: any): CallbackParams {
    const { code, state } = req.query;
    
    return {
      code: code || '',
      state,
      normalizedState: state,
    };
  },
  
  /**
   * Exchange authorization code for Google access/refresh tokens
   * NOTE: Google uses traditional OAuth 2.0 with client_secret (NO PKCE)
   * @param params - Token exchange parameters (codeVerifier ignored for Google)
   * @returns Standardized token response
   */
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
    const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/google`;
    
    // Google uses traditional OAuth 2.0 - DO NOT include code_verifier
    // Authentication is via client_id + client_secret only
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code: params.code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    
    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      throw new Error(`Google token exchange failed (${tokenRes.status}): ${errorText}`);
    }
    
    const tokenData = await tokenRes.json() as any;
    
    if (!tokenData.access_token) {
      throw new Error(`Google token exchange failed: ${JSON.stringify(tokenData)}`);
    }
    
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600, // Google default: 1 hour
      scope: tokenData.scope,
    };
  },
  
  /**
   * Get default OAuth scopes for Google Drive
   * @returns Array of scope strings
   */
  getDefaultScopes(): string[] {
    return ['https://www.googleapis.com/auth/drive'];
  },
  
  /**
   * Register Google Drive-specific MCP tools
   * Tools will be registered with 'google-' prefix
   * @param mcp - MCP server instance
   * @param authContext - Authentication context with Google credentials
   */
  registerTools(mcp: McpServer, authContext: any): void {
    registerGoogleTools(mcp, authContext);
  },
};
