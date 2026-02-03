/**
 * Google RSA Key Manager
 *
 * Manages RSA key pair for encrypting/decrypting Google service account credentials.
 * Keys are loaded from environment variables (base64-encoded PEM format).
 */

import { createPublicKey, createPrivateKey } from 'crypto';
import { encryptWithPublicKey, decryptWithPrivateKey } from './crypto.js';
import type { GoogleServiceAccountCredentials } from '../providers/google/types.js';

/**
 * Encryption feature state
 */
export type EncryptionState =
  | EncryptionDisabledState
  | EncryptionEnabledState;

/**
 * Encryption disabled - keys not configured or invalid
 */
export interface EncryptionDisabledState {
  enabled: false;
  reason: 'keys-not-configured' | 'invalid-key-format';
  message: string;
  error?: string; // Present when reason is 'invalid-key-format'
}

/**
 * Encryption enabled - keys loaded and validated
 */
export interface EncryptionEnabledState {
  enabled: true;
  publicKeyLoaded: boolean;
  privateKeyLoaded: boolean;
}

/**
 * Thrown when encryption operation is attempted but keys are not configured
 */
export class EncryptionNotEnabledError extends Error {
  readonly code = 'ENCRYPTION_NOT_ENABLED';
  readonly operation: string;

  constructor(operation: string) {
    super(
      `Google encryption not enabled. Cannot perform ${operation}.\n` +
      'Configure encryption keys in environment variables (GOOGLE_RSA_PUBLIC_KEY, GOOGLE_RSA_PRIVATE_KEY).\n' +
      'See docs/google-service-account-encryption.md for setup instructions.'
    );
    this.name = 'EncryptionNotEnabledError';
    this.operation = operation;
  }
}

/**
 * Thrown when key format validation fails during initialization
 */
export class InvalidKeyFormatError extends Error {
  readonly code = 'INVALID_KEY_FORMAT';
  readonly keyType: 'public' | 'private';

  constructor(keyType: 'public' | 'private', details: string) {
    super(
      `Invalid ${keyType} key format: ${details}\n` +
      `Ensure GOOGLE_RSA_${keyType.toUpperCase()}_KEY environment variable contains valid base64-encoded PEM format.\n` +
      'Run scripts/generate-rsa-keys.sh to generate new keys.'
    );
    this.name = 'InvalidKeyFormatError';
    this.keyType = keyType;
  }
}

/**
 * Check if both encryption keys are configured in environment
 */
function areKeysConfigured(): boolean {
  return !!(
    process.env.GOOGLE_RSA_PUBLIC_KEY &&
    process.env.GOOGLE_RSA_PRIVATE_KEY
  );
}

/**
 * Load and decode base64-encoded PEM key from environment variable
 *
 * @param envVarName - Environment variable name
 * @param keyType - 'public' or 'private' for error messages
 * @returns Decoded PEM string
 * @throws {InvalidKeyFormatError} if variable missing or invalid base64
 */
