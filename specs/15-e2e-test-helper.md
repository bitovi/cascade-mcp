# E2E Test Helper Implementation Plan

## Overview
Create reusable E2E test helpers and CLI scripts for testing REST API endpoints without manual request construction. This improves developer experience and ensures consistent testing patterns.

## Goals
1. Create reusable helper functions for calling REST API endpoints
2. Move existing E2E test to new test directory structure
3. Refactor existing test to use helper functions
4. Create CLI scripts for manual API testing

## Implementation Steps

### Step 1: Create Test Directory Structure

**What to do:**
- Create `/test/e2e/` directory
- Create `/test/e2e/helpers/` subdirectory

**How to verify:**
- Directories exist at root level
- Matches standard Node.js test conventions

### Step 2: Create API Client Helper

**What to do:**
Create `/test/e2e/helpers/api-client.ts` with:
- Base client configuration (URL, timeout)
- Common request method with header injection
- Token management from environment variables
- Error handling wrapper

**Key functions:**
```typescript
interface ApiClientConfig {
  baseUrl: string;
  atlassianToken: string;
  figmaToken: string;
  anthropicToken: string;
  timeout?: number;
}

class ApiClient {
  constructor(config: ApiClientConfig);
  post(endpoint: string, body: object): Promise<Response>;
}

function createApiClient(options?: Partial<ApiClientConfig>): ApiClient;
```

**How to verify:**
- Can instantiate client with defaults from environment
- Can override base URL for different environments
- Properly sets all required headers (X-Atlassian-Token, X-Figma-Token, X-Anthropic-Token)
- Returns fetch Response objects

### Step 2a: Create Jira URL Parser Utility

**What to do:**
Create `/test/e2e/helpers/jira-url-parser.ts` with:
- Parse Jira issue/epic URLs to extract epic key and site name
- Support URL format: `https://{siteName}.atlassian.net/browse/{KEY}`

**Key function:**
```typescript
interface ParsedJiraUrl {
  epicKey: string;
  siteName: string;
}

function parseJiraUrl(urlOrKey: string): ParsedJiraUrl;
```

**Patterns to handle:**
- Full URL: Extract site name from `{siteName}.atlassian.net` and epic key from `/browse/{KEY}`
- Validate epic key format (PROJECT-NUMBER)
- Throw error if URL is invalid or site name cannot be extracted

**How to verify:**
- Parses `https://bitovi.atlassian.net/browse/PLAY-123` → `{ epicKey: 'PLAY-123', siteName: 'bitovi' }`
- Parses `https://bitovi.atlassian.net/browse/PLAY-123?foo=bar` → `{ epicKey: 'PLAY-123', siteName: 'bitovi' }`
- Throws helpful error for plain epic key like `PLAY-123` (missing site name)
- Throws helpful error for invalid URLs or formats

### Step 3: Create API Endpoint Helpers

**What to do:**
Create `/test/e2e/helpers/api-endpoints.ts` with functions for each API:

```typescript
// Analyze feature scope
interface AnalyzeFeatureScopeParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
}
async function analyzeFeatureScope(
  client: ApiClient, 
  params: AnalyzeFeatureScopeParams
): Promise<AnalyzeFeatureScopeResult>;

// Write shell stories
interface WriteShellStoriesParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
  sessionId?: string;
}
async function writeShellStories(
  client: ApiClient,
  params: WriteShellStoriesParams
): Promise<WriteShellStoriesResult>;

// Write next story
interface WriteNextStoryParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
}
async function writeNextStory(
  client: ApiClient,
  params: WriteNextStoryParams
): Promise<WriteNextStoryResult>;
```

**Key patterns:**
- Each helper wraps one API endpoint
- Type-safe parameters and responses
- Throw on non-200 responses with helpful error messages
- Parse JSON response
- Log request/response for debugging

**How to verify:**
- Each function makes correct POST request
- Correct endpoint path
- Body parameters match API contract
- Returns parsed JSON response
- Throws descriptive errors on failures

### Step 4: Move and Refactor Existing Test

**What to do:**
- Move `specs/support-direct-api-requests.test.js` to `/test/e2e/api-workflow.test.ts`
- Convert from JavaScript to TypeScript
- Refactor to use helper functions instead of inline fetch calls
- Keep the same test flow (create epic → write shell stories → write next story)
- Update imports to use new helpers

**Before (current pattern):**
```javascript
const apiResponse = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Atlassian-Token': ATLASSIAN_PAT,
    'X-Figma-Token': FIGMA_PAT,
    'X-Anthropic-Token': ANTHROPIC_API_KEY
  },
  body: JSON.stringify({ epicKey, cloudId })
});
```

**After (using helpers):**
```typescript
import { createApiClient } from './helpers/api-client.js';
import { writeShellStories } from './helpers/api-endpoints.js';

const client = createApiClient();
const result = await writeShellStories(client, { epicKey, cloudId });

// Keep inline Jira API calls for epic creation/deletion
const createEpicResponse = await fetch(createEpicUrl, { /* ... */ });
```

**How to verify:**
- Test still passes with same assertions
- Test uses helper functions for API calls (writeShellStories, writeNextStory, analyzeFeatureScope)
- Direct Jira API calls for test setup/teardown remain inline (createEpic, deleteEpic, getEpicDescription)
- TypeScript compilation succeeds
- Can run with `npm run test:e2e`

