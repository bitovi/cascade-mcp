/**
 * CLI Script: Delete Figma Comments
 * 
 * Deletes all comments from a Figma design file, respecting rate limits
 * with a 10-second delay between deletions.
 * 
 * Usage:
 *   node --import ./loader.mjs scripts/api/delete-figma-comments.ts <figma-url-or-file-key>
 * 
 * Example:
 *   node --import ./loader.mjs scripts/api/delete-figma-comments.ts https://www.figma.com/design/abc123/MyDesign
 *   node --import ./loader.mjs scripts/api/delete-figma-comments.ts abc123
 * 
 * Options:
 *   --dry-run       Show what would be deleted without actually deleting
 *   --delay <ms>    Delay between deletions in milliseconds (default: 10000)
 *   --help, -h      Show this help message
 * 
 * Environment Variables Required:
 *   FIGMA_TEST_PAT - Figma Personal Access Token with file_comments:write scope
 */

import dotenv from 'dotenv';
import { createFigmaClient } from '../../server/providers/figma/figma-api-client.js';

// Load environment variables
dotenv.config();

/**
 * Extract Figma file key from URL or return as-is if already a key
 * Examples:
 *   https://www.figma.com/design/abc123/MyDesign -> abc123
 *   https://www.figma.com/file/abc123/MyDesign -> abc123
 *   abc123 -> abc123
 */
function extractFigmaFileKey(urlOrKey: string): string {
  // If it's already a file key (no slashes, no protocol), return as-is
  if (!urlOrKey.includes('/') && !urlOrKey.includes(':')) {
    return urlOrKey;
  }

  // Try to extract from URL
  const patterns = [
    /figma\.com\/design\/([a-zA-Z0-9]+)/,
    /figma\.com\/file\/([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = urlOrKey.match(pattern);
    if (match) {
      return match[1];
    }
  }

  throw new Error(`Could not extract Figma file key from: ${urlOrKey}`);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Delete Figma Comments - Remove all comments from a Figma design file

Usage:
  node --import ./loader.mjs scripts/api/delete-figma-comments.ts <figma-url-or-file-key>

Arguments:
  <figma-url-or-file-key>    Figma file URL or file key
                             Examples:
                               https://www.figma.com/design/abc123/MyDesign
                               https://www.figma.com/file/abc123/MyDesign
                               abc123

Options:
  --dry-run             Show what would be deleted without actually deleting
  --delay <ms>          Delay between deletions in milliseconds (default: 10000)
  --help, -h            Show this help message

Environment Variables Required:
  FIGMA_TEST_PAT        Figma Personal Access Token with file_comments:write scope

Example:
  # Delete all comments with 10-second delay (default)
  node --import ./loader.mjs scripts/api/delete-figma-comments.ts https://www.figma.com/design/abc123/MyDesign
  
  # Preview what would be deleted (dry run)
  node --import ./loader.mjs scripts/api/delete-figma-comments.ts abc123 --dry-run
  
  # Use custom delay (5 seconds)
  node --import ./loader.mjs scripts/api/delete-figma-comments.ts abc123 --delay 5000
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const figmaInput = args[0];
  const isDryRun = args.includes('--dry-run');
  
  const delayIndex = args.indexOf('--delay');
  const delay = delayIndex !== -1 ? parseInt(args[delayIndex + 1], 10) : 10000;

  if (isNaN(delay) || delay < 0) {
    console.error('❌ Error: --delay must be a positive number');
    process.exit(1);
  }

  try {
    // Extract file key
    console.log('🔍 Parsing Figma file...');
    const fileKey = extractFigmaFileKey(figmaInput);
    console.log(`  File Key: ${fileKey}`);

    // Get Figma token from environment
    const figmaToken = process.env.FIGMA_TEST_PAT;
    if (!figmaToken) {
      throw new Error('Missing environment variable: FIGMA_TEST_PAT');
    }

    // Create Figma client
    console.log('\n📡 Creating Figma API client...');
    const client = createFigmaClient(figmaToken);
    console.log('  ✓ Client created');

    // Fetch all comments
    console.log('\n📥 Fetching comments...');
    const comments = await client.fetchComments(fileKey);
    console.log(`  Found ${comments.length} comment(s)`);

    if (comments.length === 0) {
      console.log('\n✅ No comments to delete.');
      process.exit(0);
    }

    // Display comments
    console.log('\n📋 Comments to delete:\n');
    comments.forEach((comment, index) => {
      const preview = comment.message.length > 60 
        ? comment.message.substring(0, 60) + '...'
        : comment.message;
      console.log(`  ${index + 1}. [${comment.id}] ${comment.user.handle}: "${preview}"`);
    });

    if (isDryRun) {
      console.log('\n🔍 DRY RUN MODE - No comments were deleted');
      console.log(`\nTo delete these ${comments.length} comment(s), run without --dry-run flag`);
      process.exit(0);
    }

    // Confirm deletion
    console.log(`\n⚠️  About to delete ${comments.length} comment(s) with ${delay}ms delay between each deletion`);
    console.log('   This operation cannot be undone!');
    
    // Wait 3 seconds before starting
    console.log('\n⏳ Starting deletion in 3 seconds... (Ctrl+C to cancel)');
    await sleep(3000);

    // Delete comments one by one
    console.log('\n🗑️  Deleting comments:\n');
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      const progress = `[${i + 1}/${comments.length}]`;
      
      try {
        console.log(`${progress} Deleting comment ${comment.id}...`);
        await client.deleteComment(fileKey, comment.id);
        console.log(`${progress} ✓ Deleted`);
        
        // Wait before next deletion (except for the last one)
        if (i < comments.length - 1) {
          console.log(`${progress} ⏳ Waiting ${delay / 1000}s before next deletion...\n`);
          await sleep(delay);
        }
      } catch (error: any) {
        console.error(`${progress} ❌ Failed to delete comment ${comment.id}: ${error.message}`);
        
        // If we hit a rate limit, suggest increasing the delay
        if (error.message.includes('Rate limit')) {
          console.error('\n⚠️  Rate limit hit! Consider using --delay with a larger value.');
          process.exit(1);
        }
        
        // Continue with other deletions
      }
    }

    console.log('\n✅ Deletion complete!');
    console.log(`\n📊 Results:`);
    console.log(`   Total comments: ${comments.length}`);
    console.log(`   Time taken: ~${Math.round((comments.length - 1) * delay / 1000)}s (excluding API call time)`);

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('Could not extract')) {
      console.error('\n💡 Tip: Make sure to provide a valid Figma URL or file key');
      console.error('   Examples:');
      console.error('     https://www.figma.com/design/abc123/MyDesign');
      console.error('     abc123');
    } else if (error.message.includes('environment variable')) {
      console.error('\n💡 Tip: Make sure FIGMA_TEST_PAT is set in your .env file');
      console.error('   Get your token from: https://www.figma.com/developers/api#access-tokens');
    } else if (error.message.includes('file_comments:write')) {
      console.error('\n💡 Tip: Your Figma token needs the file_comments:write scope');
      console.error('   Create a new token with this scope at:');
      console.error('   https://www.figma.com/developers/api#access-tokens');
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.error('\nStack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

main();
