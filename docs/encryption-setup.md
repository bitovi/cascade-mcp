# RSA Encryption Setup

**Using hosted service?** Visit `/encrypt` page (no setup needed)  
**Self-hosting?** [Generate keys](#generate-encryption-keys)  
**Deploying?** Store keys in GitHub Secrets or cloud secret managers

---

## Using the Encryption Page

Start the server and visit the encryption page:

```bash
npm run start-local
# Open http://localhost:3000/encrypt
```

Paste your credentials and click "🔒 Encrypt Data". Copy the encrypted output (starts with `RSA-ENCRYPTED:`).

---

## Generate Encryption Keys

For self-hosting, generate RSA encryption keys:

```bash
./scripts/generate-rsa-keys.sh
```

This creates `private.pem` and `public.pem` and outputs base64-encoded keys for your `.env` file.

### Configure Environment Variables

Add the base64-encoded keys to your `.env` file:

```bash
# Copy the ENTIRE line from the script output (including quotes)
RSA_PUBLIC_KEY="LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K..."
RSA_PRIVATE_KEY="LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1J..."
```

**Important:** Copy the entire line including quotes. Keys must be one continuous base64 string (no line breaks). Never commit `private.pem` or `RSA_PRIVATE_KEY` to version control.

## 🔐 Security

- **RSA-4096 encryption** (industry standard)
- **Pre-generated keys** loaded from environment variables (not auto-generated)
- **Private key** must remain server-side only (never expose to client)

## 🔄 Key Rotation

To rotate encryption keys:

```bash
./scripts/generate-rsa-keys.sh  # Generate new keys
# Update .env with new base64-encoded keys
npm run start-local             # Restart server
# Re-encrypt all credentials
```

## 🎯 Use Cases

- **Development**: Generate keys locally, store in `.env` (git-ignored)
- **Staging/Production**: Store keys in GitHub Secrets or cloud secret managers
- **Team Isolation**: Each environment has its own key pair

## Manual Terminal Encryption

For advanced users who want to encrypt locally:

### Get the Public Key

```bash
# Option A: From running server at http://localhost:3000/encrypt (click "📋 Copy Public Key")
# Option B: From environment variable
echo "$RSA_PUBLIC_KEY" | base64 -d > public_key.pem
```

### Encrypt Your Data

```bash
openssl pkeyutl -encrypt -pubin -inkey public_key.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in your-file.json | base64 | tr -d '\n' | sed 's/^/RSA-ENCRYPTED:/'
```

Use the encrypted output in API headers (e.g., `X-Google-Token: RSA-ENCRYPTED:...`) or environment variables.

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

**Error: "Invalid PEM format"**
- Verify quotes are present in `.env`: `RSA_PUBLIC_KEY="..."`
- Ensure keys are one continuous line (no line breaks)
- Regenerate keys: `./scripts/generate-rsa-keys.sh`

**Error: "Encryption keys not configured"**
- Verify `.env` file is in project root
- Check `.env` syntax (no spaces around `=`)
- Restart server after modifying `.env`
