/**
 * Test Script: Google Service Account Encryption
 * 
 * Tests the complete encryption flow:
 * 1. Load service account from GOOGLE_SERVICE_ACCOUNT_ENCRYPTED env var
 * 2. Test decryption
 * 3. Create Google client
 * 4. Verify it works (fetch user info)
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/test-encryption.ts
 * 
 * Prerequisites:
 *   - Set GOOGLE_SERVICE_ACCOUNT_ENCRYPTED in .env
 *   - Get encrypted credentials from /google-service-encrypt page
 */

import dotenv from 'dotenv';
import { googleKeyManager } from '../../server/utils/key-manager.js';
import { createGoogleClientWithServiceAccountEncrypted } from '../../server/providers/google/google-api-client.js';

dotenv.config();

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Google Service Account Encryption - End-to-End Test         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Load encrypted credentials from env
    console.log('📂 Step 1: Loading encrypted credentials from environment...');
    
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED) {
      throw new Error(
        'Missing GOOGLE_SERVICE_ACCOUNT_ENCRYPTED environment variable.\n' +
        'Please set it in .env file.\n' +
        'Get encrypted credentials from /google-service-encrypt page.'
      );
    }

    const encrypted = process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED;
    console.log(`  ✓ Loaded encrypted credentials`);
    console.log(`  ✓ Length: ${encrypted.length} characters`);
    console.log(`  ✓ Prefix: ${encrypted.substring(0, 20)}...\n`);

    // Step 2: Decrypt to verify
    console.log('🔓 Step 2: Decrypting service account...');
    const decrypted = await googleKeyManager.decrypt(encrypted);
    
    console.log(`  ✓ Decrypted successfully`);
    console.log(`  ✓ Service account: ${decrypted.client_email}`);
    console.log(`  ✓ Project ID: ${decrypted.project_id}\n`);

    // Step 3: Create client with encrypted credentials
    console.log('🔐 Step 3: Creating Google client with encrypted credentials...');
    const client = await createGoogleClientWithServiceAccountEncrypted(encrypted);
    
    console.log(`  ✓ Client created with auth type: ${client.authType}\n`);

    // Step 4: Test API call
    console.log('🌐 Step 4: Testing Google Drive API...');
    const response = await client.fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user',
      { method: 'GET' }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Drive API error (${response.status}): ${errorText}`);
    }
    
    const userInfo = await response.json() as any;
    
    console.log(`  ✓ API call successful!`);
    console.log(`  ✓ User: ${userInfo.user.displayName}`);
    console.log(`  ✓ Email: ${userInfo.user.emailAddress}\n`);

    // Step 5: Verify email matches
    console.log('✅ Step 5: Verifying email matches service account...');
    if (userInfo.user.emailAddress === decrypted.client_email) {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('✅ ALL TESTS PASSED!');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log('Summary:');
      console.log('  • RSA-4096 decryption works correctly');
      console.log('  • Encrypted credentials loaded from environment variable');
      console.log('  • Google Drive API call successful');
      console.log('  • Service account email verified');
      console.log('\n💡 Usage:');
      console.log('  1. Visit /google-service-encrypt to encrypt your google.json');
      console.log('  2. Add to .env: GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:...');
      console.log('  3. Use in code:');
      console.log('\n```javascript');
      console.log('const client = await createGoogleClientWithServiceAccount(');
      console.log('  process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED');
      console.log(');');
      console.log('const userInfo = await client.fetchAboutUser();');
      console.log('```\n');
    } else {
      throw new Error('User info mismatch between encrypted and plaintext clients');
    }

  } catch (error: any) {
    console.error('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    
    if (error.message.includes('GOOGLE_SERVICE_ACCOUNT_ENCRYPTED')) {
      console.error('\n💡 Tip: Set GOOGLE_SERVICE_ACCOUNT_ENCRYPTED in .env');
      console.error('   Get encrypted credentials from /google-service-encrypt page');
    } else if (error.message.includes('RSA-ENCRYPTED')) {
      console.error('\n💡 Tip: Check that your encrypted credentials have the correct format');
    } else if (error.code === 404) {
      console.error('\n💡 Tip: The file or folder was not found or is not accessible');
    } else if (error.code === 403) {
      console.error('\n💡 Tip: The service account does not have permission to access this resource');
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.error('\nStack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

main();
