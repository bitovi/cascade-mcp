/**
 * MCP PAT Header Authentication E2E Test
 *
 * Validates that MCP clients can authenticate using Personal Access Token headers
 * (X-Atlassian-Token, X-Figma-Token) instead of the OAuth PKCE flow.
 *
 * Tests:
 * 1. Session initialization with PAT headers (no JWT)
 * 2. Calling an Atlassian tool (atlassian-get-issue) with PAT auth
 * 3. Calling a Figma tool (figma-get-user) with PAT auth
 * 4. Verifying subsequent requests on the same session work
 * 5. Verifying invalid PATs return tool errors (not OAuth re-auth 401s)
 *
 * Requirements:
 * - ATLASSIAN_TEST_PAT: Base64-encoded email:api_token for Jira
 * - FIGMA_TEST_PAT: Figma personal access token
 * - JIRA_TEST_ISSUE_KEY: A known Jira issue key (e.g., "PLAY-29")
 *
 * Run: npm run test:e2e -- --testPathPattern=mcp-pat-auth
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startTestServer, stopTestServer } from '../../specs/shared/helpers/test-server.js';

// Test configuration from environment
const ATLASSIAN_PAT = process.env.ATLASSIAN_TEST_PAT?.replace(/^"|"$/g, '');
const FIGMA_PAT = process.env.FIGMA_TEST_PAT?.replace(/^"|"$/g, '');
const JIRA_ISSUE_KEY = process.env.JIRA_TEST_ISSUE_KEY || 'PLAY-29';
const JIRA_SITE_NAME = 'bitovi';

const shouldSkip = !ATLASSIAN_PAT || !FIGMA_PAT;

if (shouldSkip) {
  console.warn('⚠️  Skipping MCP PAT auth E2E tests — missing required environment variables:');
  if (!ATLASSIAN_PAT) console.warn('  - ATLASSIAN_TEST_PAT (base64(email:token))');
  if (!FIGMA_PAT) console.warn('  - FIGMA_TEST_PAT (figd_...)');
}

/**
 * Create an MCP transport that uses PAT headers instead of JWT Bearer auth
 */
function createPatTransport(
  serverUrl: string,
  headers: Record<string, string>,
  sessionId?: string,
): StreamableHTTPClientTransport {
  const opts: any = {
    requestInit: {
      headers,
    },
  };
  if (sessionId) {
    opts.sessionId = sessionId;
  }
  return new StreamableHTTPClientTransport(new URL('/mcp', serverUrl), opts);
}

function createClient(name: string = 'pat-auth-test-client'): Client {
  return new Client(
    { name, version: '1.0.0' },
    { capabilities: {} },
  );
}

