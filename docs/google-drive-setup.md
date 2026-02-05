# Google Drive Integration Setup

This guide covers setting up Google Drive integration for Cascade MCP, including creating a service account and encrypting credentials for secure storage.

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

## 🔒 Encrypting Service Account Credentials

Before encrypting credentials, ensure you have [set up encryption keys](./encryption-setup.md).

### Option 1: Web-Based Encryption (Recommended)

Start the server and visit the encryption page:

```bash
npm run start-local
# Open http://localhost:3000/google-service-encrypt
```

Paste your `google.json` content and click "🔒 Encrypt Credentials"

### Option 2: Manual Encryption (Advanced)

If you prefer to encrypt credentials on your local machine without using the web form, you can use the public key directly.

#### Step 1: Get the Public Key

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

#### Step 2: Encrypt with OpenSSL

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

#### Step 3: Use the Encrypted Credential

Copy the output (starting with `RSA-ENCRYPTED:`) and use it in API calls:

```bash
curl -X POST https://your-server.com/api/write-shell-stories \
  -H "X-Atlassian-Token: your-jira-token" \
  -H "X-Google-Token: RSA-ENCRYPTED:..." \
  -H "Content-Type: application/json"
```

#### Step 4: Cleanup

Remove sensitive files after encryption:

```bash
rm google.json public_key.pem encrypted.txt
```

**Note:** The encrypted credential can be safely stored in scripts, config files, or version control since it can only be decrypted by the server with the private key.

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

### API Header

```bash
curl -X POST https://your-server.com/api/tool-name \
  -H "X-Google-Token: RSA-ENCRYPTED:..." \
  -H "Content-Type: application/json"
```

## 🔧 Troubleshooting

### Error: "Google encryption keys not configured"

**Problem**: RSA encryption keys are not set up.

**Solution**: Follow the [Encryption Setup Guide](./encryption-setup.md) to configure encryption keys.

### Service Account Cannot Access Files

**Problem**: The service account doesn't have permission to access Google Drive files.

**Solutions**:

1. Share the specific file/folder with the service account email (found in your `google.json` as `client_email`)
2. In Google Drive, right-click the file/folder → Share → Add the service account email
3. Verify the service account has the required Drive API enabled

### "User Rate Limit Exceeded" Errors

**Problem**: Too many API requests to Google Drive.

**Solutions**:

1. Implement exponential backoff in your application
2. Check [Google Drive API quotas](https://developers.google.com/drive/api/guides/limits) in your Google Cloud Console
3. Request quota increases if needed for production use

## ⚠️ Important Security Notes

- **Never commit** plaintext `google.json` to version control
- **Always use encrypted credentials** for Google service accounts
- **Keep backups** of your plaintext service account JSON in a secure location (password manager, secure vault)
- **Share files explicitly** with service account email - don't grant broad permissions
- **Rotate service account keys** periodically in Google Cloud Console

## 📚 Additional Resources

- [Google Drive API Documentation](https://developers.google.com/drive/api/guides/about-sdk)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)
- [Encryption Setup Guide](./encryption-setup.md) - For RSA key configuration
