/**
 * Copy Sheet Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { copySheetToSpreadsheet, resolveSheetId, spreadsheetBatchUpdate } from '../sheets-helpers.js';

export function registerSheetsCopySheetTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-copy-sheet',
    {
      title: 'Copy Sheet',
      description: 'Copy a sheet tab from one spreadsheet to another and optionally rename it.',
      inputSchema: {
        srcSpreadsheetId: z.string().describe('Source spreadsheet ID'),
        srcSheetName: z.string().describe('Source sheet tab name'),
        dstSpreadsheetId: z.string().describe('Destination spreadsheet ID'),
        dstSheetName: z.string().optional().describe('Optional destination tab name after copy'),
      },
    },
    async ({ srcSpreadsheetId, srcSheetName, dstSpreadsheetId, dstSheetName }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-copy-sheet');
        const token = authInfo?.google?.access_token;
        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const srcSheetId = await resolveSheetId(client, srcSpreadsheetId, srcSheetName);
        const copied = await copySheetToSpreadsheet(client, srcSpreadsheetId, srcSheetId, dstSpreadsheetId);

        if (dstSheetName) {
          await spreadsheetBatchUpdate(client, dstSpreadsheetId, [{
            updateSheetProperties: {
              properties: { sheetId: copied.sheetId, title: dstSheetName },
              fields: 'title',
            },
          }]);
        }

        logger.info('sheets-copy-sheet completed', { srcSpreadsheetId, srcSheetName, dstSpreadsheetId, dstSheetName });

        return { content: [{ type: 'text', text: `Copied sheet to destination spreadsheet. New sheetId: ${copied.sheetId}` }] };
      } catch (error: any) {
        logger.error('sheets-copy-sheet error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
