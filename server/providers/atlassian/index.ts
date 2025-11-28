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
  CallbackParams
} from '../provider-interface.js';
import { registerAtlassianTools } from './tools/index.js';
import { generateCodeChallenge } from '../../tokens.js';

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
    const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/atlassian`;
    const scope = params.scope || process.env.VITE_JIRA_SCOPE!;

    console.log(`[ATLASSIAN] Using environment variables:`);
    console.log(`[ATLASSIAN]   - VITE_JIRA_CLIENT_ID: ${clientId?.substring(0, 10)}...`);
    console.log(`[ATLASSIAN]   - VITE_AUTH_SERVER_URL: ${baseUrl}`);
    console.log(`[ATLASSIAN]   - VITE_JIRA_SCOPE: ${process.env.VITE_JIRA_SCOPE}`);
    console.log(`[ATLASSIAN]   - Final redirect_uri: ${redirectUri}`);
    console.log(`[ATLASSIAN]   - Final scope: ${scope}`);

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

    const fullUrl = `https://auth.atlassian.com/authorize?${new URLSearchParams(urlParams).toString()}`;
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
    console.log(`\n========== ATLASSIAN TOKEN EXCHANGE START ==========`);
    console.log(`[ATLASSIAN] Preparing token exchange request...`);

    const clientId = process.env.VITE_JIRA_CLIENT_ID;
    const clientSecret = process.env.JIRA_CLIENT_SECRET;
    const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
    const redirectUri = params.redirectUri || `${baseUrl}/auth/callback/atlassian`;

    console.log(`[ATLASSIAN] Environment variables:`);
    console.log(`[ATLASSIAN]   - VITE_JIRA_CLIENT_ID (FULL): ${clientId || 'MISSING'}`);
    console.log(`[ATLASSIAN]   - JIRA_CLIENT_SECRET: ${clientSecret ? 'present (length: ' + clientSecret.length + ')' : 'MISSING'}`);
    if (clientSecret) {
      console.log(`[ATLASSIAN]   - Secret starts with: ${clientSecret.substring(0, 4)}... (format: ${clientSecret.startsWith('ATOA') ? 'NEW ATOA format' : 'OLD format or custom'})`);
      console.log(`[ATLASSIAN]   - 🔍 SECRET LAST 8 CHARS FOR VERIFICATION: ...${clientSecret.slice(-8)}`);
    }
    console.log(`[ATLASSIAN]   - VITE_AUTH_SERVER_URL: ${baseUrl}`);
    console.log(`[ATLASSIAN]   - Redirect URI: ${redirectUri}`);

    const requestBody = {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: params.code,
      redirect_uri: redirectUri,
      code_verifier: params.codeVerifier,
    };

    console.log(`[ATLASSIAN] Token request body:`, {
      grant_type: requestBody.grant_type,
      client_id: requestBody.client_id?.substring(0, 10) + '...',
      client_secret: requestBody.client_secret ? 'present (length: ' + requestBody.client_secret.length + ')' : 'MISSING',
      code: requestBody.code?.substring(0, 20) + '...',
      redirect_uri: requestBody.redirect_uri,
      code_verifier: requestBody.code_verifier?.substring(0, 10) + '... (length: ' + requestBody.code_verifier?.length + ')',
    });
    
    console.log(`[ATLASSIAN] 🔍 FULL TOKEN EXCHANGE REQUEST BODY (for debugging):`);
    console.log(JSON.stringify({
      grant_type: requestBody.grant_type,
      client_id: requestBody.client_id,
      client_secret: '***' + requestBody.client_secret?.slice(-8),
      code: requestBody.code,
      redirect_uri: requestBody.redirect_uri,
      code_verifier: requestBody.code_verifier,
    }, null, 2));

    // PKCE Validation: Compute what the code_challenge SHOULD be from our code_verifier
    console.log(`[ATLASSIAN] 🔐 PKCE VALIDATION:`);
    try {
      const computedChallenge = generateCodeChallenge(params.codeVerifier);
      console.log(`[ATLASSIAN]   - Our code_verifier: ${params.codeVerifier.substring(0, 15)}... (full length: ${params.codeVerifier.length})`);
      console.log(`[ATLASSIAN]   - Computed code_challenge: ${computedChallenge.substring(0, 15)}... (full length: ${computedChallenge.length})`);
      console.log(`[ATLASSIAN]   - Full computed challenge: ${computedChallenge}`);

      // Extract what Atlassian stored in the authorization code
      try {
        const codeParts = params.code.split('.');
        if (codeParts.length === 3) {
          const codePayload = JSON.parse(Buffer.from(codeParts[1], 'base64url').toString());
          const atlassianStoredPkce = codePayload['https://id.atlassian.com/pkce'];
          if (atlassianStoredPkce) {
            console.log(`[ATLASSIAN]   - Atlassian's encrypted PKCE: ${atlassianStoredPkce.substring(0, 30)}...`);
            console.log(`[ATLASSIAN]   - NOTE: Atlassian encrypts the code_challenge for security`);
          }
        }
      } catch (e) {
        console.log(`[ATLASSIAN]   - Could not decode auth code JWT (this is OK)`);
      }
    } catch (err) {
      console.error(`[ATLASSIAN]   - ERROR computing code_challenge:`, err);
    }

    console.log(`[ATLASSIAN] Making POST request to: https://auth.atlassian.com/oauth/token`);
    console.log(`[ATLASSIAN] Request headers: Content-Type: application/json`);

    let tokenRes: Response;
    let fetchError: Error | null = null;

    try {
      tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      fetchError = err as Error;
      console.error(`[ATLASSIAN] FATAL: Failed to make HTTP request to Atlassian token endpoint`);
      console.error(`[ATLASSIAN] Network error:`, fetchError.message);
      console.error(`[ATLASSIAN] This could mean:`);
      console.error(`[ATLASSIAN]   1. Network connectivity issue`);
      console.error(`[ATLASSIAN]   2. DNS resolution failure`);
      console.error(`[ATLASSIAN]   3. Firewall blocking outbound HTTPS`);
      throw new Error(`Network error contacting Atlassian: ${fetchError.message}`);
    }

    console.log(`[ATLASSIAN] Response received:`);
    console.log(`[ATLASSIAN]   - Status: ${tokenRes.status} ${tokenRes.statusText}`);
    console.log(`[ATLASSIAN]   - Headers:`, {
      'content-type': tokenRes.headers.get('content-type'),
      'content-length': tokenRes.headers.get('content-length'),
      'x-request-id': tokenRes.headers.get('x-request-id'),
      'date': tokenRes.headers.get('date'),
    });

    const tokenData = await tokenRes.json() as any;

    console.log(`[ATLASSIAN] Response body:`, {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
      error: tokenData.error,
      errorDescription: tokenData.error_description,
    });

    if (!tokenData.access_token) {
      console.error(`[ATLASSIAN] ERROR: Token exchange failed!`);
      console.error(`[ATLASSIAN] Full error response: ${JSON.stringify(tokenData, null, 2)}`);
      console.error(`[ATLASSIAN] This typically means:`);
      console.error(`[ATLASSIAN]   1. Client ID or Client Secret is incorrect`);
      console.error(`[ATLASSIAN]   2. Code verifier doesn't match code challenge`);
      console.error(`[ATLASSIAN]   3. Redirect URI doesn't match what was registered`);
      console.error(`[ATLASSIAN]   4. Authorization code has expired or been used`);
      console.error(`========== ATLASSIAN TOKEN EXCHANGE FAILED ==========\n`);
      throw new Error(`Atlassian token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    console.log(`[ATLASSIAN] Token exchange successful!`);
    console.log(`[ATLASSIAN] Access token (first 20 chars): ${tokenData.access_token.substring(0, 20)}...`);
    console.log(`========== ATLASSIAN TOKEN EXCHANGE END ==========\n`);

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
    registerAtlassianTools(mcp, authContext);
  },
};
