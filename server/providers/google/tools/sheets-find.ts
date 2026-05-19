/**
 * Find in Spreadsheet Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { getSpreadsheetInfo, readSheetValues } from '../sheets-helpers.js';

function colIndexToLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function registerSheetsFindTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-find',
    {
      title: 'Find in Spreadsheet',
      description: 'Find text occurrences in one sheet tab or all sheet tabs.',
      inputSchema: {
        spreadsheetId: z.string().describe('Spreadsheet ID'),
        searchText: z.string().min(1).describe('Text to search for'),
        sheetName: z.string().optional().describe('Optional sheet tab name to limit search'),
      },
    },
    async ({ spreadsheetId, searchText, sheetName }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-find');
        const token = authInfo?.google?.access_token;
        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const sheetNames = sheetName
          ? [sheetName]
          : (await getSpreadsheetInfo(client, spreadsheetId)).sheets.map((s) => s.properties.title);

        const needle = searchText.toLowerCase();
        const matches: Array<{ sheetName: string; cell: string; value: string }> = [];

        for (const tab of sheetNames) {
          const result = await readSheetValues(client, spreadsheetId, `${tab}!A1:Z1000`);
          const values = result.values || [];
          values.forEach((row, r) => {
            row.forEach((cell, c) => {
              if (String(cell).toLowerCase().includes(needle)) {
                matches.push({ sheetName: tab, cell: `${colIndexToLetters(c)}${r + 1}`, value: String(cell) });
              }
            });
          });
        }

        logger.info('sheets-find completed', { spreadsheetId, searchText, matchCount: matches.length });
        return { content: [{ type: 'text', text: JSON.stringify({ matchCount: matches.length, matches }, null, 2) }] };
      } catch (error: any) {
        logger.error('sheets-find error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
