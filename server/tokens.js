import { SignJWT, jwtVerify as joseVerify } from 'jose';
import { createSecretKey } from 'crypto';
import { webcrypto } from 'crypto';

// Polyfill crypto for jose library
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// Create a secret key for JWT signing
const key = createSecretKey(Buffer.from(process.env.JWT_SECRET || 'devsecret'));

/**
 * Sign a JWT token with the provided payload
 * @param {object} payload - The payload to include in the JWT
 * @returns {Promise<string>} The signed JWT token
 */
export async function jwtSign(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);
}

/**
 * Verify and decode a JWT token
 * @param {string} token - The JWT token to verify
 * @returns {Promise<object>} The decoded payload
 */
export async function jwtVerify(token) {
  const { payload } = await joseVerify(token, key);
  return payload;
}