function loadKeyFromEnv(envVarName: string, keyType: 'public' | 'private'): string {
  const base64Value = process.env[envVarName];
  
  if (!base64Value) {
    throw new InvalidKeyFormatError(keyType, 'Environment variable not set');
  }

  try {
    // Decode base64 to PEM format
    const pemKey = Buffer.from(base64Value, 'base64').toString('utf8');
    return pemKey;
  } catch (error) {
    throw new InvalidKeyFormatError(
      keyType,
      `Invalid base64 encoding: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Validate PEM key format using Node.js crypto module
 *
 * @param pemKey - PEM-formatted key string
 * @param keyType - 'public' or 'private'
 * @throws {InvalidKeyFormatError} if PEM format is invalid
 */
function validatePemKey(pemKey: string, keyType: 'public' | 'private'): void {
  try {
    if (keyType === 'public') {
      createPublicKey(pemKey);
    } else {
      createPrivateKey(pemKey);
    }
  } catch (error) {
    throw new InvalidKeyFormatError(
      keyType,
      `Invalid PEM format: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Key Manager for Google Service Account Encryption
 *
 * Handles:
 * - Loading pre-generated RSA keys from environment variables
 * - Graceful degradation when keys are not configured
 * - Encryption/decryption of service account credentials
 */
export class GoogleKeyManager {
  private state: EncryptionState = {
    enabled: false,
    reason: 'keys-not-configured',
    message: 'Encryption keys not configured',
  };
  private publicKey: string | null = null;
  private privateKey: string | null = null;

  /**
   * Initialize key manager by loading keys from environment
   * Called once during server startup
   *
   * @throws {InvalidKeyFormatError} if keys are malformed or invalid
   */
  async initialize(): Promise<void> {
    console.log('Initializing Google encryption key manager...');

    // Check if keys are configured
    if (!areKeysConfigured()) {
      this.state = {
        enabled: false,
        reason: 'keys-not-configured',
        message: 'Environment variables GOOGLE_RSA_PUBLIC_KEY and GOOGLE_RSA_PRIVATE_KEY are not set',
      };
      console.log('  Google encryption keys not configured (graceful degradation)');
      return;
    }

    try {
      // Load and validate public key
      console.log('  Loading public key from environment...');
      const publicKeyPem = loadKeyFromEnv('GOOGLE_RSA_PUBLIC_KEY', 'public');
      validatePemKey(publicKeyPem, 'public');
      this.publicKey = publicKeyPem;

      // Load and validate private key
      console.log('  Loading private key from environment...');
      const privateKeyPem = loadKeyFromEnv('GOOGLE_RSA_PRIVATE_KEY', 'private');
      validatePemKey(privateKeyPem, 'private');
      this.privateKey = privateKeyPem;

      // Set enabled state
      this.state = {
        enabled: true,
        publicKeyLoaded: true,
        privateKeyLoaded: true,
      };

      console.log('  Google encryption keys loaded and validated successfully');
    } catch (error) {
      // Handle validation errors
      if (error instanceof InvalidKeyFormatError) {
        this.state = {
          enabled: false,
          reason: 'invalid-key-format',
          message: error.message,
          error: error.message,
        };
        throw error; // Re-throw to stop server startup
      }
      throw error;
    }
  }

  /**
   * Check if Google encryption is enabled and ready to use
   *
   * @returns true if keys are loaded and valid, false otherwise
   */
  isEnabled(): boolean {
    return this.state.enabled;
  }

  /**
   * Get current encryption state (for logging and debugging)
   *
   * @returns Current state with reason if disabled
   */
  getState(): EncryptionState {
    return this.state;
  }

  /**
   * Encrypt Google service account credentials
   *
   * @param serviceAccountJson - Plaintext service account credentials
   * @returns Encrypted string with format "RSA-ENCRYPTED:<base64>"
   *
   * @throws {EncryptionNotEnabledError} if encryption not enabled
   * @throws {Error} if encryption operation fails
   *
   * @example
   * ```typescript
   * const encrypted = await googleKeyManager.encrypt(serviceAccount);
   * // Store encrypted string in config/env
   * ```
   */
  async encrypt(serviceAccountJson: GoogleServiceAccountCredentials): Promise<string> {
    if (!this.isEnabled()) {
      throw new EncryptionNotEnabledError('encrypt');
    }

    console.log('Encrypting Google service account credentials...');
    console.log(`  Service Account: ${serviceAccountJson.client_email}`);
    console.log(`  Project ID: ${serviceAccountJson.project_id}`);

    const plaintext = JSON.stringify(serviceAccountJson);
    const encrypted = await encryptWithPublicKey(plaintext, this.publicKey!);

    console.log('  Encryption successful');

    return encrypted;
  }

  /**
   * Decrypt encrypted Google service account credentials
   *
   * @param encryptedData - Encrypted string in format "RSA-ENCRYPTED:<base64>"
   * @returns Decrypted service account credentials
   *
   * @throws {EncryptionNotEnabledError} if encryption not enabled
   * @throws {Error} if decryption operation fails or data is invalid
   *
   * @example
   * ```typescript
   * const decrypted = await googleKeyManager.decrypt(encryptedString);
   * // Use decrypted credentials to create Google client
   * ```
   */
  async decrypt(encryptedData: string): Promise<GoogleServiceAccountCredentials> {
    if (!this.isEnabled()) {
      throw new EncryptionNotEnabledError('decrypt');
    }

    console.log('Decrypting Google service account credentials...');

    const decrypted = await decryptWithPrivateKey(encryptedData, this.privateKey!);

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
 * Keys loaded from environment variables (GOOGLE_RSA_PUBLIC_KEY, GOOGLE_RSA_PRIVATE_KEY)
 */
export const googleKeyManager = new GoogleKeyManager();