### Step 5: Update package.json Test Scripts

**What to do:**
Update `package.json` scripts:
- Update `test:e2e:rest-api` to point to `/test/e2e/api-workflow.test.ts`
- Add `test:e2e` script as alias
- Keep same timeout and Jest configuration

```json
{
  "scripts": {
    "test:e2e": "jest test/e2e --testTimeout=600000 --runInBand",
    "test:e2e:rest-api": "jest test/e2e/api-workflow.test.ts --testTimeout=600000 --runInBand"
  }
}
```

**How to verify:**
- `npm run test:e2e` runs all E2E tests
- `npm run test:e2e:rest-api` runs specific workflow test
- Tests can still find and import helper modules

### Step 6: Create CLI Script for analyze-feature-scope

**What to do:**
Create `/scripts/api/analyze-feature-scope.ts` with:
- Command-line argument parsing accepting Jira URL (required)
- Use Jira URL parser to extract epic key and site name
- Use same API client helper
- Pretty-print JSON response
- Error handling with exit codes

**Usage:**
```bash
# Using full Jira URL (required - provides both epic key and site name)
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123

# Advanced: Override with explicit cloud ID if needed
node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123 --cloud-id <uuid>
```

**How to verify:**
- Script connects to local server (default: http://localhost:3000)
- Accepts Jira URL from command line
- Correctly extracts epic key and site name from URL
- Makes API request using helper with siteName parameter
- Prints formatted JSON response
- Exits with 0 on success, 1 on error
- Shows helpful error messages if URL is invalid or missing

### Step 7: Create CLI Script for write-shell-stories

**What to do:**
Create `/scripts/api/write-shell-stories.ts` with:
- Command-line argument parsing accepting Jira URL (required)
- Use Jira URL parser
- Use API client helper
- Show progress indicators
- Print summary of created stories

**Usage:**
```bash
# Using full Jira URL (required - provides both epic key and site name)
node --import ./loader.mjs scripts/api/write-shell-stories.ts https://bitovi.atlassian.net/browse/PLAY-123
```

**How to verify:**
- Makes API request successfully
- Shows progress during execution
- Prints story count and screen count
- Provides link to epic in output

### Step 8: Create CLI Script for write-next-story

**What to do:**
Create `/scripts/api/write-next-story.ts` with:
- Command-line argument parsing accepting Jira URL (required)
- Use Jira URL parser
- Use API client helper
- Show which story was written
- Provide link to created Jira issue

**Usage:**
```bash
# Using full Jira URL (required - provides both epic key and site name)
node --import ./loader.mjs scripts/api/write-next-story.ts https://bitovi.atlassian.net/browse/PLAY-123
```

**How to verify:**
- Makes API request successfully
- Shows which story ID was written (e.g., st001)
- Shows created Jira issue key
- Provides link to created issue

### Step 9: Create Unified CLI Script

**What to do:**
Create `/scripts/api/cascade.ts` as unified entry point:
```bash
# All commands require full Jira URL (provides both epic key and site name)
node --import ./loader.mjs scripts/api/cascade.ts analyze https://bitovi.atlassian.net/browse/PLAY-123
node --import ./loader.mjs scripts/api/cascade.ts write-shell-stories https://bitovi.atlassian.net/browse/PLAY-123
node --import ./loader.mjs scripts/api/cascade.ts write-next-story https://bitovi.atlassian.net/browse/PLAY-123
```

**Features:**
- Subcommand routing (analyze, write-shell-stories, write-next-story)
- Shared Jira URL parsing logic
- Help text for each command showing URL requirement
- Use minimist for CLI parsing
- Consolidates individual scripts into single entry point for easier discoverability

**Note**: This unified script can coexist with individual scripts (Steps 6-8) or replace them. Individual scripts may be useful for simpler command-line experience, while unified script provides consistent interface.

**How to verify:**
- Each subcommand works correctly
- Help text displays properly (`--help`)
- Requires full Jira URL (rejects plain epic keys with helpful error)
- Arguments validated before API call
- Consistent error handling across commands

### Step 10: Update Documentation

**What to do:**
Update `/server/readme.md` or create `/test/e2e/README.md` with:
- How to run E2E tests
- Required environment variables
- How to use CLI scripts
- Examples for each endpoint

**Key sections:**
1. Environment Setup (PAT tokens, cloud IDs)
2. Running E2E Tests
3. Using CLI Scripts
4. Troubleshooting

**How to verify:**
- Documentation covers all helper functions
- Examples are copy-paste ready
- Links to Jira PAT creation guide
- Explains environment variable requirements

## Questions Answered

1. **Server URL Configuration**: Default to `http://localhost:3000` (matches PORT from `.env`)

2. **CLI Library Preference**: Use `minimist` for argument parsing

3. **Test Organization**: Keep integrated workflow test as primary E2E test

4. **Error Handling in CLI Scripts**: Fail fast - no automatic retries

5. **TypeScript vs JavaScript for Scripts**: TypeScript (`.ts`) using `node --import ./loader.mjs` pattern

6. **Jira Site Configuration**: Full Jira URL required (e.g., `https://bitovi.atlassian.net/browse/PLAY-123`) to extract both epic key and site name. Plain epic keys are not supported as they lack site information. Favors `siteName` over `cloudId` for API requests.

7. **Test Cleanup**: Enable epic deletion by default in tests

8. **Authentication Source**: PAT tokens from environment variables only