# REST API Documentation

## Overview

The Cascade MCP service provides REST API endpoints for generating Jira stories from Figma designs. These endpoints use Personal Access Token (PAT) authentication instead of OAuth, making them suitable for server-to-server integrations, CI/CD pipelines, and automated workflows.

## Base URL

```
http://localhost:3000  # Development
https://your-domain.com  # Production
```

## Authentication

All REST API endpoints require three types of tokens:

1. **Atlassian PAT** - Personal Access Token for Jira API access
2. **Figma PAT** - Personal Access Token for Figma API access  
3. **Anthropic API Key** - API key for AI-powered story generation

### Obtaining Tokens

**Atlassian PAT:**
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a descriptive name
4. Copy the generated token (starts with `ATATT...`)

**Figma PAT:**
1. Go to https://www.figma.com/developers/api#access-tokens
2. Generate a new personal access token
3. Copy the token (starts with `figd_...`)

**Anthropic API Key:**
1. Go to https://console.anthropic.com/
2. Create an API key
3. Copy the key (starts with `sk-ant-...`)

## Endpoints

### 1. Write Shell Stories

Generates prioritized shell stories from Figma designs linked in a Jira epic.

**Endpoint:** `POST /api/write-shell-stories`

**Request Body:**
```json
{
  "epicKey": "PROJ-123",
  "siteName": "my-jira-site",
  "atlassianToken": "ATATT3xFfGF0...",
  "figmaToken": "figd_5L7d0...",
  "anthropicApiKey": "sk-ant-api03-..."
}
```

**Parameters:**
- `epicKey` (required) - The Jira epic key (e.g., "PROJ-123")
- `siteName` (optional) - Name of the Jira site to use
- `cloudId` (optional) - Atlassian cloud ID (alternative to siteName)
- `sessionId` (optional) - Unique session ID for temp directory naming
- `atlassianToken` (required) - Atlassian Personal Access Token
- `figmaToken` (required) - Figma Personal Access Token
- `anthropicApiKey` (required) - Anthropic API key

**Success Response (200 OK):**
```json
{
  "success": true,
  "shellStoriesContent": "## Shell Stories\n\n- `st001` **User Login** ...",
  "storyCount": 12,
  "screensAnalyzed": 8,
  "tempDirPath": "/tmp/shell-stories-...",
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
curl -X POST http://localhost:3000/api/write-shell-stories \
  -H "Content-Type: application/json" \
  -d '{
    "epicKey": "PROJ-123",
    "siteName": "my-jira-site",
    "atlassianToken": "ATATT3xFfGF0...",
    "figmaToken": "figd_5L7d0...",
    "anthropicApiKey": "sk-ant-api03-..."
  }'
```

**Example using Node.js:**
```javascript
const response = await fetch('http://localhost:3000/api/write-shell-stories', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    epicKey: 'PROJ-123',
    siteName: 'my-jira-site',
    atlassianToken: process.env.ATLASSIAN_PAT,
    figmaToken: process.env.FIGMA_PAT,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  }),
});

const result = await response.json();
console.log(`Generated ${result.storyCount} shell stories`);
```

---

### 2. Write Next Story

Writes the next Jira story from shell stories in an epic. Validates dependencies, generates full story content, creates Jira issue, and updates epic with completion marker.

**Endpoint:** `POST /api/write-next-story`

**Request Body:**
```json
{
  "epicKey": "PROJ-123",
  "siteName": "my-jira-site",
  "atlassianToken": "ATATT3xFfGF0...",
  "figmaToken": "figd_5L7d0...",
  "anthropicApiKey": "sk-ant-api03-..."
}
```

**Parameters:** Same as write-shell-stories

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
curl -X POST http://localhost:3000/api/write-next-story \
  -H "Content-Type: application/json" \
  -d '{
    "epicKey": "PROJ-123",
    "siteName": "my-jira-site",
    "atlassianToken": "ATATT3xFfGF0...",
    "figmaToken": "figd_5L7d0...",
    "anthropicApiKey": "sk-ant-api03-..."
  }'
```

**Example Workflow (Node.js):**
```javascript
// 1. Generate shell stories first
const shellStoriesResult = await fetch('http://localhost:3000/api/write-shell-stories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    epicKey: 'PROJ-123',
    siteName: 'my-jira-site',
    atlassianToken: process.env.ATLASSIAN_PAT,
    figmaToken: process.env.FIGMA_PAT,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  }),
});

const shellStories = await shellStoriesResult.json();
console.log(`Generated ${shellStories.storyCount} shell stories`);

// 2. Write stories one by one until all complete
let storiesWritten = 0;
while (true) {
  const nextStoryResult = await fetch('http://localhost:3000/api/write-next-story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      epicKey: 'PROJ-123',
      siteName: 'my-jira-site',
      atlassianToken: process.env.ATLASSIAN_PAT,
      figmaToken: process.env.FIGMA_PAT,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
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

## Error Handling

All endpoints return JSON responses with appropriate HTTP status codes:

- **200 OK** - Request successful
- **400 Bad Request** - Invalid request body or missing required fields
- **500 Internal Server Error** - Server error during processing

Error responses include:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Stack trace (development only)"
}
```

## Rate Limiting

The REST API endpoints use the same backend services as the MCP tools:

- **Anthropic API**: Subject to your Anthropic account rate limits
- **Jira API**: Subject to Atlassian rate limits (typically 10 requests/second)
- **Figma API**: Subject to Figma rate limits (varies by endpoint)

For high-volume usage, consider:
- Implementing request queuing/throttling in your client
- Caching analysis files between runs (stored in temp directories)
- Using the `sessionId` parameter consistently to reuse cached data

## Security Notes

1. **Never commit tokens to version control** - Use environment variables
2. **Rotate tokens regularly** - Especially if they may have been exposed
3. **Use HTTPS in production** - The development server uses HTTP
4. **Implement request signing** - For additional security in production
5. **Monitor token usage** - Watch for unexpected API calls

## Troubleshooting

**"Missing required field" errors:**
- Ensure all required fields are present in the request body
- Check that tokens are properly formatted (no extra quotes or whitespace)

**Figma 403 errors:**
- Verify your Figma PAT has not expired
- Check that the Figma file is accessible with your token
- Ensure the file URL in the epic description is correct

**Jira authentication errors:**
- Verify your Atlassian PAT is valid
- Check that your token has write permissions for the project
- Confirm the site name or cloud ID is correct

**Dependency errors when writing stories:**
- Stories must be written in dependency order
- The epic's Shell Stories section tracks which stories are complete
- Dependencies are specified in the shell story format

## Support

For issues or questions:
- GitHub Issues: https://github.com/bitovi/cascade-mcp/issues
- Documentation: https://github.com/bitovi/cascade-mcp
