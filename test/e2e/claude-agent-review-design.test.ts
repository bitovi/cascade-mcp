/**
 * E2E Test: Claude Agent SDK — Design Review Workflow
 * 
 * Uses the Claude Agent SDK to connect to our MCP server,
 * call `figma-ask-scope-questions-for-page`, and verify the full
 * workflow completes with questions produced.
 * 
 * Required environment variables:
 * - ANTHROPIC_API_KEY — Anthropic API key for Claude Agent SDK
 * - FIGMA_TEST_PAT — Figma Personal Access Token
 * - FIGMA_TEST_URL — Figma page URL to analyze
 * 
 * Run: npm run test:e2e:claude-agent
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { startTestServer, stopTestServer } from '../../specs/shared/helpers/test-server.js';
import {
  createTestJwt,
  runDesignReviewWorkflow,
  saveTestOutput,
} from './helpers/claude-agent-helpers.js';

// ============================================================================
// Configuration
// ============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FIGMA_TEST_PAT = process.env.FIGMA_TEST_PAT?.replace(/^"|"/g, '');
const FIGMA_TEST_URL = process.env.FIGMA_TEST_URL;

let shouldSkip = !ANTHROPIC_API_KEY || !FIGMA_TEST_PAT || !FIGMA_TEST_URL;

if (shouldSkip) {
  console.warn('⚠️  Skipping Claude Agent SDK E2E test — missing required environment variables:');
  if (!ANTHROPIC_API_KEY) console.warn('  - ANTHROPIC_API_KEY');
  if (!FIGMA_TEST_PAT) console.warn('  - FIGMA_TEST_PAT');
  if (!FIGMA_TEST_URL) console.warn('  - FIGMA_TEST_URL');
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Claude Agent SDK: Design Review E2E', () => {
  let serverUrl: string;
  let testJwt: string;

  beforeAll(async () => {
    if (shouldSkip) return;

    // Clear mock OAuth flag
    delete process.env.TEST_USE_MOCK_ATLASSIAN;

    // Start the MCP server
    try {
      serverUrl = await startTestServer({
        testMode: false,
        logLevel: 'error',
        port: 3000,
      });
    } catch (error) {
      shouldSkip = true;
      console.warn('⚠️  Skipping Claude Agent SDK E2E test — server failed to start:', (error as Error).message);
      return;
    }

    // Create unsigned JWT with Figma PAT
    testJwt = createTestJwt({ figmaPat: FIGMA_TEST_PAT! });

    console.log(`🧪 Test JWT created (${testJwt.length} chars)`);
    console.log(`🔗 MCP server: ${serverUrl}/mcp`);
    console.log(`🎨 Figma URL: ${FIGMA_TEST_URL}`);
  }, 60_000);

  afterAll(async () => {
    if (shouldSkip) return;
    await stopTestServer();
  }, 30_000);

  test('runs design review and produces scope questions', async () => {
    if (shouldSkip) {
      console.log('Skipped: missing env vars');
      return;
    }

    console.log('\n🚀 Starting design review workflow via Claude Agent SDK...\n');

    const result = await runDesignReviewWorkflow(FIGMA_TEST_URL!, {
      serverUrl,
      testJwt,
      maxTurns: 50,
    });

    // Save output for inspection regardless of pass/fail
    const outputPath = saveTestOutput(result);
    console.log(`\n📊 Results:`);
    console.log(`  Turns: ${result.numTurns}`);
    console.log(`  Cost: $${result.totalCostUsd.toFixed(4)}`);
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log(`  Questions found: ${result.questions.length}`);
    console.log(`  Errors: ${result.errors.length}`);

    if (result.questions.length > 0) {
      console.log('\n📝 Questions generated:');
      result.questions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
    }

    // Assertions
    // 1. The workflow should complete successfully
    expect(result.resultMessage).not.toBeNull();
    expect(result.resultMessage?.subtype).toBe('success');

    // 2. No errors in the result
    expect(result.errors.length).toBe(0);

    // 3. Agent did meaningful work (more than 1 turn)
    expect(result.numTurns).toBeGreaterThan(1);

    // 4. Questions were generated
    expect(result.questions.length).toBeGreaterThan(0);

    console.log('\n✅ Design review workflow completed successfully!');
  }, 600_000); // 10 minute timeout
});
