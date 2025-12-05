/**
 * CLI Script: Analyze Feature Scope
 * 
 * Analyzes Figma screens in a Jira epic to generate comprehensive scope analysis
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/analyze-feature-scope.ts <jira-url>
 * 
 * Example:
 *   node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123
 *   node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/TF-10 --provider bedrock --model us.anthropic.claude-sonnet-4-5-20250929-v1:0
 * 
 * Environment Variables Required:
 *   ATLASSIAN_TEST_PAT - Atlassian Personal Access Token
 *   FIGMA_TEST_PAT - Figma Personal Access Token
 *   ANTHROPIC_API_KEY - Anthropic API key
 */

import dotenv from 'dotenv';
import { createApiClient } from '../../test/e2e/helpers/api-client.js';
import { analyzeFeatureScope } from '../../test/e2e/helpers/api-endpoints.js';
import { parseJiraUrl } from '../../test/e2e/helpers/jira-url-parser.js';

// Load environment variables
dotenv.config();

async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Analyze Feature Scope - Generate comprehensive scope analysis from Figma screens

Usage:
  node --import ./loader.mjs scripts/api/analyze-feature-scope.ts <jira-url>

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
  # Use default provider (Anthropic)
  node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123
  
  # Use OpenAI with environment variable
  LLM_PROVIDER=openai node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123
  
  # Use OpenAI with command-line option
  node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123 --provider openai
  
  # Use specific model
  node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/PLAY-123 --provider openai --model gpt-4o-mini
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
    const { epicKey, siteName } = parseJiraUrl(jiraUrl);
    console.log(`  Epic Key: ${epicKey}`);
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
    console.log('\n🤖 Analyzing feature scope...');
    console.log(`  Epic: ${epicKey}`);
    console.log(`  Site: ${siteName}`);
    if (cloudId) {
      console.log(`  Cloud ID: ${cloudId}`);
    }

    const result = await analyzeFeatureScope(client, {
      epicKey,
      siteName,
      cloudId,
    });

    // Display results
    console.log('\n✅ Analysis Complete!\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📊 Feature Areas:  ${result.featureAreasCount}`);
    console.log(`❓ Questions:      ${result.questionsCount}`);
    console.log(`🖼️  Screens:        ${result.screensAnalyzed}`);
    console.log(`📂 Temp Directory: ${result.tempDirPath}`);
    console.log('═══════════════════════════════════════════════════════════════');
    
    console.log(`\n🔗 View Epic: https://${siteName}.atlassian.net/browse/${epicKey}`);
    
    console.log('\n📝 Scope Analysis Content (first 500 chars):\n');
    console.log(result.scopeAnalysisContent.substring(0, 500));
    if (result.scopeAnalysisContent.length > 500) {
      console.log(`\n... (${result.scopeAnalysisContent.length - 500} more characters)`);
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
