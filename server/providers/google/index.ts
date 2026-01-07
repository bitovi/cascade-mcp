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
  CallbackParams,
  RefreshTokenParams,
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
      prompt: 'consent', // Force consent screen to always get refresh token
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
   * Refresh an access token using a refresh token
   * Google uses standard OAuth 2.0 refresh with client_secret
   * ⚠️ NOTE: Google does NOT rotate refresh tokens - the same one remains valid
   * @param params - Refresh parameters including the refresh token
   * @returns New access token and the ORIGINAL refresh token
   */
  async refreshAccessToken(
    params: RefreshTokenParams
  ): Promise<StandardTokenResponse> {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

    console.log('[GOOGLE] Refreshing access token');
    console.log('[GOOGLE]   - Refresh token length:', params.refreshToken.length);
    console.log(
      '[GOOGLE]   - Using endpoint: https://oauth2.googleapis.com/token'
    );

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: params.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GOOGLE] Token refresh failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(
        `Google token refresh failed (${response.status}): ${errorText}`
      );
    }

    const tokenData = (await response.json()) as any;
    console.log('[GOOGLE] Token refresh successful:', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token, // Should be false
      expiresIn: tokenData.expires_in,
    });

    // Google response: { access_token, token_type, expires_in, scope } - NO refresh_token!
    return {
      access_token: tokenData.access_token,
      // ⚠️ KEY: Google doesn't return a refresh token, so we return the ORIGINAL
      // input token. This ensures the caller gets a valid refresh_token to embed
      // in the new JWT, even though Google didn't provide one.
      refresh_token: params.refreshToken,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      scope: tokenData.scope,
    };
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
