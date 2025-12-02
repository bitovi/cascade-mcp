/**
 * REST API End-to-End Test for Write Shell Stories
 * 
 * Tests the complete flow:
 * 1. Create a Jira epic with Figma design links
 * 2. Call REST API to generate shell stories
 * 3. Verify shell stories were created in epic
 * 4. Call REST API to write the next story
 * 5. Verify story was created
 * 
 * Requirements:
 * - ATLASSIAN_PAT: Personal Access Token for Jira
 * - FIGMA_PAT: Personal Access Token for Figma
 * - ANTHROPIC_API_KEY: Anthropic API key for LLM generation
 * - JIRA_TEST_CLOUD_ID: Cloud ID for Jira site
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { startTestServer, stopTestServer } from '../../specs/shared/helpers/test-server.js';
import { createApiClient } from './helpers/api-client.js';
import { writeShellStories, writeNextStory } from './helpers/api-endpoints.js';

// Test configuration from environment (using existing env var names)
const ATLASSIAN_PAT = process.env.ATLASSIAN_TEST_PAT?.replace(/^"|"/g, ''); // Remove quotes if present (base64 credentials)
const FIGMA_PAT = process.env.FIGMA_TEST_PAT?.replace(/^"|"/g, ''); // Remove quotes if present
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const JIRA_CLOUD_ID = process.env.JIRA_TEST_CLOUD_ID;
const JIRA_PROJECT_KEY = 'PLAY'; // Target project

// Figma design for testing
const FIGMA_DESIGN_URL = 'https://www.figma.com/design/3JgSzy4U8gdIGm1oyHiovy/TaskFlow?node-id=0-321&t=gLoyvDoklsFADvn8-0';

// Skip tests if required environment variables are not set
const shouldSkip = !ATLASSIAN_PAT || !FIGMA_PAT || !ANTHROPIC_API_KEY || !JIRA_CLOUD_ID;

if (shouldSkip) {
  console.warn('⚠️  Skipping REST API E2E tests - missing required environment variables:');
  if (!ATLASSIAN_PAT) console.warn('  - ATLASSIAN_TEST_PAT (Atlassian PAT - base64(email:token))');
  if (!FIGMA_PAT) console.warn('  - FIGMA_TEST_PAT (Figma PAT)');
  if (!ANTHROPIC_API_KEY) console.warn('  - ANTHROPIC_API_KEY');
  if (!JIRA_CLOUD_ID) console.warn('  - JIRA_TEST_CLOUD_ID');
  console.warn('  Set these in your .env file to run the tests.');
  console.warn('  See: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token');
}

describe('REST API: Write Shell Stories E2E', () => {
  let serverUrl: string;
  let createdEpicKey: string | undefined;
  let apiClient: ReturnType<typeof createApiClient>;

  beforeAll(async () => {
    if (shouldSkip) {
      return; // Skip setup if missing env vars
    }

    console.log('🚀 Starting test server...');
    serverUrl = await startTestServer({ 
      testMode: true, 
      logLevel: 'info',
      port: 3000 
    });
    console.log(`✅ Test server running at ${serverUrl}`);

    // Create API client for test use
    apiClient = createApiClient({
      baseUrl: serverUrl,
      atlassianToken: ATLASSIAN_PAT!,
      figmaToken: FIGMA_PAT!,
      anthropicToken: ANTHROPIC_API_KEY!,
    });
  }, 30000);

  afterAll(async () => {
    if (shouldSkip) {
      return;
    }

    // Clean up: delete the created epic
    if (createdEpicKey) {
      try {
        console.log(`🧹 Cleaning up epic ${createdEpicKey}...`);
        const deleteUrl = `https://bitovi.atlassian.net/rest/api/3/issue/${createdEpicKey}`;
        const deleteResponse = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${ATLASSIAN_PAT}`,
            'Accept': 'application/json'
          }
        });
        
        if (deleteResponse.ok) {
          console.log(`✅ Deleted epic ${createdEpicKey}`);
        } else {
          console.warn(`⚠️  Failed to delete epic: ${deleteResponse.status}`);
        }
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
    console.log(`   Using Atlassian PAT: ${ATLASSIAN_PAT?.substring(0, 15)}...${ATLASSIAN_PAT?.substring(ATLASSIAN_PAT.length - 5)} (length: ${ATLASSIAN_PAT?.length})`);
    console.log(`   Cloud ID: ${JIRA_CLOUD_ID}`);
    
    const epicSummary = `E2E Test Epic - ${new Date().toISOString()}`;
    const epicDescription = `Test epic for REST API validation.\n\nFigma Design: ${FIGMA_DESIGN_URL}`;
    
    // Atlassian PATs use Basic Authentication with direct site URL (not api.atlassian.com)
    // ATLASSIAN_PAT is already base64-encoded (email:token)
    const createEpicUrl = `https://bitovi.atlassian.net/rest/api/3/issue`;
    console.log(`   API URL: ${createEpicUrl}`);
    
    const createEpicResponse = await fetch(createEpicUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${ATLASSIAN_PAT}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          project: {
            key: JIRA_PROJECT_KEY
          },
          summary: epicSummary,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: epicDescription
                  }
                ]
              }
            ]
          },
          issuetype: {
            name: 'Epic'
          }
        }
      })
    });

    if (!createEpicResponse.ok) {
      const errorText = await createEpicResponse.text();
      console.error(`❌ Failed to create epic: ${createEpicResponse.status} ${createEpicResponse.statusText}`);
      console.error(`   Response: ${errorText}`);
      throw new Error(`Failed to create epic: ${createEpicResponse.status} - ${errorText}`);
    }

    expect(createEpicResponse.ok).toBe(true);
    const epicData = await createEpicResponse.json() as { key: string };
    createdEpicKey = epicData.key;
    
    console.log(`✅ Created epic: ${createdEpicKey}`);
    console.log(`   URL: https://bitovi.atlassian.net/browse/${createdEpicKey}`);

    // Step 2: Call REST API to generate shell stories using helper
    console.log('🤖 Step 2: Calling write-shell-stories API...');
    
    const apiResult = await writeShellStories(apiClient, {
      epicKey: createdEpicKey!,
      cloudId: JIRA_CLOUD_ID,
      sessionId: `e2e-test-${Date.now()}`
    });

    console.log('📋 API Response:', JSON.stringify(apiResult, null, 2));

    // Verify API call was successful
    expect(apiResult.success).toBe(true);
    expect(apiResult.epicKey).toBe(createdEpicKey);
    expect(apiResult.storyCount).toBeGreaterThan(0);
    expect(apiResult.screensAnalyzed).toBeGreaterThan(0);

    console.log(`✅ API created ${apiResult.storyCount} shell stories from ${apiResult.screensAnalyzed} screens`);

    // Step 3: Fetch the epic and verify shell stories were created
    console.log('🔍 Step 3: Verifying shell stories in epic...');
    
    const getEpicUrl = `https://bitovi.atlassian.net/rest/api/3/issue/${createdEpicKey}?fields=description`;
    const getEpicResponse = await fetch(getEpicUrl, {
      headers: {
        'Authorization': `Basic ${ATLASSIAN_PAT}`,
        'Accept': 'application/json'
      }
    });

    expect(getEpicResponse.ok).toBe(true);
    const epicDetails = await getEpicResponse.json() as { fields: { description?: { content?: any[] } } };
    
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

    // Verify Shell Stories section exists (ADF converts ## to plain text)
    expect(epicText).toContain('Shell Stories');
    expect(epicText).toContain('Final Prioritized Stories');
    
    // Extract shell stories (look for st001 pattern since ADF loses markdown heading markers)
    const shellStoriesMatch = epicText.match(/(Final Prioritized Stories[\s\S]+)/);
    expect(shellStoriesMatch).toBeTruthy();
    
    const shellStoriesContent = shellStoriesMatch![1];
    console.log('📋 Shell Stories section length:', shellStoriesContent.length);

    // Verify shell stories were created by checking for story IDs
    // Note: We check the API response directly since ADF-to-text conversion loses markdown formatting
    const storyIdMatches = apiResult.shellStoriesContent.match(/`st\d+`/g);
    const storyCount = storyIdMatches ? storyIdMatches.length : 0;
    
    console.log(`✅ Found ${storyCount} shell stories in API response`);
    
    // Verify multiple stories were created
    expect(storyCount).toBeGreaterThan(1);
    expect(storyCount).toBe(apiResult.storyCount); // Should match the reported count
    
    // Verify expected content in shell stories
    expect(apiResult.shellStoriesContent).toBeTruthy();
    expect(apiResult.shellStoriesContent).toContain('st001');
    expect(apiResult.shellStoriesContent).toContain('Final Prioritized Stories');
    
    // Verify the epic was updated with shell stories
    expect(epicText).toContain('Shell Stories');
    expect(epicText).toContain('st001');
    
    console.log('✅ Shell stories test completed successfully!');
    
    // ==========================================
    // Step 4: Call write-next-story API to write st001 using helper
    // ==========================================
    console.log('\n📝 Step 4: Calling write-next-story API to write st001...');
    
    const writeNextStoryResult = await writeNextStory(apiClient, {
      epicKey: createdEpicKey!,
      cloudId: JIRA_CLOUD_ID
    });
    
    console.log('📋 Write-next-story API Response:', JSON.stringify(writeNextStoryResult, null, 2));
    
    expect(writeNextStoryResult.success).toBe(true);
    
    if (!writeNextStoryResult.complete) {
      expect(writeNextStoryResult.issueKey).toBeTruthy();
      expect(writeNextStoryResult.storyTitle).toBe('Display Core Dashboard Metrics');
      
      console.log(`✅ Created story ${writeNextStoryResult.issueKey}: ${writeNextStoryResult.storyTitle}`);
      console.log(`   View at: https://bitovi.atlassian.net/browse/${writeNextStoryResult.issueKey}`);
    }
    
    console.log('\n🎉 E2E test completed successfully!');
  }, 600000); // 10 minute timeout for API call with LLM generation (Claude can be slow for large requests)
});
