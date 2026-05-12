/**
 * Create Sheet Tab Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { spreadsheetBatchUpdate } from '../sheets-helpers.js';

export function registerSheetsCreateSheetTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-create-sheet',
    {
      title: 'Create Sheet Tab',
      description: 'Add a new sheet tab to an existing spreadsheet.',
      inputSchema: {
        spreadsheetId: z.string().describe('The Google Spreadsheet ID'),
        title: z.string().min(1).describe('New sheet tab name'),
      },
    },
    async ({ spreadsheetId, title }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-create-sheet');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const result = await spreadsheetBatchUpdate(client, spreadsheetId, [
          { addSheet: { properties: { title } } },
        ]);

        logger.info('sheets-create-sheet completed', { spreadsheetId, title });

        return {
          content: [{
            type: 'text',
            text: `Created sheet tab "${title}" in spreadsheet ${result.spreadsheetId}.`,
          }],
        };
      } catch (error: any) {
        logger.error('sheets-create-sheet error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
