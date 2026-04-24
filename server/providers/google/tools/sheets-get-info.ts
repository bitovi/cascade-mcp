/**
 * Get Spreadsheet Info Tool
 * Retrieves spreadsheet metadata including title, locale, and sheet tab details
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { getSpreadsheetInfo } from '../sheets-helpers.js';

export function registerSheetsGetInfoTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-get-info',
    {
      title: 'Get Spreadsheet Info',
      description: 'Get spreadsheet metadata including title, locale, and details about each sheet tab (name, dimensions, frozen rows/columns).',
      inputSchema: {
        spreadsheetId: z.string().describe('The Google Spreadsheet ID'),
      },
    },
    async ({ spreadsheetId }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-get-info');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }],
          };
        }

        const client = createGoogleClient(token);
        const info = await getSpreadsheetInfo(client, spreadsheetId);

        logger.info('sheets-get-info completed', {
          spreadsheetId,
          title: info.properties.title,
          sheetCount: info.sheets.length,
        });

        const sheetsDetail = info.sheets.map((s) => {
          const p = s.properties;
          const grid = p.gridProperties;
          let detail = `  - **${p.title}** (id: ${p.sheetId}, index: ${p.index}, type: ${p.sheetType})`;
          if (grid) {
            detail += `\n    Dimensions: ${grid.rowCount} rows × ${grid.columnCount} columns`;
            if (grid.frozenRowCount) detail += `, ${grid.frozenRowCount} frozen row(s)`;
            if (grid.frozenColumnCount) detail += `, ${grid.frozenColumnCount} frozen column(s)`;
          }
          return detail;
        });

        const text = [
          `**${info.properties.title}**`,
          `Spreadsheet ID: \`${info.spreadsheetId}\``,
          `Locale: ${info.properties.locale}`,
          `URL: ${info.spreadsheetUrl}`,
          ``,
          `**Sheets (${info.sheets.length}):**`,
          ...sheetsDetail,
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      } catch (error: any) {
        logger.error('sheets-get-info error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
