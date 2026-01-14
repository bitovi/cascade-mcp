/**
 * OAuth URL Builder Utilities
 * 
 * Centralizes OAuth authorization URL creation logic to eliminate duplication
 * across provider implementations. Supports both PKCE and traditional OAuth flows.
 */

import type { AuthUrlParams } from '../provider-interface.js';

/**
 * Configuration for building OAuth authorization URLs
 */
export interface OAuthUrlBuilderConfig {
  /** Base authorization endpoint URL */
  baseUrl: string;
  /** Environment variable name containing client ID */
  clientIdEnvVar: string;
  /** Environment variable name containing OAuth scope */
  scopeEnvVar: string;
  /** Additional query parameters specific to the provider */
  additionalParams?: Record<string, string>;
  /** Whether this provider uses PKCE flow */
  usePKCE?: boolean;
}

/**
 * Build OAuth authorization URL with consistent parameter handling
 * 
 * @param config - Provider-specific configuration
 * @param params - Authorization parameters from MCP/PKCE flow
 * @param redirectPath - Path for OAuth callback (e.g., '/auth/callback/atlassian')
 * @returns Complete OAuth authorization URL
 */
export function buildOAuthUrl(
  config: OAuthUrlBuilderConfig,
  params: AuthUrlParams,
  redirectPath: string
): string {
  const clientId = process.env[config.clientIdEnvVar];
  const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
  const redirectUri = params.redirectUri || `${baseUrl}${redirectPath}`;
  const scope = params.scope || process.env[config.scopeEnvVar]!;

  // Build base parameters
  const urlParams: Record<string, string> = {
    client_id: clientId!,
    response_type: params.responseType || 'code',
    redirect_uri: redirectUri,
    scope,
    ...config.additionalParams,
  };

  // Add PKCE parameters if required
  if (config.usePKCE) {
    urlParams.code_challenge = params.codeChallenge;
    urlParams.code_challenge_method = params.codeChallengeMethod;
  }

  // Add state if provided
  if (params.state) {
    urlParams.state = params.state;
  }

  return `${config.baseUrl}?${new URLSearchParams(urlParams).toString()}`;
}
