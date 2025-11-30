#!/usr/bin/env node
/**
 * PAT Token Validation Script
 * 
 * Validates that the Atlassian, Figma, and Anthropic tokens in your .env file
 * are valid for API access and optionally checks E2E test permissions.
 * 
 * Two levels of validation:
 * 1. Basic validation - Verifies tokens are valid for general API usage
 * 2. E2E validation - Checks access to specific test resources (optional)
 * 
 * Run: npm run validate-pat-tokens
 * 
 * See: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token
 */

import https from 'https';
import { createLLMClient } from '../server/llm-client/index.js';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const ATLASSIAN_PAT = process.env.ATLASSIAN_TEST_PAT?.replace(/^"|"/g, ''); // Pre-encoded base64(email:token)
const FIGMA_PAT = process.env.FIGMA_TEST_PAT?.replace(/^"|"/g, '');
const FIGMA_TEST_URL = process.env.FIGMA_TEST_URL || 'https://www.figma.com/design/3JgSzy4U8gdIGm1oyHiovy/TaskFlow?node-id=0-321'; // Default to TaskFlow file
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Parse Figma URL to extract file key and node ID
function parseFigmaUrl(url: string): { fileKey: string | null; nodeId: string | null } {
  const fileKeyMatch = url.match(/\/design\/([^\/\?]+)/);
  const nodeIdMatch = url.match(/node-id=([^&]+)/);
  
  return {
    fileKey: fileKeyMatch ? fileKeyMatch[1] : null,
    nodeId: nodeIdMatch ? nodeIdMatch[1] : null
  };
}

// Helper to make HTTPS requests
function httpsRequest(options: https.RequestOptions, body: string | null = null): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data); // Return raw data if not JSON
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function validateAtlassianToken(): Promise<boolean> {
  console.log('\n🔍 Validating Atlassian PAT Token...\n');

  if (!ATLASSIAN_PAT) {
    console.error('❌ ATLASSIAN_TEST_PAT not found in environment variables');
    return false;
  }

  console.log('✅ ATLASSIAN_TEST_PAT found (pre-encoded base64 credentials)');

  try {
    // Test 1: Get current user (verify authentication works)
    console.log('\n📋 Test 1: Checking authentication...');
    const user = await httpsRequest({
      hostname: 'bitovi.atlassian.net',
      path: '/rest/api/3/myself',
      method: 'GET',
      headers: {
        'Authorization': `Basic ${ATLASSIAN_PAT}`,
        'Accept': 'application/json'
      }
    });
    console.log(`✅ Authenticated as: ${user.displayName} (${user.emailAddress})`);

    // Test 2: Check project permissions
    console.log('\n📋 Test 2: Checking project permissions for PLAY...');
    const projects = await httpsRequest({
      hostname: 'bitovi.atlassian.net',
      path: '/rest/api/3/project',
      method: 'GET',
      headers: {
        'Authorization': `Basic ${ATLASSIAN_PAT}`,
        'Accept': 'application/json'
      }
    });
    const hasPlayProject = projects.some((p: any) => p.key === 'PLAY');
    if (hasPlayProject) {
      console.log('✅ Has access to PLAY project');
    } else {
      console.error('❌ No access to PLAY project');
      console.log('   Available projects:', projects.map((p: any) => p.key).join(', '));
      return false;
    }

    // Test 3: Check issue creation permissions
    console.log('\n📋 Test 3: Checking issue creation permissions...');
    const createMeta = await httpsRequest({
      hostname: 'bitovi.atlassian.net',
      path: '/rest/api/3/issue/createmeta?projectKeys=PLAY&expand=projects.issuetypes.fields',
      method: 'GET',
      headers: {
        'Authorization': `Basic ${ATLASSIAN_PAT}`,
        'Accept': 'application/json'
      }
    });
    
    if (createMeta.projects && createMeta.projects.length > 0) {
      const project = createMeta.projects[0];
      const hasEpicType = project.issuetypes.some((t: any) => t.name === 'Epic');
      const hasStoryType = project.issuetypes.some((t: any) => t.name === 'Story');
      
      if (hasEpicType && hasStoryType) {
        console.log('✅ Can create Epics and Stories in PLAY project');
      } else {
        console.error('❌ Missing required issue types:');
        if (!hasEpicType) console.error('   - Epic');
        if (!hasStoryType) console.error('   - Story');
        return false;
      }
    } else {
      console.error('❌ No create permissions for PLAY project');
      return false;
    }

    console.log('\n✅ All Atlassian validations passed!\n');
    return true;

  } catch (error: any) {
    console.error('\n❌ Atlassian validation failed:', error.message);
    return false;
  }
}

