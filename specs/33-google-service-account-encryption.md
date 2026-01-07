# Spec: Google Service Account Encryption

**Feature**: Encrypt Google service account JSON credentials using RSA asymmetric encryption  
**Branch**: `service-account-auth` (to be renamed to `google-service-account-encryption`)  
**Date**: January 7, 2026

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
3. **Client Usage**: Users can use encrypted credentials just like a PAT (Personal Access Token) - simple string that gets decrypted server-side
4. **Security**: Private key remains server-side only; public key can be published for client-side encryption tools in the future

## Technical Design

### Architecture

```
User Flow:
1. User visits /google-service-encrypt
2. Pastes service account JSON (plaintext)
3. Server encrypts with public key
4. User receives encrypted string (can be stored safely)
5. User provides encrypted string to API (like a PAT)
6. Server decrypts with private key → creates Google client
```

### RSA Key Management

**Key Generation**:
- Algorithm: RSA-OAEP (RSA with Optimal Asymmetric Encryption Padding)
- Key size: 4096 bits (industry standard for long-term security)
- Format: PEM (Privacy Enhanced Mail)
- Storage: Local filesystem at `cache/keys/google-rsa/`

**Key Files**:
```
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
```
RSA-ENCRYPTED:eyJhbGciOiJSU0EtT0FFUCIsInZlcnNpb24iOiIxIn0=...
```

**Format Details**:
- Prefix: `RSA-ENCRYPTED:` (identifies encryption type)
- Encoding: Base64 (URL-safe, no padding)
- Padding: RSA-OAEP with SHA-256
- Max size: 4096-bit key can encrypt ~470 bytes (service account JSON is ~2-3KB, requires chunking)

**Chunking Strategy** (for large JSON):
- Split plaintext into chunks (470 bytes each)
- Encrypt each chunk with RSA
- Concatenate encrypted chunks
- Encode final result as Base64
- Prepend format identifier: `RSA-ENCRYPTED:`

### API Changes

#### New Type: `GoogleEncryptedServiceAccountCredentials`

```typescript
// server/providers/google/types.ts

/**
 * Encrypted Google Service Account credentials
 * 
 * RSA-encrypted service account JSON that can be safely stored and transmitted.
 * Server-side decryption required before use.
 */
export interface GoogleEncryptedServiceAccountCredentials {
  type: 'encrypted_service_account';
  encrypted_data: string; // Base64-encoded RSA-encrypted JSON
  encryption_version: '1'; // For future encryption algorithm changes
}
```

#### Updated Function Signature

```typescript
// server/providers/google/google-api-client.ts

/**
 * Create a Google API client using encrypted service account credentials
 * 
 * @param encryptedCredentials - RSA-encrypted service account JSON string
 * @returns API client with Drive operations
 */
export async function createGoogleClientWithServiceAccount(
  credentials: GoogleServiceAccountCredentials | string // NEW: Accept encrypted string
): Promise<GoogleClient>;
```

**Backward Compatibility**:
- If `credentials` is object → use existing flow (plaintext JSON)
- If `credentials` is string → decrypt first, then proceed
- String format check: starts with `RSA-ENCRYPTED:`

### Implementation Components

#### 1. Crypto Utility (`server/utils/crypto.ts`)

**New file** containing RSA key generation and encryption/decryption:

```typescript
export interface RSAKeyPair {
  publicKey: string;  // PEM format
  privateKey: string; // PEM format
}

// Generate RSA-4096 key pair
export async function generateRSAKeyPair(): Promise<RSAKeyPair>;

// Encrypt data with public key
export async function encryptWithPublicKey(
  data: string,
  publicKey: string
): Promise<string>; // Returns: "RSA-ENCRYPTED:<base64>"

// Decrypt data with private key
export async function decryptWithPrivateKey(
  encryptedData: string, // Format: "RSA-ENCRYPTED:<base64>"
  privateKey: string
): Promise<string>;

