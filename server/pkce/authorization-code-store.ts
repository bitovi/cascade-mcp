/**
 * Authorization Code Store
 * 
 * Stores temporary mappings between authorization codes and JWT tokens for the
 * OAuth 2.0 authorization code flow. This is used when the connection hub
 * completes and needs to return a code to the MCP client.
 * 
 * Specifications Implemented:
 * - RFC 6749 Section 4.1.2 - Authorization codes are single-use and short-lived
 * - RFC 6749 Section 10.5 - Authorization codes should expire quickly (10 minutes)
 * 
 * Key Responsibilities:
 * - Generate cryptographically secure authorization codes
 * - Store temporary code → JWT mappings
 * - Auto-expire codes after 10 minutes
 * - Ensure single-use (codes deleted after retrieval)
 */

import crypto from 'crypto';

interface AuthCodeEntry {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  clientId?: string;
  redirectUri?: string;
}

/**
 * Authorization code consumption result
 */
export interface AuthCodeResult {
  accessToken: string;
  refreshToken?: string;
}

/**
 * In-memory store for authorization codes
 * Key: authorization code
 * Value: JWT tokens (access and refresh) and metadata
 */
const authorizationCodes = new Map<string, AuthCodeEntry>();

/**
 * Authorization code expiration time (10 minutes per RFC 6749)
 */
const CODE_EXPIRATION_MS = 10 * 60 * 1000;

/**
 * Cleanup interval for expired codes (every 5 minutes)
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Periodic cleanup of expired authorization codes
 */
setInterval(() => {
  const now = Date.now();
  let expiredCount = 0;
  
  for (const [code, entry] of authorizationCodes.entries()) {
    if (entry.expiresAt < now) {
      authorizationCodes.delete(code);
      expiredCount++;
    }
  }
  
  if (expiredCount > 0) {
    console.log(`🧹 Cleaned up ${expiredCount} expired authorization codes`);
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Generate a cryptographically secure authorization code
 */
export function generateAuthorizationCode(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Store an authorization code with its associated JWT tokens
 *
 * @param code - The authorization code
 * @param accessToken - The JWT access token to return when code is exchanged
 * @param refreshToken - Optional JWT refresh token
 * @param clientId - Optional client ID for validation
 * @param redirectUri - Optional redirect URI for validation
 */
export function storeAuthorizationCode(
  code: string,
  accessToken: string,
  refreshToken?: string,
  clientId?: string,
  redirectUri?: string
): void {
  const expiresAt = Date.now() + CODE_EXPIRATION_MS;

  authorizationCodes.set(code, {
    accessToken,
    refreshToken,
    expiresAt,
    clientId,
    redirectUri,
  });

  console.log(
    `📝 Stored authorization code (expires in ${CODE_EXPIRATION_MS / 1000}s)`
  );
  console.log(`  Has refresh token: ${!!refreshToken}`);
}

/**
 * Retrieve and consume an authorization code
 *
 * Per RFC 6749, authorization codes are single-use and must be deleted after retrieval.
 *
 * @param code - The authorization code to retrieve
 * @returns The stored access and refresh tokens, or null if code is invalid/expired
 */
export function consumeAuthorizationCode(code: string): AuthCodeResult | null {
  const entry = authorizationCodes.get(code);

  if (!entry) {
    console.log('  ❌ Authorization code not found');
    return null;
  }

  // Check expiration
  if (entry.expiresAt < Date.now()) {
    authorizationCodes.delete(code);
    console.log('  ⏰ Authorization code expired');
    return null;
  }

  // Delete code (single-use per RFC 6749)
  authorizationCodes.delete(code);
  console.log('  ✅ Authorization code consumed');
  console.log(`  Returning access token: ${!!entry.accessToken}`);
  console.log(`  Returning refresh token: ${!!entry.refreshToken}`);

  return {
    accessToken: entry.accessToken,
    refreshToken: entry.refreshToken,
  };
}

/**
 * Get the size of the authorization code store (for debugging)
 */
export function getAuthCodeStoreSize(): number {
  return authorizationCodes.size;
}
