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

# Google Service Account (Encrypted) - Alternative to OAuth
# Generate encrypted credentials locally using http://localhost:3000/google-service-encrypt
# Then set this environment variable with the encrypted output
# Format: RSA-ENCRYPTED:<base64-encoded-encrypted-credentials>
# GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:eyJhbGci...
# Note: Server auto-generates RSA keys in cache/keys/google-rsa/ on first use
#       Keys must persist across restarts - use volume mount or persistent storage

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

#### 1. Generate Encrypted Credentials Locally

```bash
# Start the server locally
npm run start-local

# Visit the encryption page
open http://localhost:3000/google-service-encrypt

# Paste your service account JSON and encrypt it
# Copy the output starting with "RSA-ENCRYPTED:"
```

#### 2. Configure Environment Variable

Add the encrypted credentials to your deployment environment:

```bash
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:eyJhbGci...
```

**Deployment Options:**

- **GitHub Actions**: Add as a repository secret
- **AWS**: Store in AWS Secrets Manager or Parameter Store
- **Docker**: Add to `.env` file (ensure it's not committed)
- **Kubernetes**: Store in a Secret resource

#### 3. RSA Key Persistence

The server auto-generates RSA keys in `cache/keys/google-rsa/` on first use. These keys **must persist** across restarts:

**Docker Volume:**

```yaml
# docker-compose.yaml
services:
  cascade-mcp:
    volumes:
      - ./cache:/app/cache
```

**Important Notes:**

- Different environments (staging, production) should have **separate RSA key pairs**
- Encrypted credentials from one environment **cannot** be decrypted in another
- If you lose the RSA keys, you'll need to re-encrypt all credentials

#### 4. Security Considerations

- **Never commit** `cache/keys/` directory to version control
- **Never commit** plaintext service account JSON files
- Use GitHub Secrets or a secrets manager for production
- Rotate service account keys periodically
- Private RSA keys have file permissions set to `0600` automatically

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
