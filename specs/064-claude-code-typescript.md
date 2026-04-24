# 064: E2E Test — Claude Agent SDK + MCP Design Review

## Goal

Create an E2E test using the [Claude Agent SDK (TypeScript)](https://platform.claude.com/docs/en/agent-sdk/typescript) that connects to our MCP server, runs the `figma-ask-scope-questions-for-page` design review workflow, and verifies that the agent produces questions without errors.

## Background

### Claude Agent SDK

The SDK (`@anthropic-ai/claude-agent-sdk`) lets you programmatically invoke Claude Code as a library. The core API is:

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';

const q = query({
  prompt: "...",
  options: {
    mcpServers: { /* MCP server configs */ },
    allowedTools: [...],
    maxTurns: 50,
    permissionMode: 'bypassPermissions',
    // etc.
  }
});

for await (const message of q) {
  // SDKMessage — assistant, user, result, system, etc.
}
```

Key options for this test:
- **`mcpServers`** — connect to our bridge server via HTTP transport (`{ type: "http", url: "...", headers: {...} }`)
- **`allowedTools`** — auto-approve specific tools (MCP tools appear as `mcp__<server>__<tool>`)
- **`permissionMode: 'bypassPermissions'`** — skip interactive permission prompts
- **`maxTurns`** — cap agentic turns to prevent runaway loops
- **`systemPrompt`** — guide the agent to use our MCP tools and follow embedded workflow instructions

Reference example: [example-claude-code.js](https://github.com/bitovi/figma-code-connect-ai-poc/blob/luca-and-igor-experimenting-with-claude-code/example-claude-code.js)

### Design Review Workflow

The `figma-ask-scope-questions-for-page` tool is self-contained — it returns all data and workflow instructions in a single response:
1. Agent calls `figma-ask-scope-questions-for-page` tool with a Figma URL
2. Tool returns frame images, annotations, semantic XML, embedded prompt resources, and a final text block with workflow instructions
3. Agent follows the embedded workflow instructions: save data to temp, analyze each frame (optionally via subagents), synthesize scope, generate questions
4. Agent presents questions to the user

No separate MCP prompt is needed — the tool response includes everything the agent needs to complete the workflow.

The test verifies that this entire chain completes and produces questions.

### Auth Challenge

Our MCP server requires JWT Bearer authentication (OAuth PKCE flow). For E2E testing, we need to either:
- Use PAT-based auth (like the REST API tests do)
- Create a test JWT with embedded PAT tokens
- Add a test bypass mode for MCP auth

The existing REST API E2E tests (`test/e2e/api-workflow.test.ts`) use PATs via headers. The MCP path requires JWT. We need a way to create a valid JWT containing Figma PAT credentials for the test.

## Implementation Plan

### Step 1: Install `@anthropic-ai/claude-agent-sdk`

Add the SDK as a dev dependency.

```bash
npm install --save-dev @anthropic-ai/claude-agent-sdk
```

**Verification:** `npm ls @anthropic-ai/claude-agent-sdk` shows the installed version.

### Step 2: Generate Unsigned Test JWT from PAT Tokens

The MCP endpoint requires a JWT Bearer token, but `parseJWT()` in `tokens.ts` only base64-decodes the payload—it does **no cryptographic signature verification**. This means we can craft a minimal unsigned JWT in the test helper containing PAT credentials in the `AuthContext` shape.

Create a test helper function `createTestJwt(options)` that:
- Accepts PAT tokens (Figma, optionally Atlassian)
- Constructs an `AuthContext`-shaped payload: `{ figma: { access_token, refresh_token: "", expires_at: 9999999999 }, iat, exp }`
- Base64url-encodes a dummy header + the payload + empty signature into a valid JWT string
- Returns the JWT for use in `McpHttpServerConfig.headers` as `Authorization: Bearer <jwt>`

```ts
function createTestJwt(tokens: { figmaPat?: string; atlassianPat?: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    figma: tokens.figmaPat ? { access_token: tokens.figmaPat, refresh_token: '', expires_at: now + 86400 } : undefined,
    atlassian: tokens.atlassianPat ? { access_token: tokens.atlassianPat, refresh_token: '', expires_at: now + 86400 } : undefined,
    iat: now,
    exp: now + 3600,
  })).toString('base64url');
  return `${header}.${payload}.`; // Empty signature
}
```

No server changes required.

> **Note:** A proper PAT-based MCP auth path (no JWT needed) is planned in [066-pat-mcp-support.md](066-pat-mcp-support.md). Once implemented, this test can switch to using PAT headers directly.

**Verification:**
- Generate a test JWT with `createTestJwt({ figmaPat: process.env.FIGMA_TEST_PAT })`
- Start server normally (`npm run start-local`)
- `curl -X POST http://localhost:3000/mcp -H "Content-Type: application/json" -H "Authorization: Bearer <generated-jwt>" -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}'`
- Should return successful initialize response (not 401)

