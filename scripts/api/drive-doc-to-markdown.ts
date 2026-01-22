/**
 * CLI Script: Drive Document to Markdown
 * 
 * Convert Google Docs document to Markdown format using service account
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/drive-doc-to-markdown.ts <url> [--json <json-string>]
 *   node --import ./loader.mjs scripts/api/drive-doc-to-markdown.ts <url> [--file <path>]
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
import { executeDriveDocToMarkdown } from '../../server/providers/google/tools/drive-doc-to-markdown/core-logic.js';
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
Drive Document to Markdown - Convert Google Docs to Markdown format

Usage:
  node --import ./loader.mjs scripts/api/drive-doc-to-markdown.ts <url> [options]

Arguments:
  <url>                 Google Docs URL or document ID

Options:
  --json <json-string>  Pass service account JSON as a string argument
  --file <path>         Read service account JSON from custom file path
  --help, -h            Show this help message

Configuration:
  Default: Reads google.json from project root

Description:
  Converts a Google Docs document to Markdown format with support for:
  - Headings, formatting (bold, italic)
  - Lists (ordered/unordered with nesting)
  - Tables, images, hyperlinks
  - Code blocks and inline code

  The document must be shared with the service account email.

Examples:
  # Using google.json in project root (default)
  node --import ./loader.mjs scripts/api/drive-doc-to-markdown.ts "https://docs.google.com/document/d/abc123/edit"
  
  # Using document ID only
  node --import ./loader.mjs scripts/api/drive-doc-to-markdown.ts abc123
  
  # Passing JSON as argument
  node --import ./loader.mjs scripts/api/drive-doc-to-markdown.ts abc123 --json '{"type":"service_account",...}'
  
  # Using custom file path
  node --import ./loader.mjs scripts/api/drive-doc-to-markdown.ts abc123 --file ./my-service-account.json
`);
    process.exit(0);
  }

  try {
    // Extract URL/ID (first non-flag argument that isn't a flag value)
    const jsonArgIndex = args.indexOf('--json');
    const fileArgIndex = args.indexOf('--file');
    
    const url = args.find((arg, index) => {
      // Skip flag arguments
      if (arg.startsWith('--')) return false;
      // Skip values immediately after --json or --file flags
      if (jsonArgIndex !== -1 && index === jsonArgIndex + 1) return false;
      if (fileArgIndex !== -1 && index === fileArgIndex + 1) return false;
      return true;
    });
    
    if (!url) {
      throw new Error(
        'Missing required argument: URL or document ID\n' +
        'Usage: node --import ./loader.mjs scripts/api/drive-doc-to-markdown.ts <url>\n' +
        'Run --help for more information'
      );
    }
    
    let serviceAccountJson: GoogleServiceAccountCredentials;
    
    // Check for --json argument (reuse index from above)
    if (jsonArgIndex !== -1 && args[jsonArgIndex + 1]) {
      console.log('📂 Loading credentials from --json argument...');
      serviceAccountJson = JSON.parse(args[jsonArgIndex + 1]) as GoogleServiceAccountCredentials;
    }
    // Check for --file argument (reuse index from above)
    else if (fileArgIndex !== -1) {
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

    console.log(`\n📄 Converting document to Markdown...`);
    console.log(`  URL/ID: ${url}`);
    
    const result = await executeDriveDocToMarkdown({ url }, client);

    console.log('\n✅ Conversion Successful!\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`📋 Title:         ${result.metadata.name}`);
    console.log(`🆔 Document ID:   ${result.metadata.id}`);
    console.log(`📅 Modified:      ${result.metadata.modifiedTime}`);
    console.log(`📏 Size:          ${result.metadata.size || 0} bytes`);
    console.log(`📝 Markdown:      ${result.markdown.length} characters`);
    console.log(`⏱️  Processing:    ${result.processingTimeMs}ms`);
    
    if (result.warnings && result.warnings.length > 0) {
      console.log(`⚠️  Warnings:      ${result.warnings.length}`);
      result.warnings.forEach((warning, i) => {
        console.log(`  ${i + 1}. ${warning}`);
      });
    }
    console.log('═══════════════════════════════════════════════════════════════');
    
    console.log('\n📄 Markdown Content:\n');
    console.log('─'.repeat(65));
    console.log(result.markdown);
    console.log('─'.repeat(65));
    
    console.log('\n💡 Tip: Document must be shared with:');
    console.log(`   ${serviceAccountJson.client_email}`);

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('ENOENT') && error.message.includes('google.json')) {
      console.error('\n💡 Tip: Make sure google.json exists in the project root');
    } else if (error.message.includes('credentials')) {
      console.error('\n💡 Tip: Check that google.json contains valid service account credentials');
    } else if (error.message.includes('404') || error.message.includes('not found')) {
      console.error('\n💡 Tip: Document not found or not accessible by service account');
      console.error('   Make sure the document is shared with the service account email');
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.error('\n💡 Tip: Service account lacks permission to access this document');
      console.error('   Share the document with the service account email');
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('\n💡 Tip: Service account credentials may be invalid or expired');
      console.error('   Generate new credentials in Google Cloud Console');
    } else if (error.message.includes('Invalid URL') || error.message.includes('Invalid document ID')) {
      console.error('\n💡 Tip: Provide a valid Google Docs URL or document ID');
      console.error('   Format: https://docs.google.com/document/d/{id}/edit or just {id}');
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.error('\nStack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

main();
