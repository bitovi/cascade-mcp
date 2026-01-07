# Google Service Account Encryption - Quick Start

This feature allows you to encrypt Google service account credentials using RSA-4096 asymmetric encryption, making them safe to store in config files, environment variables, or version control.

## 🚀 Quick Start

### 1. Encrypt Your Service Account

Visit the encryption page:
```bash
npm run start-local
# Open http://localhost:3000/google-service-encrypt
```

Paste your `google.json` content and click "🔒 Encrypt Credentials"

### 2. Use Encrypted Credentials

The encrypted string works just like a Personal Access Token:

```typescript
import { createGoogleClientWithServiceAccount } from './server/providers/google/google-api-client.js';

// Use encrypted credentials (secure)
const encrypted = "RSA-ENCRYPTED:eyJhbGci...";
const client = await createGoogleClientWithServiceAccount(encrypted);

// Or use plaintext (backward compatible)
const serviceAccount = JSON.parse(fs.readFileSync('google.json', 'utf-8'));
const client = await createGoogleClientWithServiceAccount(serviceAccount);

// Both work identically
const userInfo = await client.fetchAboutUser();
```

### 3. Test It

```bash
# Run end-to-end test (requires google.json in project root)
node --import ./loader.mjs scripts/api/test-encryption.ts
```

## 📋 Storage Options

### Environment Variable
```bash
# .env
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:eyJh...

# In code
const client = await createGoogleClientWithServiceAccount(
  process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED
);
```

### Config File (Safe for Git)
```json
{
  "google_service_account": "RSA-ENCRYPTED:eyJh..."
}
```

### Direct Usage
```typescript
const ENCRYPTED_CREDS = "RSA-ENCRYPTED:eyJh...";
const client = await createGoogleClientWithServiceAccount(ENCRYPTED_CREDS);
```

## 🔐 Security

- **RSA-4096 encryption** (industry standard)
- **Private key** stored in `cache/keys/google-rsa/` (git-ignored)
- **Public key** can be safely published
- **Backward compatible** - plaintext credentials still work

## 📦 Files Created

- `server/utils/crypto.ts` - RSA encryption utilities
- `server/utils/key-manager.ts` - Key management
- `server/google-service-encrypt.ts` - Web interface
- `scripts/api/test-encryption.ts` - End-to-end test
- `specs/33-google-service-account-encryption.md` - Full specification

## 🔄 Key Rotation

To rotate encryption keys:
```bash
rm -rf cache/keys/google-rsa/
npm run start-local  # Generates new keys
# Re-encrypt all service accounts on the web page
```

## 📚 Full Documentation

See [specs/33-google-service-account-encryption.md](./specs/33-google-service-account-encryption.md) for:
- Complete technical design
- Security considerations
- Architecture details
- Testing strategy
- Migration path
