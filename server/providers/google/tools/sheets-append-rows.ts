/**
 * Append Rows Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { appendSheetValues } from '../sheets-helpers.js';

export function registerSheetsAppendRowsTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-append-rows',
    {
      title: 'Append Rows',
      description: 'Append rows of values to the end of a sheet.',
      inputSchema: {
        spreadsheetId: z.string().describe('Spreadsheet ID'),
        sheetName: z.string().describe('Sheet tab name'),
        values: z.string().describe('2D JSON array string'),
        valueInputOption: z.enum(['USER_ENTERED', 'RAW']).optional().default('USER_ENTERED'),
      },
    },
    async ({ spreadsheetId, sheetName, values, valueInputOption }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-append-rows');
        const token = authInfo?.google?.access_token;
        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        let parsedValues: string[][];
        try {
          parsedValues = JSON.parse(values);
          if (!Array.isArray(parsedValues) || !parsedValues.every(Array.isArray)) {
            throw new Error('values must be 2D array');
          }
        } catch {
          return { content: [{ type: 'text', text: 'Error: values must be valid 2D JSON array.' }] };
        }

        const client = createGoogleClient(token);
        const result = await appendSheetValues(client, spreadsheetId, `${sheetName}!A1`, parsedValues, valueInputOption);

        logger.info('sheets-append-rows completed', { spreadsheetId, sheetName, rows: parsedValues.length });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        logger.error('sheets-append-rows error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