// Load or generate keys from filesystem
export async function loadOrGenerateKeys(
  keyDir: string
): Promise<RSAKeyPair>;
```

**Implementation Notes**:
- Use Node.js `crypto` module (built-in, no dependencies)
- `crypto.generateKeyPair('rsa', { modulusLength: 4096, ... })`
- `crypto.publicEncrypt()` and `crypto.privateDecrypt()`
- Implement chunking for large data (service account JSON is ~2-3KB)

#### 2. Key Management (`server/utils/key-manager.ts`)

**New file** for managing RSA keys:

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
  async encrypt(serviceAccountJson: GoogleServiceAccountCredentials): Promise<string>;

  // Decrypt encrypted string
  async decrypt(encryptedData: string): Promise<GoogleServiceAccountCredentials>;
}

// Singleton instance
export const googleKeyManager = new GoogleKeyManager('cache/keys/google-rsa');
```

#### 3. Encryption Web Page (`/google-service-encrypt`)

**Route**: `app.get('/google-service-encrypt', renderEncryptionPage)`

**HTML Interface**:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Encrypt Google Service Account</title>
  <style>/* Simple, clean styling */</style>
</head>
<body>
  <h1>🔐 Encrypt Google Service Account</h1>
  
  <p>Paste your Google service account JSON below. We'll encrypt it using RSA-4096 encryption.</p>
  <p>⚠️ <strong>Important</strong>: The encrypted output is safe to store in config files or environment variables.</p>
  
  <form method="POST" action="/google-service-encrypt">
    <textarea name="serviceAccountJson" rows="20" cols="80" placeholder="Paste your service account JSON here..."></textarea>
    <br>
    <button type="submit">🔒 Encrypt Credentials</button>
  </form>
  
  <div id="result" style="display: none;">
    <h2>✅ Encryption Successful</h2>
    <p>Copy the encrypted credentials below:</p>
    <textarea id="encrypted" readonly rows="5" cols="80"></textarea>
    <br>
    <button onclick="copyToClipboard()">📋 Copy to Clipboard</button>
    
    <h3>Usage</h3>
    <p>Use the encrypted string like a Personal Access Token:</p>
    <pre><code>// In your code
const client = await createGoogleClientWithServiceAccount(
  "RSA-ENCRYPTED:eyJhbGciOiJSU0EtT0FFUCIsInZlcnNpb24iOiIxIn0=..."
);

// Or in environment variable
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:eyJh...</code></pre>
  </div>
