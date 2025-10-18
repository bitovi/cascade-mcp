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
import type { AtlassianTokenResponse } from '../atlassian-auth-code-flow.ts';

// Extended interface to handle optional refresh token expiration
export interface ExtendedAtlassianTokenResponse extends AtlassianTokenResponse {
  refresh_expires_in?: number;
}

/**
 * Extract expiration from Atlassian JWT refresh token
 */
function extractAtlassianRefreshTokenExpiration(refreshToken: string): number | null {
  try {
    // Decode JWT without verification (we just need the exp claim)
    const parts = refreshToken.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload.exp || null;
  } catch {
    return null;
  }
}

export interface TokenCreationOptions {
  resource?: string;
  scope?: string;
  sub?: string;
  iss?: string;
}

/**
 * Creates a Jira MCP access token (JWT) with nested Atlassian credentials
 * Per Q21, Q22: Uses nested structure { atlassian: { access_token, refresh_token, expires_at, ... } }
 */
export async function createJiraMCPAuthToken(
  atlassianTokens: ExtendedAtlassianTokenResponse, 
  options: TokenCreationOptions = {}
): Promise<string> {
  const ATLASSIAN_CONFIG = getAtlassianConfig();
  
  // Calculate JWT expiration: 1 minute before Atlassian token expires
  const atlassianExpiresIn = atlassianTokens.expires_in || 3600;
  const jwtExpiresIn = process.env.TEST_SHORT_AUTH_TOKEN_EXP ? 
    parseInt(process.env.TEST_SHORT_AUTH_TOKEN_EXP) : 
    Math.max(60, atlassianExpiresIn - 60);
    
  const jwtExpirationTime = Math.floor(Date.now() / 1000) + jwtExpiresIn;
  const atlassianExpiresAt = Math.floor(Date.now() / 1000) + atlassianExpiresIn;
  
  if (process.env.TEST_SHORT_AUTH_TOKEN_EXP) {
    console.log(`🧪 TEST MODE: Creating JWT token with ${jwtExpiresIn}s expiration (expires at ${new Date(jwtExpirationTime * 1000).toISOString()})`);
  }

  // Create JWT with nested Atlassian credentials (Q21, Q22)
  const jwt = await jwtSign({
    sub: options.sub || ('user-' + randomUUID()),
    iss: options.iss || process.env.VITE_AUTH_SERVER_URL,
    aud: options.resource || process.env.VITE_AUTH_SERVER_URL,
    scope: options.scope || ATLASSIAN_CONFIG.scopes,
    // Nested provider structure (Q21)
    atlassian: {
      access_token: atlassianTokens.access_token,
      refresh_token: atlassianTokens.refresh_token,
      expires_at: atlassianExpiresAt,
      scope: ATLASSIAN_CONFIG.scopes,
    },
    exp: jwtExpirationTime
  });

  return jwt;
}

/**
 * Creates a Jira MCP refresh token (JWT) with nested Atlassian refresh token
 * Per Q21: Uses nested structure { atlassian: { refresh_token, ... } }
 */
export async function createJiraMCPRefreshToken(
  atlassianTokens: ExtendedAtlassianTokenResponse, 
  options: TokenCreationOptions = {}
): Promise<{ refreshToken: string; expiresIn: number }> {
  const ATLASSIAN_CONFIG = getAtlassianConfig();
  
  // Calculate refresh token expiration to match Atlassian's refresh token lifetime
  let refreshTokenExp;
  
  // Try to decode Atlassian's JWT refresh token to get actual expiration
  if (atlassianTokens.refresh_token) {
    refreshTokenExp = extractAtlassianRefreshTokenExpiration(atlassianTokens.refresh_token);
  }
  
  // Fallback if we couldn't decode the JWT or no refresh token
  if (!refreshTokenExp) {
    if (atlassianTokens.refresh_expires_in) {
      // Use refresh_expires_in if provided
      refreshTokenExp = Math.floor(Date.now() / 1000) + atlassianTokens.refresh_expires_in - 86400; // 1 day buffer
      console.log('  Using Atlassian refresh_expires_in with 1-day buffer');
    } else {
      // Fallback to 90 days (common for Atlassian refresh tokens)
      refreshTokenExp = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
      console.log('  Using 90-day fallback for refresh token expiration');
    }
  }

  // Create a refresh token with nested structure (Q21)
  const refreshToken = await jwtSign({
    type: 'refresh_token',
    sub: options.sub || ('user-' + randomUUID()),
    iss: options.iss || process.env.VITE_AUTH_SERVER_URL,
    aud: options.resource || process.env.VITE_AUTH_SERVER_URL,
    scope: options.scope || ATLASSIAN_CONFIG.scopes,
    // Nested provider structure for refresh tokens
    atlassian: {
      refresh_token: atlassianTokens.refresh_token,
    },
    exp: refreshTokenExp
  });

  return {
    refreshToken,
    expiresIn: refreshTokenExp - Math.floor(Date.now() / 1000)
  };
}
