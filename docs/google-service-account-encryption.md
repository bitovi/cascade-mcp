# Google Service Account Encryption - Quick Start

This feature allows you to encrypt Google service account credentials using RSA-4096 asymmetric encryption with pre-generated keys, making them safe to store in config files, environment variables, or version control.

## Prerequisites

### Create a Google Service Account

You'll need a Google service account JSON file before encrypting it. Follow these steps:

1. Go to [Google Cloud Console - Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Select your project (or create a new one)
3. Click **Create Service Account**
4. Fill in details:
   - **Service account name**: `cascade-mcp-drive` (or your preferred name)
   - **Description**: "Service account for Cascade MCP Google Drive integration"
5. Click **Create and Continue**
6. **(Optional)** Grant permissions - skip this for typical use cases (service accounts access only files explicitly shared with them)
7. Click **Done**
8. Find your service account in the list and click on the email
9. Go to **Keys** tab
10. Click **Add Key** → **Create new key**
11. Select **JSON** format and click **Create**
12. Save the downloaded JSON file securely

### Enable Google Drive API

Before using the service account, enable the Google Drive API:

1. Navigate to [APIs & Services - Library](https://console.cloud.google.com/apis/library)
2. Search for "Google Drive API"
3. Click **Enable**

For detailed official documentation, see [Google Cloud Service Accounts Guide](https://cloud.google.com/iam/docs/service-accounts-create).

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

## � Manual Encryption (Advanced)

If you prefer to encrypt credentials on your local machine without using the web form, you can use the public key directly.

### Step 1: Get the Public Key

Visit the encryption page while the server is running and copy the public key:

```bash
npm run start-local
# Open http://localhost:3000/google-service-encrypt
# Click "📋 Copy Public Key" button
```

Or extract it directly from your `.env`:

```bash
# Decode the base64-encoded public key
echo "$RSA_PUBLIC_KEY" | base64 -d > public_key.pem
```

### Step 2: Encrypt with OpenSSL

Use this one-liner to encrypt your service account:

```bash
openssl pkeyutl -encrypt -pubin -inkey public_key.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in google.json | base64 | tr -d '\n' | sed 's/^/RSA-ENCRYPTED:/'
```

This command:
- Encrypts `google.json` using RSA-OAEP with SHA-256
- Base64-encodes the result
- Removes line breaks
- Adds the `RSA-ENCRYPTED:` prefix

Save to a file (optional):

```bash
openssl pkeyutl -encrypt -pubin -inkey public_key.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in google.json | base64 | tr -d '\n' | sed 's/^/RSA-ENCRYPTED:/' > encrypted.txt
```

### Step 3: Use the Encrypted Credential

Copy the output (starting with `RSA-ENCRYPTED:`) and use it in API calls:

```bash
curl -X POST https://your-server.com/api/write-shell-stories \
  -H "X-Atlassian-Token: your-jira-token" \
  -H "X-Google-Token: RSA-ENCRYPTED:..." \
  -H "Content-Type: application/json"
```

### Step 4: Cleanup

Remove sensitive files after encryption:

```bash
rm google.json public_key.pem encrypted.txt
```

**Note:** The encrypted credential can be safely stored in scripts, config files, or version control since it can only be decrypted by the server with the private key.

## �📋 Storage Options

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

- **Never commit** `private.pem` or `RSA_PRIVATE_KEY` to version control
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
   # Look for: "✅ Google encryption enabled"
   ```

### Error: "Google encryption keys not configured"

**Problem**: Environment variables are not being loaded.

**Solutions**:

1. Verify `.env` file is in the project root directory
2. Check `.env` syntax (no extra spaces around `=`)
3. Restart the server after modifying `.env`
4. Verify file is not named `.env.txt` or similar
