/**
 * Format Sheet Range Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { hexToSheetsColor, parseA1RangeToGridRange, resolveSheetId, spreadsheetBatchUpdate } from '../sheets-helpers.js';

export function registerSheetsFormatRangeTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-format-range',
    {
      title: 'Format Sheet Range',
      description: 'Apply formatting to a range (bold, italic, colors, font size).',
      inputSchema: {
        spreadsheetId: z.string().describe('Spreadsheet ID'),
        sheetName: z.string().describe('Sheet tab name'),
        range: z.string().describe('A1 range within the sheet, e.g. A1:D10'),
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        fontSize: z.number().int().positive().optional(),
        fontColor: z.string().optional().describe('Hex color, e.g. #112233'),
        backgroundColor: z.string().optional().describe('Hex color, e.g. #f0f0f0'),
      },
    },
    async ({ spreadsheetId, sheetName, range, bold, italic, fontSize, fontColor, backgroundColor }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-format-range');
        const token = authInfo?.google?.access_token;
        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);
        const gridRange = parseA1RangeToGridRange(range, sheetId);

        const textFormat: Record<string, unknown> = {};
        if (bold !== undefined) textFormat.bold = bold;
        if (italic !== undefined) textFormat.italic = italic;
        if (fontSize !== undefined) textFormat.fontSize = fontSize;
        if (fontColor) textFormat.foregroundColor = hexToSheetsColor(fontColor);

        const cellFormat: Record<string, unknown> = {};
        if (Object.keys(textFormat).length > 0) cellFormat.textFormat = textFormat;
        if (backgroundColor) cellFormat.backgroundColor = hexToSheetsColor(backgroundColor);

        if (Object.keys(cellFormat).length === 0) {
          return { content: [{ type: 'text', text: 'Error: No formatting properties provided.' }] };
        }

        await spreadsheetBatchUpdate(client, spreadsheetId, [{
          repeatCell: {
            range: gridRange,
            cell: { userEnteredFormat: cellFormat },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        }]);

        logger.info('sheets-format-range completed', { spreadsheetId, sheetName, range });
        return { content: [{ type: 'text', text: `Formatted ${sheetName}!${range}` }] };
      } catch (error: any) {
        logger.error('sheets-format-range error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
