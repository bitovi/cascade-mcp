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
 * - Create JWT access tokens with nested provider credentials
 * - Create JWT refresh tokens with nested provider refresh tokens
 * - Calculate appropriate token expiration times (1 minute buffer)
 * - Handle test mode short expiration for refresh flow testing
 * - Maintain token audience and scope for proper authorization
 *
 * Token Structure (Per Q21, Q22):
 * - Access Token JWT contains nested structure: { atlassian: { access_token, refresh_token, ... }, figma: { ... } }
 * - Refresh Token JWT contains nested provider refresh tokens
 * - Both include proper OAuth claims (aud, iss, sub, exp, scope)
 */

import { randomUUID } from 'crypto';
import { jwtSign } from '../tokens.ts';
import { getAtlassianConfig } from '../atlassian-auth-code-flow.ts';

/**
 * Generic token data from OAuth provider (Atlassian, Figma, etc.)
 */
export interface ProviderTokenData {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  refresh_expires_in?: number; // Atlassian-specific
  [key: string]: any; // Allow provider-specific fields
}

/**
 * Multi-provider token data organized by provider name
 */
export interface MultiProviderTokens {
  atlassian?: ProviderTokenData;
  figma?: ProviderTokenData;
  [key: string]: ProviderTokenData | undefined;
}

/**
 * Options for token creation
 */
export interface TokenCreationOptions {
  resource?: string;
  scope?: string;
  sub?: string;
  iss?: string;
}

/**
 * Extract expiration timestamp from a JWT token string
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
 * Build a nested JWT payload for access tokens with provider credentials
 */
function buildAccessTokenPayload(
  providers: MultiProviderTokens,
  options: TokenCreationOptions
): any {
  const ATLASSIAN_CONFIG = getAtlassianConfig();

  const payload: any = {
    sub: options.sub || ('user-' + randomUUID()),
    iss: options.iss || process.env.VITE_AUTH_SERVER_URL,
    aud: options.resource || process.env.VITE_AUTH_SERVER_URL,
    scope: options.scope || ATLASSIAN_CONFIG.scopes,
  };

  // Add Atlassian credentials if present
  if (providers.atlassian) {
    const atlassianTokens = providers.atlassian;
    const expiresIn = atlassianTokens.expires_in || 3600;
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    payload.atlassian = {
      access_token: atlassianTokens.access_token,
      refresh_token: atlassianTokens.refresh_token,
      expires_at: expiresAt,
      scope: ATLASSIAN_CONFIG.scopes,
    };
  }

  // Add Figma credentials if present
  if (providers.figma) {
    const figmaTokens = providers.figma;
    const expiresIn = figmaTokens.expires_in || 3600;
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    payload.figma = {
      access_token: figmaTokens.access_token,
      refresh_token: figmaTokens.refresh_token,
      expires_at: expiresAt,
      scope: figmaTokens.scope || 'file_content:read file_export:write',
    };
  }

  return payload;
}

/**
 * Calculate JWT expiration time using the earliest provider expiration
 * Per design decision: JWT expires when first provider's token expires (1-minute buffer)
 */
function calculateAccessTokenExpiration(providers: MultiProviderTokens): number {
  let minExpiresIn = Infinity;

  if (providers.atlassian) {
    const expiresIn = providers.atlassian.expires_in || 3600;
    minExpiresIn = Math.min(minExpiresIn, expiresIn);
  }

  if (providers.figma) {
    const expiresIn = providers.figma.expires_in || 3600;
    minExpiresIn = Math.min(minExpiresIn, expiresIn);
  }

  // Use test mode short expiration if set
  if (process.env.TEST_SHORT_AUTH_TOKEN_EXP) {
    const jwtExpiresIn = parseInt(process.env.TEST_SHORT_AUTH_TOKEN_EXP);
    if (isFinite(minExpiresIn)) {
      console.log(`🧪 TEST MODE: Overriding expiration from ${minExpiresIn}s to ${jwtExpiresIn}s`);
    }
    return jwtExpiresIn;
  }

  // Apply 1-minute buffer before earliest expiration
  const jwtExpiresIn = Math.max(60, (minExpiresIn === Infinity ? 3600 : minExpiresIn) - 60);

  if (isFinite(minExpiresIn)) {
    console.log(`📊 JWT expiration: ${jwtExpiresIn}s (${minExpiresIn}s from first provider - 60s buffer)`);
  }

  return jwtExpiresIn;
}

/**
 * Creates an MCP access token (JWT) with nested provider credentials
 * Per Q21, Q22: Uses nested structure { atlassian: { access_token, refresh_token, expires_at, ... }, figma: { ... } }
 *
 * DEPRECATION NOTE: This function is kept for backward compatibility.
 * Use createMCPAccessToken() for new code.
 */
export async function createJiraMCPAuthToken(
  atlassianTokens: ProviderTokenData,
  options: TokenCreationOptions = {}
): Promise<string> {
  return createMCPAccessToken(
    { atlassian: atlassianTokens },
    options
  );
}

