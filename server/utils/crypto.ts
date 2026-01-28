/**
 * RSA Encryption Utilities
 *
 * Provides RSA-4096 asymmetric encryption for Google service account credentials.
 * Uses Node.js built-in crypto module (no external dependencies).
 */

import { generateKeyPair, publicEncrypt, privateDecrypt, constants } from 'crypto';
import { promisify } from 'util';

const generateKeyPairAsync = promisify(generateKeyPair);

/**
 * RSA key pair in PEM format
 */
export interface RSAKeyPair {
  publicKey: string; // PEM format (-----BEGIN PUBLIC KEY-----)
  privateKey: string; // PEM format (-----BEGIN PRIVATE KEY-----)
}

/**
 * Generate a new RSA-4096 key pair
 *
 * @returns Promise resolving to public/private key pair in PEM format
 *
 * @example
 * ```typescript
 * const keyPair = await generateRSAKeyPair();
 * console.log(keyPair.publicKey);  // -----BEGIN PUBLIC KEY-----\n...
 * console.log(keyPair.privateKey); // -----BEGIN PRIVATE KEY-----\n...
 * ```
 */
export async function generateRSAKeyPair(): Promise<RSAKeyPair> {
  console.log('Generating RSA-4096 key pair...');

  const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
    modulusLength: 4096, // Strong encryption (industry standard)
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  console.log('  Key generation complete');
  console.log(`  Public key: ${publicKey.split('\n')[0]}...`);
  console.log(`  Private key: ${privateKey.split('\n')[0]}...`);

  return {
    publicKey,
    privateKey,
  };
}

/**
 * Encrypt data using RSA public key
 *
 * For large data (>470 bytes), implements chunking to work around RSA size limits.
 *
 * @param data - Plaintext string to encrypt
 * @param publicKey - RSA public key in PEM format
 * @returns Encrypted string with format: "RSA-ENCRYPTED:<base64>"
 *
 * @example
 * ```typescript
 * const encrypted = await encryptWithPublicKey(
 *   JSON.stringify(serviceAccountJson),
 *   publicKey
 * );
 * // Returns: "RSA-ENCRYPTED:eyJhbGciOiJSU0EtT0FFUCIsInZlcnNpb24iOiIxIn0=..."
 * ```
 */
export async function encryptWithPublicKey(data: string, publicKey: string): Promise<string> {
  console.log(`Encrypting data (${data.length} bytes)...`);

  // RSA-4096 with OAEP padding can encrypt ~470 bytes max
  // For service account JSON (~2-3KB), we need chunking
  const CHUNK_SIZE = 400; // Conservative size to ensure it fits
  const chunks: Buffer[] = [];
  const dataBuffer = Buffer.from(data, 'utf8');

  // Split data into chunks and encrypt each one
  for (let i = 0; i < dataBuffer.length; i += CHUNK_SIZE) {
    const chunk = dataBuffer.subarray(i, i + CHUNK_SIZE);

    const encryptedChunk = publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      chunk,
    );

    chunks.push(encryptedChunk);
  }

  console.log(`  Encrypted ${chunks.length} chunk(s)`);

  // Concatenate all encrypted chunks
  const allChunks = Buffer.concat(chunks);

  // Encode as base64 with prefix
  const base64 = allChunks.toString('base64');
  const result = `RSA-ENCRYPTED:${base64}`;

  console.log(`  Final size: ${result.length} characters`);

  return result;
}

/**
 * Decrypt data using RSA private key
 *
 * Handles chunked encryption (reverses the chunking done during encryption).
 *
 * @param encryptedData - Encrypted string in format "RSA-ENCRYPTED:<base64>"
 * @param privateKey - RSA private key in PEM format
 * @returns Decrypted plaintext string
 *
 * @throws {Error} If format is invalid or decryption fails
 *
 * @example
 * ```typescript
 * const decrypted = await decryptWithPrivateKey(
 *   "RSA-ENCRYPTED:eyJhbGci...",
 *   privateKey
 * );
 * const serviceAccount = JSON.parse(decrypted);
 * ```
 */
export async function decryptWithPrivateKey(encryptedData: string, privateKey: string): Promise<string> {
  console.log('Decrypting data...');

  // Validate format
  if (!encryptedData.startsWith('RSA-ENCRYPTED:')) {
    throw new Error('Invalid encrypted data format. Expected "RSA-ENCRYPTED:<base64>" prefix.');
  }

  // Remove prefix and decode base64
  const base64 = encryptedData.substring('RSA-ENCRYPTED:'.length);
  const encryptedBuffer = Buffer.from(base64, 'base64');

  // RSA-4096 produces 512-byte encrypted chunks (4096 bits / 8)
  const ENCRYPTED_CHUNK_SIZE = 512;
  const chunks: Buffer[] = [];

  // Split encrypted data into chunks and decrypt each one
  for (let i = 0; i < encryptedBuffer.length; i += ENCRYPTED_CHUNK_SIZE) {
    const encryptedChunk = encryptedBuffer.subarray(i, i + ENCRYPTED_CHUNK_SIZE);

    const decryptedChunk = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      encryptedChunk,
    );

    chunks.push(decryptedChunk);
  }

  console.log(`  Decrypted ${chunks.length} chunk(s)`);

  // Concatenate all decrypted chunks
  const allChunks = Buffer.concat(chunks);
  const result = allChunks.toString('utf8');

  console.log(`  Decrypted size: ${result.length} bytes`);

  return result;
}