async function validateFigmaToken(): Promise<boolean> {
  console.log('\n🔍 Validating Figma PAT Token...\n');

  if (!FIGMA_PAT) {
    console.error('❌ FIGMA_TEST_PAT not found in environment variables');
    return false;
  }

  console.log('✅ FIGMA_TEST_PAT found');
  console.log(`   Token: ${FIGMA_PAT.substring(0, 10)}...${FIGMA_PAT.slice(-5)}`);

  let basicValidation = false;

  try {
    // Test 1: Basic authentication (verify token is valid for API calls)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Test 1: Checking Figma authentication (required for API access)...');
    const user = await httpsRequest({
      hostname: 'api.figma.com',
      path: '/v1/me',
      method: 'GET',
      headers: {
        'X-Figma-Token': FIGMA_PAT
      }
    });
    
    console.log(`✅ Authenticated as: ${user.email}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Handle: ${user.handle || 'N/A'}`);
    console.log('\n✅ Basic Figma validation passed - token is valid for API calls');
    basicValidation = true;

  } catch (error: any) {
    console.error(`❌ Figma authentication failed: ${error.message}`);
    console.error('\nCommon issues:');
    console.error('  - Token might be invalid or expired');
    console.error('  - Token might not have read permissions');
    return false;
  }

  // Test 2-4: E2E test-specific validation (optional)
  const { fileKey: TEST_FILE_KEY, nodeId: TEST_NODE_ID } = parseFigmaUrl(FIGMA_TEST_URL);
  
  if (!TEST_FILE_KEY) {
    console.log('\n⚠️  Could not parse FIGMA_TEST_URL - skipping E2E validation');
    console.log(`   URL: ${FIGMA_TEST_URL}`);
    console.log('\n✅ Figma validation passed for API access\n');
    return basicValidation;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Test 2: Checking E2E test file access (optional - only needed for E2E tests)...');
  console.log(`   File Key: ${TEST_FILE_KEY}`);

  try {
    const fileResponse = await httpsRequest({
      hostname: 'api.figma.com',
      path: `/v1/files/${TEST_FILE_KEY}`,
      method: 'GET',
      headers: {
        'X-Figma-Token': FIGMA_PAT
      }
    });
    
    console.log(`✅ E2E test file accessible: ${fileResponse.name}`);
    console.log(`   Last Modified: ${fileResponse.lastModified}`);

  } catch (error: any) {
    console.log(`⚠️  E2E test file not accessible: ${error.message}`);
    console.log('   (This is OK if you don\'t need to run E2E tests)');
    console.log('\n✅ Figma validation passed for API access\n');
    return basicValidation;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Test 3: Checking E2E test node access (optional)...');
  
  if (!TEST_NODE_ID) {
    console.log('   No node-id specified in FIGMA_TEST_URL - skipping node validation');
    console.log('\n✅ Figma validation passed for file access\n');
    return basicValidation;
  }
  
  console.log(`   Node ID: ${TEST_NODE_ID}`);

  try {
    const encodedNodeId = encodeURIComponent(TEST_NODE_ID);
    const nodeResponse = await httpsRequest({
      hostname: 'api.figma.com',
      path: `/v1/files/${TEST_FILE_KEY}/nodes?ids=${encodedNodeId}`,
      method: 'GET',
      headers: {
        'X-Figma-Token': FIGMA_PAT
      }
    });
    
    if (nodeResponse.nodes) {
      const nodeKeys = Object.keys(nodeResponse.nodes);
      if (nodeKeys.length > 0) {
        nodeKeys.forEach(key => {
          const node = nodeResponse.nodes[key];
          if (node.document) {
            console.log(`✅ E2E test node accessible: ${node.document.name} (${node.document.type})`);
          }
        });
      }
    }

  } catch (error: any) {
    console.log(`⚠️  E2E test node not accessible: ${error.message}`);
    console.log('   (This is OK if you don\'t need to run E2E tests)');
    console.log('\n✅ Figma validation passed for API access\n');
    return basicValidation;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Test 4: Verifying auth header format...');

  try {
    const bearerResponse = await httpsRequest({
      hostname: 'api.figma.com',
      path: '/v1/me',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FIGMA_PAT}`
      }
    });
    
    if (bearerResponse) {
      console.log('ℹ️  Bearer authorization format also works (X-Figma-Token is preferred)');
    }
  } catch (error: any) {
    console.log('ℹ️  Bearer authorization format not supported (use X-Figma-Token header)');
  }

  console.log('\n✅ Full Figma validation passed - ready for E2E tests!\n');
  return true;
}

async function validateAnthropicKey(): Promise<boolean> {
  console.log('\n🔍 Validating Anthropic API Key...\n');

  if (!ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment variables');
    return false;
  }

  console.log('✅ ANTHROPIC_API_KEY found');
  console.log(`   Key: ${ANTHROPIC_API_KEY.substring(0, 15)}...${ANTHROPIC_API_KEY.slice(-5)}`);

  try {
    console.log('\n📋 Test: Checking Anthropic API authentication...');
    
    // Use the helper to make a minimal API call
    const generateText = createLLMClient({ apiKey: ANTHROPIC_API_KEY });
    const response = await generateText({
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 10
    });
    
    console.log('✅ Anthropic API key is valid');
    console.log(`   Model: ${response.metadata?.model || 'unknown'}`);
    console.log(`   Tokens used: ${response.metadata?.usage?.totalTokens || 'unknown'}`);
    console.log('\n✅ Anthropic validation passed!\n');
    return true;

  } catch (error: any) {
    console.error(`\n❌ Anthropic API key validation failed: ${error.message}`);
    console.error('\nCommon issues:');
    console.error('  - API key might be invalid or expired');
    console.error('  - API key might not have the correct permissions');
    console.error('  - Account might have insufficient credits');
    console.error('\nGet a new key at: https://console.anthropic.com/settings/keys');
    return false;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting PAT Token Validation\n');
  console.log('This script validates that your tokens are valid for API access');
  console.log('and optionally checks permissions for E2E test resources.\n');

  const atlassianValid = await validateAtlassianToken();
  const figmaValid = await validateFigmaToken();
  const anthropicValid = await validateAnthropicKey();

  if (atlassianValid && figmaValid && anthropicValid) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ All tokens validated successfully!');
    console.log('\n🎯 Token Status:');
    console.log('   • Atlassian: Valid for API access and E2E tests');
    console.log('   • Figma: Valid for API access (E2E test access checked above)');
    console.log('   • Anthropic: Valid for AI-powered API endpoints');
    console.log('\n📝 Next Steps:');
    console.log('   • General API usage: Tokens are ready');
    console.log('   • E2E tests: npm run test:e2e:rest-api');
    console.log('     (Requires E2E test file/node access shown above)\n');
    process.exit(0);
  } else {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.error('❌ Token validation failed!');
    console.error('\nPlease check the errors above and update your .env file.');
    console.error('See: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