/**
 * Creates an MCP access token (JWT) with nested provider credentials
 * Supports multiple providers (Atlassian, Figma, etc.)
 */
export async function createMCPAccessToken(
  providers: MultiProviderTokens,
  options: TokenCreationOptions = {}
): Promise<string> {
  const jwtExpiresIn = calculateAccessTokenExpiration(providers);
  const jwtExpirationTime = Math.floor(Date.now() / 1000) + jwtExpiresIn;

  if (process.env.TEST_SHORT_AUTH_TOKEN_EXP) {
    console.log(`🧪 TEST MODE: Creating JWT access token with ${jwtExpiresIn}s expiration (expires at ${new Date(jwtExpirationTime * 1000).toISOString()})`);
  }

  const payload = buildAccessTokenPayload(providers, options);
  payload.exp = jwtExpirationTime;

  return await jwtSign(payload);
}

/**
 * Build nested JWT payload for refresh tokens with provider refresh tokens
 */
function buildRefreshTokenPayload(
  providers: MultiProviderTokens,
  options: TokenCreationOptions
): any {
  const ATLASSIAN_CONFIG = getAtlassianConfig();

  const payload: any = {
    type: 'refresh_token',
    sub: options.sub || ('user-' + randomUUID()),
    iss: options.iss || process.env.VITE_AUTH_SERVER_URL,
    aud: options.resource || process.env.VITE_AUTH_SERVER_URL,
    scope: options.scope || ATLASSIAN_CONFIG.scopes,
  };

  // Add Atlassian refresh token if present
  if (providers.atlassian && providers.atlassian.refresh_token) {
    payload.atlassian = {
      refresh_token: providers.atlassian.refresh_token,
    };
  }

  // Add Figma refresh token if present
  if (providers.figma && providers.figma.refresh_token) {
    payload.figma = {
      refresh_token: providers.figma.refresh_token,
    };
  }

  return payload;
}

/**
 * Calculate refresh token expiration time
 * Uses the expiration time embedded in provider refresh tokens if available
 */
function calculateRefreshTokenExpiration(providers: MultiProviderTokens): number {
  let minRefreshExp: number | null = null;

  // Check Atlassian refresh token expiration
  if (providers.atlassian?.refresh_token) {
    const atlassianRefreshExp = extractJwtExpiration(providers.atlassian.refresh_token);
    if (atlassianRefreshExp) {
      minRefreshExp = minRefreshExp === null ? atlassianRefreshExp : Math.min(minRefreshExp, atlassianRefreshExp);
    }
  }

  // Check Figma refresh token expiration (unlikely to be JWT, but support it)
  if (providers.figma?.refresh_token) {
    const figmaRefreshExp = extractJwtExpiration(providers.figma.refresh_token);
    if (figmaRefreshExp) {
      minRefreshExp = minRefreshExp === null ? figmaRefreshExp : Math.min(minRefreshExp, figmaRefreshExp);
    }
  }

  // If we have explicit refresh_expires_in, use it
  if (providers.atlassian?.refresh_expires_in) {
    const atlassianRefreshExpTime = Math.floor(Date.now() / 1000) + providers.atlassian.refresh_expires_in;
    if (minRefreshExp === null) {
      minRefreshExp = atlassianRefreshExpTime;
    } else {
      minRefreshExp = Math.min(minRefreshExp, atlassianRefreshExpTime);
    }
  }

  // Fallback to 90 days if we couldn't determine from tokens
  if (minRefreshExp === null) {
    const ninetyDays = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
    console.log('⏰ Refresh token: Using 90-day fallback for expiration');
    return ninetyDays;
  }

  return minRefreshExp;
}

/**
 * Creates an MCP refresh token (JWT) with nested provider refresh tokens
 * Per Q21: Uses nested structure { atlassian: { refresh_token, ... }, figma: { ... } }
 *
 * DEPRECATION NOTE: This function is kept for backward compatibility.
 * Use createMCPRefreshToken() for new code.
 */
export async function createJiraMCPRefreshToken(
  atlassianTokens: ProviderTokenData,
  options: TokenCreationOptions = {}
): Promise<{ refreshToken: string; expiresIn: number }> {
  const { refreshToken, expiresIn } = await createMCPRefreshToken(
    { atlassian: atlassianTokens },
    options
  );

  return { refreshToken, expiresIn };
}

/**
 * Creates an MCP refresh token (JWT) with nested provider refresh tokens
 * Supports multiple providers (Atlassian, Figma, etc.)
 */
export async function createMCPRefreshToken(
  providers: MultiProviderTokens,
  options: TokenCreationOptions = {}
): Promise<{ refreshToken: string; expiresIn: number }> {
  const refreshTokenExp = calculateRefreshTokenExpiration(providers);

  const payload = buildRefreshTokenPayload(providers, options);
  payload.exp = refreshTokenExp;

  const refreshToken = await jwtSign(payload);
  const expiresIn = refreshTokenExp - Math.floor(Date.now() / 1000);

  return {
    refreshToken,
    expiresIn,
  };
}
