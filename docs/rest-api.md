# REST API Documentation

## Overview

The Cascade MCP service provides REST API endpoints for generating Jira stories from Figma designs. These endpoints use Personal Access Token (PAT) authentication instead of OAuth, making them suitable for server-to-server integrations, CI/CD pipelines, and automated workflows.

## Base URL

```
https://cascade.bitovi.com  # Production
```

## Authentication

All REST API endpoints require authentication via HTTP headers:

**Required Headers:**
- `X-Atlassian-Token` - Base64-encoded `email:api_token` for Jira Basic Auth
- `X-Figma-Token` - Figma Personal Access Token
- `X-Anthropic-Token` - Anthropic API key for AI-powered story generation

**Optional Headers:**
- `X-Google-Token` - Encrypted Google service account (enables Google Docs context in epics)

**Example Headers:**
```bash
X-Atlassian-Token: eW91ci1lbWFpbEBleGFtcGxlLmNvbTpBVEFUVDN4RmZHRjA...
X-Figma-Token: figd_5L7d0...
X-Anthropic-Token: sk-ant-api03-...
X-Google-Token: RSA-ENCRYPTED:fx/3go4xa4K/...
```

### Obtaining Tokens

**Atlassian PAT:**
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a descriptive name
4. Copy the generated token (starts with `ATATT...`)
5. **Encode for REST API**: Base64-encode `your-email@example.com:ATATT...`
   - Command: `echo -n "your-email@example.com:ATATT..." | base64`
   - Or use: `Buffer.from('email:token').toString('base64')` in Node.js
   - The API uses Basic Authentication with this format
6. Required scopes:
   - Read and write Jira issues
   - Access to your Jira workspace

**Figma PAT:**
1. Go to https://www.figma.com/settings (scroll to "Personal access tokens")
2. Generate a new personal access token
3. Copy the token (starts with `figd_...`)
4. Required scopes:
   - File content - Read only
   - File comments - Read only

**Google Service Account Encrypted Credentials:**

See the [Google Service Account Encryption Guide](./google-service-account-encryption.md) for detailed instructions.


Quick setup:
1. Create service account in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google Drive API
3. Create and download JSON key
4. Share Google Drive files with the service account email
5. Encrypt your credentials at `/google-service-encrypt`
6. Use the encrypted string in the `X-Google-Token` header

**Anthropic API Key:**
1. Go to https://console.anthropic.com/settings/keys
2. Create an API key
3. Copy the key (starts with `sk-ant-...`)

## Endpoints

### Write Shell Stories

Generates prioritized shell stories from Figma designs linked in a Jira epic.

**Endpoint:** `POST /api/write-shell-stories`

**Headers:**

- `Content-Type: application/json`
- `X-Atlassian-Token` (required) - Base64-encoded `email:token` for Basic Auth
- `X-Figma-Token` (required) - Figma Personal Access Token (starts with `figd_...`)
- `X-Anthropic-Token` (required) - Anthropic API key (starts with `sk-ant-...`)
- `X-Google-Token` (optional) - Encrypted Google service account (enables Google Docs context)

**Request Body:**

```json
{
  "epicKey": "PROJ-123",
  "siteName": "my-jira-site",
  "cloudId": "uuid"
}
```

**Parameters:**
- `epicKey` (required) - The Jira epic key (e.g., "PROJ-123")
- `siteName` (optional) - Name of the Jira site to use
- `cloudId` (optional) - Atlassian cloud ID (alternative to siteName)

**Success Response (200 OK):**
```json
{
  "success": true,
  "shellStoriesContent": "## Shell Stories\n\n- `st001` **User Login** ...",
  "storyCount": 12,
  "screensAnalyzed": 8,
  "epicKey": "PROJ-123"
}
```

**Error Response (400/500):**
```json
{
  "success": false,
  "error": "Missing required field: epicKey"
}
```

