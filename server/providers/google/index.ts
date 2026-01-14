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
import { buildOAuthUrl } from '../oauth-url-builder.js';
import { performTokenExchange, performTokenRefresh } from '../token-exchange-helper.js';

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
    return buildOAuthUrl(
      {
        baseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientIdEnvVar: 'GOOGLE_CLIENT_ID',
        scopeEnvVar: 'GOOGLE_OAUTH_SCOPES',
        additionalParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
        usePKCE: false,
      },
      params,
      '/auth/callback/google'
    );
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
    return performTokenExchange(
      {
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientIdEnvVar: 'GOOGLE_CLIENT_ID',
        clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
        usePKCE: false,
        contentType: 'form',
        defaultExpiresIn: 3600, // Google default: 1 hour
        redirectPath: '/auth/callback/google',
      },
      params
    );
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
    return performTokenRefresh(
      {
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientIdEnvVar: 'GOOGLE_CLIENT_ID',
        clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
        contentType: 'form',
        rotatesRefreshToken: false,
        defaultExpiresIn: 3600,
      },
      params
    );
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
