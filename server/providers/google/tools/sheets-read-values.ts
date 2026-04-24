/**
 * Read Sheet Values Tool
 * Reads cell values from a specific range in a Google Spreadsheet
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { readSheetValues } from '../sheets-helpers.js';

export function registerSheetsReadValuesTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-read-values',
    {
      title: 'Read Sheet Values',
      description: 'Read cell values from a range in a Google Spreadsheet. Returns the values as a formatted table. Use A1 notation for the range (e.g. "Sheet1!A1:D10").',
      inputSchema: {
        spreadsheetId: z.string().describe('The Google Spreadsheet ID'),
        range: z.string().optional().default('A1:Z1000').describe('A1 notation range (e.g. "Sheet1!A1:D10"). Defaults to A1:Z1000'),
      },
    },
    async ({ spreadsheetId, range }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-read-values');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }],
          };
        }

        const client = createGoogleClient(token);
        const result = await readSheetValues(client, spreadsheetId, range);

        const values = result.values || [];

        logger.info('sheets-read-values completed', {
          spreadsheetId,
          range: result.range,
          rows: values.length,
        });

        if (values.length === 0) {
          return {
            content: [{ type: 'text', text: `No data found in range "${result.range}".` }],
          };
        }

        // Format as a simple table: first row as header, rest as data rows
        const maxCols = Math.max(...values.map((row) => row.length));
        const padded = values.map((row) => {
          const r = [...row];
          while (r.length < maxCols) r.push('');
          return r;
        });

        // Build markdown table
        const header = padded[0];
        const separator = header.map(() => '---');
        const tableRows = [
          `| ${header.join(' | ')} |`,
          `| ${separator.join(' | ')} |`,
          ...padded.slice(1).map((row) => `| ${row.join(' | ')} |`),
        ];

        const displayRows = padded.length - 1; // exclude header
        const MAX_DISPLAY_ROWS = 100;
        let text: string;
        if (displayRows > MAX_DISPLAY_ROWS) {
          const truncatedTable = [
            tableRows[0],
            tableRows[1],
            ...tableRows.slice(2, MAX_DISPLAY_ROWS + 2),
          ];
          text = `Range: ${result.range} (${values.length} rows, showing first ${MAX_DISPLAY_ROWS})\n\n${truncatedTable.join('\n')}\n\n... and ${displayRows - MAX_DISPLAY_ROWS} more rows`;
        } else {
          text = `Range: ${result.range} (${values.length} rows)\n\n${tableRows.join('\n')}`;
        }

        return { content: [{ type: 'text', text }] };
      } catch (error: any) {
        logger.error('sheets-read-values error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
