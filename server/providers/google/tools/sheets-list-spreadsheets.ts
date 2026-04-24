/**
 * List Google Spreadsheets Tool
 * Lists spreadsheets accessible to the authenticated user, with optional name filtering
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { listSpreadsheets } from '../sheets-helpers.js';

export function registerSheetsListSpreadsheetsTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-list-spreadsheets',
    {
      title: 'List Google Spreadsheets',
      description: 'List spreadsheets accessible to the authenticated user. Optionally filter by name substring.',
      inputSchema: {
        nameFilter: z.string().optional().describe('Optional substring to filter spreadsheet names'),
        maxResults: z.number().optional().default(25).describe('Maximum number of results to return (default 25)'),
      },
    },
    async ({ nameFilter, maxResults }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-list-spreadsheets');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }],
          };
        }

        const client = createGoogleClient(token);
        const result = await listSpreadsheets(client, maxResults, nameFilter);

        logger.info('sheets-list-spreadsheets completed', {
          count: result.files.length,
          nameFilter: nameFilter || '(none)',
        });

        if (result.files.length === 0) {
          return {
            content: [{ type: 'text', text: nameFilter
              ? `No spreadsheets found matching "${nameFilter}".`
              : 'No spreadsheets found.' }],
          };
        }

        const lines = result.files.map(
          (f) => `- **${f.name}**\n  ID: \`${f.id}\`\n  Modified: ${f.modifiedTime}\n  Link: ${f.webViewLink}`,
        );
        const text = `Found ${result.files.length} spreadsheet(s):\n\n${lines.join('\n\n')}`;

        return { content: [{ type: 'text', text }] };
      } catch (error: any) {
        logger.error('sheets-list-spreadsheets error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
