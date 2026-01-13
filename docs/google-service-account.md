# Google Service Account Setup

## Overview

Google service accounts allow server-to-server authentication without user interaction. Service account credentials are JSON key files that contain a private key for signing requests to Google APIs.

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

**ONLY USE FOR:**
- ✅ Secure, trusted server-to-server integrations
- ✅ Backend services with proper access controls
- ✅ Internal automation scripts on secure infrastructure
- ✅ Testing in local development environments (with extreme caution)

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

![Enable Google Drive API](./images/google-enable-drive-api.png)

### Step 3: Create Service Account

1. Navigate to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**

![Create Service Account](./images/google-create-service-account.png)

3. Fill in details:
   - **Service account name**: `cascade-mcp-drive` (or your preferred name)
   - **Service account ID**: Auto-generated (e.g., `cascade-mcp-drive@project-id.iam.gserviceaccount.com`)
   - **Description**: "Service account for CascadeMCP Google Drive integration"

![Service Account Details](./images/google-service-account-details.png)

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

![Service Account List](./images/google-service-account-list.png)

3. Go to **Keys** tab
4. Click **Add Key** → **Create new key**

![Create Key](./images/google-create-key.png)

5. Select **JSON** format
6. Click **Create**

![Select JSON](./images/google-key-json.png)

7. **IMPORTANT**: The JSON file downloads automatically:
   - Save it securely immediately
   - Rename it to `google.json` (or your preferred name)
   - **This is your only chance to download this key**
   - If lost, you must create a new key

### Step 5: Secure the Key File

**For Development (Recommended):**

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

![Share with Service Account](./images/google-share-with-service-account.png)

**Important Notes:**
- Service accounts appear as regular users in sharing dialogs
- They cannot access files in "My Drive" unless explicitly shared
- Sharing with a service account is the ONLY way it can access files
- Service accounts cannot interact with Google Drive UI

## Testing the Service Account

### Direct Client Test

Test the service account credentials directly:

```bash
# Place google.json in project root
cp ~/secure/google.json ./google.json

# Run the test script
node --import ./loader.mjs scripts/api/drive-about-user.ts
```

**Expected Output:**
```
📂 Loading credentials from google.json...
  Service Account: cascade-mcp-drive@your-project.iam.gserviceaccount.com
  Project ID: your-project-id

🔐 Creating Google Drive client...
  Auth Type: service-account

👤 Fetching user information from Google Drive API...

✅ User Information Retrieved!

═══════════════════════════════════════════════════════════════
📧 Email:        cascade-mcp-drive@your-project.iam.gserviceaccount.com
👤 Display Name: cascade-mcp-drive
🆔 Permission ID: 12345678901234567890
🔗 Kind:         drive#user
═══════════════════════════════════════════════════════════════

💡 Tip: This service account can access files shared with:
   cascade-mcp-drive@your-project.iam.gserviceaccount.com
```

### API Endpoint Test

🚨 **PROOF OF CONCEPT ONLY - INTERNAL USE ONLY** 🚨

**This endpoint is a temporary proof of concept and will be replaced with an encrypted key mechanism shortly.**

This endpoint currently accepts **unencrypted** service account keys via HTTP headers. The server will soon encrypt these keys before transmission. Until then, this is **HIGHLY INSECURE** and should **NEVER** be used outside of:
- Internal testing only
- Isolated local development environments
- Demonstration purposes

**DO NOT:**
- ❌ Use this in any production environment
- ❌ Use this in client-facing applications
- ❌ Share this endpoint with external parties
- ❌ Rely on this endpoint for any long-term implementation
- ❌ Deploy this to any public or shared networks

**An encrypted key mechanism is coming soon to replace this temporary approach.**

**Test with curl:**
```bash
# Make sure server is running: npm run dev

curl -X POST http://localhost:3000/api/drive-about-user \
  -H "Content-Type: application/json" \
  -H "X-Google-Json: $(cat google.json)" \
  -d '{}'
```

**Test with Node.js:**
```javascript
const fs = require('fs');

const serviceAccountJson = fs.readFileSync('./google.json', 'utf-8');

const response = await fetch('http://localhost:3000/api/drive-about-user', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Google-Json': serviceAccountJson,
  },
  body: JSON.stringify({}),
});

const data = await response.json();
console.log(`User: ${data.user.displayName}`);
console.log(`Email: ${data.user.emailAddress}`);
```

## Revoking Service Account Keys

If a key is compromised or no longer needed:

### Option 1: Delete the Key

1. Go to **IAM & Admin** → **Service Accounts**
2. Click on the service account
3. Go to **Keys** tab
4. Find the key (by Key ID)
5. Click ⋮ (three dots) → **Delete**
6. Confirm deletion

![Delete Key](./images/google-delete-key.png)

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
