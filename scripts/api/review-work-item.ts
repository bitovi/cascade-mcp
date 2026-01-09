/**
 * CLI Script: Review Work Item
 * 
 * Reviews a Jira work item and posts questions as a comment
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/review-work-item.ts <jira-url>
 * 
 * Example:
 *   node --import ./loader.mjs scripts/api/review-work-item.ts https://bitovi.atlassian.net/browse/PLAY-123
 * 
 * Environment Variables Required:
 *   ATLASSIAN_TEST_PAT - Atlassian Personal Access Token
 *   ANTHROPIC_API_KEY - Anthropic API key (or other LLM provider key)
 */

import dotenv from 'dotenv';
import { createApiClient } from '../../test/e2e/helpers/api-client.js';
import { reviewWorkItem } from '../../test/e2e/helpers/api-endpoints.js';
import { parseJiraUrl } from '../../test/e2e/helpers/jira-url-parser.js';

// Load environment variables
dotenv.config();

async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Review Work Item - Identify gaps and questions in a Jira work item

Usage:
  node --import ./loader.mjs scripts/api/review-work-item.ts <jira-url>

Arguments:
  <jira-url>    Full Jira URL (e.g., https://bitovi.atlassian.net/browse/PLAY-123)

Options:
  --cloud-id <id>       Override cloud ID (optional)
  --max-depth <n>       Parent hierarchy depth (default: 5)
  --provider <name>     LLM provider (default: anthropic)
                        Options: anthropic, openai, google, bedrock, mistral, deepseek, groq, xai
  --model <id>          LLM model ID (optional, uses provider default if not specified)
  --help, -h            Show this help message

Environment Variables Required:
  ATLASSIAN_TEST_PAT         Atlassian Personal Access Token
  LLM_PROVIDER               LLM provider (default: anthropic) - optional if --provider specified
  LLM_MODEL                  LLM model ID - optional
  LLMCLIENT_{PROVIDER}_API_KEY  Provider API key (e.g., LLMCLIENT_OPENAI_API_KEY)
  API_BASE_URL               API base URL (default: http://localhost:3000)

Example:
  node --import ./loader.mjs scripts/api/review-work-item.ts https://bitovi.atlassian.net/browse/PLAY-123
  node --import ./loader.mjs scripts/api/review-work-item.ts https://bitovi.atlassian.net/browse/PLAY-123 --max-depth 3
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const jiraUrl = args[0];
  const cloudIdIndex = args.indexOf('--cloud-id');
  const cloudId = cloudIdIndex !== -1 ? args[cloudIdIndex + 1] : undefined;
  
  const maxDepthIndex = args.indexOf('--max-depth');
  const maxDepth = maxDepthIndex !== -1 ? parseInt(args[maxDepthIndex + 1], 10) : undefined;
  
  const providerIndex = args.indexOf('--provider');
  const provider = providerIndex !== -1 ? args[providerIndex + 1] : undefined;
  
  const modelIndex = args.indexOf('--model');
  const model = modelIndex !== -1 ? args[modelIndex + 1] : undefined;

  try {
    // Parse Jira URL to extract issue key and site name
    console.log('🔍 Parsing Jira URL...');
    const { ticketKey, siteName } = parseJiraUrl(jiraUrl);
    console.log(`  Issue Key: ${ticketKey}`);
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
    console.log('\n🔍 Reviewing work item...');
    console.log(`  Issue: ${ticketKey}`);
    console.log(`  Site: ${siteName}`);
    if (cloudId) {
      console.log(`  Cloud ID: ${cloudId}`);
    }
    if (maxDepth !== undefined) {
      console.log(`  Max Depth: ${maxDepth}`);
    }

    const result = await reviewWorkItem(client, {
      ticketKey,
      siteName,
      cloudId,
      maxDepth,
    });

    // Display results
    console.log('\n✅ Review Complete!\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📝 Issue:     ${result.ticketKey}`);
    console.log(`❓ Questions: ${result.questionCount}`);
    console.log(`📊 Status:    ${result.wellDefined ? 'Well-defined ✨' : 'Needs clarification'}`);
    console.log(`💬 Comment:   ${result.commentId}`);
    console.log('═══════════════════════════════════════════════════════════════');
    
    console.log('\n📋 Review Content:\n');
    console.log('───────────────────────────────────────────────────────────────');
    console.log(result.reviewContent);
    console.log('───────────────────────────────────────────────────────────────');
    
    console.log(`\n🔗 View Issue: https://${siteName}.atlassian.net/browse/${ticketKey}`);
    
    if (!result.wellDefined) {
      console.log('\n💡 Tip: Address the questions above, then re-run the review to verify improvements');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('Plain epic key')) {
      console.error('\n💡 Tip: Use the full Jira URL instead of just the issue key');
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
