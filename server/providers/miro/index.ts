/**
 * Miro OAuth Provider
 * 
 * Implements the OAuthProvider interface for Miro authentication.
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
import { registerMiroTools } from './tools/index.js';
import { buildOAuthUrl } from '../../traditional-oauth/url-builder.js';
import { performTokenExchange, performTokenRefresh } from '../../traditional-oauth/token-exchange.js';

/**
 * Miro Provider Object
 * Simple object (not a class) implementing the OAuthProvider interface
 */
export const miroProvider: OAuthProvider = {
  name: 'miro',
  
  /**
   * Create Miro OAuth authorization URL
   * NOTE: Miro uses traditional OAuth 2.0 with client_secret, NOT PKCE
   */
  createAuthUrl(params: AuthUrlParams): string {
    return buildOAuthUrl(
      {
        baseUrl: 'https://miro.com/oauth/authorize',
        clientIdEnvVar: 'MIRO_CLIENT_ID',
        scopeEnvVar: 'MIRO_OAUTH_SCOPES',
        usePKCE: false,
      },
      params,
      '/auth/callback/miro'
    );
  },
  
  /**
   * Extract callback parameters from OAuth redirect
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
   * Exchange authorization code for Miro access/refresh tokens
   * Miro uses traditional OAuth 2.0 with client_secret (NO PKCE)
   * Token URL: https://api.miro.com/v1/oauth/token
   */
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    return performTokenExchange(
      {
        tokenUrl: 'https://api.miro.com/v1/oauth/token',
        clientIdEnvVar: 'MIRO_CLIENT_ID',
        clientSecretEnvVar: 'MIRO_CLIENT_SECRET',
        usePKCE: false,
        contentType: 'form',
        defaultExpiresIn: 3599, // Miro default: ~1 hour
        redirectPath: '/auth/callback/miro',
      },
      params
    );
  },

  /**
   * Refresh an access token using a refresh token
   * Miro rotates refresh tokens on each refresh (new refresh token returned)
   * Refresh tokens are valid for 60 days
   */
  async refreshAccessToken(
    params: RefreshTokenParams
  ): Promise<StandardTokenResponse> {
    return performTokenRefresh(
      {
        tokenUrl: 'https://api.miro.com/v1/oauth/token',
        clientIdEnvVar: 'MIRO_CLIENT_ID',
        clientSecretEnvVar: 'MIRO_CLIENT_SECRET',
        contentType: 'form',
        rotatesRefreshToken: true,
        defaultExpiresIn: 3599,
      },
      params
    );
  },

  /**
   * Register Miro-specific MCP tools
   */
  registerTools(mcp: McpServer, authContext: any): void {
    registerMiroTools(mcp, authContext);
  },
};
