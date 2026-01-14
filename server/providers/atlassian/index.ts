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
import { buildOAuthUrl } from '../oauth-url-builder.js';
import { performTokenExchange, performTokenRefresh } from '../token-exchange-helper.js';

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
    console.log(`[ATLASSIAN] Creating auth URL with params:`, {
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge?.substring(0, 10) + '...',
      codeChallengeMethod: params.codeChallengeMethod,
      state: params.state?.substring(0, 10) + '...',
      responseType: params.responseType,
      scope: params.scope,
    });

    const clientId = process.env.VITE_JIRA_CLIENT_ID;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL!;

    console.log(`[ATLASSIAN] Using environment variables:`);
    console.log(`[ATLASSIAN]   - VITE_JIRA_CLIENT_ID: ${clientId?.substring(0, 10)}...`);
    console.log(`[ATLASSIAN]   - VITE_AUTH_SERVER_URL: ${baseUrl}`);
    console.log(`[ATLASSIAN]   - VITE_JIRA_SCOPE: ${process.env.VITE_JIRA_SCOPE}`);

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

    console.log(`[ATLASSIAN] Generated full auth URL (first 100 chars): ${fullUrl.substring(0, 100)}...`);
    console.log(`[ATLASSIAN] 🔑 CRITICAL - Code challenge being sent to Atlassian: ${params.codeChallenge}`);
    console.log(`[ATLASSIAN] 🔑 Full authorization URL:\n${fullUrl}`);

    return fullUrl;
  },

  /**
   * Extract callback parameters from OAuth redirect
   * Handles Atlassian-specific URL encoding quirk: + gets decoded as space
   * @param req - Express request object
   * @returns Extracted and normalized callback parameters
   */
  extractCallbackParams(req: any): CallbackParams {
    console.log(`[ATLASSIAN] Extracting callback parameters from query string`);
    console.log(`[ATLASSIAN] Full query object:`, req.query);

    const { code, state } = req.query;

    console.log(`[ATLASSIAN] Raw extracted values:`);
    console.log(`[ATLASSIAN]   - code: ${code ? code.substring(0, 30) + '... (length: ' + code.length + ')' : 'MISSING'}`);
    console.log(`[ATLASSIAN]   - state: ${state ? state.substring(0, 20) + '... (length: ' + state.length + ')' : 'MISSING'}`);

    // Try to decode the authorization code JWT to see what Atlassian stored
    if (code) {
      try {
        const parts = code.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          console.log(`[ATLASSIAN] Decoded authorization code JWT payload:`, {
            jti: payload.jti,
            sub: payload.sub?.substring(0, 20) + '...',
            iss: payload.iss,
            aud: payload.aud?.substring(0, 10) + '...',
            audFull: payload.aud,
            exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'none',
            hasPkce: !!payload['https://id.atlassian.com/pkce'],
            pkcePreview: payload['https://id.atlassian.com/pkce']?.substring(0, 30),
          });
          console.log(`[ATLASSIAN] This shows what code_challenge Atlassian stored during authorization`);
          console.log(`[ATLASSIAN] 🚨 VERIFY: Auth code issued for client_id: ${payload.aud}`);
        }
      } catch (err) {
        console.log(`[ATLASSIAN] Could not decode authorization code as JWT (this is normal)`);
      }
    }

    // Handle Atlassian-specific URL encoding: + gets decoded as space
    const normalizedState = state ? state.replace(/ /g, '+') : state;

    if (state !== normalizedState) {
      console.log(`[ATLASSIAN] State was normalized (spaces replaced with +)`);
      console.log(`[ATLASSIAN]   - Original: ${state?.substring(0, 20)}...`);
      console.log(`[ATLASSIAN]   - Normalized: ${normalizedState?.substring(0, 20)}...`);
    }

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
