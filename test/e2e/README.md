# E2E Testing for REST API

This directory contains end-to-end tests and helper utilities for testing the Cascade REST API.

## Directory Structure

```
test/e2e/
├── helpers/
│   ├── api-client.ts       # API client with token management
│   ├── api-endpoints.ts    # Type-safe wrappers for each endpoint
│   └── jira-url-parser.ts  # Parse Jira URLs to extract epic key and site name
└── api-workflow.test.ts    # E2E test for complete API workflow
```

## Environment Setup

Required environment variables (set in your `.env` file):

```bash
# Atlassian PAT (Personal Access Token)
# Base64-encoded format: base64(email:token)
# See: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token
ATLASSIAN_TEST_PAT="<base64-encoded-credentials>"

# Figma PAT (Personal Access Token)
FIGMA_TEST_PAT="figd_..."

# Anthropic API Key
ANTHROPIC_API_KEY="sk-..."

# Optional: API Base URL (defaults to http://localhost:3000)
API_BASE_URL="http://localhost:3000"
```

## Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific workflow test
npm run test:e2e:rest-api
```

## Using Helper Functions

The helper functions can be used in tests or CLI scripts:

### API Client

```typescript
import { createApiClient } from './helpers/api-client.js';

// Create client with defaults from environment
const client = createApiClient();

// Or override specific settings
const client = createApiClient({
  baseUrl: 'http://localhost:4000',
  atlassianToken: 'custom-token',
  // ... other options
});
```

### API Endpoints

```typescript
import { analyzeFeatureScope, writeShellStories, writeNextStory } from './helpers/api-endpoints.js';

// Analyze feature scope
const result = await analyzeFeatureScope(client, {
  epicKey: 'PLAY-123',
  siteName: 'bitovi',
});

// Write shell stories
const result = await writeShellStories(client, {
  epicKey: 'PLAY-123',
  siteName: 'bitovi',
});

// Write next story
const result = await writeNextStory(client, {
  epicKey: 'PLAY-123',
  siteName: 'bitovi',
});
```

### Jira URL Parser

```typescript
import { parseJiraUrl } from './helpers/jira-url-parser.js';

// Parse full Jira URL
const { ticketKey, siteName } = parseJiraUrl('https://bitovi.atlassian.net/browse/PLAY-123');
// Returns: { ticketKey: 'PLAY-123', siteName: 'bitovi' }
```

## CLI Scripts

For manual testing, use the CLI scripts in `/scripts/api/`:

### Individual Scripts

```bash
# Analyze feature scope
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123

# Write shell stories
node --import ./loader.mjs scripts/api/write-shell-stories.ts https://bitovi.atlassian.net/browse/PLAY-123

# Write next story
node --import ./loader.mjs scripts/api/write-next-story.ts https://bitovi.atlassian.net/browse/PLAY-123
```

### Unified CLI

```bash
# Analyze feature scope
node --import ./loader.mjs scripts/api/cascade.ts analyze https://bitovi.atlassian.net/browse/PLAY-123

# Write shell stories
node --import ./loader.mjs scripts/api/cascade.ts write-shell-stories https://bitovi.atlassian.net/browse/PLAY-123

# Write next story
node --import ./loader.mjs scripts/api/cascade.ts write-next-story https://bitovi.atlassian.net/browse/PLAY-123
```

All CLI scripts support `--help` flag for detailed usage information.

## Test Workflow

The E2E test (`api-workflow.test.ts`) validates the complete workflow:

1. **Create Epic** - Creates a test epic in Jira with Figma design links
2. **Write Shell Stories** - Calls API to generate shell stories from Figma designs
3. **Verify Shell Stories** - Confirms shell stories were created in epic description
4. **Write Next Story** - Calls API to create first Jira issue from shell stories
5. **Cleanup** - Deletes test epic (configurable)

## Troubleshooting

### Missing Environment Variables

If tests fail with environment variable errors:

1. Check that your `.env` file exists in the project root
2. Verify all required variables are set
3. Ensure `ATLASSIAN_TEST_PAT` is base64-encoded format: `base64(email:token)`

### Authentication Errors

If API calls return 401 errors:

1. Verify your Atlassian PAT is valid and not expired
2. Check that the PAT has required permissions (read/write issues)
3. Confirm Figma PAT has access to the design files

### API Timeouts

The tests use a 10-minute timeout for LLM operations. If tests timeout:

1. Check that the API server is running (`npm run start-local`)
2. Verify network connectivity to external APIs (Anthropic, Figma, Jira)
3. Check server logs for errors

### Invalid Jira URLs

CLI scripts require full Jira URLs, not just epic keys:

❌ Bad: `PLAY-123`
✅ Good: `https://bitovi.atlassian.net/browse/PLAY-123`

The full URL is required to extract both the epic key and site name.

## Related Documentation

- [Server README](../../server/readme.md) - API endpoint documentation
- [REST API Documentation](../../docs/rest-api.md) - API specifications
- [Jira PAT Guide](https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token) - Creating Atlassian tokens
