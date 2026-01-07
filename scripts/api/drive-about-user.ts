/**
 * CLI Script: Drive About User
 * 
 * Get authenticated user information from Google Drive using service account
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/drive-about-user.ts
 * 
 * Configuration:
 *   Reads service account credentials from google.json in project root
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createGoogleClientWithServiceAccount } from '../../server/providers/google/google-api-client.js';
import type { GoogleServiceAccountCredentials } from '../../server/providers/google/types.js';

// Load service account from google.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const googleJsonPath = resolve(__dirname, '../../google.json');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Drive About User - Get authenticated user information from Google Drive

Usage:
  node --import ./loader.mjs scripts/api/drive-about-user.ts

Options:
  --help, -h            Show this help message

Configuration:
  Service account credentials: google.json (project root)

Description:
  Retrieves information about the authenticated user from Google Drive.
  Uses service account authentication from google.json.

Example:
  node --import ./loader.mjs scripts/api/drive-about-user.ts
`);
    process.exit(0);
  }

  try {
    console.log('📂 Loading service account credentials...');
    const serviceAccountJson = JSON.parse(
      readFileSync(googleJsonPath, 'utf-8')
    ) as GoogleServiceAccountCredentials;
    
    console.log(`  Service Account: ${serviceAccountJson.client_email}`);
    console.log(`  Project ID: ${serviceAccountJson.project_id}`);

    console.log('\n🔐 Creating Google Drive client with service account...');
    const client = await createGoogleClientWithServiceAccount(serviceAccountJson);
    console.log(`  Auth Type: ${client.authType}`);

    console.log('\n👤 Fetching user information from Google Drive API...');
    const userInfo = await client.fetchAboutUser();

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
    console.log(`   ${serviceAccountJson.client_email}`);

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
