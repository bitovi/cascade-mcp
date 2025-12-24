/**
 * Provider Interface - Multi-Provider OAuth Abstraction
 * 
 * This file defines the common interface that all OAuth providers must implement.
 * Uses a functional approach with simple objects instead of classes.
 */

import type { McpServer } from '../mcp-core/mcp-types.js';

// Standard token response structure used by all providers
export interface StandardTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id?: string;
  [key: string]: any; // Allow provider-specific fields
}

// Parameters for creating authorization URLs
export interface AuthUrlParams {
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  responseType?: string;
  scope?: string;
  redirectUri?: string;
}

// Parameters for token exchange
export interface TokenExchangeParams {
  code: string;
  codeVerifier: string;
  redirectUri?: string;
}

// Parameters for refresh token exchange
export interface RefreshTokenParams {
  refreshToken: string;
}

// Callback parameters extracted from request
export interface CallbackParams {
  code: string;
  state?: string;
  normalizedState?: string;
}

/**
 * OAuth Provider Interface
 * 
 * Providers are simple objects (not classes) that implement this interface.
 * This enables a functional, testable approach to multi-provider OAuth.
 * 
 * Example usage:
 * ```typescript
 * export const atlassianProvider: OAuthProvider = {
 *   name: 'atlassian',
 *   createAuthUrl: (params) => { ... },
 *   exchangeCodeForTokens: async (params) => { ... },
 *   registerTools: (mcp, authContext) => { ... }
 * };
 * ```
 */
export interface OAuthProvider {
  /** Provider identifier (e.g., 'atlassian', 'figma') */
  name: string;
  
  /**
   * Create provider-specific authorization URL with PKCE parameters
   * @param params - Authorization URL parameters including code challenge
   * @returns OAuth authorization URL to redirect user to
   */
  createAuthUrl(params: AuthUrlParams): string;
  
  /**
   * Extract callback parameters from OAuth redirect
   * Handles provider-specific quirks (e.g., Atlassian's URL encoding)
   * @param req - Express request object from callback endpoint
   * @returns Extracted and normalized callback parameters
   */
  extractCallbackParams(req: any): CallbackParams;
  
  /**
   * Exchange authorization code for access/refresh tokens
   * @param params - Token exchange parameters including code verifier
   * @returns Standardized token response
   */
  exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse>;
  
  /**
   * Get default OAuth scopes for this provider
   * @returns Array of scope strings (optional - can use env vars instead)
   */
  getDefaultScopes?(): string[];
  
  /**
   * Validate token response from provider (optional)
   * @param response - Raw response from token endpoint
   * @returns true if valid, false otherwise
   */
  validateTokenResponse?(response: any): boolean;

  /**
   * Refresh an access token using a refresh token
   * Handles provider-specific refresh flows (different endpoints, auth methods)
   * @param params - Refresh parameters including the refresh token
   * @returns New access token and optionally new refresh token
   *
   * NOTE: Some providers (Atlassian) rotate refresh tokens on each refresh,
   * while others (Figma) reuse the same refresh token indefinitely.
   * The returned refresh_token should be:
   * - The NEW refresh token if provider rotates (Atlassian)
   * - The ORIGINAL refresh token if provider doesn't rotate (Figma)
   */
  refreshAccessToken?(params: RefreshTokenParams): Promise<StandardTokenResponse>;

  /**
   * Register provider-specific MCP tools
   * Called during dynamic MCP server creation based on authenticated providers
   * @param mcp - MCP server instance to register tools on
   * @param authContext - Authentication context with provider tokens
   */
  registerTools(mcp: McpServer, authContext: any): void;
}