</body>
</html>
```

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

#### 4. Updated API Client (`server/providers/google/google-api-client.ts`)

**Modifications**:
```typescript
export async function createGoogleClientWithServiceAccount(
  credentials: GoogleServiceAccountCredentials | string
): Promise<GoogleClient> {
  // Handle encrypted credentials
  if (typeof credentials === 'string') {
    if (!credentials.startsWith('RSA-ENCRYPTED:')) {
      throw new Error('Invalid encrypted credentials format. Expected "RSA-ENCRYPTED:..." prefix.');
    }
    
    console.log('Decrypting service account credentials...');
    const decrypted = await googleKeyManager.decrypt(credentials);
    credentials = decrypted; // Now it's plaintext JSON
  }
  
  // Existing implementation (use plaintext credentials)
  const { google } = await import('googleapis');
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  
  // ... rest of existing code
}
```

### File Structure

```
cascade-mcp/
├── server/
│   ├── utils/
│   │   ├── crypto.ts           # NEW: RSA encryption utilities
│   │   └── key-manager.ts      # NEW: Key management class
│   ├── providers/google/
│   │   ├── google-api-client.ts # MODIFIED: Accept encrypted credentials
│   │   └── types.ts            # MODIFIED: Add encrypted type
│   └── server.ts               # MODIFIED: Add /google-service-encrypt routes
├── cache/
│   └── keys/
│       └── google-rsa/         # NEW: RSA key storage (git-ignored)
│           ├── private.pem     # Generated on first use
│           └── public.pem      # Can be published
└── specs/
    └── 33-google-service-account-encryption.md # This file
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
   - Use environment variable for private key: `GOOGLE_RSA_PRIVATE_KEY`
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
    const original = { type: 'service_account', client_email: 'test@test.com', ... };
    
    const encrypted = await encryptWithPublicKey(JSON.stringify(original), keyPair.publicKey);
    expect(encrypted).toStartWith('RSA-ENCRYPTED:');
    
    const decrypted = await decryptWithPrivateKey(encrypted, keyPair.privateKey);
    expect(JSON.parse(decrypted)).toEqual(original);
  });

  it('should handle large service account JSON (chunking)', async () => {
    const keyPair = await generateRSAKeyPair();
    const largeJson = { /* 2-3KB of data */ };
    
    const encrypted = await encryptWithPublicKey(JSON.stringify(largeJson), keyPair.publicKey);
    const decrypted = await decryptWithPrivateKey(encrypted, keyPair.privateKey);
    
    expect(JSON.parse(decrypted)).toEqual(largeJson);
  });
});
```

### Integration Tests

```typescript
// test/google-service-account-encryption.test.ts
describe('Google Service Account Encryption', () => {
  it('should create Google client with encrypted credentials', async () => {
    const serviceAccount = JSON.parse(fs.readFileSync('google.json', 'utf-8'));
    const encrypted = await googleKeyManager.encrypt(serviceAccount);
    
    const client = await createGoogleClientWithServiceAccount(encrypted);
    expect(client.authType).toBe('service-account');
    
    const userInfo = await client.fetchAboutUser();
    expect(userInfo.user.emailAddress).toBe(serviceAccount.client_email);
  });

  it('should backward-compatible with plaintext credentials', async () => {
    const serviceAccount = JSON.parse(fs.readFileSync('google.json', 'utf-8'));
    
    const client = await createGoogleClientWithServiceAccount(serviceAccount);
    expect(client.authType).toBe('service-account');
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

# 6. Test with CLI script
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED="RSA-ENCRYPTED:eyJh..." \
  node --import ./loader.mjs scripts/api/drive-about-user.ts

# Expected: Should decrypt and work like plaintext credentials
```

## Migration Path

### Phase 1: Backward Compatibility (This PR)
- Implement encryption system
- Support both plaintext and encrypted credentials
- No breaking changes for existing users

### Phase 2: Deprecation Warnings (Future)
- Add console warnings when plaintext credentials are used
- Update documentation to recommend encrypted credentials

### Phase 3: Encrypted Only (Future, optional)
- Remove plaintext support (breaking change)
- Require encrypted credentials for all service accounts

## Open Questions

1. **Key Distribution**: How do we securely distribute the public key for client-side encryption tools?
   - Option A: Publish in documentation (least secure, but most convenient)
   - Option B: Provide API endpoint `/google-service-encrypt/public-key`
   - Option C: Include in npm package for local encryption

2. **Key Rotation**: How often should keys be rotated?
   - Recommendation: Yearly or on security incidents
   - Provide CLI tool: `npm run rotate-google-keys`

3. **Multi-Key Support**: Should we support multiple key versions simultaneously?
   - Useful during rotation periods (decrypt with old key, encrypt with new key)
   - Adds complexity (key versioning, storage)

4. **Alternative Encryption**: Should we support other encryption methods?
   - AES-256 with shared secret (faster, but requires secure key distribution)
   - Age encryption (modern alternative to PGP)
   - KMS integration (AWS KMS, Google Cloud KMS)

## Success Criteria

- ✅ Users can encrypt service account JSON via web page
- ✅ Encrypted credentials work identically to plaintext (transparent to user code)
- ✅ Private key stored securely and never exposed
- ✅ No performance degradation (decryption overhead <100ms)
- ✅ Backward compatible with existing plaintext credentials
- ✅ Clear documentation and error messages
- ✅ Unit and integration tests pass

## Implementation Checklist

- [ ] Create `server/utils/crypto.ts` with RSA utilities
- [ ] Create `server/utils/key-manager.ts` with key management
- [ ] Add `GoogleEncryptedServiceAccountCredentials` type
- [ ] Update `createGoogleClientWithServiceAccount()` to accept encrypted credentials
- [ ] Create `/google-service-encrypt` GET route with HTML form
- [ ] Create `/google-service-encrypt` POST route for encryption
- [ ] Add `.gitignore` entry for `cache/keys/`
- [ ] Set file permissions on private key (`chmod 600`)
- [ ] Write unit tests for crypto utilities
- [ ] Write integration tests for end-to-end flow
- [ ] Update documentation (README, usage guide)
- [ ] Manual testing: encrypt → store → decrypt → use
- [ ] Update branch name to `google-service-account-encryption`

## References

- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
- [RSA-OAEP Encryption](https://en.wikipedia.org/wiki/Optimal_asymmetric_encryption_padding)
- [Google Service Account Documentation](https://cloud.google.com/iam/docs/service-accounts)
- [Best Practices for Managing Secrets](https://cloud.google.com/docs/authentication/best-practices-applications)
