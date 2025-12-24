/**
 * JWT Token Creation and Management Utilities
 *
 * This module provides utilities for creating JWT access and refresh tokens that
 * embed provider credentials (Atlassian, Figma, etc.) for MCP clients. It handles
 * token expiration logic and maintains compatibility with MCP authentication requirements.
 *
 * Specifications Implemented:
 * - RFC 7519 - JSON Web Token (JWT) creation and signing
 * - RFC 6749 - OAuth 2.0 token response formats and expiration
 * - Model Context Protocol (MCP) authentication token requirements
 * - Multi-provider token embedding with nested structure
 *
 * Key Responsibilities:
 * - Create JWT access tokens with nested provider credentials (multi-provider support)
 * - Create JWT refresh tokens with nested provider refresh tokens
 * - Calculate appropriate token expiration times (1 minute buffer)
 * - Handle test mode short expiration for refresh flow testing
 * - Maintain token audience and scope for proper authorization
 * - Support multiple providers (Atlassian, Figma, etc.)
 *
 * Token Structure (Per Q21, Q22):
 * - Access Token JWT contains nested structure: { atlassian: { access_token, refresh_token, ... }, figma: { ... } }
 * - Refresh Token JWT contains nested provider refresh tokens: { atlassian: { refresh_token }, figma: { refresh_token } }
 * - Both include proper OAuth claims (aud, iss, sub, exp, scope)
 * - JWT expiration: shortest provider token expiration minus 1 minute buffer
 *
 * Provider Token Structures:
 * Atlassian: { access_token, refresh_token (rotating), token_type, expires_in }
 * Figma: { access_token, refresh_token (static - reused), token_type, expires_in }
 */

import { randomUUID } from 'crypto';
import { jwtSign } from '../tokens.ts';
import { getAtlassianConfig } from '../atlassian-auth-code-flow.ts';
import type { AtlassianTokenResponse } from '../atlassian-auth-code-flow.ts';

// Generic provider token response
export interface ProviderTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  [key: string]: any;
}

// Extended Atlassian token response with optional refresh expiration
export interface ExtendedAtlassianTokenResponse extends AtlassianTokenResponse {
  refresh_expires_in?: number;
}

// Figma token response (similar structure to Atlassian)
export interface FigmaTokenResponse extends ProviderTokenResponse {
  user_id?: string;
}

export interface TokenCreationOptions {
  resource?: string;
  scope?: string;
  sub?: string;
  iss?: string;
}

/**
 * Extract JWT expiration timestamp from a JWT token
 * @param token - JWT token to extract expiration from
 * @returns Expiration timestamp in seconds, or null if cannot decode
 */
function extractJwtExpiration(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload.exp || null;
  } catch {
    return null;
  }
}

/**
 * Creates a multi-provider MCP access token (JWT) with nested provider credentials
 * Per Q21, Q22: Uses nested structure { atlassian: { access_token, refresh_token, expires_at, ... }, figma: { ... } }
 *
 * @param providers - Record of provider tokens keyed by provider name
 * @param options - Token creation options
 * @returns Signed JWT access token
 */
export async function createMCPAccessToken(
  providers: Record<string, ProviderTokenResponse>,
  options: TokenCreationOptions = {}
): Promise<string> {
  const ATLASSIAN_CONFIG = getAtlassianConfig();

  // Calculate JWT expiration: 1 minute before shortest provider token expires
  let minExpiresAt = Infinity;
  const now = Math.floor(Date.now() / 1000);

  for (const [_providerName, tokenData] of Object.entries(providers)) {
    const expiresIn = tokenData.expires_in || 3600;
    const expiresAt = now + expiresIn;
    minExpiresAt = Math.min(minExpiresAt, expiresAt);
  }

  // Use shortest expiration minus 1 minute buffer
  const jwtExpiresIn = process.env.TEST_SHORT_AUTH_TOKEN_EXP ?
    parseInt(process.env.TEST_SHORT_AUTH_TOKEN_EXP) :
    Math.max(60, (minExpiresAt - now) - 60);

  const jwtExpirationTime = now + jwtExpiresIn;

  if (process.env.TEST_SHORT_AUTH_TOKEN_EXP) {
    console.log(`🧪 TEST MODE: Creating JWT token with ${jwtExpiresIn}s expiration (expires at ${new Date(jwtExpirationTime * 1000).toISOString()})`);
  }

  // Build JWT payload with nested provider credentials
  const jwtPayload: any = {
    sub: options.sub || ('user-' + randomUUID()),
    iss: options.iss || process.env.VITE_AUTH_SERVER_URL,
    aud: options.resource || process.env.VITE_AUTH_SERVER_URL,
    scope: options.scope || ATLASSIAN_CONFIG.scopes,
    exp: jwtExpirationTime
  };

  // Add each provider's tokens to the JWT payload
  if (providers.atlassian) {
    const atlassianExpiresAt = now + (providers.atlassian.expires_in || 3600);
    jwtPayload.atlassian = {
      access_token: providers.atlassian.access_token,
      refresh_token: providers.atlassian.refresh_token,
      expires_at: atlassianExpiresAt,
      scope: providers.atlassian.scope || ATLASSIAN_CONFIG.scopes,
    };
  }

  if (providers.figma) {
    const figmaExpiresAt = now + (providers.figma.expires_in || 7776000); // Figma default: 90 days
    jwtPayload.figma = {
      access_token: providers.figma.access_token,
      refresh_token: providers.figma.refresh_token,
      expires_at: figmaExpiresAt,
      scope: providers.figma.scope || 'file_content:read file_comments:read',
    };
  }

  const jwt = await jwtSign(jwtPayload);
  return jwt;
}

