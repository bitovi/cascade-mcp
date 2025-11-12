/**
 * Manual test script for addIssueComment function
 * 
 * Tests posting markdown comments to Jira issues using both OAuth and PAT authentication.
 * 
 * Usage:
 *   1. Set environment variables (see below)
 *   2. Run: npx tsx scripts/test-add-comment.ts
 * 
 * Required environment variables:
 *   - ATLASSIAN_PAT: Base64-encoded email:token for PAT auth
 *   - TEST_EPIC_KEY: Jira issue key to comment on (e.g., "PROJ-123")
 *   - TEST_CLOUD_ID: Optional - Jira cloud ID (will auto-detect if not provided)
 *   - TEST_SITE_NAME: Optional - Jira site name (will auto-detect if not provided)
 */

import { createAtlassianClientWithPAT } from '../server/providers/atlassian/atlassian-api-client.js';
import { addIssueComment, resolveCloudId } from '../server/providers/atlassian/atlassian-helpers.js';

async function testAddComment() {
  console.log('🧪 Testing addIssueComment function\n');
  
  // Check required environment variables
  const pat = process.env.ATLASSIAN_PAT;
  const epicKey = process.env.TEST_EPIC_KEY;
  const cloudId = process.env.TEST_CLOUD_ID;
  const siteName = process.env.TEST_SITE_NAME;
  
  if (!pat) {
    console.error('❌ Missing ATLASSIAN_PAT environment variable');
    console.error('   Set it to base64(email:api_token)');
    process.exit(1);
  }
  
  if (!epicKey) {
    console.error('❌ Missing TEST_EPIC_KEY environment variable');
    console.error('   Set it to a Jira issue key (e.g., "PROJ-123")');
    process.exit(1);
  }
  
  console.log(`Epic Key: ${epicKey}`);
  console.log(`Cloud ID: ${cloudId || 'auto-detect'}`);
  console.log(`Site Name: ${siteName || 'auto-detect'}\n`);
  
  try {
    // Create Atlassian client
    console.log('1️⃣  Creating Atlassian client with PAT...');
    const client = createAtlassianClientWithPAT(pat);
    console.log('   ✅ Client created\n');
    
    // Resolve cloud ID
    console.log('2️⃣  Resolving cloud ID...');
    const { cloudId: resolvedCloudId, siteName: resolvedSiteName, siteUrl } = await resolveCloudId(
      client,
      cloudId,
      siteName
    );
    console.log(`   ✅ Resolved: ${resolvedSiteName} (${resolvedCloudId})`);
    console.log(`   URL: ${siteUrl}\n`);
    
    // Test 1: Simple text comment
    console.log('3️⃣  Test 1: Posting simple text comment...');
    const simpleComment = 'This is a test comment from the addIssueComment function. ✅';
    const { commentId: commentId1 } = await addIssueComment(client, resolvedCloudId, epicKey, simpleComment);
    console.log(`   ✅ Simple comment posted (ID: ${commentId1})\n`);
    
    // Test 2: Markdown formatted comment
    console.log('4️⃣  Test 2: Posting markdown formatted comment...');
    const markdownComment = `
## Test Comment with Markdown

**What this tests:**
- Bold text
- *Italic text*
- \`Inline code\`
- [Link to Google](https://www.google.com)

**Code block:**
\`\`\`javascript
function test() {
  console.log('Hello from markdown!');
}
\`\`\`

**List:**
1. First item
2. Second item
3. Third item

✅ This comment was posted using the \`addIssueComment\` helper function.
`.trim();
    
    const { commentId: commentId2 } = await addIssueComment(client, resolvedCloudId, epicKey, markdownComment);
    console.log(`   ✅ Markdown comment posted (ID: ${commentId2})\n`);
    
    // Test 3: Error-style comment (simulates what would be posted on failure)
    console.log('5️⃣  Test 3: Posting error-style comment...');
    const errorComment = `
🚨 **Test Error Comment**

**What happened:**
This is a simulated error message to test error commenting

**Possible causes:**
- Cause 1
- Cause 2
- Cause 3

**How to fix:**
1. Step 1
2. Step 2
3. Step 3

**Technical details:**
- Epic: ${epicKey}
- Cloud ID: ${resolvedCloudId}
- Test timestamp: ${new Date().toISOString()}
`.trim();
    
    const { commentId: commentId3 } = await addIssueComment(client, resolvedCloudId, epicKey, errorComment);
    console.log(`   ✅ Error-style comment posted (ID: ${commentId3})\n`);
    
    console.log('✅ All tests passed!');
    console.log(`\nCheck Jira issue ${epicKey} for the 3 test comments.`);
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.status) {
      console.error(`   HTTP Status: ${error.status}`);
    }
    if (error.stack && process.env.DEBUG) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testAddComment();
