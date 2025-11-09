# REST API End-to-End Testing

This directory contains end-to-end tests for the REST API endpoints that support direct PAT (Personal Access Token) authentication.

## Test: support-direct-api-requests.test.js

Tests the complete flow of the `write-shell-stories` REST API endpoint:

1. **Creates a Jira epic** with Figma design links in the PLAY project
2. **Calls the REST API** to generate shell stories from the Figma designs
3. **Verifies** that shell stories were successfully created in the epic

### Prerequisites

You need to set up the following environment variables in your `.env` file:

#### 1. Atlassian Personal Access Token (PAT)

Create one at: https://id.atlassian.com/manage-profile/security/api-tokens

```bash
JIRA_TEST_PAT="ATATT3xFf..."
```

**Note:** 
- PATs start with "ATATT" and are used as Bearer tokens when calling `api.atlassian.com`
- The API uses `createAtlassianClientWithPAT()` which is optimized for PAT authentication
- MCP tools use `createAtlassianClient()` for OAuth tokens
- Both use Bearer token format but are created via different factory functions

**Token can be enclosed in quotes** in the `.env` file - the test strips them automatically.

**Required scopes:** The PAT needs access to:
- Read and write Jira issues
- Access to the Bitovi Jira workspace

#### 2. Figma Personal Access Token (PAT)

Create one at: https://www.figma.com/settings (scroll to "Personal access tokens")

```bash
FIGMA_TEST_PAT="figd_..."
```

**Required scopes:**
- File content - Read only

#### 3. Anthropic API Key

Get one at: https://console.anthropic.com/settings/keys

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```

#### 4. Jira Cloud ID

Your Jira site's cloud ID (usually already in your `.env`):

```bash
JIRA_TEST_CLOUD_ID=2a2bce9e-5780-4e10-a848-ee82abca0056
```

### Validating Your Tokens

Before running the tests, validate that your tokens have the correct permissions:

```bash
npm run validate-pat-tokens
```

This script will:
- ✅ Verify both PAT tokens are valid and not expired
- ✅ Check you have access to the Bitovi Jira workspace
- ✅ Confirm you have CREATE_ISSUES permission in the PLAY project
- ✅ Verify the Figma token can read file content
- ✅ Display your user info and permissions

**Common issues the validator catches:**
- Expired or invalid tokens
- Missing project permissions
- Wrong cloud ID
- Insufficient scopes

### Running the Test

```bash
# Run the E2E test
npm run test:e2e:rest-api
```

The test will:
- ✅ Start the local server
- ✅ Create a test epic in the PLAY project
- ✅ Call `/api/write-shell-stories` with the epic key
- ✅ Verify shell stories were generated
- ✅ Parse and validate the shell stories structure
- ✅ Clean up by deleting the test epic

**Expected duration:** ~2-3 minutes (includes AI generation)

### What Gets Tested

The test validates:

1. **API Authentication**: PAT tokens work correctly via headers
2. **Epic Creation**: Jira API integration works
3. **API Call Success**: Returns 200 with expected response structure
4. **Shell Stories Generation**: Multiple stories are created
5. **Story Structure**: Each story has required fields (id, title, description)
6. **Screen References**: Stories reference Figma screens
7. **Parser Compatibility**: Generated markdown can be parsed by `parseShellStories()`

### Test Output Example

```
🚀 Starting test server...
✅ Test server running at http://localhost:3000

📝 Step 1: Creating test epic in Jira...
✅ Created epic: PLAY-123
   URL: https://bitovi.atlassian.net/browse/PLAY-123

🤖 Step 2: Calling write-shell-stories API...
📋 API Response: {
  "success": true,
  "epicKey": "PLAY-123",
  "storyCount": 8,
  "screensAnalyzed": 5,
  ...
}
✅ API created 8 shell stories from 5 screens

🔍 Step 3: Verifying shell stories in epic...
✅ Found 8 shell stories
  - st001: User can view login screen
  - st002: User can enter email
  - st003: User can enter password
  ...

✅ 8 stories have screen references
🎉 E2E test completed successfully!

🧹 Cleaning up epic PLAY-123...
✅ Deleted epic PLAY-123
✅ Test server stopped
```

### Troubleshooting

**Test skips with warning about missing environment variables:**
- Check that all required environment variables are set in your `.env` file:
  - `JIRA_TEST_PAT` - Atlassian Personal Access Token
  - `FIGMA_TEST_PAT` - Figma Personal Access Token  
  - `ANTHROPIC_API_KEY` - Anthropic API key
  - `JIRA_TEST_CLOUD_ID` - Jira Cloud ID
- Run `cat .env | grep -E "(JIRA_TEST_PAT|FIGMA_TEST_PAT|ANTHROPIC_API_KEY|JIRA_TEST_CLOUD_ID)"` to verify
- Note: PAT tokens can be quoted in `.env` - the test strips quotes automatically

**API returns 401 Unauthorized:**
- Verify your PAT tokens are valid and not expired
- Atlassian PATs expire - regenerate if needed
- Figma PATs don't expire but can be revoked

**API returns 400 Bad Request:**
- Check that the epic was created successfully (look for the Jira URL in logs)
- Verify the epic has a Figma link in its description

**Test times out:**
- AI generation can take 1-2 minutes for complex designs
- Ensure you have a stable internet connection
- Check Anthropic API status

**Epic not cleaned up:**
- If the test fails before cleanup, manually delete: `https://bitovi.atlassian.net/browse/PLAY-XXX`
- Or use: `curl -X DELETE "https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/issue/{epicKey}" -H "Authorization: Bearer ${JIRA_TEST_PAT}"`

### Related Files

- **Test file**: `specs/support-direct-api-requests.test.js`
- **API handler**: `server/api/write-shell-stories.ts`
- **Core logic**: `server/providers/combined/tools/writing-shell-stories/core-logic.ts`
- **Parser**: `server/providers/combined/tools/write-next-story/shell-story-parser.ts`

### Future Enhancements

Potential additions to this test suite:

- [ ] Test `write-next-story` API endpoint
- [ ] Test error cases (invalid tokens, missing epic, etc.)
- [ ] Test with different Figma designs
- [ ] Add performance benchmarks
- [ ] Test concurrent API requests
- [ ] Add API response time assertions
