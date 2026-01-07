/**
 * CLI Script: Google Drive Client
 * 
 * Search and list files in Google Drive using service account credentials
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/google-drive.ts search <fileName>
 *   node --import ./loader.mjs scripts/api/google-drive.ts list <folderId>
 * 
 * Example:
 *   node --import ./loader.mjs scripts/api/google-drive.ts search Ticket-1395
 *   node --import ./loader.mjs scripts/api/google-drive.ts list 1a2B3c4D5e6F7g8H9i0J
 * 
 * Configuration:
 *   Reads service account credentials from google.json in project root
 */

import { google } from "googleapis";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load service account from google.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const googleJsonPath = resolve(__dirname, "../../google.json");
const serviceAccount = JSON.parse(readFileSync(googleJsonPath, "utf-8"));

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

function driveClient() {
  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: SCOPES,
  });

  return google.drive({ version: "v3", auth });
}

async function listFolder(folderId: string) {
  const drive = driveClient();

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, modifiedTime, size)",
    pageSize: 1000,
  });

  return res.data.files ?? [];
}

async function searchByFileName(fileName: string) {
  const drive = driveClient();

  const res = await drive.files.list({
    q: `name contains '${fileName}' and trashed = false`,
    fields: "files(id, name, mimeType, modifiedTime, size, parents, webViewLink)",
    pageSize: 100,
  });

  return res.data.files ?? [];
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Google Drive Client - Search and list files

Usage:
  node --import ./loader.mjs scripts/api/google-drive.ts search <fileName>
  node --import ./loader.mjs scripts/api/google-drive.ts list <folderId>

Commands:
  search <fileName>     Search for files by name
  list <folderId>       List all files in a folder

Options:
  --help, -h            Show this help message

Configuration:
  Service account credentials: google.json (project root)
  Service account email: ${serviceAccount.client_email}

Examples:
  node --import ./loader.mjs scripts/api/google-drive.ts search Ticket-1395
  node --import ./loader.mjs scripts/api/google-drive.ts list 1a2B3c4D5e6F7g8H9i0J

Note: The service account must have access to the files/folders you want to access.
      Share files with: ${serviceAccount.client_email}
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const command = args[0];
  const query = args[1];

  if (!command || !query) {
    console.error('❌ Error: Missing command or query parameter\n');
    console.error('Usage: node --import ./loader.mjs scripts/api/google-drive.ts <command> <query>');
    console.error('Run with --help for more information');
    process.exit(1);
  }

  try {
    if (command === "search") {
      console.log(`🔍 Searching for files containing: "${query}"\n`);
      const files = await searchByFileName(query);
      
      if (files.length === 0) {
        console.log('No files found.');
        console.log(`\n💡 Tip: Make sure the service account has access to the files.`);
        console.log(`   Share with: ${serviceAccount.client_email}`);
        process.exit(0);
      }

      console.log(`✅ Found ${files.length} file(s):\n`);
      console.log('═══════════════════════════════════════════════════════════════');
      
      files.forEach((file: any) => {
        console.log(`\n📄 ${file.name}`);
        console.log(`   Type: ${file.mimeType}`);
        console.log(`   ID: ${file.id}`);
        if (file.webViewLink) {
          console.log(`   Link: ${file.webViewLink}`);
        }
        if (file.modifiedTime) {
          console.log(`   Modified: ${new Date(file.modifiedTime).toLocaleString()}`);
        }
        if (file.size) {
          const sizeKB = Math.round(parseInt(file.size) / 1024);
          console.log(`   Size: ${sizeKB} KB`);
        }
      });
      
      console.log('\n═══════════════════════════════════════════════════════════════');
      
    } else if (command === "list") {
      console.log(`📂 Listing files in folder: ${query}\n`);
      const files = await listFolder(query);
      
      if (files.length === 0) {
        console.log('Folder is empty or not accessible.');
        console.log(`\n💡 Tip: Make sure the service account has access to this folder.`);
        console.log(`   Share with: ${serviceAccount.client_email}`);
        process.exit(0);
      }

      console.log(`✅ Found ${files.length} file(s):\n`);
      console.log('═══════════════════════════════════════════════════════════════');
      
      files.forEach((file: any) => {
        console.log(`\n📄 ${file.name}`);
        console.log(`   Type: ${file.mimeType}`);
        console.log(`   ID: ${file.id}`);
        if (file.modifiedTime) {
          console.log(`   Modified: ${new Date(file.modifiedTime).toLocaleString()}`);
        }
        if (file.size) {
          const sizeKB = Math.round(parseInt(file.size) / 1024);
          console.log(`   Size: ${sizeKB} KB`);
        }
      });
      
      console.log('\n═══════════════════════════════════════════════════════════════');
      
    } else {
      console.error(`❌ Unknown command: ${command}`);
      console.error('Use "search" or "list"');
      console.error('Run with --help for more information');
      process.exit(1);
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('ENOENT') && error.message.includes('google.json')) {
      console.error('\n💡 Tip: Make sure google.json exists in the project root');
    } else if (error.message.includes('credentials')) {
      console.error('\n💡 Tip: Check that google.json contains valid service account credentials');
    } else if (error.code === 404) {
      console.error('\n💡 Tip: The file or folder was not found or is not accessible');
      console.error(`   Share with: ${serviceAccount.client_email}`);
    } else if (error.code === 403) {
      console.error('\n💡 Tip: The service account does not have permission to access this resource');
      console.error(`   Share with: ${serviceAccount.client_email}`);
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.error('\nStack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

main();
