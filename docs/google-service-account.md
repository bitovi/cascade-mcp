# Google Service Account Setup

## Overview

Google service accounts allow server-to-server authentication without user interaction. Service account credentials are JSON key files that contain a private key for signing requests to Google APIs.

**🚨 TEMPORARY PROOF OF CONCEPT**

The `X-Google-Json` header currently accepts **unencrypted** service account JSON keys. This will be replaced with an encrypted key mechanism soon. Until then, only use for internal testing and local development.

**⚠️ CRITICAL SECURITY WARNING**

Service account keys are **EXTREMELY DANGEROUS**:
- **Keys DO NOT expire** - They remain valid until manually revoked
- **Full access** - Anyone with the key has complete access to resources shared with the service account
- **No user context** - Keys work even if you're not logged in
- **Irreversible access** - Leaked keys can be used immediately by attackers

**DO NOT:**
- ❌ Commit service account keys to version control
- ❌ Send keys via email, Slack, or insecure channels
- ❌ Store keys in client-side applications or public-facing code
- ❌ Use the X-Google-Json API header outside of secure server-to-server environments
- ❌ Share keys with untrusted parties
- ❌ Use this in any production environment

**ONLY USE FOR:**
- ✅ Internal testing and local development
- ✅ Demonstration purposes in secure environments

## Creating a Service Account

### Step 1: Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Note your project ID for reference

### Step 2: Enable Google Drive API

1. Navigate to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click **Enable**
4. Wait for enablement (~30 seconds)

### Step 3: Create Service Account

1. Navigate to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**

3. Fill in details:
   - **Service account name**: `cascade-mcp-drive` (or your preferred name)
   - **Service account ID**: Auto-generated (e.g., `cascade-mcp-drive@project-id.iam.gserviceaccount.com`)
   - **Description**: "Service account for CascadeMCP Google Drive integration"

4. Click **Create and Continue**

5. **Grant permissions** (Optional):
   - For most use cases, you can skip this step
   - Service accounts access only files explicitly shared with them
   - If needed, add roles like "Editor" or specific Drive roles

6. Click **Continue**

7. **Grant users access** (Optional):
   - Skip this step for typical use cases

8. Click **Done**

### Step 4: Create and Download Key

1. Find your newly created service account in the list
2. Click on the service account email
3. Go to **Keys** tab
4. Click **Add Key** → **Create new key**
5. Select **JSON** format
6. Click **Create**
7. **IMPORTANT**: The JSON file downloads automatically:
   - Save it securely immediately
   - Rename it to `google.json` (or your preferred name)
   - **This is your only chance to download this key**
   - If lost, you must create a new key

### Step 5: Secure the Key File

Place the key in your project root and ensure it's ignored by git:

```bash
# Move to project root
mv ~/Downloads/project-id-*.json ./google.json

# Verify .gitignore is working
git status  # google.json should NOT appear in untracked files
```

**Add to `.gitignore`** (if not already present):

```gitignore
# Google Service Account Keys
google.json
```

### Step 6: Add to Environment Variables

**For local development**, add the service account JSON to your `.env` file:

```bash
# Option 1: Reference the file path (recommended for development)
# Read the file and convert to single-line JSON
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-project-id","private_key_id":"abc123...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"cascade-mcp-drive@your-project.iam.gserviceaccount.com",...}'
```

**To convert the JSON file to a single-line string:**

```bash
# macOS/Linux
cat google.json | jq -c . | sed "s/'/'\\\\''/g"

# Or manually:
# 1. Open google.json
# 2. Copy all content
# 3. Remove all line breaks (make it one line)
# 4. Escape any single quotes if present
# 5. Wrap in single quotes
```

**For REST API usage**, you can either:
1. Use the environment variable (recommended for CLI scripts)
2. Pass directly in the `X-Google-Json` header (for programmatic access)

## Service Account JSON Structure

The downloaded JSON file contains:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "cascade-mcp-drive@your-project.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/...",
  "universe_domain": "googleapis.com"
}
```

**Key fields:**
- `type`: Must be `"service_account"`
- `project_id`: Your Google Cloud project ID
- `private_key`: RSA private key for signing JWT tokens
- `client_email`: Service account email (used to share files)

## Granting Access to Files

Service accounts can only access Google Drive files that are explicitly shared with them:

### Share a File with Service Account

1. Open Google Drive
2. Right-click on a file or folder
3. Click **Share**
4. Enter the service account email:
   ```
   cascade-mcp-drive@your-project.iam.gserviceaccount.com
   ```
5. Set permission level:
   - **Viewer**: Read-only access
   - **Commenter**: View and comment
   - **Editor**: Full edit access
6. Uncheck "Notify people" (service accounts can't receive emails)
7. Click **Share**

**Important Notes:**
- Service accounts appear as regular users in sharing dialogs
- They cannot access files in "My Drive" unless explicitly shared
- Sharing with a service account is the ONLY way it can access files
- Service accounts cannot interact with Google Drive UI

## Testing the Service Account

### Option 1: Using CLI Scripts

Test with the analyze-feature-scope or write-shell-stories CLI scripts:

```bash
# Ensure GOOGLE_SERVICE_ACCOUNT_JSON is in your .env file
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/EPIC-123

# Or set inline (for testing)
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  node --import ./loader.mjs scripts/api/write-shell-stories.ts https://bitovi.atlassian.net/browse/EPIC-123
```

### Option 2: Using the Browser MCP Client

The service account credentials can be tested using the Google Drive MCP tools through the browser-based MCP client:

1. Start the server: `npm run start-local`
2. Open http://localhost:3000
3. The server will use `GOOGLE_SERVICE_ACCOUNT_JSON` from your `.env` file

### Option 3: Using REST API

Test with curl:

```bash
# Read the service account JSON
GOOGLE_JSON=$(cat google.json | jq -c .)

curl -X POST http://localhost:3000/api/analyze-feature-scope \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: <base64-token>" \
  -H "X-Figma-Token: figd_..." \
  -H "X-Anthropic-Token: sk-ant-..." \
  -H "X-Google-Json: $GOOGLE_JSON" \
  -d '{"epicKey": "EPIC-123", "siteName": "bitovi"}'
```

### What to Expect

When working correctly, the tools will:
1. Extract Google Drive links from the Jira epic description
2. Fetch Google Docs using the service account
3. Convert docs to markdown
4. Include relevant docs as context in AI prompts
5. Use doc content to generate better stories/analysis

**Troubleshooting:**
- If no Google Docs are found, verify the epic has Google Drive links
- If access is denied, verify the service account has access to the files
- Check logs for "📄 Google Docs for analyze-feature-scope: N" messages

## Revoking Service Account Keys

If a key is compromised or no longer needed:

### Option 1: Delete the Key

1. Go to **IAM & Admin** → **Service Accounts**
2. Click on the service account
3. Go to **Keys** tab
4. Find the key (by Key ID)
5. Click ⋮ (three dots) → **Delete**
6. Confirm deletion

**Effect:** Key becomes invalid immediately and cannot be restored

### Option 2: Delete the Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Check the box next to the service account
3. Click **Delete** (trash icon)
4. Confirm deletion

**Effect:** All keys for this service account become invalid, and access to all shared files is revoked

## Related Documentation

- [REST API Documentation](./rest-api.md) - Using service accounts with REST APIs
- [Google Cloud IAM Best Practices](https://cloud.google.com/iam/docs/best-practices)
- [Google Drive API - Service Accounts](https://developers.google.com/identity/protocols/oauth2/service-account)