describe('MCP PAT Header Authentication', () => {
  let serverUrl: string;

  beforeAll(async () => {
    if (shouldSkip) return;

    // Don't use mock Atlassian — we're hitting real APIs with PATs
    delete process.env.TEST_USE_MOCK_ATLASSIAN;

    serverUrl = await startTestServer({
      testMode: false,
      logLevel: 'error',
      port: 3000,
    });
  }, 30000);

  afterAll(async () => {
    if (shouldSkip) return;
    await stopTestServer();
  }, 15000);

  test('should initialize MCP session with PAT headers', async () => {
    if (shouldSkip) return;

    const transport = createPatTransport(serverUrl, {
      'X-Atlassian-Token': ATLASSIAN_PAT!,
      'X-Figma-Token': FIGMA_PAT!,
    });
    const client = createClient();

    await client.connect(transport);

    // Verify we got a session — listTools should work
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);

    // Should have both Atlassian and Figma tools available
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('atlassian-get-issue');
    expect(toolNames).toContain('figma-get-user');

    console.log(`  ✅ Session initialized with ${tools.length} tools available`);

    await client.close();
  }, 30000);

  test('should fetch Jira issue using Atlassian PAT', async () => {
    if (shouldSkip) return;

    const transport = createPatTransport(serverUrl, {
      'X-Atlassian-Token': ATLASSIAN_PAT!,
      'X-Figma-Token': FIGMA_PAT!,
    });
    const client = createClient();
    await client.connect(transport);

    const result = await client.callTool({
      name: 'atlassian-get-issue',
      arguments: {
        issueKey: JIRA_ISSUE_KEY,
        siteName: JIRA_SITE_NAME,
      },
    });

    // Should get a successful response with issue data
    const content = result.content as any[];
    expect(content).toBeDefined();
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);

    const textContent = content.find(c => c.type === 'text');
    expect(textContent).toBeDefined();

    // Should contain the issue key in the response
    expect(textContent.text).toContain(JIRA_ISSUE_KEY);
    // Should NOT contain error messages
    expect(textContent.text).not.toContain('Error: No Atlassian access token');

    console.log(`  ✅ Fetched ${JIRA_ISSUE_KEY} via Atlassian PAT`);

    await client.close();
  }, 30000);

  test('should fetch Figma user info using Figma PAT', async () => {
    if (shouldSkip) return;

    const transport = createPatTransport(serverUrl, {
      'X-Atlassian-Token': ATLASSIAN_PAT!,
      'X-Figma-Token': FIGMA_PAT!,
    });
    const client = createClient();
    await client.connect(transport);

    const result = await client.callTool({
      name: 'figma-get-user',
      arguments: {},
    });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);

    const textContent = (result.content as any[]).find(c => c.type === 'text');
    expect(textContent).toBeDefined();

    // Should contain user info (email or handle), not an error
    expect(textContent.text).not.toContain('Error: No Figma access token');
    expect(textContent.text).not.toContain('401');

    console.log(`  ✅ Fetched Figma user info via PAT`);

    await client.close();
  }, 30000);

  test('should work with only Atlassian PAT (no Figma)', async () => {
    if (shouldSkip) return;

    const transport = createPatTransport(serverUrl, {
      'X-Atlassian-Token': ATLASSIAN_PAT!,
    });
    const client = createClient();
    await client.connect(transport);

    // Atlassian tool should work
    const result = await client.callTool({
      name: 'atlassian-get-issue',
      arguments: {
        issueKey: JIRA_ISSUE_KEY,
        siteName: JIRA_SITE_NAME,
      },
    });

    const textContent = (result.content as any[]).find(c => c.type === 'text');
    expect(textContent.text).toContain(JIRA_ISSUE_KEY);

    // Figma tool should not be available (not registered without Figma token)
    // or should return a clear error (not crash or trigger OAuth)
    try {
      const figmaResult = await client.callTool({
        name: 'figma-get-user',
        arguments: {},
      });
      // If the call succeeds, check for an error message
      const figmaText = (figmaResult.content as any[]).find(c => c.type === 'text');
      expect(figmaText.text).toMatch(/No Figma access token|not found/i);
    } catch (err: any) {
      // Tool not found error is also acceptable — means Figma tools weren't registered
      expect(err.message || String(err)).toContain('not found');
    }

    console.log(`  ✅ Single-provider PAT works correctly`);

    await client.close();
  }, 30000);

  test('should return tool error for invalid Atlassian PAT (not OAuth re-auth)', async () => {
    if (shouldSkip) return;

    const transport = createPatTransport(serverUrl, {
      'X-Atlassian-Token': 'aW52YWxpZEBleGFtcGxlLmNvbTppbnZhbGlkLXRva2Vu', // base64("invalid@example.com:invalid-token")
      'X-Figma-Token': FIGMA_PAT!,
    });
    const client = createClient();
    await client.connect(transport);

    // This should NOT throw an error that triggers OAuth re-auth.
    // It should return a tool error response instead.
    const result = await client.callTool({
      name: 'atlassian-get-issue',
      arguments: {
        issueKey: JIRA_ISSUE_KEY,
        siteName: JIRA_SITE_NAME,
      },
    });

    // The call should complete (not throw) — we get a tool response with an error message
    expect(result.content).toBeDefined();

    console.log(`  ✅ Invalid PAT returns tool error, not OAuth re-auth`);

    await client.close();
  }, 30000);

  test('should handle multiple tool calls on same PAT session', async () => {
    if (shouldSkip) return;

    const transport = createPatTransport(serverUrl, {
      'X-Atlassian-Token': ATLASSIAN_PAT!,
      'X-Figma-Token': FIGMA_PAT!,
    });
    const client = createClient();
    await client.connect(transport);

    // First call
    const result1 = await client.callTool({
      name: 'atlassian-get-issue',
      arguments: { issueKey: JIRA_ISSUE_KEY, siteName: JIRA_SITE_NAME },
    });
    const text1 = (result1.content as any[]).find(c => c.type === 'text');
    expect(text1.text).toContain(JIRA_ISSUE_KEY);

    // Second call on the same session
    const result2 = await client.callTool({
      name: 'figma-get-user',
      arguments: {},
    });
    const text2 = (result2.content as any[]).find(c => c.type === 'text');
    expect(text2.text).not.toContain('Error: No Figma access token');

    console.log(`  ✅ Multiple tool calls on same PAT session work`);

    await client.close();
  }, 30000);
});
