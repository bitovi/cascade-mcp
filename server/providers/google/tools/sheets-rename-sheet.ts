/**
 * Rename Sheet Tab Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { resolveSheetId, spreadsheetBatchUpdate } from '../sheets-helpers.js';

export function registerSheetsRenameSheetTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-rename-sheet',
    {
      title: 'Rename Sheet Tab',
      description: 'Rename a sheet tab in a Google Spreadsheet.',
      inputSchema: {
        spreadsheetId: z.string().describe('The Google Spreadsheet ID'),
        sheetName: z.string().describe('Current sheet tab name'),
        newName: z.string().min(1).describe('New sheet tab name'),
      },
    },
    async ({ spreadsheetId, sheetName, newName }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-rename-sheet');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);

        await spreadsheetBatchUpdate(client, spreadsheetId, [
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                title: newName,
              },
              fields: 'title',
            },
          },
        ]);

        logger.info('sheets-rename-sheet completed', { spreadsheetId, sheetName, newName });

        return {
          content: [{ type: 'text', text: `Renamed sheet tab "${sheetName}" to "${newName}".` }],
        };
      } catch (error: any) {
        logger.error('sheets-rename-sheet error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