**Example using curl:**
```bash
# First, create the base64-encoded token for Atlassian:
# echo -n "your-email@example.com:ATATT3xFfGF0..." | base64

curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: <base64(email:token)>" \
  -H "X-Figma-Token: figd_5L7d0..." \
  -H "X-Anthropic-Token: sk-ant-api03-..." \
  -d '{
    "epicKey": "PROJ-123",
    "siteName": "my-jira-site"
  }'
```

**Example using Node.js:**
```javascript
// Create base64-encoded Atlassian token
const atlassianToken = Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_PAT}`
).toString('base64');

const response = await fetch('http://localhost:3000/api/write-shell-stories', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Atlassian-Token': atlassianToken,
    'X-Figma-Token': process.env.FIGMA_PAT,
    'X-Anthropic-Token': process.env.ANTHROPIC_API_KEY,
  },
  body: JSON.stringify({
    epicKey: 'PROJ-123',
    siteName: 'my-jira-site',
  }),
});

const result = await response.json();
console.log(`Generated ${result.storyCount} shell stories`);
```

---

### Write Next Story

Writes the next Jira story from shell stories in an epic. Validates dependencies, generates full story content, creates Jira issue, and updates epic with completion marker.

**Endpoint:** `POST /api/write-next-story`

**Headers:**

- `Content-Type: application/json`
- `X-Atlassian-Token` (required) - Base64-encoded `email:token` for Basic Auth
- `X-Figma-Token` (required) - Figma Personal Access Token (starts with `figd_...`)
- `X-Anthropic-Token` (required) - Anthropic API key (starts with `sk-ant-...`)
- `X-Google-Token` (optional) - Encrypted Google service account (enables Google Docs context)

**Request Body:**

```json
{
  "epicKey": "PROJ-123",
  "siteName": "my-jira-site",
  "cloudId": "uuid"
}
```

**Parameters:**
- `epicKey` (required) - The Jira epic key (e.g., "PROJ-123")
- `siteName` (optional) - Name of the Jira site to use
- `cloudId` (optional) - Atlassian cloud ID (alternative to siteName)

**Success Response (200 OK):**
```json
{
  "success": true,
  "issueKey": "PROJ-124",
  "issueSelf": "https://bitovi.atlassian.net/rest/api/3/issue/12345",
  "storyTitle": "User can login with email",
  "epicKey": "PROJ-123"
}
```

**All Stories Complete (200 OK):**
```json
{
  "success": true,
  "complete": true,
  "message": "All stories in epic PROJ-123 have been written! 🎉\n\nTotal stories: 12"
}
```

**Dependency Error (400 Bad Request):**
```json
{
  "success": false,
  "error": "Dependency not satisfied",
  "message": "Dependency st002 must be written before st003.\n\nPlease write story st002 first."
}
```

**Example using curl:**
```bash
# First, create the base64-encoded token for Atlassian:
# echo -n "your-email@example.com:ATATT3xFfGF0..." | base64

curl -X POST http://localhost:3000/api/write-next-story \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: <base64(email:token)>" \
  -H "X-Figma-Token: figd_5L7d0..." \
  -H "X-Anthropic-Token: sk-ant-api03-..." \
  -d '{
    "epicKey": "PROJ-123",
    "siteName": "my-jira-site"
  }'
