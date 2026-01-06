/**
 * Get Google Document Content Tool
 * Retrieves plain text content from a Google Doc using its file ID
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';

/**
 * Input schema for drive-get-document tool
 */
const DriveGetDocumentSchema = z.object({
  fileId: z
    .string()
    .min(1)
    .describe('The file ID of the Google Doc to retrieve (e.g., "1abc...xyz")'),
});

/**
 * Format document content with metadata header
 */
function formatDocumentContent(fileId: string, content: string): string {
  const lines = content.split('\n');
  const contentLength = content.length;
  const lineCount = lines.length;
  
  let output = `# Google Document Content\n\n`;
  output += `**File ID**: \`${fileId}\`\n`;
  output += `**Content Length**: ${contentLength.toLocaleString()} characters\n`;
  output += `**Line Count**: ${lineCount.toLocaleString()} lines\n\n`;
  output += `---\n\n`;
  output += content;
  
  return output;
}

/**
 * Register the drive-get-document tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerDriveGetDocumentTool(mcp: McpServer): void {
  mcp.registerTool(
    'drive-get-document',
    {
      title: 'Get Google Document Content',
      description:
        'Retrieve plain text content from a Google Doc using its file ID. Exports the document as plain text preserving basic structure.',
      inputSchema: DriveGetDocumentSchema.shape,
    },
    async (args, context) => {
      console.log('drive-get-document called');

      try {
        // Validate input
        const params = DriveGetDocumentSchema.parse(args);

        console.log(`  File ID: ${params.fileId}`);

        // Get auth info with proper error handling
        const authInfo = getAuthInfoSafe(context, 'drive-get-document');
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

        console.log('  Calling Google Drive API to export document...');

        // Create Google client and get document content
        const client = createGoogleClient(token);
        const content = await client.getDocumentContent(params.fileId);

        console.log(`  Retrieved document content (${content.length} characters)`);

        logger.info('drive-get-document completed', {
          fileId: params.fileId,
          contentLength: content.length,
          lineCount: content.split('\n').length,
        });

        // Format output with metadata
        const formattedOutput = formatDocumentContent(params.fileId, content);

        return {
          content: [
            {
              type: 'text',
              text: formattedOutput,
            },
          ],
        };
      } catch (error: any) {
        logger.error('drive-get-document error', { error: error.message });
        console.error('  Error in drive-get-document:', error);

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
                text: 'Error: Insufficient permissions to access this document. Please check file permissions.',
              },
            ],
          };
        }

        if (error.message.includes('404')) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Document not found (File ID: ${args.fileId}). The file may have been deleted or you may not have access.`,
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

        // Handle unsupported file types
        if (error.message.includes('export') || error.message.includes('mimeType')) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: This file type cannot be exported as plain text. Only Google Docs are currently supported.',
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
