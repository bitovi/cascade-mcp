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
import { buildOAuthUrl } from '../utils/oauth-url-builder.js';
import { performTokenExchange, performTokenRefresh } from '../utils/token-exchange-helper.js';

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
    return buildOAuthUrl(
      {
        baseUrl: 'https://www.figma.com/oauth',
        clientIdEnvVar: 'FIGMA_CLIENT_ID',
        scopeEnvVar: 'FIGMA_OAUTH_SCOPES',
        usePKCE: false,
      },
      params,
      '/auth/callback/figma'
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
   * Exchange authorization code for Figma access/refresh tokens
   * NOTE: Figma uses traditional OAuth 2.0 with client_secret (NO PKCE)
   * @param params - Token exchange parameters (codeVerifier ignored for Figma)
   * @returns Standardized token response
   */
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    return performTokenExchange(
      {
        tokenUrl: 'https://api.figma.com/v1/oauth/token',
        clientIdEnvVar: 'FIGMA_CLIENT_ID',
        clientSecretEnvVar: 'FIGMA_CLIENT_SECRET',
        usePKCE: false,
        contentType: 'form',
        defaultExpiresIn: 7776000, // Figma default: 90 days
        redirectPath: '/auth/callback/figma',
      },
      params
    );
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
    return performTokenRefresh(
      {
        tokenUrl: 'https://api.figma.com/v1/oauth/refresh',
        clientIdEnvVar: 'FIGMA_CLIENT_ID',
        clientSecretEnvVar: 'FIGMA_CLIENT_SECRET',
        contentType: 'form',
        useBasicAuth: true,
        rotatesRefreshToken: false,
        defaultExpiresIn: 7776000,
      },
      params
    );
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