### Step 3: Create Test File Structure

Create the test file and helper:

```
test/e2e/
├── claude-agent-review-design.test.ts   # Main E2E test
├── helpers/
│   ├── claude-agent-helpers.ts          # SDK query setup, message parsing
│   └── ... (existing helpers)
```

**Verification:** Files exist, TypeScript compiles without errors.

### Step 4: Implement Claude Agent Helper

Create `test/e2e/helpers/claude-agent-helpers.ts` with:

1. **`createMcpServerConfig()`** — returns the `McpServerConfig` object for our bridge:
   ```ts
   {
     cascade: {
       type: "http",
       url: `http://localhost:${port}/mcp`,
       headers: { Authorization: `Bearer ${testJwt}` }
     }
   }
   ```

2. **`runDesignReviewWorkflow(figmaUrl, options?)`** — wraps the `query()` call:
   - Sets up MCP server config pointing to our test server
   - Crafts a prompt that instructs the agent to call `figma-ask-scope-questions-for-page` with the Figma URL and follow the workflow instructions in the response
   - Collects all `SDKMessage`s from the async generator
   - Returns structured result: `{ messages, result, questions, errors }`

3. **`parseQuestionsFromResult(messages)`** — extracts questions from the agent's final output:
   - Scans `SDKAssistantMessage` content for question patterns
   - Returns array of question strings
   - Validates that questions were actually generated

3. **`saveTestOutput(result, outputDir?)`** — saves the full message log and parsed questions to a timestamped JSON file in `temp/` for post-run inspection.

**Verification:** Helper compiles, types check correctly.

### Step 5: Implement the E2E Test

Create `test/e2e/claude-agent-review-design.test.ts`:

```ts
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { startTestServer, stopTestServer } from '../../specs/shared/helpers/test-server.js';

