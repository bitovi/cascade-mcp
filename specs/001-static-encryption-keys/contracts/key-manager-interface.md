# Google Encryption Key Management Contracts

**Feature**: [spec.md](../spec.md) | **Phase**: 1 - Design & Contracts

## TypeScript Interfaces

### Environment Configuration

```typescript
/**
 * Environment variables for Google encryption keys
 */
export interface GoogleEncryptionEnvConfig {
  /**
   * Base64-encoded RSA public key in PEM format
   * Used for encrypting service account credentials
   */
  GOOGLE_RSA_PUBLIC_KEY?: string;

  /**
   * Base64-encoded RSA private key in PEM format
   * Used for decrypting service account credentials
   * MUST remain server-side only, never exposed to client
   */
  GOOGLE_RSA_PRIVATE_KEY?: string;
}
```

### Key Manager Interface

```typescript
/**
 * Simplified key manager for Google service account encryption
 * Loads pre-generated keys from environment variables
 */
export interface IGoogleKeyManager {
  /**
   * Initialize key manager by loading keys from environment
   * Called once during server startup
   *
   * @throws {InvalidKeyFormatError} if keys are malformed or invalid
   */
  initialize(): Promise<void>;

  /**
   * Check if Google encryption is enabled and ready to use
   *
   * @returns true if keys are loaded and valid, false otherwise
   */
  isEnabled(): boolean;

  /**
   * Get current encryption state (for logging and debugging)
   *
   * @returns Current state with reason if disabled
   */
  getState(): EncryptionState;

  /**
   * Encrypt Google service account JSON credentials
   *
   * @param serviceAccount - Service account credentials to encrypt
   * @returns Encrypted string with format "RSA-ENCRYPTED:<base64>"
   *
   * @throws {EncryptionNotEnabledError} if encryption not enabled
   * @throws {Error} if encryption operation fails
   */
  encrypt(serviceAccount: GoogleServiceAccountCredentials): Promise<string>;

  /**
   * Decrypt encrypted Google service account credentials
   *
   * @param encryptedData - Encrypted string in format "RSA-ENCRYPTED:<base64>"
   * @returns Decrypted service account credentials
   *
   * @throws {EncryptionNotEnabledError} if encryption not enabled
   * @throws {Error} if decryption operation fails or data is invalid
   */
  decrypt(encryptedData: string): Promise<GoogleServiceAccountCredentials>;
}
```

### State Types

```typescript
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
```

### Error Types

```typescript
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
```

### Key Loading Functions

```typescript
/**
 * Load and decode RSA key from base64-encoded environment variable
 *
 * @param envVarName - Name of environment variable to load
 * @returns Decoded PEM string
 *
 * @throws {InvalidKeyFormatError} if variable is missing, invalid base64, or not valid PEM
 */
export function loadKeyFromEnv(envVarName: string): string;

/**
 * Validate PEM key format using Node.js crypto module
 *
 * @param keyPem - PEM string to validate
 * @param keyType - Type of key ('public' or 'private') for error messages
 *
 * @throws {InvalidKeyFormatError} if PEM is invalid or cannot be parsed
 */
export function validatePemKey(keyPem: string, keyType: 'public' | 'private'): void;

/**
 * Check if both encryption keys are configured in environment
 *
 * @returns true if both GOOGLE_RSA_PUBLIC_KEY and GOOGLE_RSA_PRIVATE_KEY are set
 */
export function areKeysConfigured(): boolean;
```

## Usage Examples

### Server Initialization

```typescript
import { googleKeyManager } from './server/utils/key-manager.js';

async function startServer() {
  // Initialize encryption keys from environment
  try {
    await googleKeyManager.initialize();
    
    if (googleKeyManager.isEnabled()) {
      console.log('✅ Google encryption enabled');
    } else {
      const state = googleKeyManager.getState();
      console.log(`ℹ️  Google encryption disabled: ${state.message}`);
      console.log('   Google Drive/Docs features will be unavailable');
    }
  } catch (error) {
    if (error instanceof InvalidKeyFormatError) {
      console.error('❌ Failed to initialize Google encryption:', error.message);
      process.exit(1); // Invalid configuration should abort startup
    }
    throw error;
  }
  
  // Continue server setup...
}
```

