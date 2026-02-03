# Cascade MCP Deployment Guide

This guide covers deploying the Cascade MCP service on various infrastructure platforms. The service is a Node.js application that provides OAuth-authenticated MCP (Model Context Protocol) tools for Atlassian Jira and Figma integrations.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Deployment Options](#deployment-options)
  - [Docker Deployment](#docker-deployment)
  - [Using docker-to-ec2](#using-docker-to-ec2)
- [Verify the deployment](#verify-the-deployment)

---

## Prerequisites

### System Requirements

- **Node.js**: 18.x

### OAuth Application Setup

Before deploying, you need to create OAuth applications for the services you want to integrate:

#### Atlassian/Jira OAuth App

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Create a new OAuth 2.0 integration
3. Configure settings:
   - **Callback URL**: `https://your-domain.com/auth/callback/atlassian`
   - **Scopes**: `read:jira-work write:jira-work offline_access`
4. Note your `Client ID` and `Client Secret`

#### Figma OAuth App

1. Go to [Figma Developer Settings](https://www.figma.com/developers/apps)
2. Create a new app
3. Configure settings:
   - **Callback URL**: `https://your-domain.com/auth/callback/figma`
   - **Scopes**: `file_content:read file_comments:read current_user:read`
4. Note your `Client ID` and `Client Secret`

#### Google Drive OAuth App

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Navigate to **APIs & Services** > **Library**
   - Search for "Google Drive API"
   - Click **Enable**
4. Create OAuth 2.0 credentials:
   - Navigate to **APIs & Services** > **Credentials**
   - Click **Create Credentials** > **OAuth client ID**
   - Select **Application type**: **Web application**
   - **Name**: Choose a descriptive name (e.g., "Cascade MCP Server")
   - **Authorized redirect URIs**: Add `https://your-domain.com/auth/callback/google`
   - Click **Create**
5. Note your `Client ID` and `Client Secret` from the confirmation dialog

---

## Environment Configuration

### Required Environment Variables

Create a `.env` file or configure your deployment platform with these variables:

```bash
# Server Configuration
PORT=3000                                    # Port the service listens on

# Base URL (MUST be HTTPS in production)
VITE_AUTH_SERVER_URL=https://your-domain.com

# Session & JWT Security
SESSION_SECRET=your-secure-random-string     # Generate with: openssl rand -base64 32
JWT_SECRET=your-jwt-secret                   # Generate with: openssl rand -base64 32
CHECK_JWT_EXPIRATION=true                    # Enable JWT expiration checks

# Atlassian/Jira OAuth
VITE_JIRA_CLIENT_ID=your-jira-client-id
JIRA_CLIENT_SECRET=your-jira-client-secret
VITE_JIRA_SCOPE="read:jira-work write:jira-work offline_access"
VITE_JIRA_CALLBACK_URL=https://your-domain.com/auth/callback/atlassian
VITE_JIRA_API_URL=https://api.atlassian.com/ex/jira

# Figma OAuth
FIGMA_CLIENT_ID=your-figma-client-id
FIGMA_CLIENT_SECRET=your-figma-client-secret
FIGMA_OAUTH_SCOPES="file_content:read file_comments:read file_comments:write current_user:read"

# Google Drive OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_SCOPES="https://www.googleapis.com/auth/drive"

# Google Encryption Keys (Required for service account encryption)
# Generate keys locally: ./scripts/generate-rsa-keys.sh
# Store in GitHub Secrets for staging/production deployments
# Use different keys for each environment (dev/staging/prod)
# See: docs/google-service-account-encryption.md for complete setup guide
RSA_PUBLIC_KEY=LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K...
RSA_PRIVATE_KEY=LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1J...

# Google Service Account (Encrypted) - Alternative to OAuth
# Generate encrypted credentials locally using http://localhost:3000/google-service-encrypt
# Then set this environment variable with the encrypted output
# Format: RSA-ENCRYPTED:<base64-encoded-encrypted-credentials>
# See: docs/google-service-account-encryption.md for encryption workflow
# GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:eyJhbGci...

# Optional: AWS (for CloudWatch logging)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key

# Optional: Sentry (for error tracking)
SENTRY_DSN=your-sentry-dsn
VITE_STATUS_REPORTS_ENV=production           # Environment name for Sentry
VITE_COMMIT_SHA=git-commit-sha               # Git commit for release tracking
```

### Generating Secure Secrets

```bash
# Generate SESSION_SECRET
openssl rand -base64 32

# Generate JWT_SECRET
openssl rand -base64 32
```

---

## Deployment Options

### Docker Deployment

The simplest way to deploy is using Docker. The provided `Dockerfile` and `docker-compose.yaml` are production-ready.

#### Using Docker Compose

1. **Create `.env` file** with your environment variables (see above)

2. **Build and run:**

   ```bash
   docker-compose up --build -d
   ```

3. **View logs:**

   ```bash
   docker-compose logs -f
   ```

4. **Stop the service:**

   ```bash
   docker-compose down
   ```

#### Using Docker directly

```bash
# Build the image
docker build -t cascade-mcp:latest .

# Run the container
docker run -d \
  --name cascade-mcp \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  cascade-mcp:latest
```

### Google Service Account Encryption for Production

If you're using Google Service Account credentials for Google Drive access, follow these steps for secure deployment:

#### 1. Generate RSA Encryption Keys

**For each environment (dev/staging/production), generate separate keys:**

```bash
# Run the key generation script
./scripts/generate-rsa-keys.sh

# This creates private.pem and public.pem
# And outputs base64-encoded keys for environment variables
```

**Important:** Use different key pairs for each environment. This ensures encrypted credentials cannot be decrypted across environments.

#### 2. Store Keys in GitHub Secrets

For staging and production, add keys to GitHub Secrets:

- `RSA_PUBLIC_KEY` - RSA public key
- `RSA_PRIVATE_KEY` - RSA private key

**GitHub Actions Workflow Example:**

```yaml
# .github/workflows/deploy-staging.yml
env:
  RSA_PUBLIC_KEY: ${{ secrets.RSA_PUBLIC_KEY }}
  RSA_PRIVATE_KEY: ${{ secrets.RSA_PRIVATE_KEY }}
```

#### 3. Encrypt Service Account Credentials

**For each environment:**

```bash
# 1. Start server with RSA keys
export RSA_PUBLIC_KEY="<base64-key>"
export RSA_PRIVATE_KEY="<base64-key-for-this-env>"
npm run start-local

# 2. Visit encryption page
open http://localhost:3000/google-service-encrypt

# 3. Paste service account JSON and encrypt
# 4. Copy the output starting with "RSA-ENCRYPTED:"
```

#### 4. Configure Environment Variables

Add the encrypted credentials to your deployment environment:

```bash
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:eyJhbGci...
```

**Deployment Options:**

- **GitHub Actions**: Add as repository secrets (separate for staging/prod)
- **AWS**: Store in AWS Secrets Manager or Parameter Store
- **Docker**: Add to environment-specific `.env` files
- **Kubernetes**: Store in Secret resources (separate per namespace)

#### 5. Security Considerations

- **Never commit** `private.pem`, `public.pem`, or private keys to version control
- **Never commit** plaintext service account JSON files
- **Use different keys** for dev, staging, and production
- **Store private keys** only in secure secrets managers (GitHub Secrets, AWS Secrets Manager)
- **Rotate keys** when team members with access leave
- **No filesystem dependencies** - keys load from environment variables only
- **Graceful degradation** - if keys not configured, encryption features are disabled

#### 6. Key Rotation Process

```bash
# 1. Generate new keys for the environment
./scripts/generate-rsa-keys.sh

# 2. Update GitHub Secrets with new keys
# 3. Re-encrypt all service account credentials with new keys
# 4. Update GOOGLE_SERVICE_ACCOUNT_ENCRYPTED in deployment
# 5. Deploy with new keys and encrypted credentials
```

For more details, see: [docs/google-service-account-encryption.md](google-service-account-encryption.md)

### Using docker-to-ec2

TBD:

## Verify the deployment

The following are incremental verification steps you can use to ensure the app is functioning properly.

### Visit the homepage

The homepage should load properly. You should see the right url for the MCP service:

> <img width="568" height="424" alt="image" src="https://github.com/user-attachments/assets/39034d87-a872-4da3-9003-30a3200d8967" />

### Check the Metadata Endpoints

The homepage has links to the metadata endpoints. Check that these also have the right urls.

> <img width="638" height="157" alt="image" src="https://github.com/user-attachments/assets/d476c047-95d5-4ee6-a5d8-f00fcc9b67ed" />

### Connect with an MCP client

The final step is to connect with an MCP client. The homepage has instructions on how to do this.
