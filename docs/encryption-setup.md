# RSA Encryption Setup

This guide covers setting up RSA-4096 asymmetric encryption for sensitive credentials in Cascade MCP. Encrypted credentials can be safely stored in config files, environment variables, or version control.

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
RSA_PUBLIC_KEY="LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K..."
RSA_PRIVATE_KEY="LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1J..."
```

**Important:**

- Copy the entire line including the quotes from the script output
- The quotes are REQUIRED to preserve special characters
- Keys should be one continuous base64 string (no line breaks)
- Never commit `private.pem` or `RSA_PRIVATE_KEY` to version control!

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

- `RSA_PUBLIC_KEY` - Base64-encoded public key
- `RSA_PRIVATE_KEY` - Base64-encoded private key (keep secret!)

## 🔄 Key Rotation

To rotate encryption keys:

```bash
# 1. Generate new keys
./scripts/generate-rsa-keys.sh

# 2. Update .env with new base64-encoded keys

# 3. Restart server
npm run start-local

# 4. Re-encrypt all credentials that use encryption
```

**Important:** After key rotation, you'll need to re-encrypt all credentials and update any stored encrypted values.

## 🎯 Use Cases

- **Development**: Generate keys locally, store in `.env` (git-ignored)
- **Staging**: Generate separate keys, store in GitHub Secrets with `STAGING_` prefix
- **Production**: Generate separate keys, store in GitHub Secrets with `PROD_` prefix
- **Team Isolation**: Each environment has its own key pair - encrypted credentials cannot be decrypted across environments
- **Zero Trust**: Encrypted credentials are safe to store in version control (only the server with the private key can decrypt)

## �️ Manual Terminal Encryption

For advanced users who want to encrypt data from the terminal without using the web interface:

### Step 1: Extract the Public Key

**Option A: From Running Server**

```bash
# Start server
npm run start-local

# Visit http://localhost:3000/encrypt
# Click "📋 Copy Public Key" button
# Save to file: public_key.pem
```

**Option B: From Environment Variable**

```bash
# Decode the base64-encoded public key from .env
echo "$RSA_PUBLIC_KEY" | base64 -d > public_key.pem
```

### Step 2: Encrypt Any Text File

Use OpenSSL to encrypt any sensitive data:

```bash
# Encrypt API keys, tokens, configuration, or any text file
openssl pkeyutl -encrypt -pubin -inkey public_key.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in your-sensitive-data.txt | base64 | tr -d '\n' | sed 's/^/RSA-ENCRYPTED:/'
```

**Examples**:

```bash
# Encrypt Google service account JSON
openssl pkeyutl -encrypt -pubin -inkey public_key.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in google.json | base64 | tr -d '\n' | sed 's/^/RSA-ENCRYPTED:/'

# Encrypt API key file
echo "sk-ant-api-key-abc123..." | openssl pkeyutl -encrypt -pubin -inkey public_key.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 | base64 | tr -d '\n' | sed 's/^/RSA-ENCRYPTED:/'

# Encrypt multi-line configuration
openssl pkeyutl -encrypt -pubin -inkey public_key.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in config.yaml | base64 | tr -d '\n' | sed 's/^/RSA-ENCRYPTED:/'
```

### Step 3: Use the Encrypted Output

Copy the encrypted string (starting with `RSA-ENCRYPTED:`) and use it:

```bash
# In environment variables
export MY_SECRET="RSA-ENCRYPTED:eyJhbGci..."

# In API requests (provider-specific headers)
curl -X POST https://your-server.com/api/endpoint \
  -H "X-Google-Token: RSA-ENCRYPTED:..." \
  -H "Content-Type: application/json"

# In configuration files
echo "ENCRYPTED_CONFIG=RSA-ENCRYPTED:..." >> .env.production
```

### Step 4: Cleanup

Remove sensitive files after encryption:

```bash
rm your-sensitive-data.txt public_key.pem encrypted.txt
```

**Security Notes**:

- The encrypted output can be safely stored in version control
- Only the server with the private key (`RSA_PRIVATE_KEY`) can decrypt it
- Public key is safe to share - it can only encrypt, not decrypt
- Use different encryption keys for dev, staging, and production

---

## �📚 Full Documentation

See [specs/001-static-encryption-keys/](../specs/001-static-encryption-keys/) for:

- Complete technical design
- Security considerations
- Architecture details
- Environment-based key loading

## ⚠️ Important Notes

- **Never commit** `private.pem` or `RSA_PRIVATE_KEY` to version control
- **Always use HTTPS** in production
- **Use different keys** for dev, staging, and production environments
- **Rotate keys** when team members with access to keys leave
- **Keep backups** of your plaintext credentials in a secure location (password manager, secure vault)
- **Encryption is optional** - if keys are not configured, features requiring encryption will be gracefully disabled

## 🔧 Troubleshooting

### Error: "Invalid PEM format: error:1E08010C:DECODER routines::unsupported"

**Problem**: The base64-encoded key cannot be decoded or contains invalid characters.

**Solutions**:

1. **Verify quotes are present** in your `.env` file:

   ```bash
   # ✅ CORRECT (with quotes)
   RSA_PUBLIC_KEY="LS0tLS1CRUdJTi..."
   
   # ❌ WRONG (without quotes)
   RSA_PUBLIC_KEY=LS0tLS1CRUdJTi...
   ```

2. **Check for line breaks** - Keys must be one continuous string:

   ```bash
   # ❌ WRONG (has line breaks)
   RSA_PUBLIC_KEY="LS0tLS1CRUdJTi
   BQVUJERUZSBLT...
   VLUSURLS0tLS0K"
   
   # ✅ CORRECT (single line)
   RSA_PUBLIC_KEY="LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K..."
   ```

3. **Regenerate keys** and copy the ENTIRE line from script output:

   ```bash
   ./scripts/generate-rsa-keys.sh
   # Copy: RSA_PUBLIC_KEY="..." (including quotes)
   ```

4. **Verify .env file loading**:

   ```bash
   # Check if environment variables are set correctly
   npm run start-local
   # Look for: "✅ Encryption keys loaded" or similar messages
   ```

### Error: "Encryption keys not configured"

**Problem**: Environment variables are not being loaded.

**Solutions**:

1. Verify `.env` file is in the project root directory
2. Check `.env` syntax (no extra spaces around `=`)
3. Restart the server after modifying `.env`
4. Verify file is not named `.env.txt` or similar
