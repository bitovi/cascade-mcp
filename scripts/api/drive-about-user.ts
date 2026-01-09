/**
 * CLI Script: Drive About User
 * 
 * Get authenticated user information from Google Drive using service account
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/drive-about-user.ts [--json <json-string>]
 *   node --import ./loader.mjs scripts/api/drive-about-user.ts [--file <path>]
 * 
 * Configuration:
 *   Default: Reads google.json from project root
 *   With --json: Pass service account JSON as argument
 *   With --file: Specify custom path to JSON file
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createGoogleClientWithServiceAccountJSON } from '../../server/providers/google/google-api-client.js';
import { getGoogleDriveUser } from '../../server/providers/google/google-helpers.js';
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
  node --import ./loader.mjs scripts/api/drive-about-user.ts [options]

Options:
  --json <json-string>  Pass service account JSON as a string argument
  --file <path>         Read service account JSON from custom file path
  --help, -h            Show this help message

Configuration:
  Default: Reads google.json from project root

Description:
  Retrieves information about the authenticated user from Google Drive.
  Uses plaintext JSON service account credentials.

Examples:
  # Using google.json in project root (default)
  node --import ./loader.mjs scripts/api/drive-about-user.ts
  
  # Passing JSON as argument
  node --import ./loader.mjs scripts/api/drive-about-user.ts --json '{"type":"service_account",...}'
  
  # Using custom file path
  node --import ./loader.mjs scripts/api/drive-about-user.ts --file ./my-service-account.json
`);
    process.exit(0);
  }

  try {
    let serviceAccountJson: GoogleServiceAccountCredentials;
    
    // Check for --json argument
    const jsonArgIndex = args.indexOf('--json');
    if (jsonArgIndex !== -1 && args[jsonArgIndex + 1]) {
      console.log('📂 Loading credentials from --json argument...');
      serviceAccountJson = JSON.parse(args[jsonArgIndex + 1]) as GoogleServiceAccountCredentials;
    }
    // Check for --file argument
    else if (args.includes('--file')) {
      const fileArgIndex = args.indexOf('--file');
      const customPath = args[fileArgIndex + 1];
      
      if (!customPath) {
        throw new Error('--file option requires a path argument');
      }
      
      const resolvedPath = resolve(process.cwd(), customPath);
      if (!existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }
      
      console.log(`📂 Loading credentials from ${customPath}...`);
      serviceAccountJson = JSON.parse(
        readFileSync(resolvedPath, 'utf-8')
      ) as GoogleServiceAccountCredentials;
    }
    // Default: use google.json in project root
    else {
      if (!existsSync(googleJsonPath)) {
        throw new Error(
          'google.json not found in project root.\n' +
          'Please place your service account JSON file at: ' + googleJsonPath + '\n' +
          'Or use --json or --file options. Run --help for more info.'
        );
      }
      
      console.log('📂 Loading credentials from google.json...');
      serviceAccountJson = JSON.parse(
        readFileSync(googleJsonPath, 'utf-8')
      ) as GoogleServiceAccountCredentials;
    }
    
    console.log(`  Service Account: ${serviceAccountJson.client_email}`);
    console.log(`  Project ID: ${serviceAccountJson.project_id}`);
    
    console.log('\n🔐 Creating Google Drive client...');
    const client = await createGoogleClientWithServiceAccountJSON(serviceAccountJson);
    console.log(`  Auth Type: ${client.authType}`);

    console.log('\n👤 Fetching user information from Google Drive API...');
    const userInfo = await getGoogleDriveUser(client);

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
