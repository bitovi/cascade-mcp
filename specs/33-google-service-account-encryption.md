# Spec: Google Service Account Encryption

> ⚠️ **DEPRECATED**: This spec describes the original auto-generation approach. The feature has been refactored to use static pre-generated keys from environment variables. See [specs/001-static-encryption-keys/](./001-static-encryption-keys/) for the current implementation.

**Feature**: Encrypt Google service account JSON credentials using RSA asymmetric encryption  
**Ticket**: [FE-720](https://bitovi.atlassian.net/browse/FE-720)  
**Date**: January 2026

## Problem Statement

Currently, users must store and transmit Google service account JSON files (containing private keys) in plaintext. This creates security risks:

1. Service account private keys are exposed in configuration files
2. Users may accidentally commit these credentials to version control
3. No secure way to share service account credentials between team members
4. Credentials stored in environment variables or config files are plaintext

## Proposed Solution

Implement RSA asymmetric encryption for Google service account credentials:

1. **Key Generation**: Generate an RSA key pair (public/private) and store locally
2. **Encryption Interface**: Provide a web page (`/google-service-encrypt`) where users paste their service account JSON and receive encrypted output
3. **Client Usage**: Users can use encrypted credentials as environment variable (`GOOGLE_SERVICE_ACCOUNT_ENCRYPTED`) or in request headers
4. **Security**: Private key remains server-side only; public key can be published for client-side encryption tools in the future

## Technical Design

### Architecture

```
User Flow:
1. User visits /google-service-encrypt
2. Pastes service account JSON (plaintext)
3. Server encrypts with public key
4. User receives encrypted string (can be stored safely)
5. User provides encrypted string via env var or header
6. Server decrypts with private key → uses credentials
```

### RSA Key Management

**Key Generation**:

- Algorithm: RSA-OAEP (RSA with Optimal Asymmetric Encryption Padding)
- Key size: 4096 bits (industry standard for long-term security)
- Format: PEM (Privacy Enhanced Mail)
- Storage: Local filesystem at `cache/keys/google-rsa/`

**Key Files**:

```text
cache/keys/google-rsa/
├── private.pem  # Server-side only, never expose
└── public.pem   # Can be published for client-side encryption
```

**Key Lifecycle**:

- Keys generated on first use (lazy initialization)
- Persistent across server restarts
- Manual rotation supported (delete files, restart server)
- No key expiration (RSA keys are long-lived)

### Encryption Format

**Input**: Service account JSON (plaintext)

```json
{
  "type": "service_account",
  "project_id": "my-project",
  "private_key_id": "abc123",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "service@project.iam.gserviceaccount.com",
  ...
}
```

**Output**: Base64-encoded encrypted string

```text
RSA-ENCRYPTED:eyJhbGciOiJSU0EtT0FFUCIsInZlcnNpb24iOiIxIn0=...
```

**Format Details**:

- Prefix: `RSA-ENCRYPTED:` (identifies encryption type)
- Encoding: Base64 (URL-safe, no padding)
- Padding: RSA-OAEP with SHA-256
- Max size: 4096-bit key can encrypt ~470 bytes (service account JSON is ~2-3KB, requires chunking)

**Chunking Strategy** (for large JSON):

- Split plaintext into chunks (400 bytes each)
- Encrypt each chunk with RSA (produces 512-byte chunks)
- Concatenate encrypted chunks
- Encode final result as Base64
- Prepend format identifier: `RSA-ENCRYPTED:`

### Implementation Components

#### 1. Crypto Utility (`server/utils/crypto.ts`)

Core RSA key generation and encryption/decryption functions:

```typescript
export interface RSAKeyPair {
  publicKey: string; // PEM format
  privateKey: string; // PEM format
}

// Generate RSA-4096 key pair
export async function generateRSAKeyPair(): Promise<RSAKeyPair>;

// Encrypt data with public key
export async function encryptWithPublicKey(data: string, publicKey: string): Promise<string>; // Returns: "RSA-ENCRYPTED:<base64>"

// Decrypt data with private key
export async function decryptWithPrivateKey(
  encryptedData: string, // Format: "RSA-ENCRYPTED:<base64>"
  privateKey: string,
): Promise<string>;
```

**Implementation Notes**:

- Use Node.js `crypto` module (built-in, no dependencies)
- `crypto.generateKeyPair('rsa', { modulusLength: 4096, ... })`
- `crypto.publicEncrypt()` and `crypto.privateDecrypt()`
- Implement chunking for large data (service account JSON is ~2-3KB)

#### 2. Key Management (`server/utils/key-manager.ts`)

Manages RSA keys lifecycle:

```typescript
export class GoogleKeyManager {
  private keyDir: string;
  private keyPair: RSAKeyPair | null;

  constructor(keyDir: string);

  // Get or generate keys (lazy loading)
  async getKeys(): Promise<RSAKeyPair>;

  // Get public key for encryption
  async getPublicKey(): Promise<string>;

  // Encrypt service account JSON
  async encrypt(serviceAccountJson: object): Promise<string>;

  // Decrypt encrypted string
  async decrypt(encryptedData: string): Promise<object>;
}

// Singleton instance
export const googleKeyManager = new GoogleKeyManager('cache/keys/google-rsa');
```

#### 3. Encryption Web Page (`/google-service-encrypt`)

**Route**: `app.get('/google-service-encrypt', renderEncryptionPage)`

**Features**:

- HTML form for pasting service account JSON
- Validates JSON format and service account type
- Returns encrypted string with copy-to-clipboard
- Shows usage examples (env var and header)

**POST Handler**:

```typescript
app.post('/google-service-encrypt', async (req, res) => {
  try {
    const { serviceAccountJson } = req.body;
    const parsed = JSON.parse(serviceAccountJson);

    // Validate it's a service account
    if (parsed.type !== 'service_account') {
      throw new Error('Invalid service account JSON');
    }

    // Encrypt
    const encrypted = await googleKeyManager.encrypt(parsed);

    // Return HTML with result
    res.send(renderEncryptionResultPage(encrypted));
  } catch (error) {
    res.status(400).send(renderEncryptionErrorPage(error.message));
  }
});
```

### Credential Loading Pattern

**Environment Variable Fallback**:

```typescript
// Load from env var if header not provided
const encryptedCredentials =
  req.headers['x-google-service-account-encrypted'] || process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED;

if (encryptedCredentials) {
  const decrypted = await googleKeyManager.decrypt(encryptedCredentials);
  // Use decrypted credentials
}
```

**Priority Order**:

1. Request header: `x-google-service-account-encrypted`
2. Environment variable: `GOOGLE_SERVICE_ACCOUNT_ENCRYPTED`
3. Fall back to legacy `google.json` file if neither present

### File Structure

```text
cascade-mcp/
├── server/
│   ├── utils/
│   │   ├── crypto.ts                # NEW: RSA encryption utilities
│   │   └── key-manager.ts           # NEW: Key management class
│   ├── google-service-encrypt.ts    # NEW: Encryption web page handlers
│   └── server.ts                    # MODIFIED: Add routes
├── cache/
│   └── keys/
│       └── google-rsa/              # NEW: RSA key storage (git-ignored)
│           ├── private.pem          # Generated on first use
│           └── public.pem           # Can be published
├── docs/
│   └── google-service-account-encryption.md  # NEW: User documentation
└── specs/
    └── 33-google-service-account-encryption.md  # This file
```

## Security Considerations

### Threat Model

**Protected Against**:
✅ Accidental credential exposure in config files  
✅ Credentials in version control  
✅ Sharing credentials via insecure channels  
✅ Plaintext storage in databases/logs

**Not Protected Against**:
❌ Attacker with filesystem access (can read private key)  
❌ Memory dumps (decrypted credentials in RAM)  
❌ Server compromise (attacker can decrypt all credentials)

### Best Practices

1. **Private Key Protection**:

   - Store in `cache/keys/` (git-ignored)
   - File permissions: `chmod 600 private.pem`
   - Never log or transmit private key
   - Consider encryption-at-rest for production

2. **Key Rotation**:

   - Delete `cache/keys/google-rsa/` directory
   - Restart server (generates new keys)
   - Re-encrypt all service account credentials
   - Distribute new encrypted credentials to users

3. **Production Deployment**:

   - Use environment variable: `GOOGLE_SERVICE_ACCOUNT_ENCRYPTED`
   - Or use secrets management (AWS Secrets Manager, HashiCorp Vault)
   - Restrict filesystem access to key directory
   - Monitor key access in logs

4. **Limitations**:
   - Encryption doesn't protect against server-side attacks
   - Not a substitute for proper secrets management
   - Use for "credentials in transit/storage" not "credentials at rest in production"

## Testing Strategy

### Unit Tests

```typescript
// test/crypto.test.ts
describe('RSA Encryption', () => {
  it('should generate valid RSA key pair', async () => {
    const keyPair = await generateRSAKeyPair();
    expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('should encrypt and decrypt service account JSON', async () => {
    const keyPair = await generateRSAKeyPair();
    const original = { type: 'service_account', client_email: 'test@test.com' };

    const encrypted = await encryptWithPublicKey(JSON.stringify(original), keyPair.publicKey);
    expect(encrypted).toStartWith('RSA-ENCRYPTED:');

    const decrypted = await decryptWithPrivateKey(encrypted, keyPair.privateKey);
    expect(JSON.parse(decrypted)).toEqual(original);
  });
});
```

### Manual Testing

```bash
# 1. Start server
npm run start-local

# 2. Visit encryption page
open http://localhost:3000/google-service-encrypt

# 3. Paste service account JSON (from google.json)
# 4. Click "Encrypt Credentials"
# 5. Copy encrypted output

# 6. Test with environment variable
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED="RSA-ENCRYPTED:eyJh..." npm run start-local
# Server should start successfully and use encrypted credentials
```

## Open Questions

1. **Key Distribution**: How do we securely distribute the public key for client-side encryption tools?

   - Option A: Publish in documentation (least secure, but most convenient)
   - Option B: Provide API endpoint `/google-service-encrypt/public-key`
   - Option C: Include in npm package for local encryption

2. **Key Rotation**: How often should keys be rotated?

   - Recommendation: Yearly or on security incidents
   - Provide CLI tool or documentation for rotation process

3. **Alternative Encryption**: Should we support other encryption methods?
   - AES-256 with shared secret (faster, but requires secure key distribution)
   - KMS integration (AWS KMS, Google Cloud KMS)

## Success Criteria

- ✅ Users can encrypt service account JSON via web page
- ✅ Encrypted credentials work via environment variable or header
- ✅ Private key stored securely and never exposed
- ✅ No performance degradation (decryption overhead <100ms)
- ✅ Clear documentation and error messages
- ✅ Unit tests for crypto utilities pass

## Implementation Checklist

- [x] Create `server/utils/crypto.ts` with RSA utilities
- [x] Create `server/utils/key-manager.ts` with key management
- [x] Create `/google-service-encrypt` GET route with HTML form
- [x] Create `/google-service-encrypt` POST route for encryption
- [x] Update `server.ts` with routes and homepage link
- [x] Add `.gitignore` entry for `cache/keys/` (already covered by /cache/)
- [x] Set file permissions on private key in key-manager.ts
- [x] Update Footer.tsx with encryption link
- [x] Write user documentation (docs/google-service-account-encryption.md)
- [ ] Update contributing.md with RSA key setup
- [ ] Update .github/copilot-instructions.md with security guidelines
- [ ] Manual testing: encrypt → store → use
- [ ] Update .env.example with GOOGLE_SERVICE_ACCOUNT_ENCRYPTED
- [ ] Document deployment considerations

## References

- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
- [RSA-OAEP Encryption](https://en.wikipedia.org/wiki/Optimal_asymmetric_encryption_padding)
- [Google Service Account Documentation](https://cloud.google.com/iam/docs/service-accounts)
- [Best Practices for Managing Secrets](https://cloud.google.com/docs/authentication/best-practices-applications)
