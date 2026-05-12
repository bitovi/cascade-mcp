/**
 * Add Columns Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { resolveSheetId, spreadsheetBatchUpdate } from '../sheets-helpers.js';

export function registerSheetsAddColumnsTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-add-columns',
    {
      title: 'Add Columns',
      description: 'Insert empty columns at a specific index in a sheet tab.',
      inputSchema: {
        spreadsheetId: z.string().describe('The Google Spreadsheet ID'),
        sheetName: z.string().describe('Sheet tab name'),
        count: z.number().int().positive().describe('Number of columns to insert'),
        startIndex: z.number().int().min(0).optional().default(0).describe('0-based start column index for insertion'),
      },
    },
    async ({ spreadsheetId, sheetName, count, startIndex }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-add-columns');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);

        await spreadsheetBatchUpdate(client, spreadsheetId, [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex,
                endIndex: startIndex + count,
              },
              inheritFromBefore: false,
            },
          },
        ]);

        logger.info('sheets-add-columns completed', { spreadsheetId, sheetName, count, startIndex });

        return {
          content: [{ type: 'text', text: `Inserted ${count} column(s) into "${sheetName}" at index ${startIndex}.` }],
        };
      } catch (error: any) {
        logger.error('sheets-add-columns error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
