/**
 * CLI Script: Drive About User
 * 
 * Get authenticated user information from Google Drive using service account
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/drive-about-user.ts [--json]
 * 
 * Configuration:
 *   Default: Set GOOGLE_SERVICE_ACCOUNT_ENCRYPTED in .env (encrypted)
 *   With --json flag: Place google.json in project root (plaintext)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { 
  createGoogleClientWithServiceAccountEncrypted,
  createGoogleClientWithServiceAccountJSON 
} from '../../server/providers/google/google-api-client.js';
import type { GoogleServiceAccountCredentials } from '../../server/providers/google/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const googleJsonPath = resolve(__dirname, '../../google.json');

// Load environment variables
dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Drive About User - Get authenticated user information from Google Drive

Usage:
  node --import ./loader.mjs scripts/api/drive-about-user.ts [--json]

Options:
  --help, -h            Show this help message
  --json                Use plaintext google.json instead of encrypted credentials

Configuration:
  Default: Set GOOGLE_SERVICE_ACCOUNT_ENCRYPTED in .env (encrypted)
  With --json: Place google.json in project root (plaintext)

Description:
  Retrieves information about the authenticated user from Google Drive.
  Supports both encrypted credentials (default) and plaintext JSON (with --json flag).

Examples:
  # Using encrypted credentials (default)
  node --import ./loader.mjs scripts/api/drive-about-user.ts
  
  # Using plaintext JSON
  node --import ./loader.mjs scripts/api/drive-about-user.ts --json
`);
    process.exit(0);
  }

  try {
    const useJson = args.includes('--json');
    let client;
    
    if (useJson) {
      // Use plaintext google.json
      if (!existsSync(googleJsonPath)) {
        throw new Error(
          'google.json not found in project root.\n' +
          'Please place your service account JSON file at: ' + googleJsonPath
        );
      }
      
      console.log('📂 Loading plaintext credentials from google.json...');
      const serviceAccountJson = JSON.parse(
        readFileSync(googleJsonPath, 'utf-8')
      ) as GoogleServiceAccountCredentials;
      
      console.log(`  Service Account: ${serviceAccountJson.client_email}`);
      console.log(`  Project ID: ${serviceAccountJson.project_id}`);
      
      console.log('\n🔐 Creating Google Drive client...');
      client = await createGoogleClientWithServiceAccountJSON(serviceAccountJson);
    } else {
      // Use encrypted credentials from env
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED) {
        throw new Error(
          'Missing GOOGLE_SERVICE_ACCOUNT_ENCRYPTED environment variable.\n' +
          'Please set it in .env file.\n' +
          'Get encrypted credentials from /google-service-encrypt page.\n' +
          'Or use --json flag to load from google.json'
        );
      }

      console.log('🔐 Using encrypted credentials from GOOGLE_SERVICE_ACCOUNT_ENCRYPTED');

      console.log('\n🔐 Creating Google Drive client...');
      client = await createGoogleClientWithServiceAccountEncrypted(
        process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED
      );
    }
    console.log(`  Auth Type: ${client.authType}`);

    console.log('\n👤 Fetching user information from Google Drive API...');
    const response = await client.fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user',
      { method: 'GET' }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Drive API error (${response.status}): ${errorText}`);
    }
    
    const userInfo = await response.json() as any;

    console.log('\n✅ User Information Retrieved!\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📧 Email:        ${userInfo.user.emailAddress}`);
    console.log(`👤 Display Name: ${userInfo.user.displayName}`);
    console.log(`🆔 Permission ID: ${userInfo.user.permissionId}`);
    console.log(`🔗 Kind:         ${userInfo.user.kind}`);
    if (userInfo.user.photoLink) {
      console.log(`📷 Photo:        ${userInfo.user.photoLink}`);
    }
    console.log('═══════════════════════════════════════════════════════════════');
    
    console.log('\n💡 Tip: This service account can access files shared with:');
    console.log(`   ${userInfo.user.emailAddress}`);

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('ENOENT') && error.message.includes('google.json')) {
      console.error('\n💡 Tip: Make sure google.json exists in the project root');
    } else if (error.message.includes('credentials')) {
      console.error('\n💡 Tip: Check that google.json contains valid service account credentials');
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.error('\n💡 Tip: The service account may need additional permissions');
      console.error('   Check the Google Cloud Console for required scopes');
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('\n💡 Tip: Service account credentials may be invalid or expired');
      console.error('   Generate new credentials in Google Cloud Console');
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.error('\nStack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

main();