/**
 * Creates a multi-provider MCP refresh token (JWT) with nested provider refresh tokens
 * Per Q21: Uses nested structure { atlassian: { refresh_token }, figma: { refresh_token } }
 *
 * CRITICAL: For Figma, the same refresh_token must be preserved and reused in subsequent
 * refreshes because Figma does NOT rotate refresh tokens (they remain valid indefinitely).
 * Atlassian DOES rotate refresh tokens - each refresh returns a new one.
 *
 * @param providers - Record of provider tokens keyed by provider name
 * @param options - Token creation options
 * @returns Object with refreshToken JWT and expiresIn duration
 */
export async function createMCPRefreshToken(
  providers: Record<string, ProviderTokenResponse>,
  options: TokenCreationOptions = {}
): Promise<{ refreshToken: string; expiresIn: number }> {
  const ATLASSIAN_CONFIG = getAtlassianConfig();
  const now = Math.floor(Date.now() / 1000);

  // Calculate refresh token expiration: use earliest provider refresh token expiration
  // or fallback to provider defaults
  let refreshTokenExp: number | null = null;

  // Try to extract expiration from Atlassian's JWT refresh token
  if (providers.atlassian?.refresh_token) {
    refreshTokenExp = extractJwtExpiration(providers.atlassian.refresh_token);
  }

  // If we still don't have expiration, use fallback values
  if (!refreshTokenExp) {
    // Use shorter of Atlassian (90 days) or Figma (90 days) defaults
    // Both default to similar lifetimes, so use 90 days
    refreshTokenExp = now + (90 * 24 * 60 * 60);
    console.log('  Using 90-day fallback for refresh token expiration');
  }

  // Build refresh token payload with nested provider refresh tokens
  const refreshPayload: any = {
    type: 'refresh_token',
    sub: options.sub || ('user-' + randomUUID()),
    iss: options.iss || process.env.VITE_AUTH_SERVER_URL,
    aud: options.resource || process.env.VITE_AUTH_SERVER_URL,
    scope: options.scope || ATLASSIAN_CONFIG.scopes,
    exp: refreshTokenExp
  };

  // Add Atlassian refresh token if present
  if (providers.atlassian?.refresh_token) {
    refreshPayload.atlassian = {
      refresh_token: providers.atlassian.refresh_token,
    };
  }

  // Add Figma refresh token if present
  // CRITICAL: Figma refresh tokens do NOT rotate - preserve the original token
  if (providers.figma?.refresh_token) {
    refreshPayload.figma = {
      refresh_token: providers.figma.refresh_token,
    };
  }

  const refreshToken = await jwtSign(refreshPayload);

  return {
    refreshToken,
    expiresIn: refreshTokenExp - now
  };
}

/**
 * Legacy function for backwards compatibility - creates access token from Atlassian tokens only
 * DEPRECATED: Use createMCPAccessToken() with provider record instead
 *
 * @deprecated Use createMCPAccessToken({ atlassian: tokens }) instead
 */
export async function createJiraMCPAuthToken(
  atlassianTokens: ExtendedAtlassianTokenResponse,
  options: TokenCreationOptions = {}
): Promise<string> {
  return createMCPAccessToken({ atlassian: atlassianTokens }, options);
}

/**
 * Legacy function for backwards compatibility - creates refresh token from Atlassian tokens only
 * DEPRECATED: Use createMCPRefreshToken() with provider record instead
 *
 * @deprecated Use createMCPRefreshToken({ atlassian: tokens }) instead
 */
export async function createJiraMCPRefreshToken(
  atlassianTokens: ExtendedAtlassianTokenResponse,
  options: TokenCreationOptions = {}
): Promise<{ refreshToken: string; expiresIn: number }> {
  return createMCPRefreshToken({ atlassian: atlassianTokens }, options);
}
