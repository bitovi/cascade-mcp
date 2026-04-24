/**
 * Write/Clear Sheet Values Tool
 * Writes values to or clears a range in a Google Spreadsheet
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { writeSheetValues, clearSheetValues } from '../sheets-helpers.js';

export function registerSheetsWriteValuesTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-write-values',
    {
      title: 'Write Sheet Values',
      description: 'Write values to or clear a range in a Google Spreadsheet. Provide a 2D JSON array of values for writing, or set clearValues to true to clear the range.',
      inputSchema: {
        spreadsheetId: z.string().describe('The Google Spreadsheet ID'),
        range: z.string().describe('A1 notation range (e.g. "Sheet1!A1:D10")'),
        values: z.string().optional().describe('2D JSON array of values to write, e.g. [["Name","Age"],["Alice","30"]]. Required unless clearValues is true.'),
        valueInputOption: z.enum(['USER_ENTERED', 'RAW']).optional().default('USER_ENTERED').describe('How to interpret input values. USER_ENTERED parses formulas and formats; RAW stores as-is. Default: USER_ENTERED'),
        clearValues: z.boolean().optional().default(false).describe('If true, clear the range instead of writing values'),
      },
    },
    async ({ spreadsheetId, range, values, valueInputOption, clearValues }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-write-values');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }],
          };
        }

        const client = createGoogleClient(token);

        // Clear mode
        if (clearValues) {
          const result = await clearSheetValues(client, spreadsheetId, range);

          logger.info('sheets-write-values cleared', {
            spreadsheetId,
            clearedRange: result.clearedRange,
          });

          return {
            content: [{ type: 'text', text: `Cleared range: ${result.clearedRange}` }],
          };
        }

        // Write mode — values required
        if (!values) {
          return {
            content: [{ type: 'text', text: 'Error: "values" parameter is required when clearValues is not true. Provide a 2D JSON array, e.g. [["A","B"],["1","2"]]' }],
          };
        }

        let parsedValues: string[][];
        try {
          parsedValues = JSON.parse(values);
          if (!Array.isArray(parsedValues) || !parsedValues.every(Array.isArray)) {
            throw new Error('not a 2D array');
          }
        } catch {
          return {
            content: [{ type: 'text', text: 'Error: "values" must be a valid 2D JSON array, e.g. [["Name","Age"],["Alice","30"]]' }],
          };
        }

        const result = await writeSheetValues(client, spreadsheetId, range, parsedValues, valueInputOption);

        logger.info('sheets-write-values completed', {
          spreadsheetId,
          updatedRange: result.updatedRange,
          updatedRows: result.updatedRows,
          updatedColumns: result.updatedColumns,
          updatedCells: result.updatedCells,
        });

        const text = [
          `Successfully wrote to spreadsheet.`,
          `Updated range: ${result.updatedRange}`,
          `Rows: ${result.updatedRows}, Columns: ${result.updatedColumns}, Cells: ${result.updatedCells}`,
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      } catch (error: any) {
        logger.error('sheets-write-values error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