### Encryption Operation

```typescript
import { googleKeyManager, EncryptionNotEnabledError } from './server/utils/key-manager.js';

export async function encryptServiceAccount(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Check if encryption is enabled
    if (!googleKeyManager.isEnabled()) {
      res.status(503).json({
        error: 'Google encryption not configured',
        message: 'See docs/google-service-account-encryption.md for setup instructions'
      });
      return;
    }

    const serviceAccount = req.body; // Assume validated
    const encrypted = await googleKeyManager.encrypt(serviceAccount);

    res.json({
      encrypted,
      clientEmail: serviceAccount.client_email,
      projectId: serviceAccount.project_id
    });
  } catch (error) {
    if (error instanceof EncryptionNotEnabledError) {
      res.status(503).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Encryption failed' });
    }
  }
}
```

### Decryption Operation

```typescript
import { googleKeyManager, EncryptionNotEnabledError } from './server/utils/key-manager.js';

export async function decryptServiceAccount(
  encryptedData: string
): Promise<GoogleServiceAccountCredentials> {
  if (!googleKeyManager.isEnabled()) {
    throw new EncryptionNotEnabledError('decryption');
  }

  return await googleKeyManager.decrypt(encryptedData);
}
```

### Testing with Mocks

```typescript
import { IGoogleKeyManager, EncryptionEnabledState } from './contracts/key-manager.js';

/**
 * Mock key manager for testing
 */
export class MockGoogleKeyManager implements IGoogleKeyManager {
  private state: EncryptionState;

  constructor(enabled: boolean = true) {
    this.state = enabled
      ? { enabled: true, publicKeyLoaded: true, privateKeyLoaded: true }
      : { enabled: false, reason: 'keys-not-configured', message: 'Mock disabled' };
  }

  async initialize(): Promise<void> {
    // No-op for mock
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  getState(): EncryptionState {
    return this.state;
  }

  async encrypt(serviceAccount: GoogleServiceAccountCredentials): Promise<string> {
    if (!this.isEnabled()) {
      throw new EncryptionNotEnabledError('encryption');
    }
    // Return mock encrypted value
    return `RSA-ENCRYPTED:${Buffer.from(JSON.stringify(serviceAccount)).toString('base64')}`;
  }

  async decrypt(encryptedData: string): Promise<GoogleServiceAccountCredentials> {
    if (!this.isEnabled()) {
      throw new EncryptionNotEnabledError('decryption');
    }
    // Return mock decrypted value
    const base64 = encryptedData.replace('RSA-ENCRYPTED:', '');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  }

  // Test helpers
  setEnabled(enabled: boolean): void {
    this.state = enabled
      ? { enabled: true, publicKeyLoaded: true, privateKeyLoaded: true }
      : { enabled: false, reason: 'keys-not-configured', message: 'Disabled by test' };
  }
}
```

## Contract Validation

### Type Safety

- All public methods have explicit return types
- Error types are specific and documented
- State transitions are type-safe (discriminated unions)

### Error Handling

- Clear error types for different failure modes
- Helpful error messages with actionable guidance
- Distinction between configuration errors (startup) and runtime errors

### Testing Guarantees

- Mock implementation for testing without real keys
- All error paths testable via mock configuration
- State transitions observable via `getState()`

## Breaking Changes

None - this is an internal refactoring. Public API remains:

- `googleKeyManager.encrypt()` - Same signature
- `googleKeyManager.decrypt()` - Same signature
- `RSA-ENCRYPTED:` format - Unchanged

New additions:

- `googleKeyManager.initialize()` - Must be called during server startup
- `googleKeyManager.isEnabled()` - New method for feature checks
- `googleKeyManager.getState()` - New method for debugging
