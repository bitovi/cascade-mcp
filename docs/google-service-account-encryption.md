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

The encrypted string can be stored securely and used by Google Doc conversion tools:

```bash
# .env file
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:eyJh...
```

Your Google Doc tools throughout the application will automatically use this encrypted credential.

## 📋 Storage Options

### Environment Variable (Recommended)

```bash
# .env
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:eyJh...
```

### Config File (Safe for Git)

```json
{
  "google_service_account": "RSA-ENCRYPTED:eyJh..."
}
```

## 🔐 Security

- **RSA-4096 encryption** (industry standard)
- **Private key** stored in `cache/keys/google-rsa/` (git-ignored)
- **Public key** can be safely published
- **Server-side only** - encryption/decryption happens on the server

## 📦 Files Created

When you first use the encryption page, RSA keys will be automatically generated and stored in:

```text
cache/keys/google-rsa/
├── private.pem  # Server-side only, never expose
└── public.pem   # Can be safely published
```

## 🔄 Key Rotation

To rotate encryption keys:

```bash
rm -rf cache/keys/google-rsa/
npm run start-local  # Generates new keys
# Re-encrypt all service accounts on the web page
```

**Important:** After key rotation, you'll need to re-encrypt your service account JSON and update any stored encrypted credentials.

## 🎯 Use Cases

- **Development**: Store encrypted credentials in `.env` for local development
- **CI/CD**: Store encrypted credentials in GitHub secrets or environment variables
- **Multiple Environments**: Use different keys for staging and production
- **Team Sharing**: Share encrypted credentials safely (only your server can decrypt them)

## 📚 Full Documentation

See [specs/33-google-service-account-encryption.md](../specs/33-google-service-account-encryption.md) for:

- Complete technical design
- Security considerations
- Architecture details
- Encryption format specification

## ⚠️ Important Notes

- **Never commit** the private key (`cache/keys/google-rsa/private.pem`)
- **Always use HTTPS** in production
- **Rotate keys** when team members with access to keys leave
- **Keep backups** of your plaintext service account JSON in a secure location (password manager, secure vault)
