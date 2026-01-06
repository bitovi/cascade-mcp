/**
 * List Google Drive Files Tool
 * Lists files from authenticated user's Google Drive with filtering, search, and pagination
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import type { DriveFile } from '../types.js';

/**
 * Input schema for drive-list-files tool
 */
const DriveListFilesSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Search query using Google Drive query syntax (e.g., "mimeType=\'application/vnd.google-apps.document\'" for Google Docs, "name contains \'project\'" for files with "project" in name)'
    ),
  pageSize: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .describe('Number of files to return per page (1-1000, default: 100)'),
  pageToken: z
    .string()
    .optional()
    .describe('Token for retrieving the next page of results'),
  orderBy: z
    .string()
    .optional()
    .describe('Sort order (e.g., "modifiedTime desc", "name", "createdTime")'),
});

/**
 * Format file size in human-readable format
 */
function formatFileSize(sizeBytes: string | undefined): string {
  if (!sizeBytes) return 'N/A';
  const bytes = parseInt(sizeBytes, 10);
  if (isNaN(bytes)) return 'N/A';
  
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format date in human-readable format
 */
function formatDate(isoDate: string | undefined): string {
  if (!isoDate) return 'N/A';
  try {
    const date = new Date(isoDate);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Format files list as markdown table
 */
function formatFilesAsMarkdown(files: DriveFile[], nextPageToken?: string): string {
  if (files.length === 0) {
    return '# Google Drive Files\n\nNo files found matching the criteria.';
  }

  let output = `# Google Drive Files (${files.length} found)\n\n`;
  
  // Create markdown table
  output += '| Name | Type | Modified | Size | ID |\n';
  output += '|------|------|----------|------|----|\n';
  
  for (const file of files) {
    const mimeType = file.mimeType.replace('application/vnd.google-apps.', '');
    const name = file.name.replace(/\|/g, '\\|'); // Escape pipes in names
    const modified = formatDate(file.modifiedTime);
    const size = formatFileSize(file.size);
    
    output += `| ${name} | ${mimeType} | ${modified} | ${size} | \`${file.id}\` |\n`;
  }
  
  // Add links section
  output += '\n## File Links\n\n';
  for (const file of files) {
    if (file.webViewLink) {
      output += `- [${file.name}](${file.webViewLink})\n`;
    }
  }
  
  // Add pagination info
  if (nextPageToken) {
    output += `\n---\n\n**Next Page Token**: \`${nextPageToken}\`\n`;
    output += '\nTo get the next page, call this tool again with `pageToken` parameter.';
  }
  
  return output;
}

/**
 * Register the drive-list-files tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerDriveListFilesTool(mcp: McpServer): void {
  mcp.registerTool(
    'drive-list-files',
    {
      title: 'List Google Drive Files',
      description:
        "List files from the authenticated user's Google Drive. Supports filtering by query, pagination, and sorting.",
      inputSchema: DriveListFilesSchema.shape,
    },
    async (args, context) => {
      console.log('drive-list-files called');

      try {
        // Validate input
        const params = DriveListFilesSchema.parse(args);

        // Get auth info with proper error handling
        const authInfo = getAuthInfoSafe(context, 'drive-list-files');
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

        console.log('  Calling Google Drive API to list files...');
        if (params.query) {
          console.log(`  Query: ${params.query}`);
        }
        if (params.pageSize) {
          console.log(`  Page size: ${params.pageSize}`);
        }
        if (params.orderBy) {
          console.log(`  Order by: ${params.orderBy}`);
        }

        // Create Google client and call listFiles
        const client = createGoogleClient(token);
        const response = await client.listFiles({
          query: params.query,
          pageSize: params.pageSize,
          pageToken: params.pageToken,
          orderBy: params.orderBy,
        });

        console.log(`  Retrieved ${response.files.length} files`);
        if (response.nextPageToken) {
          console.log('  More results available (pagination)');
        }

        logger.info('drive-list-files completed', {
          fileCount: response.files.length,
          hasNextPage: !!response.nextPageToken,
          query: params.query,
          pageSize: params.pageSize,
        });

        // Format output as markdown
        const markdownOutput = formatFilesAsMarkdown(response.files, response.nextPageToken);

        return {
          content: [
            {
              type: 'text',
              text: markdownOutput,
            },
          ],
        };
      } catch (error: any) {
        logger.error('drive-list-files error', { error: error.message });
        console.error('  Error in drive-list-files:', error);

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
