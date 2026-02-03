# Google Service Account Encryption - Quick Start

This feature allows you to encrypt Google service account credentials using RSA-4096 asymmetric encryption with pre-generated keys, making them safe to store in config files, environment variables, or version control.

## 🚀 Quick Start

### 1. Generate Encryption Keys

First-time setup requires generating RSA encryption keys:

```bash
./scripts/generate-rsa-keys.sh
```

This creates `private.pem` and `public.pem` and outputs base64-encoded keys for your `.env` file.

### 2. Configure Environment Variables

Add the base64-encoded keys to your `.env` file:

```bash
# Copy the ENTIRE line from the script output (including quotes)
GOOGLE_RSA_PUBLIC_KEY="LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K..."
GOOGLE_RSA_PRIVATE_KEY="LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1J..."
```

**Important:**

- Copy the entire line including the quotes from the script output
- The quotes are REQUIRED to preserve special characters
- Keys should be one continuous base64 string (no line breaks)
- Never commit `private.pem` or `GOOGLE_RSA_PRIVATE_KEY` to version control!

### 3. Encrypt Your Service Account

Start the server and visit the encryption page:

```bash
npm run start-local
# Open http://localhost:3000/google-service-encrypt
```

Paste your `google.json` content and click "🔒 Encrypt Credentials"

### 4. Use Encrypted Credentials

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
- **Pre-generated keys** loaded from environment variables (not auto-generated)
- **Private key** must remain server-side only (never expose to client)
- **Public key** used for encryption on the server
- **Server-side only** - encryption/decryption happens on the server

## 📦 Key Files

When you run `./scripts/generate-rsa-keys.sh`, it creates:

```text
private.pem  # Server-side only, never commit (git-ignored)
public.pem   # Used for encryption, safe to publish if needed
```

Keys are loaded from environment variables:

- `GOOGLE_RSA_PUBLIC_KEY` - Base64-encoded public key
- `GOOGLE_RSA_PRIVATE_KEY` - Base64-encoded private key (keep secret!)

## 🔄 Key Rotation

To rotate encryption keys:

```bash
# 1. Generate new keys
./scripts/generate-rsa-keys.sh

# 2. Update .env with new base64-encoded keys
# 3. Restart server
npm run start-local

# 4. Re-encrypt all service accounts on the web page
```

**Important:** After key rotation, you'll need to re-encrypt your service account JSON and update any stored encrypted credentials.

## 🎯 Use Cases

- **Development**: Generate keys locally, store in `.env` (git-ignored)
- **Staging**: Generate separate keys, store in GitHub Secrets with `STAGING_` prefix
- **Production**: Generate separate keys, store in GitHub Secrets with `PROD_` prefix
- **Team Isolation**: Each environment has its own key pair - encrypted credentials cannot be decrypted across environments
- **Zero Trust**: Encrypted credentials are safe to store in version control (only the server with the private key can decrypt)

## 📚 Full Documentation

See [specs/001-static-encryption-keys/](../specs/001-static-encryption-keys/) for:

- Complete technical design
- Security considerations
- Architecture details
- Environment-based key loading

## ⚠️ Important Notes

- **Never commit** `private.pem` or `GOOGLE_RSA_PRIVATE_KEY` to version control
- **Always use HTTPS** in production
- **Use different keys** for dev, staging, and production environments
- **Rotate keys** when team members with access to keys leave
- **Keep backups** of your plaintext service account JSON in a secure location (password manager, secure vault)
- **Encryption is optional** - if keys are not configured, Google features will be gracefully disabled

## 🔧 Troubleshooting

### Error: "Invalid PEM format: error:1E08010C:DECODER routines::unsupported"

**Problem**: The base64-encoded key cannot be decoded or contains invalid characters.

**Solutions**:

1. **Verify quotes are present** in your `.env` file:

   ```bash
   # ✅ CORRECT (with quotes)
   GOOGLE_RSA_PUBLIC_KEY="LS0tLS1CRUdJTi..."
   
   # ❌ WRONG (without quotes)
   GOOGLE_RSA_PUBLIC_KEY=LS0tLS1CRUdJTi...
   ```

2. **Check for line breaks** - Keys must be one continuous string:

   ```bash
   # ❌ WRONG (has line breaks)
   GOOGLE_RSA_PUBLIC_KEY="LS0tLS1CRUdJTi
   BQVUJERUZSBLT...
   VLUSURLS0tLS0K"
   
   # ✅ CORRECT (single line)
   GOOGLE_RSA_PUBLIC_KEY="LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K..."
   ```

3. **Regenerate keys** and copy the ENTIRE line from script output:

   ```bash
   ./scripts/generate-rsa-keys.sh
   # Copy: GOOGLE_RSA_PUBLIC_KEY="..." (including quotes)
   ```

4. **Verify .env file loading**:

   ```bash
   # Check if environment variables are set correctly
   npm run start-local
   # Look for: "✅ Google encryption enabled"
   ```

### Error: "Google encryption keys not configured"

**Problem**: Environment variables are not being loaded.

**Solutions**:

1. Verify `.env` file is in the project root directory
2. Check `.env` syntax (no extra spaces around `=`)
3. Restart the server after modifying `.env`
4. Verify file is not named `.env.txt` or similar
