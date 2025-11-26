#!/usr/bin/env node
/**
 * PAT Token Validation Script
 * 
 * Validates that the Atlassian and Figma PAT tokens in your .env file
 * have the necessary permissions for the REST API E2E tests.
 * 
 * Run: npm run validate-pat-tokens
 * 
 * See: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token
 */

const https = require('https');

// Load environment variables
require('dotenv').config();

const ATLASSIAN_PAT = process.env.ATLASSIAN_TEST_PAT?.replace(/^"|"$/g, ''); // Pre-encoded base64(email:token)
const FIGMA_PAT = process.env.FIGMA_TEST_PAT?.replace(/^"|"$/g, '');
const JIRA_CLOUD_ID = process.env.JIRA_TEST_CLOUD_ID;

// Helper to make HTTPS requests
function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
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

async function validateAtlassianToken() {
  console.log('\n🔍 Validating Atlassian PAT Token...\n');

  if (!ATLASSIAN_PAT) {
    console.error('❌ ATLASSIAN_TEST_PAT not found in environment variables');
    return false;
  }
  
  if (!JIRA_CLOUD_ID) {
    console.error('❌ JIRA_TEST_CLOUD_ID not found in environment variables');
    return false;
  }

  console.log('✅ ATLASSIAN_TEST_PAT found (pre-encoded base64 credentials)');
  console.log('✅ JIRA_TEST_CLOUD_ID found:', JIRA_CLOUD_ID);

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
    const hasPlayProject = projects.some(p => p.key === 'PLAY');
    if (hasPlayProject) {
      console.log('✅ Has access to PLAY project');
    } else {
      console.error('❌ No access to PLAY project');
      console.log('   Available projects:', projects.map(p => p.key).join(', '));
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
      const hasEpicType = project.issuetypes.some(t => t.name === 'Epic');
      const hasStoryType = project.issuetypes.some(t => t.name === 'Story');
      
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

  } catch (error) {
    console.error('\n❌ Atlassian validation failed:', error.message);
    return false;
  }
}

async function validateFigmaToken() {
  console.log('🔍 Validating Figma PAT Token...\n');

  if (!FIGMA_PAT) {
    console.error('❌ FIGMA_TEST_PAT not found in environment variables');
    return false;
  }

  console.log('✅ FIGMA_TEST_PAT found');
  console.log(`   Token: ${FIGMA_PAT.substring(0, 10)}...${FIGMA_PAT.slice(-5)}`);

  try {
    // Test: Get current user (verify token is valid)
    console.log('\n📋 Test: Checking Figma authentication...');
    const user = await httpsRequest({
      hostname: 'api.figma.com',
      path: '/v1/me',
      method: 'GET',
      headers: {
        'X-Figma-Token': FIGMA_PAT
      }
    });
    
    console.log(`✅ Authenticated as: ${user.email}`);
    console.log('\n✅ Figma validation passed!\n');
    return true;

  } catch (error) {
    console.error('\n❌ Figma validation failed:', error.message);
    console.error('\nCommon issues:');
    console.error('  - Token might be invalid or expired');
    console.error('  - Token might not have read permissions');
    return false;
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting PAT Token Validation\n');
  console.log('This script validates that your tokens have the necessary permissions');
  console.log('for the REST API E2E tests.\n');

  const atlassianValid = await validateAtlassianToken();
  const figmaValid = await validateFigmaToken();

  if (atlassianValid && figmaValid) {
    console.log('✅ All tokens validated successfully!');
    console.log('\nYou can now run the E2E tests with:');
    console.log('  npm run test:e2e:rest-api\n');
    process.exit(0);
  } else {
    console.error('\n❌ Token validation failed!');
    console.error('\nPlease check the errors above and update your .env file.');
    console.error('See: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
