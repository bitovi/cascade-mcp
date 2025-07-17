import crypto from 'crypto';

/**
 * Generate a cryptographically secure code verifier for PKCE
 * @returns {string} Base64URL-encoded code verifier
 */
export function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a code challenge from a code verifier using SHA256
 * @param {string} codeVerifier - The code verifier to hash
 * @returns {string} Base64URL-encoded code challenge
 */
export function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return Buffer.from(hash).toString('base64url');
}