describe('Claude Agent SDK: Design Review E2E', () => {
  // Skip if missing ANTHROPIC_API_KEY or FIGMA_TEST_PAT
  
  beforeAll(async () => {
    // Start test server with PAT auth mode
    await startTestServer({ port: 3000, testMode: false });
  });
  
  afterAll(async () => {
    await stopTestServer();
  });
  
  test('runs design review and produces questions', async () => {
    const figmaUrl = process.env.FIGMA_TEST_URL;
    // 1. Create query with MCP server pointing to localhost
    // 2. Prompt: "Use the figma-ask-scope-questions-for-page tool to 
    //    analyze this Figma URL: <figmaUrl>. Follow the workflow 
    //    instructions in the tool response to analyze frames, synthesize
    //    scope, and generate questions. Present the final questions."
    // 3. Iterate messages, collect result
    // 4. Assert: no errors in SDKResultMessage
    // 5. Assert: result contains questions (parse from final text)
    // 6. Assert: num_turns > 1 (agent actually did work)
    // 7. Save output (messages + parsed questions) to temp/ for inspection
  }, 600_000); // 10 minute timeout
});
```

Key `query()` options:
- `mcpServers`: `{ cascade: { type: "http", url: "http://localhost:3000/mcp", headers: { ... } } }` — server name `cascade`
- `allowedTools`: Auto-approve all MCP tools (`mcp__cascade__figma-ask-scope-questions-for-page`, etc.) and file tools (`Read`, `Write`)
- `permissionMode`: `'bypassPermissions'` to avoid interactive prompts
- `maxTurns`: 50 (cap for safety)
- `systemPrompt`: Instruct the agent to use MCP tools and follow the workflow instructions returned by the tool
- `allowDangerouslySkipPermissions`: `true`

After the test run completes, save the full message log and parsed questions to `temp/claude-agent-review-design-<timestamp>.json` for post-run inspection. The `temp/` directory is git-ignored.

**Verification:**
- Run `ANTHROPIC_API_KEY=... FIGMA_TEST_PAT=... FIGMA_TEST_URL=... npm run test:e2e:claude-agent`
- Test passes: agent connected to MCP server, called the tool, followed workflow instructions, produced questions
- `SDKResultMessage.subtype` is `'success'`
- Parsed questions array has length > 0
- Output file written to `temp/`

### Step 6: Add npm Script

Add to `package.json`:

```json
"test:e2e:claude-agent": "jest test/e2e/claude-agent-review-design.test.ts --testTimeout=600000 --runInBand --testMatch='**/test/e2e/**/*.test.ts'"
```

**Verification:** `npm run test:e2e:claude-agent` executes the test.

### Step 7: Update Documentation

Update `server/readme.md` and `test/e2e/README.md`:
- Document the new test and required environment variables
- Document the test auth bypass mechanism
- Add the Claude Agent SDK as a listed dependency

**Verification:** Docs accurately describe the new test setup.

## Key Design Decisions

### MCP Server Name
The MCP server name in the test config is `"cascade"`. The Claude Agent SDK names MCP tools as `mcp__cascade__<toolName>`, so `allowedTools` entries follow this pattern (e.g., `mcp__cascade__figma-ask-scope-questions-for-page`).

### Auth Strategy

**Decision: Unsigned test JWT (no server changes).** Since `parseJWT()` only base64-decodes the payload without verifying signatures, the test helper crafts a minimal JWT containing PAT credentials in the `AuthContext` shape. The Claude Agent SDK sends it as a Bearer header via `McpHttpServerConfig.headers`.

A follow-up spec ([066-pat-mcp-support.md](066-pat-mcp-support.md)) will add proper PAT header support to the MCP endpoint, eliminating the need for JWT wrapping entirely.

### Prompt Strategy

The `figma-ask-scope-questions-for-page` tool is self-contained — it returns all data, embedded prompt resources, and workflow instructions in a single response. The test prompts the agent to call this tool directly with the Figma URL and follow the workflow instructions returned in the response. No separate MCP prompt discovery is needed.

### Figma URL for Testing
Read from the `FIGMA_TEST_URL` environment variable. This keeps the test flexible across different Figma files and avoids hardcoding URLs.

## Environment Variables Required

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Agent SDK | Yes |
| `FIGMA_TEST_PAT` | Figma Personal Access Token | Yes |
| `FIGMA_TEST_URL` | Figma page URL to analyze in the test | Yes |
| `ATLASSIAN_TEST_PAT` | Atlassian PAT (if testing Jira tools) | No |

## Questions

1. ~~The spec mentions "review stories prompt" — I'm interpreting this as the `prompt-figma-page-questions` workflow (design review → generate questions). Is this correct, or is there a different "review stories" workflow you have in mind?~~ **Answered:** Yes. Note: `prompt-figma-page-questions` has since been removed — the tool `figma-ask-scope-questions-for-page` (renamed from `figma-page-questions-context`) is now self-contained and includes workflow instructions directly in its response.

2. ~~For MCP authentication in the test: should we (a) generate a test JWT at test setup time using existing `tokens.ts` utilities, or (b) add a PAT-header bypass mode to the MCP endpoint for test environments?~~ **Answered:** Use unsigned test JWT (option a) for this spec — no server changes needed since `parseJWT()` doesn't verify signatures. Proper PAT support for the MCP endpoint is a separate feature spec: [066-pat-mcp-support.md](066-pat-mcp-support.md).



3. ~~Should the test actually save output (questions, analysis) to a file for inspection, or is console output + pass/fail assertion sufficient?~~ **Answered:** Save output to the git-ignored `temp/` folder for post-run inspection.

4. ~~Is the Figma URL `https://www.figma.com/design/3JgSzy4U8gdIGm1oyHiovy/TaskFlow?node-id=0-321` the right one to use for this test, or is there a simpler/smaller Figma file that would produce results faster?~~ **Answered:** Use the `FIGMA_TEST_URL` environment variable (already exists alongside `FIGMA_TEST_PAT`).

5. ~~Should we set a max budget (`maxBudgetUsd`) on the Claude Agent SDK query to prevent unexpectedly expensive test runs? If so, what's a reasonable cap (e.g., $1, $5)?~~ **Answered:** Not now; may revisit later.

6. ~~The Claude Agent SDK tool naming convention is `mcp__<serverName>__<toolName>`. What should our MCP server name be in the test config — `"cascade"`, `"cascade-mcp"`, or something else?~~ **Answered:** `cascade`. 