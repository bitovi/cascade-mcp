# Quick Start: Google Encryption Setup (5 Minutes)

**Feature**: [spec.md](../spec.md) | **For**: Local Development

This guide gets you from zero to working Google encryption in 5 minutes.

## Prerequisites

- macOS or Linux (OpenSSL installed)
- Node.js 20+ installed
- Repository cloned locally

## Step 1: Generate Encryption Keys (2 minutes)

Run the key generation script:

```bash
cd /path/to/cascade-mcp
./scripts/generate-rsa-keys.sh
```

**Output**:
```
🔐 Generating RSA-4096 key pair...
Generating RSA private key, 4096 bit long modulus
...
✅ Keys generated successfully:
   Private: private.pem (permissions: 600)
   Public:  public.pem (permissions: 644)

📋 Add to .env file:
GOOGLE_RSA_PUBLIC_KEY=LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K...
GOOGLE_RSA_PRIVATE_KEY=LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1J...
```

**What this does**:
- Creates `private.pem` with restricted permissions (0600)
- Creates `public.pem` with standard permissions (0644)
- Outputs base64-encoded values ready for `.env`

## Step 2: Add Keys to .env File (1 minute)

Copy the output from Step 1 and paste into your `.env` file:

```bash
# Copy from script output
GOOGLE_RSA_PUBLIC_KEY=LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K...
GOOGLE_RSA_PRIVATE_KEY=LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1J...
```

**Tip**: Use your editor to paste the entire block at once.

## Step 3: Start the Server (1 minute)

```bash
npm run start-local
```

**Look for this in the logs**:
```
✅ Google encryption enabled
   Loaded public key from GOOGLE_RSA_PUBLIC_KEY
   Loaded private key from GOOGLE_RSA_PRIVATE_KEY
```

**If you see this instead** (keys not configured):
```
ℹ️  Google encryption keys not configured
   Google Drive/Docs features will be unavailable
   See docs/google-service-account-encryption.md for setup
```

→ Go back to Step 2 and verify `.env` file has both keys.

## Step 4: Test Encryption (1 minute)

1. Open browser to [http://localhost:3000/google-service-encrypt](http://localhost:3000/google-service-encrypt)

2. Paste your Google service account JSON (from Google Cloud Console)

3. Click **🔒 Encrypt Credentials**

4. Copy the encrypted output (starts with `RSA-ENCRYPTED:`)

5. Add to `.env`:

```bash
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:eyJhbGciOiJSU0EtT0FFUCIsInZlcnNpb24iOiIxIn0=...
```

## Verification

Test that everything works:

```bash
# Check server logs show encryption enabled
npm run start-local | grep "Google encryption"

# Expected output:
# ✅ Google encryption enabled
```

Try using a Google Drive tool (requires service account setup):

```bash
curl -X POST http://localhost:3000/api/google-drive/doc-to-markdown \
  -H "Content-Type: application/json" \
  -d '{"url":"https://docs.google.com/document/d/YOUR_DOC_ID/edit"}'
```

## Troubleshooting

### Server won't start - "Invalid RSA key format"

**Cause**: Base64 encoding is malformed or PEM format is invalid.

**Fix**:
```bash
# Regenerate keys
./scripts/generate-rsa-keys.sh

# Copy new base64 values to .env
# Restart server
```

### Server starts but encryption page shows error

**Cause**: Keys not loaded properly.

**Fix**:
1. Check `.env` file has both `GOOGLE_RSA_PUBLIC_KEY` and `GOOGLE_RSA_PRIVATE_KEY`
2. Verify no extra spaces or line breaks in the base64 values
3. Restart server after fixing `.env`

### Encryption page works but service account features don't work

**Cause**: Service account not configured or encrypted value not in `.env`.

**Fix**:
1. Verify `GOOGLE_SERVICE_ACCOUNT_ENCRYPTED` is in `.env`
2. Check value starts with `RSA-ENCRYPTED:`
3. Verify service account has access to the Google Doc/Drive resources

### Keys deleted - how to recover?

**If you have encrypted credentials**:
- You MUST regenerate keys and re-encrypt all service accounts
- Old encrypted values cannot be decrypted with new keys

**If you have backup of original service account JSON**:
- Generate new keys with script
- Re-encrypt service account JSON on encryption page
- Update `.env` with new encrypted value

## Clean Up (Optional)

After adding keys to `.env`, you can delete the PEM files if desired:

```bash
rm private.pem public.pem
```

**Warning**: Keep a backup copy in a secure location (password manager, secure vault). If you lose the keys and `.env`, you'll need to re-encrypt all service accounts.

## Next Steps

- **For team setup**: See [contributing.md](../../../contributing.md#google-service-account-setup)
- **For production deployment**: See [docs/deployment.md](../../../docs/deployment.md#google-service-account-encryption)
- **For GitHub Secrets setup**: See [research.md](./research.md#3-github-secrets-management-strategy)

## What You Learned

- How to generate RSA-4096 key pairs
- How to base64-encode keys for environment variables
- How to configure encryption keys in `.env`
- How to verify encryption is working
- How to troubleshoot common issues

**Total time**: ~5 minutes (assuming you have service account JSON ready)
