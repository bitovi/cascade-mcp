import { SignJWT, jwtVerify as joseVerify } from 'jose';
import { createSecretKey, createHash, randomBytes } from 'crypto';
import { webcrypto } from 'crypto';

// Polyfill crypto for jose library
if (!globalThis.crypto) {
  // Type assertion needed because Node's webcrypto types don't perfectly match browser Crypto types
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// Generic JWT payload structure
export interface JWTPayload {
  [key: string]: any;
  exp?: number | string | Date;
  iat?: number;
}

// Create a secret key for JWT signing
const key = createSecretKey(Buffer.from(process.env.JWT_SECRET!));

/**
 * Sign a JWT token with the provided payload
 * @param payload - The payload to include in the JWT
 * @returns The signed JWT token
 */
export async function jwtSign(payload: JWTPayload): Promise<string> {
  const { exp, ...jwtPayload } = payload;
  
  const jwt = new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp || '2m');

  return await jwt.sign(key);
}

/**
 * Verify and decode a JWT token
 * @param token - The JWT token to verify
 * @returns The decoded payload
 */
export async function jwtVerify(token: string): Promise<any> {
  const { payload } = await joseVerify(token, key);
  return payload;
}

// === PKCE Helper Functions ===

/**
 * Generate a cryptographically secure code verifier for PKCE
 * @returns Base64URL-encoded code verifier
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate a code challenge from a code verifier using SHA256
 * @param codeVerifier - The code verifier to hash
 * @returns Base64URL-encoded code challenge
 */
export function generateCodeChallenge(codeVerifier: string): string {
  const hash = createHash('sha256').update(codeVerifier).digest();
  return Buffer.from(hash).toString('base64url');
}

// === JWT Utility Functions ===

/**
 * Parse a JWT token and extract the payload
 * @param token - The JWT token to parse
 * @returns The decoded payload
 */
export function parseJWT(token: string): any {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

/**
 * Extract expires_in from a JWT token by decoding its exp claim
 * @param token - JWT token string
 * @returns seconds until expiration, or default 3540 if unable to extract
 */
export function getExpiresInFromJwt(token: string): number {
  const payload = parseJWT(token);
  if (payload.exp && typeof payload.exp === 'number') {
    const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
    return Math.max(0, expiresIn); // Don't return negative
  }

  return 3540; // Default fallback
}

/**
 * Format a token with truncation and expiration information
 * @param token - The JWT token to format
 * @param maxLength - Maximum length for the truncated token
 * @returns Formatted token string with expiration info
 */
export function formatTokenWithExpiration(token: string, maxLength: number = 20): string {
  try {
    const payload = parseJWT(token);
    const truncatedToken = token.substring(0, maxLength) + '...';
    
    // Check if we have a valid expiration timestamp
    if (!payload.exp || typeof payload.exp !== 'number') {
      return `${truncatedToken} (no expiration info)`;
    }
    
    const expTimestamp = payload.exp;
    const now = Math.floor(Date.now() / 1000);
    const diffSeconds = expTimestamp - now;
    
    // Sanity check - if the difference is more than 10 years, something is wrong
    const tenYearsInSeconds = 10 * 365 * 24 * 60 * 60;
    if (Math.abs(diffSeconds) > tenYearsInSeconds) {
      return `${truncatedToken} (invalid expiration: ${expTimestamp})`;
    }
    
    let timeMessage: string;
    if (diffSeconds > 0) {
      // Token hasn't expired yet
      const hours = Math.floor(diffSeconds / 3600);
      const minutes = Math.floor((diffSeconds % 3600) / 60);
      
      if (hours > 0) {
        timeMessage = `expires in ${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        timeMessage = `expires in ${minutes}m`;
      } else {
        timeMessage = `expires in ${diffSeconds}s`;
      }
    } else {
      // Token has expired
      const expiredSeconds = Math.abs(diffSeconds);
      const hours = Math.floor(expiredSeconds / 3600);
      const minutes = Math.floor((expiredSeconds % 3600) / 60);
      
      if (hours > 0) {
        timeMessage = `expired ${hours}h ${minutes}m ago`;
      } else if (minutes > 0) {
        timeMessage = `expired ${minutes}m ago`;
      } else {
        timeMessage = `expired ${expiredSeconds}s ago`;
      }
    }
    
    return `${truncatedToken} (${timeMessage})`;
  } catch (err) {
    // If we can't parse the token, just truncate it
    const truncatedToken = token.substring(0, maxLength) + '...';
    return `${truncatedToken} (could not parse expiration)`;
  }
}

/**
 * Sanitize a JWT payload for logging by truncating sensitive tokens and adding expiration info
 * @param payload - The JWT payload to sanitize
 * @returns Sanitized payload safe for logging
 */
export function sanitizeJwtPayload(payload: any): any {
  return sanitizeObjectWithJWTs(payload, 30);
}

/**
 * Sanitize an object by detecting and sanitizing any JWT tokens it contains
 * @param obj - The object to sanitize
 * @param maxTokenLength - Maximum length for truncated tokens
 * @returns Sanitized object safe for logging
 */
export function sanitizeObjectWithJWTs(obj: any, maxTokenLength: number = 30): any {
  const sanitized = { ...obj };
  
  for (const [key, value] of Object.entries(sanitized)) {
    // Check if the value looks like a JWT (string with exactly 3 parts separated by dots)
    if (typeof value === 'string' && value.includes('.')) {
      const parts = value.split('.');
      if (parts.length === 3) {
        try {
          // Try to parse as JWT - if successful, use formatTokenWithExpiration
          parseJWT(value);
          sanitized[key] = formatTokenWithExpiration(value, maxTokenLength);
        } catch (err) {
          // If parsing fails, it's not a valid JWT - just truncate if it's long
          if (value.length > maxTokenLength) {
            sanitized[key] = value.substring(0, maxTokenLength) + '...';
          }
        }
      }
    }
  }
  
  return sanitized;
}
