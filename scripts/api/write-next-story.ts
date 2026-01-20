/**
 * CLI Script: Write Next Story
 *
 * Writes the next Jira story from shell stories in an epic
 *
 * Usage:
 *   node --import ./loader.mjs scripts/api/write-next-story.ts <jira-url>
 *
 * Example:
 *   node --import ./loader.mjs scripts/api/write-next-story.ts https://bitovi.atlassian.net/browse/PLAY-123
 *
 * Environment Variables Required:
 *   ATLASSIAN_TEST_PAT - Atlassian Personal Access Token
 *   FIGMA_TEST_PAT - Figma Personal Access Token
 *   ANTHROPIC_API_KEY - Anthropic API key
 */

import dotenv from 'dotenv';
import { createApiClient } from '../../test/e2e/helpers/api-client.js';
import { writeNextStory } from '../../test/e2e/helpers/api-endpoints.js';
import { parseJiraUrl } from '../../test/e2e/helpers/jira-url-parser.js';

// Load environment variables
dotenv.config();

async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Write Next Story - Create the next Jira story from shell stories

Usage:
  node --import ./loader.mjs scripts/api/write-next-story.ts <jira-url>

Arguments:
  <jira-url>    Full Jira URL (e.g., https://bitovi.atlassian.net/browse/PLAY-123)

Options:
  --cloud-id <id>       Override cloud ID (optional)
  --provider <name>     LLM provider (default: anthropic)
                        Options: anthropic, openai, google, bedrock, mistral, deepseek, groq, xai
  --model <id>          LLM model ID (optional, uses provider default if not specified)
  --help, -h            Show this help message

Environment Variables Required:
  ATLASSIAN_TEST_PAT         Atlassian Personal Access Token
  FIGMA_TEST_PAT             Figma Personal Access Token
  LLM_PROVIDER               LLM provider (default: anthropic) - optional if --provider specified
  LLM_MODEL                  LLM model ID - optional
  LLMCLIENT_{PROVIDER}_API_KEY  Provider API key (e.g., LLMCLIENT_OPENAI_API_KEY)
  API_BASE_URL               API base URL (default: http://localhost:3000)

Example:
  node --import ./loader.mjs scripts/api/write-next-story.ts https://bitovi.atlassian.net/browse/PLAY-123 --provider openai
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const jiraUrl = args[0];
  const cloudIdIndex = args.indexOf('--cloud-id');
  const cloudId = cloudIdIndex !== -1 ? args[cloudIdIndex + 1] : undefined;

  const providerIndex = args.indexOf('--provider');
  const provider = providerIndex !== -1 ? args[providerIndex + 1] : undefined;

  const modelIndex = args.indexOf('--model');
  const model = modelIndex !== -1 ? args[modelIndex + 1] : undefined;

  try {
    // Parse Jira URL to extract epic key and site name
    console.log('🔍 Parsing Jira URL...');
    const { ticketKey, siteName } = parseJiraUrl(jiraUrl);
    console.log(`  Epic Key: ${ticketKey}`);
    console.log(`  Site Name: ${siteName}`);

    // Create API client
    console.log('\n📡 Creating API client...');

    // Build headers for LLM provider if specified
    const headers: Record<string, string> = {};
    if (provider) {
      headers['X-LLM-Provider'] = provider;
      console.log(`  Provider: ${provider}`);
    }
    if (model) {
      headers['X-LLM-Model'] = model;
      console.log(`  Model: ${model}`);
    }

    const client = createApiClient({
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    console.log('  ✓ Client created');

    // Call API
    console.log('\n🤖 Writing next story...');
    console.log(`  Epic: ${ticketKey}`);
    console.log(`  Site: ${siteName}`);
    if (cloudId) {
      console.log(`  Cloud ID: ${cloudId}`);
    }

    const result = await writeNextStory(client, {
      epicKey: ticketKey,
      siteName,
      cloudId,
    });

    // Display results
    if (result.complete) {
      console.log('\n🎉 All Stories Complete!\n');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(result.message);
      console.log('═══════════════════════════════════════════════════════════════');
    } else {
      console.log('\n✅ Story Created!\n');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`📝 Issue:  ${result.issueKey}`);
      console.log(`📋 Title:  ${result.storyTitle}`);
      console.log('═══════════════════════════════════════════════════════════════');

      console.log(`\n🔗 View Story: https://${siteName}.atlassian.net/browse/${result.issueKey}`);
      console.log(`🔗 View Epic:  https://${siteName}.atlassian.net/browse/${ticketKey}`);

      console.log('\n💡 Run this command again to write the next story');
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
