/**
 * Test Script: Drive About User REST API
 * 
 * Tests the REST API endpoint for Google Drive user info
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/test-drive-about-user-api.ts [--json]
 * 
 * Prerequisites:
 *   - Server running on http://localhost:3000
 *   Default: GOOGLE_SERVICE_ACCOUNT_ENCRYPTED set in .env
 *   With --json: Place google.json in project root
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const googleJsonPath = resolve(__dirname, '../../google.json');

dotenv.config();

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Drive About User API Test                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    const args = process.argv.slice(2);
    const useJson = args.includes('--json');
    
    let headers: Record<string, string>;
    
    if (useJson) {
      // Step 1: Load plaintext google.json
      console.log('📂 Step 1: Loading plaintext credentials from google.json...');
      
      if (!existsSync(googleJsonPath)) {
        throw new Error(
          'google.json not found in project root.\n' +
          'Please place your service account JSON file at: ' + googleJsonPath
        );
      }
      
      const serviceAccountJson = readFileSync(googleJsonPath, 'utf-8');
      console.log(`  ✓ Loaded google.json`);
      console.log(`  ✓ Length: ${serviceAccountJson.length} characters\n`);
      
      headers = {
        'Content-Type': 'application/json',
        'X-Google-Json': serviceAccountJson,
      };
    } else {
      // Step 1: Load encrypted credentials from env
      console.log('📂 Step 1: Loading encrypted credentials from environment...');
      
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED) {
        throw new Error(
          'Missing GOOGLE_SERVICE_ACCOUNT_ENCRYPTED environment variable.\n' +
          'Please set it in .env file.\n' +
          'Get encrypted credentials from /google-service-encrypt page.\n' +
          'Or use --json flag to load from google.json'
        );
      }

      const encrypted = process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED;
      console.log(`  ✓ Loaded encrypted credentials`);
      console.log(`  ✓ Length: ${encrypted.length} characters\n`);
      
      headers = {
        'Content-Type': 'application/json',
        'X-Google-Encrypt': encrypted,
      };
    }

    // Step 2: Call the REST API
    console.log('🌐 Step 2: Calling POST /api/drive-about-user...');
    const apiUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
    
    const response = await fetch(`${apiUrl}/api/drive-about-user`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    console.log(`  Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error}\nDetails: ${errorData.details}`);
    }

    // Step 3: Parse response
    console.log('\n📊 Step 3: Parsing response...');
    const userData = await response.json();
    
    console.log('  ✓ Response received successfully\n');

    // Display results
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ User Information Retrieved!\n');
    console.log(`📧 Email:        ${userData.user.emailAddress}`);
    console.log(`👤 Display Name: ${userData.user.displayName}`);
    console.log(`🆔 Permission ID: ${userData.user.permissionId}`);
    console.log(`🔗 Kind:         ${userData.user.kind}`);
    if (userData.user.photoLink) {
      console.log(`📷 Photo:        ${userData.user.photoLink}`);
    }
    console.log('═══════════════════════════════════════════════════════════════');
    
    console.log('\n💡 API Endpoint Usage:');
    console.log('  # Using encrypted credentials:');
    console.log(`  curl -X POST ${apiUrl}/api/drive-about-user \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -H "X-Google-Encrypt: RSA-ENCRYPTED:..." \\`);
    console.log(`    -d '{}'`);
    console.log('\n  # Using plaintext JSON:');
    console.log(`  curl -X POST ${apiUrl}/api/drive-about-user \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -H "X-Google-Json: $(cat google.json)" \\`);
    console.log(`    -d '{}'`);

    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    
    if (error.message.includes('GOOGLE_SERVICE_ACCOUNT_ENCRYPTED')) {
      console.error('\n💡 Tip: Set GOOGLE_SERVICE_ACCOUNT_ENCRYPTED in .env or use --json flag');
      console.error('   Get encrypted credentials from /google-service-encrypt page');
    } else if (error.message.includes('google.json')) {
      console.error('\n💡 Tip: Place google.json in project root or use encrypted credentials');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Tip: Make sure the server is running on http://localhost:3000');
      console.error('   Run: npm run start-local');
    } else if (error.message.includes('fetch')) {
      console.error('\n💡 Tip: Check that the server is accessible');
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.error('\nStack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

main();
