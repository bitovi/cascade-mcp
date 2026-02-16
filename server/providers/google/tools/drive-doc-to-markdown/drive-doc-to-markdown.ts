/**
 * MCP Tool: Google Drive Document to Markdown Converter
 * Converts Google Docs documents to Markdown format
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { executeDriveDocToMarkdown } from './core-logic.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createGoogleClient } from '../../google-api-client.js';
import type { ConversionRequest } from './types.js';

// Tool parameters interface
interface DriveDocToMarkdownParams {
  url: string;
}

/**
 * Register the drive-doc-to-markdown MCP tool
 */
export function registerDriveDocToMarkdownTool(mcp: McpServer): void {
  mcp.registerTool(
    'google-drive-doc-to-markdown',
    {
      title: 'Convert Google Doc to Markdown',
      description:
        'Convert a Google Docs document to Markdown format. ' +
        'Supports headings, formatting (bold, italic), lists (ordered/unordered with nesting), ' +
        'and hyperlinks.',
      inputSchema: {
        url: z.string().describe(
          'Google Docs URL or document ID. ' +
          'Supports formats: ' +
          'https://docs.google.com/document/d/{id}/edit, ' +
          'https://docs.google.com/document/u/0/d/{id}/edit, ' +
          'or bare document ID'
        ),
      },
    },
    async ({ url }: DriveDocToMarkdownParams, context: any) => {
      try {
        // Get authentication context
        const authInfo = getAuthInfoSafe(context, 'google-drive-doc-to-markdown');
        const token = authInfo?.google?.access_token;
        
        if (!token) {
          return {
            content: [{
              type: 'text',
              text: 'Error: Google Drive authentication required. Please authenticate with Google Drive first.',
            }],
          };
        }
        
        // Create Google API client
        const googleClient = createGoogleClient(token);
        
        // Build conversion request
        const request: ConversionRequest = {
          url,
        };
        
        // Execute conversion
        const result = await executeDriveDocToMarkdown(request, googleClient);
        
        return {
          content: [{
            type: 'text',
            text: result.markdown,
          }],
        };
        
      } catch (error) {

        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          content: [{
            type: 'text',
            text: `Error converting document: ${errorMessage}`,
          }],
        };
      }
    }
  );
}
