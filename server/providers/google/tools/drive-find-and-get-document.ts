/**
 * Find and Get Google Document Content Tool
 * Convenience tool that searches for a document and retrieves its content in one step
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';

/**
 * Input schema for drive-find-and-get-document tool
 */
const DriveFindAndGetDocumentSchema = z.object({
  searchQuery: z
    .string()
    .min(1)
    .describe('Search query to find the document (e.g., ticket number "1395", or partial filename)'),
  mimeType: z
    .string()
    .optional()
    .describe('Optional MIME type filter (default: application/vnd.google-apps.document for Google Docs)'),
});

/**
 * Format document content with file metadata header
 */
function formatDocumentWithMetadata(
  fileName: string,
  fileId: string,
  webViewLink: string | undefined,
  modifiedTime: string | undefined,
  content: string
): string {
  let output = `# Google Document: ${fileName}\n\n`;
  output += `**File ID**: \`${fileId}\`\n`;
  if (webViewLink) {
    output += `**View Online**: ${webViewLink}\n`;
  }
  if (modifiedTime) {
    try {
      const date = new Date(modifiedTime);
      output += `**Last Modified**: ${date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}\n`;
    } catch {
      output += `**Last Modified**: ${modifiedTime}\n`;
    }
  }
  output += `**Content Length**: ${content.length.toLocaleString()} characters\n`;
  output += `**Line Count**: ${content.split('\n').length.toLocaleString()} lines\n\n`;
  output += `---\n\n`;
  output += content;
  
  return output;
}

/**
 * Register the drive-find-and-get-document tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerDriveFindAndGetDocumentTool(mcp: McpServer): void {
  mcp.registerTool(
    'drive-find-and-get-document',
    {
      title: 'Find and Get Google Document Content',
      description:
        'Search for a Google document by name/text and retrieve its content in one step. Useful for queries like "what is ticket 1395 about?" - automatically finds the document and returns its content.',
      inputSchema: DriveFindAndGetDocumentSchema.shape,
    },
    async (args, context) => {
      console.log('drive-find-and-get-document called');

      try {
        // Validate input
        const params = DriveFindAndGetDocumentSchema.parse(args);

        console.log(`  Search query: ${params.searchQuery}`);

        // Get auth info with proper error handling
        const authInfo = getAuthInfoSafe(context, 'drive-find-and-get-document');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: No Google Drive access token found in authentication context',
              },
            ],
          };
        }

        // Create Google client
        const client = createGoogleClient(token);

        // Build search query
        const defaultMimeType = 'application/vnd.google-apps.document';
        const mimeType = params.mimeType || defaultMimeType;
        
        const searchQuery = `name contains '${params.searchQuery}' and mimeType='${mimeType}'`;
        
        console.log('  Step 1: Searching for matching files...');
        console.log(`  Query: ${searchQuery}`);

        // Search for matching files
        const searchResponse = await client.listFiles({
          query: searchQuery,
          pageSize: 10,
          orderBy: 'modifiedTime desc', // Most recently modified first
        });

        if (searchResponse.files.length === 0) {
          logger.info('drive-find-and-get-document: No matches found', {
            searchQuery: params.searchQuery,
            mimeType,
          });

          return {
            content: [
              {
                type: 'text',
                text: `No documents found matching "${params.searchQuery}"\n\nTips:\n- Try a shorter or more general search term\n- Check if the file name is spelled correctly\n- Verify you have access to the document`,
              },
            ],
          };
        }

        // Get the first (most recently modified) matching file
        const matchedFile = searchResponse.files[0];
        const matchCount = searchResponse.files.length;

        console.log(`  Found ${matchCount} matching file(s)`);
        console.log(`  Selected: "${matchedFile.name}" (ID: ${matchedFile.id})`);

        if (matchCount > 1) {
          console.log(`  Note: Multiple matches found, using most recently modified`);
        }

        // Step 2: Get document content
        console.log('  Step 2: Retrieving document content...');
        const content = await client.getDocumentContent(matchedFile.id);

        console.log(`  Retrieved content (${content.length} characters)`);

        logger.info('drive-find-and-get-document completed', {
          searchQuery: params.searchQuery,
          matchCount,
          selectedFile: matchedFile.name,
          fileId: matchedFile.id,
          contentLength: content.length,
        });

        // Format output with metadata
        const formattedOutput = formatDocumentWithMetadata(
          matchedFile.name,
          matchedFile.id,
          matchedFile.webViewLink,
          matchedFile.modifiedTime,
          content
        );

        // Add note if multiple matches
        let finalOutput = formattedOutput;
        if (matchCount > 1) {
          finalOutput += `\n\n---\n\n**Note**: Found ${matchCount} matching documents. Showing the most recently modified. `;
          finalOutput += `Use \`drive-list-files\` with the same query to see all matches.`;
        }

        return {
          content: [
            {
              type: 'text',
              text: finalOutput,
            },
          ],
        };
      } catch (error: any) {
        logger.error('drive-find-and-get-document error', { error: error.message });
        console.error('  Error in drive-find-and-get-document:', error);

        // Handle validation errors
        if (error.name === 'ZodError') {
          return {
            content: [
              {
                type: 'text',
                text: `Validation Error: ${error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
              },
            ],
          };
        }

        // Handle API errors
        if (error.message.includes('401')) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Invalid or expired Google Drive access token. Please re-authenticate.',
              },
            ],
          };
        }

        if (error.message.includes('403')) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Insufficient permissions to access Google Drive files. Please check your OAuth scopes.',
              },
            ],
          };
        }

        if (error.message.includes('404')) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Document not found or has been deleted.',
              },
            ],
          };
        }

        if (error.message.includes('429')) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Rate limit exceeded. Please try again in a few moments.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
