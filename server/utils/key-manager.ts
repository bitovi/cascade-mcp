/**
 * Google RSA Key Manager
 * 
 * Manages RSA key pair for encrypting/decrypting Google service account credentials.
 * Keys are stored in the filesystem and loaded lazily on first use.
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { resolve } from 'path';
import { getProjectRoot } from './file-paths.js';
import type { RSAKeyPair } from './crypto.js';
import { generateRSAKeyPair, encryptWithPublicKey, decryptWithPrivateKey } from './crypto.js';
import type { GoogleServiceAccountCredentials } from '../providers/google/types.js';

/**
 * Key Manager for Google Service Account Encryption
 * 
 * Handles:
 * - Lazy loading/generation of RSA key pairs
 * - Filesystem storage of keys
 * - Encryption/decryption of service account credentials
 */
export class GoogleKeyManager {
  private keyDir: string;
  private keyPair: RSAKeyPair | null = null;

  constructor(keyDir: string) {
    // Convert relative paths to absolute (relative to project root)
    if (!keyDir.startsWith('/')) {
      const projectRoot = getProjectRoot();
      this.keyDir = resolve(projectRoot, keyDir);
    } else {
      this.keyDir = keyDir;
    }
  }

  /**
   * Get public key path
   */
  private getPublicKeyPath(): string {
    return resolve(this.keyDir, 'public.pem');
  }

  /**
   * Get private key path
   */
  private getPrivateKeyPath(): string {
    return resolve(this.keyDir, 'private.pem');
  }

  /**
   * Check if keys exist on filesystem
   */
  private async keysExist(): Promise<boolean> {
    try {
      await access(this.getPublicKeyPath(), fsConstants.R_OK);
      await access(this.getPrivateKeyPath(), fsConstants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load keys from filesystem
   */
  private async loadKeysFromDisk(): Promise<RSAKeyPair> {
console.log(`Loading RSA keys from ${this.keyDir}...`);

    const publicKey = await readFile(this.getPublicKeyPath(), 'utf8');
    const privateKey = await readFile(this.getPrivateKeyPath(), 'utf8');

    console.log('  Keys loaded successfully');

    return { publicKey, privateKey };
  }

  /**
   * Save keys to filesystem
   */
  private async saveKeysToDisk(keyPair: RSAKeyPair): Promise<void> {
console.log(`Saving RSA keys to ${this.keyDir}...`);

    // Create directory if it doesn't exist
    await mkdir(this.keyDir, { recursive: true });

    // Write keys to disk
    await writeFile(this.getPublicKeyPath(), keyPair.publicKey, { mode: 0o644 });
    await writeFile(this.getPrivateKeyPath(), keyPair.privateKey, { mode: 0o600 }); // Restricted permissions

    console.log('  Keys saved successfully');
    console.log(`  Public key:  ${this.getPublicKeyPath()}`);
    console.log(`  Private key: ${this.getPrivateKeyPath()} (permissions: 0600)`);
  }

  /**
   * Get or generate RSA key pair (lazy loading)
   * 
   * On first call:
   * - Check if keys exist on disk → load them
   * - If not, generate new keys → save to disk
   * - Cache in memory for subsequent calls
   * 
   * @returns RSA key pair (public/private keys in PEM format)
   */
  async getKeys(): Promise<RSAKeyPair> {
    // Return cached keys if available
    if (this.keyPair) {
      return this.keyPair;
    }

    // Try to load existing keys
    if (await this.keysExist()) {
      this.keyPair = await this.loadKeysFromDisk();
      return this.keyPair;
    }

    // Generate new keys
    console.log('No existing RSA keys found. Generating new key pair...');
    this.keyPair = await generateRSAKeyPair();
    await this.saveKeysToDisk(this.keyPair);

    return this.keyPair;
  }

  /**
   * Get public key only (for encryption operations)
   * 
   * @returns RSA public key in PEM format
   */
  async getPublicKey(): Promise<string> {
    const keys = await this.getKeys();
    return keys.publicKey;
  }

  /**
   * Encrypt Google service account credentials
   * 
   * @param serviceAccountJson - Plaintext service account credentials
   * @returns Encrypted string with format "RSA-ENCRYPTED:<base64>"
   * 
   * @example
   * ```typescript
   * const encrypted = await googleKeyManager.encrypt(serviceAccount);
   * // Store encrypted string in config/env
   * ```
   */
  async encrypt(serviceAccountJson: GoogleServiceAccountCredentials): Promise<string> {
    console.log('Encrypting Google service account credentials...');
    console.log(`  Service Account: ${serviceAccountJson.client_email}`);
    console.log(`  Project ID: ${serviceAccountJson.project_id}`);

    const publicKey = await this.getPublicKey();
    const plaintext = JSON.stringify(serviceAccountJson);
    const encrypted = await encryptWithPublicKey(plaintext, publicKey);

    console.log('  Encryption successful');

    return encrypted;
  }

  /**
   * Decrypt encrypted Google service account credentials
   * 
   * @param encryptedData - Encrypted string in format "RSA-ENCRYPTED:<base64>"
   * @returns Decrypted service account credentials
   * 
   * @throws {Error} If decryption fails or data is invalid
   * 
   * @example
   * ```typescript
   * const decrypted = await googleKeyManager.decrypt(encryptedString);
   * // Use decrypted credentials to create Google client
   * ```
   */
  async decrypt(encryptedData: string): Promise<GoogleServiceAccountCredentials> {
    console.log('Decrypting Google service account credentials...');

    const keys = await this.getKeys();
    const decrypted = await decryptWithPrivateKey(encryptedData, keys.privateKey);

    // Parse and validate JSON
    let serviceAccount: GoogleServiceAccountCredentials;
    try {
      serviceAccount = JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Decrypted data is not valid JSON');
    }

    // Validate it's a service account
    if (serviceAccount.type !== 'service_account') {
      throw new Error('Decrypted data is not a Google service account JSON');
    }

    console.log('  Decryption successful');
    console.log(`  Service Account: ${serviceAccount.client_email}`);
    console.log(`  Project ID: ${serviceAccount.project_id}`);

    return serviceAccount;
  }
}

/**
 * Singleton instance for Google key management
 * Keys stored in: cache/keys/google-rsa/
 */
export const googleKeyManager = new GoogleKeyManager('cache/keys/google-rsa');
