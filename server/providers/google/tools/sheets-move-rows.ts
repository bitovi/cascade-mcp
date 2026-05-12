/**
 * Move Rows Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { clearSheetValues, columnNumberToLetters, getSpreadsheetInfo, parseRowRange, readSheetValues, writeSheetValues } from '../sheets-helpers.js';

export function registerSheetsMoveRowsTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-move-rows',
    {
      title: 'Move Rows',
      description: 'Move rows between sheets by reading source rows, writing destination rows, and clearing source rows.',
      inputSchema: {
        spreadsheetId: z.string().describe('Spreadsheet ID'),
        srcSheetName: z.string().describe('Source sheet tab name'),
        srcRange: z.string().describe('Row range in format start:end (1-based), e.g. 2:5'),
        dstSheetName: z.string().describe('Destination sheet tab name'),
        dstStartRow: z.number().int().min(1).optional().default(1).describe('Destination start row (1-based)'),
      },
    },
    async ({ spreadsheetId, srcSheetName, srcRange, dstSheetName, dstStartRow }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-move-rows');
        const token = authInfo?.google?.access_token;
        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const { startRow, endRow } = parseRowRange(srcRange);
        const info = await getSpreadsheetInfo(client, spreadsheetId);
        const srcSheet = info.sheets.find((s) => s.properties.title === srcSheetName);

        if (!srcSheet?.properties.gridProperties?.columnCount) {
          return { content: [{ type: 'text', text: `Error: Could not resolve source sheet column count for ${srcSheetName}.` }] };
        }

        const endColumnLetter = columnNumberToLetters(srcSheet.properties.gridProperties.columnCount);
        const sourceA1 = `${srcSheetName}!A${startRow}:${endColumnLetter}${endRow}`;
        const sourceData = await readSheetValues(client, spreadsheetId, sourceA1);
        const rows = sourceData.values || [];

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: 'No rows found in source range to move.' }] };
        }

        const dstEndRow = dstStartRow + rows.length - 1;
        const destinationA1 = `${dstSheetName}!A${dstStartRow}:${endColumnLetter}${dstEndRow}`;
        await writeSheetValues(client, spreadsheetId, destinationA1, rows, 'USER_ENTERED');
        await clearSheetValues(client, spreadsheetId, sourceA1);

        logger.info('sheets-move-rows completed', { spreadsheetId, srcSheetName, srcRange, dstSheetName, dstStartRow, movedRows: rows.length });
        return { content: [{ type: 'text', text: `Moved ${rows.length} row(s) from ${srcSheetName}:${srcRange} to ${dstSheetName} starting at row ${dstStartRow}.` }] };
      } catch (error: any) {
        logger.error('sheets-move-rows error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
