#!/usr/bin/env node
/**
 * Figma Token Test Script
 * 
 * Tests Figma API token with the specific file and node used in tests.
 * 
 * Run: node scripts/test-figma-token.cjs
 */

const https = require('https');

// Load environment variables
require('dotenv').config();

const FIGMA_PAT = process.env.FIGMA_TEST_PAT?.replace(/^"|"$/g, '');
const TEST_FILE_KEY = 'yRyWXdNtJ8KwS1GVqRBL1O';
const TEST_NODE_ID = '235:75405';

console.log('🔍 Testing Figma Token\n');
console.log('Token:', FIGMA_PAT ? `${FIGMA_PAT.substring(0, 15)}...${FIGMA_PAT.slice(-5)} (length: ${FIGMA_PAT.length})` : '❌ NOT FOUND');
console.log('File Key:', TEST_FILE_KEY);
console.log('Node ID:', TEST_NODE_ID);
console.log();

if (!FIGMA_PAT) {
  console.error('❌ FIGMA_TEST_PAT not found in environment variables');
  process.exit(1);
}

// Helper to make HTTPS requests
function httpsRequest(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function testFigmaToken() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test 1: Get current user
  console.log('📋 Test 1: Get current user (verify token is valid)');
  console.log('   URL: https://api.figma.com/v1/me');
  console.log('   Header: X-Figma-Token: ' + FIGMA_PAT.substring(0, 15) + '...\n');
  
  try {
    const userResponse = await httpsRequest({
      hostname: 'api.figma.com',
      path: '/v1/me',
      method: 'GET',
      headers: {
        'X-Figma-Token': FIGMA_PAT
      }
    });
    
    console.log(`   Status: ${userResponse.status} ${userResponse.statusText}`);
    
    if (userResponse.status === 200) {
      const user = JSON.parse(userResponse.body);
      console.log(`   ✅ Authenticated as: ${user.email}`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Handle: ${user.handle || 'N/A'}\n`);
    } else {
      console.error(`   ❌ Authentication failed`);
      console.error(`   Response: ${userResponse.body}\n`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}\n`);
    return false;
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test 2: Get file metadata
  console.log('📋 Test 2: Get file metadata');
  console.log(`   URL: https://api.figma.com/v1/files/${TEST_FILE_KEY}`);
  console.log('   Header: X-Figma-Token: ' + FIGMA_PAT.substring(0, 15) + '...\n');
  
  try {
    const fileResponse = await httpsRequest({
      hostname: 'api.figma.com',
      path: `/v1/files/${TEST_FILE_KEY}`,
      method: 'GET',
      headers: {
        'X-Figma-Token': FIGMA_PAT
      }
    });
    
    console.log(`   Status: ${fileResponse.status} ${fileResponse.statusText}`);
    
    if (fileResponse.status === 200) {
      const file = JSON.parse(fileResponse.body);
      console.log(`   ✅ File found: ${file.name}`);
      console.log(`   Last Modified: ${file.lastModified}`);
      console.log(`   Version: ${file.version || 'N/A'}\n`);
    } else {
      console.error(`   ❌ Failed to fetch file`);
      console.error(`   Response: ${fileResponse.body}\n`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}\n`);
    return false;
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test 3: Get specific node (what the test uses)
  console.log('📋 Test 3: Get specific node (test scenario)');
  const encodedNodeId = encodeURIComponent(TEST_NODE_ID);
  console.log(`   URL: https://api.figma.com/v1/files/${TEST_FILE_KEY}/nodes?ids=${encodedNodeId}`);
  console.log('   Header: X-Figma-Token: ' + FIGMA_PAT.substring(0, 15) + '...\n');
  
  try {
    const nodeResponse = await httpsRequest({
      hostname: 'api.figma.com',
      path: `/v1/files/${TEST_FILE_KEY}/nodes?ids=${encodedNodeId}`,
      method: 'GET',
      headers: {
        'X-Figma-Token': FIGMA_PAT
      }
    });
    
    console.log(`   Status: ${nodeResponse.status} ${nodeResponse.statusText}`);
    
    if (nodeResponse.status === 200) {
      const nodeData = JSON.parse(nodeResponse.body);
      console.log(`   ✅ Node data retrieved`);
      console.log(`   Response keys: ${Object.keys(nodeData).join(', ')}`);
      if (nodeData.nodes) {
        const nodeKeys = Object.keys(nodeData.nodes);
        console.log(`   Nodes found: ${nodeKeys.length}`);
        nodeKeys.forEach(key => {
          const node = nodeData.nodes[key];
          if (node.document) {
            console.log(`     - ${key}: ${node.document.name} (${node.document.type})`);
          }
        });
      }
      console.log();
    } else {
      console.error(`   ❌ Failed to fetch node`);
      console.error(`   Response: ${nodeResponse.body}\n`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}\n`);
    return false;
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test 4: Check what our code is actually sending
  console.log('📋 Test 4: Verify header format used in code');
  console.log('   Testing with Authorization header (Bearer prefix)...\n');
  
  try {
    const bearerResponse = await httpsRequest({
      hostname: 'api.figma.com',
      path: '/v1/me',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FIGMA_PAT}`
      }
    });
    
    console.log(`   Status: ${bearerResponse.status} ${bearerResponse.statusText}`);
    
    if (bearerResponse.status === 200) {
      console.log(`   ℹ️  Bearer authorization works (but should use X-Figma-Token)\n`);
    } else {
      console.log(`   ❌ Bearer authorization doesn't work`);
      console.log(`   Response: ${bearerResponse.body}\n`);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }
  
  return true;
}

async function main() {
  const success = await testFigmaToken();
  
  if (success) {
    console.log('✅ All Figma API tests passed!');
    console.log('\nThe token is valid and can access the test file.');
    console.log('If the E2E test is still failing, the issue is in how the code');
    console.log('constructs or sends the Figma request.\n');
    process.exit(0);
  } else {
    console.error('❌ Figma token validation failed!');
    console.error('\nPlease check:');
    console.error('1. Token is not expired');
    console.error('2. Token has file read permissions');
    console.error('3. File is accessible with this token\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
