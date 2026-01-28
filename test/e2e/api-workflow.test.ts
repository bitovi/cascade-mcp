/**
 * REST API End-to-End Test for Write Shell Stories
 * 
 * Tests the complete flow:
 * 1. Create a Jira epic with Figma design links
 * 2. Call REST API to analyze feature scope
 * 3. Call REST API to generate shell stories
 * 4. Verify shell stories were created in epic
 * 5. Call REST API to write the next story
 * 6. Verify story was created
 * 
 * Requirements:
 * - ATLASSIAN_PAT: Personal Access Token for Jira
 * - FIGMA_PAT: Personal Access Token for Figma
 * - ANTHROPIC_API_KEY: Anthropic API key for LLM generation
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { startTestServer, stopTestServer } from '../../specs/shared/helpers/test-server.js';
import { createApiClient } from './helpers/api-client.js';
import { analyzeFeatureScope, writeShellStories, writeNextStory } from './helpers/api-endpoints.js';
import { createAtlassianClientWithPAT } from '../../server/providers/atlassian/atlassian-api-client.js';
import { createJiraIssue, getJiraIssue, deleteJiraIssue, resolveCloudId } from '../../server/providers/atlassian/atlassian-helpers.js';
import { convertMarkdownToAdf } from '../../server/providers/atlassian/markdown-converter.js';

// Test configuration from environment (using existing env var names)
const ATLASSIAN_PAT = process.env.ATLASSIAN_TEST_PAT?.replace(/^"|"/g, ''); // Remove quotes if present (base64 credentials)
const FIGMA_PAT = process.env.FIGMA_TEST_PAT?.replace(/^"|"/g, ''); // Remove quotes if present
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const JIRA_PROJECT_KEY = 'PLAY'; // Target project
const JIRA_SITE_NAME = 'bitovi'; // Jira site subdomain

// Figma design for testing (from environment or default)
const FIGMA_DESIGN_URL = process.env.FIGMA_TEST_URL || 'https://www.figma.com/design/3JgSzy4U8gdIGm1oyHiovy/TaskFlow?node-id=0-321&t=gLoyvDoklsFADvn8-0';

// Skip tests if required environment variables are not set
const shouldSkip = !ATLASSIAN_PAT || !FIGMA_PAT || !ANTHROPIC_API_KEY;

if (shouldSkip) {
  console.warn('⚠️  Skipping REST API E2E tests - missing required environment variables:');
  if (!ATLASSIAN_PAT) console.warn('  - ATLASSIAN_TEST_PAT (Atlassian PAT - base64(email:token))');
  if (!FIGMA_PAT) console.warn('  - FIGMA_TEST_PAT (Figma PAT)');
  if (!ANTHROPIC_API_KEY) console.warn('  - ANTHROPIC_API_KEY');
  console.warn('  Set these in your .env file to run the tests.');
  console.warn('  See: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token');
}

describe('REST API: Write Shell Stories E2E', () => {
  let serverUrl: string;
  let createdEpicKey: string | undefined;
  let apiClient: ReturnType<typeof createApiClient>;
  let atlassianClient: ReturnType<typeof createAtlassianClientWithPAT>;
  let cloudId: string;

  beforeAll(async () => {
    if (shouldSkip) {
      return; // Skip setup if missing env vars
    }

    console.log('🚀 Starting test server...');
    
    // This test uses REST API with PAT tokens, not OAuth flow
    // Clear mock OAuth flag that jest-setup.js sets by default
    delete process.env.TEST_USE_MOCK_ATLASSIAN;
    
    // Clear Figma cache to ensure fresh analysis (prevents screensAnalyzed: 0 from cache)
    const { getBaseCacheDir } = await import('../../server/providers/combined/tools/writing-shell-stories/temp-directory-manager.js');
    const { parseFigmaUrl } = await import('../../server/providers/figma/figma-helpers.js');
    const cachePath = await import('path');
    const fsPromises = await import('fs/promises');
    
    const urlInfo = parseFigmaUrl(FIGMA_DESIGN_URL);
    if (urlInfo?.fileKey) {
      const figmaCacheDir = cachePath.join(getBaseCacheDir(), 'figma-files', urlInfo.fileKey);
      try {
        await fsPromises.rm(figmaCacheDir, { recursive: true, force: true });
        console.log(`✅ Cleared Figma cache: ${figmaCacheDir}`);
      } catch (error: any) {
        console.log(`⚠️  Could not clear cache (may not exist): ${error.message}`);
      }
    }
    
    serverUrl = await startTestServer({ 
      testMode: false, // Not using mock OAuth
      logLevel: 'error', // Quiet logs
      port: 3000 
    });
    console.log(`✅ Test server running at ${serverUrl}`);

    // Create API client for test use
    apiClient = createApiClient({
      baseUrl: serverUrl,
      atlassianToken: ATLASSIAN_PAT!,
      figmaToken: FIGMA_PAT!,
      headers: ANTHROPIC_API_KEY ? { 'X-LLMClient-Anthropic-Api-Key': ANTHROPIC_API_KEY } : undefined,
    });

    // Create Atlassian client and resolve cloudId
    atlassianClient = createAtlassianClientWithPAT(ATLASSIAN_PAT!);
    const siteInfo = await resolveCloudId(atlassianClient, undefined, JIRA_SITE_NAME);
    cloudId = siteInfo.cloudId;
    console.log(`✅ Resolved cloudId: ${cloudId}`);
  }, 60000); // 60 second timeout for server startup + cloud ID resolution

  afterAll(async () => {
    if (shouldSkip) {
      return;
    }

    // Clean up: delete the created epic
    if (createdEpicKey) {
      try {
        console.log(`🧹 Cleaning up epic ${createdEpicKey}...`);
        await deleteJiraIssue(atlassianClient, cloudId, createdEpicKey);
        console.log(`✅ Deleted epic ${createdEpicKey}`);
      } catch (error: any) {
        console.warn(`⚠️  Error during cleanup: ${error.message}`);
      }
    }

    await stopTestServer();
    console.log('✅ Test server stopped');
  }, 30000);

  test('should create shell stories from Figma design via REST API', async () => {
    if (shouldSkip) {
      console.log('⏭️  Skipping test - missing environment variables');
      return;
    }

    // Step 1: Create a Jira epic with Figma link
    console.log('📝 Step 1: Creating test epic in Jira...');
    console.log(`   Cloud ID: ${cloudId}`);
    console.log(`   Site Name: ${JIRA_SITE_NAME}`);
    
    const epicSummary = `E2E Test Epic - ${new Date().toISOString()}`;
    const epicDescriptionMarkdown = `Test epic for REST API validation.\n\nFigma Design: ${FIGMA_DESIGN_URL}`;
    const epicDescriptionAdf = await convertMarkdownToAdf(epicDescriptionMarkdown);
    
    const createEpicResponse = await createJiraIssue(
      atlassianClient,
      cloudId,
      JIRA_PROJECT_KEY,
      epicSummary,
      epicDescriptionAdf,
      { issueTypeName: 'Epic' }
    );

    expect(createEpicResponse.ok).toBe(true);
    const epicData = await createEpicResponse.json() as { key: string };
    createdEpicKey = epicData.key;
    
    console.log(`✅ Created epic: ${createdEpicKey}`);
    console.log(`   URL: https://bitovi.atlassian.net/browse/${createdEpicKey}`);

    // Step 2: Call REST API to analyze feature scope
    console.log('🔍 Step 2: Calling analyze-feature-scope API...');
    
    const analysisResult = await analyzeFeatureScope(apiClient, {
      epicKey: createdEpicKey!,
      siteName: JIRA_SITE_NAME,
      sessionId: `e2e-test-${Date.now()}`
    });

    console.log('📋 Analysis Response:', JSON.stringify(analysisResult, null, 2));

    // Verify analysis was successful
    expect(analysisResult.success).toBe(true);
    expect(analysisResult.epicKey).toBe(createdEpicKey);
    expect(analysisResult.featureAreasCount).toBeGreaterThan(0);
    // Note: screensAnalyzed may be 0 if using cached analysis

    console.log(`✅ Analysis complete: ${analysisResult.featureAreasCount} feature areas, ${analysisResult.questionsCount} questions`);

    // Step 3: Call REST API to generate shell stories using helper
    console.log('🤖 Step 3: Calling write-shell-stories API...');
    
    const apiResult = await writeShellStories(apiClient, {
      epicKey: createdEpicKey!,
      siteName: JIRA_SITE_NAME,
      sessionId: `e2e-test-${Date.now()}`
    });

    console.log('📋 Shell Stories Response:', JSON.stringify(apiResult, null, 2));

    // Verify API call was successful
    expect(apiResult.success).toBe(true);
    expect(apiResult.epicKey).toBe(createdEpicKey);
    expect(apiResult.screensAnalyzed).toBeGreaterThan(0);
    expect(typeof apiResult.storyCount).toBe('number');
    
    // Handle different action types
    if (apiResult.action === 'proceed') {
      expect(apiResult.storyCount).toBeGreaterThan(0);
      expect(apiResult.shellStoriesContent).toBeDefined();
      console.log(`✅ API created ${apiResult.storyCount} shell stories from ${apiResult.screensAnalyzed} screens`);
    } else if (apiResult.action === 'clarify' || apiResult.action === 'regenerate') {
      expect(apiResult.storyCount).toBe(0);
      expect(apiResult.scopeAnalysisContent).toBeDefined();
      expect(apiResult.questionCount).toBeGreaterThan(0);
      console.log(`⚠️ API generated scope analysis with ${apiResult.questionCount} unanswered questions - needs clarification`);
    }

    // Step 4: Fetch the epic and verify content was added
    console.log('🔍 Step 4: Verifying epic was updated...');
    
    const getEpicResponse = await getJiraIssue(
      atlassianClient,
      cloudId,
      createdEpicKey!,
      'description'
    );

    expect(getEpicResponse.ok).toBe(true);
    const epicDetails = await getEpicResponse.json() as {
      fields: {
        description?: {
          content?: Array<any>;
        };
      };
    };
    
    // Convert ADF to text for parsing
    const descriptionContent = epicDetails.fields.description?.content || [];
    let epicText = '';
    
    function extractText(node: any): string {
      if (node.type === 'text') {
        return node.text || '';
      }
      if (node.content) {
        return node.content.map(extractText).join('');
      }
      return '';
    }
    
    for (const node of descriptionContent) {
      epicText += extractText(node) + '\n';
    }

    console.log('📄 Epic description length:', epicText.length);
    console.log('📄 First 500 chars:', epicText.substring(0, 500));

    // Verify appropriate section exists based on action type
    if (apiResult.action === 'proceed') {
      // Verify Shell Stories section exists (ADF converts ## to plain text)
      expect(epicText).toContain('Shell Stories');
      console.log('✅ Shell Stories section found in epic');
      
      // Extract shell stories (look for st001 pattern since ADF loses markdown heading markers)
      const shellStoriesMatch = epicText.match(/(Shell Stories[\s\S]+)/);
      expect(shellStoriesMatch).toBeTruthy();
      
      const shellStoriesContent = shellStoriesMatch![1];
      console.log('📋 Shell Stories section length:', shellStoriesContent.length);

      // Verify shell stories were created by checking for story IDs
      // Note: We check the API response directly since ADF-to-text conversion loses markdown formatting
      const storyIdMatches = apiResult.shellStoriesContent!.match(/`st\d+`/g);
      const storyCount = storyIdMatches ? storyIdMatches.length : 0;
      
      console.log(`✅ Found ${storyCount} shell stories in API response`);
      
      // Verify multiple stories were created
      expect(storyCount).toBeGreaterThan(1);
      expect(storyCount).toBe(apiResult.storyCount); // Should match the reported count
      
      // Verify expected content in shell stories
      expect(apiResult.shellStoriesContent).toBeTruthy();
      expect(apiResult.shellStoriesContent).toContain('st001');
    } else if (apiResult.action === 'clarify' || apiResult.action === 'regenerate') {
      // Verify Scope Analysis section exists
      expect(epicText).toContain('Scope Analysis');
      console.log('✅ Scope Analysis section found in epic');
      
      // Verify scope analysis has questions
      expect(apiResult.scopeAnalysisContent).toBeDefined();
      expect(apiResult.scopeAnalysisContent).toContain('❓');
      console.log('✅ Scope Analysis contains unanswered questions');
    }
    
    console.log('✅ Write shell stories test completed successfully!');
    
    // ==========================================
    // Step 5: Call write-next-story API to write st001 (only if we have shell stories)
    // ==========================================
    if (apiResult.action === 'proceed') {
      console.log('\n📝 Step 5: Calling write-next-story API to write st001...');
      
      const writeNextStoryResult = await writeNextStory(apiClient, {
        epicKey: createdEpicKey!,
        siteName: JIRA_SITE_NAME
      });
      
      console.log('📋 Write-next-story API Response:', JSON.stringify(writeNextStoryResult, null, 2));
      
      expect(writeNextStoryResult.success).toBe(true);
      
      if (!writeNextStoryResult.complete) {
        // TypeScript narrowing - now we know it's WriteNextStoryResultSuccess
        const successResult = writeNextStoryResult as Extract<typeof writeNextStoryResult, { complete: false }>;
        expect(successResult.issueKey).toBeTruthy();
        
        // Check that the story title contains at least one of the expected words
        const expectedWords = ['Display', 'Dashboard', 'Metrics', 'Cards'];
        const titleLower = successResult.storyTitle.toLowerCase();
        const hasExpectedWord = expectedWords.some(word => titleLower.includes(word.toLowerCase()));
        expect(hasExpectedWord).toBe(true);
        
        console.log(`✅ Created story ${successResult.issueKey}: ${successResult.storyTitle}`);
        console.log(`   View at: https://bitovi.atlassian.net/browse/${successResult.issueKey}`);
      }
    } else {
      console.log('\n⏭️ Step 5: Skipped write-next-story (need clarification first)');
    }
    
    console.log('\n🎉 E2E test completed successfully!');
  }, 600000); // 10 minute timeout for API call with LLM generation (Claude can be slow for large requests)
});