```

**Example Workflow (Node.js):**
```javascript
// Create base64-encoded Atlassian token
const atlassianToken = Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_PAT}`
).toString('base64');

// Prepare headers for all API calls
const headers = {
  'Content-Type': 'application/json',
  'X-Atlassian-Token': atlassianToken,
  'X-Figma-Token': process.env.FIGMA_PAT,
  'X-Anthropic-Token': process.env.ANTHROPIC_API_KEY,
};

// 1. Analyze feature scope first
const scopeResult = await fetch('http://localhost:3000/api/analyze-feature-scope', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    epicKey: 'PROJ-123',
    siteName: 'my-jira-site',
  }),
});

const scopeAnalysis = await scopeResult.json();
console.log(`Generated scope analysis with ${scopeAnalysis.featureAreaCount} feature areas`);

// 2. Review and refine scope in Jira, then generate shell stories
const shellStoriesResult = await fetch('http://localhost:3000/api/write-shell-stories', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    epicKey: 'PROJ-123',
    siteName: 'my-jira-site',
  }),
});

const shellStories = await shellStoriesResult.json();
console.log(`Generated ${shellStories.storyCount} shell stories`);

// 3. Write stories one by one until all complete
let storiesWritten = 0;
while (true) {
  const nextStoryResult = await fetch('http://localhost:3000/api/write-next-story', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      epicKey: 'PROJ-123',
      siteName: 'my-jira-site',
    }),
  });

  const result = await nextStoryResult.json();
  
  if (result.complete) {
    console.log('All stories written!');
    break;
  }
  
  if (result.success) {
    storiesWritten++;
    console.log(`Created story ${result.issueKey}: ${result.storyTitle}`);
  } else {
    console.error('Error:', result.error);
    break;
  }
}

console.log(`Total stories written: ${storiesWritten}`);
```

---

## Error Handling

All endpoints return JSON responses with appropriate HTTP status codes:

- **200 OK** - Request successful
- **400 Bad Request** - Invalid request body, missing required fields, or dependency errors
- **401 Unauthorized** - Missing or invalid authentication headers
- **500 Internal Server Error** - Server error during processing

Error responses include:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Stack trace (development only)"
}
```

**Common error messages:**
- `Missing required header: X-Atlassian-Token` (401) - Add Atlassian token header
- `Missing required header: X-Figma-Token` (401) - Add Figma token header
- `Missing required header: X-Anthropic-Token` (401) - Add Anthropic token header
- `Missing required field: epicKey` (400) - Add epicKey to request body
- `Dependency not satisfied` (400) - Story dependencies must be written first
- `Invalid authentication tokens` (401) - One or more tokens are invalid or expired

## Rate Limiting

The REST API endpoints use the same backend services as the MCP tools:

- **Anthropic API**: Subject to your Anthropic account rate limits
- **Jira API**: Subject to Atlassian rate limits (typically 10 requests/second)
- **Figma API**: Subject to Figma rate limits (varies by endpoint)

For high-volume usage, consider:
- Implementing request queuing/throttling in your client

## Security Notes

1. **Never commit tokens to version control** - Use environment variables
2. **Rotate tokens regularly** - Especially if they may have been exposed
3. **Use HTTPS in production** - The development server uses HTTP
4. **Implement request signing** - For additional security in production
5. **Monitor token usage** - Watch for unexpected API calls
6. **Validate tokens before deployment** - Run `npm run validate-pat-tokens` to verify permissions


## Troubleshooting

**"Missing required header" errors (401):**
- Ensure all three token headers are present: `X-Atlassian-Token`, `X-Figma-Token`, `X-Anthropic-Token`
- Check that headers are properly formatted (no extra quotes or whitespace)
- For Atlassian: Verify the token is base64-encoded in the format `base64(email:token)`

**"Missing required field" errors (400):**
- Ensure `epicKey` is present in the request body
- Verify the request body is valid JSON

**Figma 403 errors:**
- Verify your Figma PAT has not expired
- Check that the Figma file is accessible with your token
- Ensure the file URL in the epic description is correct

**Jira authentication errors:**
- Verify your Atlassian token is properly base64-encoded
- Check that your PAT token (ATATT...) is valid and not expired
- Confirm you have write permissions for the Jira project
- Run `npm run validate-pat-tokens` to diagnose permission issues

**Dependency errors when writing stories (400):**
- Stories must be written in dependency order
- The epic's Shell Stories section tracks which stories are complete
- Dependencies are specified in the shell story format
- The API will automatically select the next available story

## Support

For issues or questions:
- GitHub Issues: https://github.com/bitovi/cascade-mcp/issues
- Documentation: https://github.com/bitovi/cascade-mcp
