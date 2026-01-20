/**
 * CLI Script: Check Story Changes
 *
 * Checks if this story and the associanted epic diverges in information.
 *
 * Environment Variables Required:
 *   ATLASSIAN_TEST_PAT - Atlassian Personal Access Token
 *   ANTHROPIC_API_KEY - Anthropic API key
 */

import dotenv from 'dotenv';
import { createApiClient } from '../../test/e2e/helpers/api-client.js';
import { checkStoryChanges } from '../../test/e2e/helpers/api-endpoints.js';
import { parseJiraUrl } from '../../test/e2e/helpers/jira-url-parser.js';

// Load environment variables
dotenv.config();

async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Check What Changed - sumarize the story and its EPIC difference

Usage:
  node --import ./loader.mjs scripts/api/check-story-changes.ts <jira-url>

Arguments:
  <jira-url>    Full Jira URL (e.g., https://bitovi.atlassian.net/browse/PLAY-123)

Options:
  --cloud-id    Override cloud ID (optional)
  --help, -h    Show this help message

Environment Variables Required:
  ATLASSIAN_TEST_PAT Atlassian Personal Access Token
  ANTHROPIC_API_KEY  Anthropic API key
  API_BASE_URL       API base URL (default: http://localhost:3000)

Example:
  node --import ./loader.mjs scripts/api/check-story-changes.ts https://bitovi.atlassian.net/browse/PLAY-123
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const jiraUrl = args[0];
  const cloudIdIndex = args.indexOf('--cloud-id');
  const cloudId = cloudIdIndex !== -1 ? args[cloudIdIndex + 1] : undefined;

  try {
    const { ticketKey, siteName } = parseJiraUrl(jiraUrl);
    const client = createApiClient();

    const result = await checkStoryChanges(client, {
      storyKey: ticketKey,
      siteName,
      cloudId,
    });

    console.log('\n✅ Story Change Analysis Result:\n');
    console.log(result.analysis);

    console.log('\n📌 Metadata:');
    console.log(`   Parent: ${result.metadata.parentKey} | Child: ${result.metadata.childKey}`);
    if (result.metadata.tokensUsed) {
      console.log(`   Tokens: ${result.metadata.tokensUsed}`);
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);

    if (error.message.includes('Plain epic key')) {
      console.error('\n💡 Tip: Use the full Jira URL instead of just the epic key');
      console.error('   Example: https://bitovi.atlassian.net/browse/PLAY-123');
    } else if (error.message.includes('environment variable')) {
      console.error('\n💡 Tip: Make sure all required environment variables are set in your .env file');
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('\nStack trace:', error.stack);
    }

    process.exit(1);
  }
}

main();
