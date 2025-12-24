/**
 * Figma OAuth Provider
 * 
 * Implements the OAuthProvider interface for Figma authentication.
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
import { registerFigmaTools } from './tools/index.js';

/**
 * Figma Provider Object
 * Simple object (not a class) implementing the OAuthProvider interface
 */
export const figmaProvider: OAuthProvider = {
  name: 'figma',
  
  /**
   * Create Figma OAuth authorization URL
   * NOTE: Figma uses traditional OAuth 2.0 with client_secret, NOT PKCE
   * @param params - Authorization parameters (PKCE params ignored for Figma)
   * @returns Full Figma authorization URL
   */
  createAuthUrl(params: AuthUrlParams): string {
    const clientId = process.env.FIGMA_CLIENT_ID;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
    const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/figma`;
    const scope = params.scope || process.env.FIGMA_OAUTH_SCOPES!;
    
    // Figma uses traditional OAuth 2.0 - DO NOT include PKCE parameters
    const urlParams: Record<string, string> = {
      client_id: clientId!,
      response_type: params.responseType || 'code',
      redirect_uri: redirectUri,
      scope,
    };
    
    if (params.state) {
      urlParams.state = params.state;
    }
    
    return `https://www.figma.com/oauth?${new URLSearchParams(urlParams).toString()}`;
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
   * Exchange authorization code for Figma access/refresh tokens
   * NOTE: Figma uses traditional OAuth 2.0 with client_secret (NO PKCE)
   * @param params - Token exchange parameters (codeVerifier ignored for Figma)
   * @returns Standardized token response
   */
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    const clientId = process.env.FIGMA_CLIENT_ID;
    const clientSecret = process.env.FIGMA_CLIENT_SECRET;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
    const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/figma`;
    
    // Figma uses traditional OAuth 2.0 - DO NOT include code_verifier
    // Authentication is via client_id + client_secret only
    const tokenRes = await fetch('https://api.figma.com/v1/oauth/token', {
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
      throw new Error(`Figma token exchange failed (${tokenRes.status}): ${errorText}`);
    }
    
    const tokenData = await tokenRes.json() as any;
    
    if (!tokenData.access_token) {
      throw new Error(`Figma token exchange failed: ${JSON.stringify(tokenData)}`);
    }
    
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 7776000, // Figma default: 90 days
      scope: tokenData.scope,
      user_id: tokenData.user_id,
    };
  },
  
  /**
   * Get default OAuth scopes for Figma
   * @returns Array of scope strings
   */
  getDefaultScopes(): string[] {
    return ['file_content:read', 'file_comments:read'];
  },

  /**
   * Refresh an access token using a refresh token
   * Figma uses a different refresh endpoint and HTTP Basic Auth
   * ⚠️ CRITICAL: Figma does NOT return a new refresh_token - the same one remains valid
   * @param params - Refresh parameters including the refresh token
   * @returns New access token and the ORIGINAL refresh token
   */
  async refreshAccessToken(
    params: RefreshTokenParams
  ): Promise<StandardTokenResponse> {
    const clientId = process.env.FIGMA_CLIENT_ID!;
    const clientSecret = process.env.FIGMA_CLIENT_SECRET!;

    console.log('[FIGMA] Refreshing access token');
    console.log('[FIGMA]   - Refresh token length:', params.refreshToken.length);
    console.log(
      '[FIGMA]   - Using endpoint: https://api.figma.com/v1/oauth/refresh'
    );

    // Figma uses HTTP Basic Auth for refresh (different from token exchange!)
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64'
    );

    const response = await fetch('https://api.figma.com/v1/oauth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        refresh_token: params.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FIGMA] Token refresh failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(
        `Figma token refresh failed (${response.status}): ${errorText}`
      );
    }

    const tokenData = (await response.json()) as any;
    console.log('[FIGMA] Token refresh successful:', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token, // Should be false
      expiresIn: tokenData.expires_in,
    });

    // Figma response: { access_token, token_type, expires_in } - NO refresh_token!
    return {
      access_token: tokenData.access_token,
      // ⚠️ KEY: Figma doesn't return a refresh token, so we return the ORIGINAL
      // input token. This ensures the caller gets a valid refresh_token to embed
      // in the new JWT, even though Figma didn't provide one.
      refresh_token: params.refreshToken,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 7776000,
    };
  },

  /**
   * Register Figma-specific MCP tools
   * Tools will be registered with 'figma-' prefix per Q13
   * @param mcp - MCP server instance
   * @param authContext - Authentication context with Figma credentials
   */
  registerTools(mcp: McpServer, authContext: any): void {
    registerFigmaTools(mcp, authContext);
  },
};
