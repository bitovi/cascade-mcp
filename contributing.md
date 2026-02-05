# Contributing to Cascade MCP Tools

Thank you for your interest in contributing! To contribute to this project, you'll need to complete both setup paths:

1. **[API Client Setup](#setup-for-api-clients)** - Start here - PAT token-based setup (easier to verify)
2. **[MCP Client Setup](#setup-for-mcp-clients)** - Then complete OAuth setup for full functionality

**Both Atlassian (Jira) and Figma are required** for the application to function.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup Overview](#setup-overview)
- [Setup for API Clients](#setup-for-api-clients) - Step 1: PAT-based setup
- [Setup for MCP Clients](#setup-for-mcp-clients) - Step 2: OAuth setup
- [Optional Configuration](#optional-configuration)
- [Contributing Code](#contributing-code)

## Prerequisites

- Node.js (v20 or higher required)
- npm (v9 or higher recommended)
- An Atlassian account with access to Jira ([atlassian.com](https://www.atlassian.com/))
- A Figma account ([figma.com](https://www.figma.com/))
- An Anthropic API account ([console.anthropic.com](https://console.anthropic.com/))

## Setup Overview

For contributing to this project, you need to complete **both** setup sections:

1. **[API Client Setup](#setup-for-api-clients)** - Start here. Uses PAT tokens which are easier to generate and verify.
2. **[MCP Client Setup](#setup-for-mcp-clients)** - Complete after API setup. Adds OAuth configuration for MCP protocol integration.

This two-step approach lets you verify your environment is working correctly with the API scripts before adding the more complex OAuth configuration.

---

## Setup for API Clients

**Complete this section first.** This setup uses Personal Access Tokens (PATs) for authentication, which are simpler to generate and verify than OAuth credentials.

### 1. Fork and Clone the Repository

```bash
git clone https://github.com/bitovi/cascade-mcp.git
cd cascade-mcp
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Generate Personal Access Tokens

#### Atlassian PAT

1. Follow the instructions at: [How to create a Jira Request token](https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token)
2. Your token will look like: `ATATT3xFfGF0...` (starts with `ATATT`)
3. Encode your credentials as base64:
   ```bash
   echo -n "your.email@example.com:ATATT3xFfGF0..." | base64
   ```
4. Save the base64-encoded output for your `.env` file

**Important:** Keep your token secure and never commit it to version control.

#### Figma PAT

1. Go to [Figma Settings > Personal access tokens](https://www.figma.com/settings)
2. Click **Generate new token**
3. Give it a descriptive name (e.g., `Cascade MCP Local Dev`)
4. Copy the token (starts with `figd_`)
5. Save it for your `.env` file

**Note:** Figma PATs have full access to your account - no additional scope configuration needed.

#### Figma Test File

The E2E tests and PAT validation script require access to a specific Figma file. By default, the project uses the "TaskFlow" design file:

- **File URL:** `https://www.figma.com/design/3JgSzy4U8gdIGm1oyHiovy/TaskFlow?node-id=0-321`

To use a different test file:

1. Open your Figma file in the browser
2. Select a specific node/frame to use for testing (optional)
3. Copy the full URL from the browser address bar (including `node-id` parameter if you selected a node)
4. Add `FIGMA_TEST_URL` to your `.env` file with the complete URL

### 4. Configure Environment Variables

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Add these **required** variables to your `.env` file:

   ```bash
   # Atlassian PAT (base64-encoded email:token)
   ATLASSIAN_TEST_PAT="<your-base64-encoded-credentials>"

   # Figma PAT
   FIGMA_TEST_PAT="figd_..."

   # Figma test file URL (full URL with node-id for E2E tests)
   # Copy the full URL from your Figma file, including the node-id parameter
   FIGMA_TEST_URL="https://www.figma.com/design/3JgSzy4U8gdIGm1oyHiovy/TaskFlow?node-id=0-321"

   # LLM Client API Key (for AI-powered API endpoints)
   # Default client: Anthropic - see server/llm-client/README.md for all LLM clients
   ANTHROPIC_API_KEY="sk-ant-..."
   # Or use the standard naming: PROVIDER_API_KEY="sk-ant-..."

   # Security secrets (use random strings for local development)
   SESSION_SECRET="changeme_in_production"
   JWT_SECRET="devsecret_change_in_production"
   ```

3. **Optional** variables:

   ```bash
   # Override API base URL (defaults to http://localhost:3000)
   API_BASE_URL=http://localhost:3000

   # Cache location (defaults to /tmp, use ./cache to keep in project)
   DEV_CACHE_DIR=./cache
   ```

### 5. Run the Server

```bash
npm run start-local
```

The server will start on `http://localhost:3000`.

### 6. Validate Your Setup

Run the token validation script to ensure your PATs are configured correctly:

```bash
npm run validate-pat-tokens
```

**What it checks:**

- **Atlassian:** Authentication, project access (PLAY), issue creation permissions
- **Figma:** Basic authentication, optional E2E test file access

### 7. Try the API Scripts

The API scripts provide a quick way to test your setup and use the main features:

```bash
# 1. Analyze feature scope from Figma designs
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123

# 2. Generate shell stories from scope analysis
node --import ./loader.mjs scripts/api/write-shell-stories.ts https://bitovi.atlassian.net/browse/PLAY-123

# 3. Write the next story (run iteratively to create all stories)
node --import ./loader.mjs scripts/api/write-next-story.ts https://bitovi.atlassian.net/browse/PLAY-123
```

**Typical workflow:** Run the commands in order, using a real Jira epic URL from your workspace.

For detailed options and examples, see: [`scripts/api/readme.md`](scripts/api/readme.md)

---

## Setup for MCP Clients

**Complete this section after [API Client Setup](#setup-for-api-clients)** to add full MCP protocol integration.

This setup configures OAuth 2.0 authentication for MCP (Model Context Protocol) integration, enabling use with MCP clients like VS Code Copilot, Claude Desktop, and other MCP-compatible tools.

### 1. Create an Atlassian OAuth App

You must register a new OAuth 2.0 (3LO) app in the Atlassian Developer Console to obtain credentials for MCP integration.

**Steps:**

1. Go to the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2. Click **Create app** > **OAuth 2.0 integration**.
3. Enter an app name (e.g., `Cascade MCP - Atlassian Local`).
4. Set the **Redirect URL** to:
   - `http://localhost:3000/auth/callback/atlassian`
5. Add the following **OAuth scopes**:
   - `read:jira-work`
   - `write:jira-work`
   - `offline_access`
6. Save the app and copy the **Client ID** and **Client Secret**.

### 2. Create a Figma OAuth App

You must register a new OAuth app in Figma to obtain credentials for MCP integration.

**Steps:**

1. Go to [Figma Developer Settings](https://www.figma.com/developers/apps).
2. Click **Create new app**.
3. Enter an app name (e.g., `Cascade MCP - Figma Local`).
4. Set the **Callback URL** to:
   - `http://localhost:3000/auth/callback/figma`
5. Configure the following OAuth scopes:
   - `file_content:read`
   - `file_metadata:read`
   - `file_comments:read`
   - `current_user:read`
6. Save the app and copy the **Client ID** and **Client Secret**.

### 3. Create a Google OAuth App (Optional)

If you want to use Google Drive integration, you'll need to create OAuth credentials in Google Cloud Console.

**Steps:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one:
   - Click the project dropdown in the top navigation bar
   - Click **New Project**
   - Enter a project name (e.g., `Cascade MCP Local`)
   - Click **Create**
3. Enable the Google Drive API:
   - In the left sidebar, navigate to **APIs & Services** > **Library**
   - Search for "Google Drive API"
   - Click on **Google Drive API** in the results
   - Click **Enable**
4. Create OAuth 2.0 credentials:
   - Navigate to **APIs & Services** > **Credentials**
   - Click **Create Credentials** > **OAuth client ID**
   - If prompted to configure OAuth consent screen:
     - Select **External** user type
     - Fill in required fields (App name, User support email, Developer contact)
     - Add test users if needed for local development
     - Save and continue through all steps
   - Back on **Create OAuth client ID** screen:
     - Select **Application type**: **Web application**
     - **Name**: `Cascade MCP - Google Drive Local`
     - Under **Authorized redirect URIs**, click **Add URI** and enter:
       - `http://localhost:3000/auth/callback/google`
     - Click **Create**
5. Note your `Client ID` and `Client Secret` from the confirmation dialog

### 4. Configure Google Encryption Keys (Optional - For REST API Testing)

If you want to test REST API endpoints that accept encrypted Google service account credentials (e.g., testing `/api/write-shell-stories` with Google Docs context):

1. **Generate encryption keys and encrypt credentials:**

   See detailed instructions in [docs/encryption-setup.md](docs/encryption-setup.md) and [docs/google-drive-setup.md](docs/google-drive-setup.md)

2. **Add to `.env` for REST API testing:**

   ```bash
   # RSA encryption keys (required to use /google-service-encrypt endpoint)
   RSA_PUBLIC_KEY="LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K..."
   RSA_PRIVATE_KEY="LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1J..."
   
   # Encrypted service account (optional - only for local testing)
   GOOGLE_SERVICE_ACCOUNT_ENCRYPTED="RSA-ENCRYPTED:eyJh..."
   ```

**Note:** The `GOOGLE_SERVICE_ACCOUNT_ENCRYPTED` environment variable is used by local development scripts (`scripts/api/`) and E2E test helpers as a convenience. In production, users pass encrypted credentials via `X-Google-Token` header in API requests, not as deployment configuration.

### 5. Configure Environment Variables

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Fill in the following **required** variables in your `.env` file:

   **Atlassian/Jira OAuth** (from Step 1):

   - `VITE_JIRA_CLIENT_ID` - Your Atlassian OAuth Client ID
   - `JIRA_CLIENT_SECRET` - Your Atlassian OAuth Client Secret
   - `VITE_JIRA_CALLBACK_URL` - Must be `http://localhost:3000/auth/callback/atlassian`
   - `VITE_JIRA_SCOPE` - Should be `"read:jira-work write:jira-work offline_access"`

   **Figma OAuth** (from Step 2):

   - `FIGMA_CLIENT_ID` - Your Figma OAuth Client ID
   - `FIGMA_CLIENT_SECRET` - Your Figma OAuth Client Secret
   - `FIGMA_OAUTH_SCOPES` - Should be `"file_content:read file_metadata:read file_comments:read file_comments:write current_user:read"`

   **Google Drive OAuth** (from Step 3, optional):

   - `GOOGLE_CLIENT_ID` - Your Google OAuth Client ID
   - `GOOGLE_CLIENT_SECRET` - Your Google OAuth Client Secret
   - `GOOGLE_OAUTH_SCOPES` - Should be `"https://www.googleapis.com/auth/drive"`

   **Note:** The `ANTHROPIC_API_KEY`, `SESSION_SECRET`, and `JWT_SECRET` variables were already set during API setup.

3. **Understanding Callback URLs**: The application uses provider-specific callback URLs following the pattern:

   ```text
   {BASE_URL}/auth/callback/{provider}
   ```

   - Atlassian: `http://localhost:3000/auth/callback/atlassian`
   - Figma: `http://localhost:3000/auth/callback/figma`
   - Google: `http://localhost:3000/auth/callback/google`

   These URLs **must match exactly** in your OAuth app configurations.

### 6. Restart the Server

If the server is still running from the API setup, restart it to pick up the new OAuth environment variables:

```bash
npm run start-local
```

### 7. Connect Your MCP Client

Follow the MCP client-specific instructions for connecting to `http://localhost:3000/mcp`. The OAuth flow will guide you through authentication with Atlassian and Figma.

---

## Optional Configuration

### LLM Clients

The default LLM client is Anthropic (Claude), but you can use any of the 8 supported LLM clients. See the **[LLM Provider Guide](./server/llm-client/README.md)** for complete documentation on:

- Supported LLM clients (Anthropic, OpenAI, Google, AWS Bedrock, Mistral, DeepSeek, Groq, xAI)
- Authentication methods and credential formats
- Header and environment variable naming conventions
- Multi-tenant vs single-tenant usage patterns

### Development Options

You can configure optional environment variables in your `.env` file to help with development and debugging:

- `DEV_CACHE_DIR=./cache` - Sets the cache location to within the project instead of `/tmp`, making it easier to inspect cached files and preserving them across restarts
- `TEST_SHORT_AUTH_TOKEN_EXP=60` - Forces JWT tokens to expire after 60 seconds to test token refresh flows (MCP clients only)
- `DEBUG_FIGMA_TOKEN=true` - Enables detailed logging of Figma token operations
- `CHECK_JWT_EXPIRATION=false` - Disables JWT expiration checking during development (useful for debugging MCP OAuth flows)

---

## Contributing Code

- Please follow the code style and documentation patterns in the repo.
- Update `server/readme.md` with any API or file changes.
- Open a pull request with a clear description of your changes.

---

For more details, see the main `README.md` and `server/readme.md`.
