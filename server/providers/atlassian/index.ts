/**
 * Atlassian (Jira) OAuth Provider
 * 
 * Implements the OAuthProvider interface for Atlassian Cloud authentication.
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
import { registerAtlassianTools } from './tools/index.js';
import { generateCodeChallenge } from '../../tokens.js';
import { getAtlassianConfig } from '../../atlassian-auth-code-flow.js';
import { buildOAuthUrl } from '../utils/oauth-url-builder.js';
import { performTokenExchange, performTokenRefresh } from '../utils/token-exchange-helper.js';

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
    const fullUrl = buildOAuthUrl(
      {
        baseUrl: 'https://auth.atlassian.com/authorize',
        clientIdEnvVar: 'VITE_JIRA_CLIENT_ID',
        scopeEnvVar: 'VITE_JIRA_SCOPE',
        usePKCE: true,
      },
      params,
      '/auth/callback/atlassian'
    );

    console.log(`[ATLASSIAN] 🔑 Auth URL created with code challenge: ${params.codeChallenge}`);

    return fullUrl;
  },

  /**
   * Extract callback parameters from OAuth redirect
   * Handles Atlassian-specific URL encoding quirk: + gets decoded as space
   * @param req - Express request object
   * @returns Extracted and normalized callback parameters
   */
  extractCallbackParams(req: any): CallbackParams {
    console.log(`[ATLASSIAN] Processing OAuth callback`);

    const { code, state } = req.query;

    // Try to decode the authorization code JWT to verify client_id match
    if (code) {
      try {
        const parts = code.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          console.log(`[ATLASSIAN] 🚨 VERIFY: Auth code issued for client_id: ${payload.aud}`);
        }
      } catch {
        console.log(`[ATLASSIAN] Auth code is not a JWT or decode failed (this is expected)`);
      }
    }

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
    return performTokenExchange(
      {
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        clientIdEnvVar: 'VITE_JIRA_CLIENT_ID',
        clientSecretEnvVar: 'JIRA_CLIENT_SECRET',
        usePKCE: true,
        contentType: 'json',
        defaultExpiresIn: 3600,
        redirectPath: '/auth/callback/atlassian',
      },
      params
    );
  },

  /**
   * Get default OAuth scopes for Atlassian
   * @returns Array of scope strings
   */
  getDefaultScopes(): string[] {
    return ['read:jira-work', 'write:jira-work', 'offline_access'];
  },

  /**
   * Refresh an access token using a refresh token
   * Atlassian rotates refresh tokens - returns a NEW refresh token with each refresh
   * @param params - Refresh parameters including the refresh token
   * @returns New access token and NEW refresh token (token rotation)
   */
  async refreshAccessToken(
    params: RefreshTokenParams
  ): Promise<StandardTokenResponse> {
    const ATLASSIAN_CONFIG = getAtlassianConfig();
    return performTokenRefresh(
      {
        tokenUrl: ATLASSIAN_CONFIG.tokenUrl,
        clientIdEnvVar: 'JIRA_CLIENT_ID',
        clientSecretEnvVar: 'JIRA_CLIENT_SECRET',
        contentType: 'json',
        rotatesRefreshToken: true,
        defaultExpiresIn: 3600,
      },
      params
    );
  },

  /**
   * Register Atlassian-specific MCP tools
   * Tools will be registered with 'atlassian-' prefix per Q13
   * @param mcp - MCP server instance
   * @param authContext - Authentication context with Atlassian credentials
   */
  registerTools(mcp: McpServer, authContext: any): void {
    registerAtlassianTools(mcp, authContext);
  },
};
