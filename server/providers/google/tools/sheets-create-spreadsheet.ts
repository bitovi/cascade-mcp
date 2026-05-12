/**
 * Create Spreadsheet Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { createSpreadsheet } from '../sheets-helpers.js';

export function registerSheetsCreateSpreadsheetTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-create-spreadsheet',
    {
      title: 'Create Spreadsheet',
      description: 'Create a new Google Spreadsheet with an optional list of initial sheet tab names.',
      inputSchema: {
        title: z.string().min(1).describe('Spreadsheet title'),
        sheetNames: z.array(z.string().min(1)).optional().describe('Optional initial sheet tab names'),
      },
    },
    async ({ title, sheetNames }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-create-spreadsheet');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const result = await createSpreadsheet(client, title, sheetNames);

        logger.info('sheets-create-spreadsheet completed', {
          spreadsheetId: result.spreadsheetId,
          title: result.properties.title,
        });

        return {
          content: [{
            type: 'text',
            text: `Created spreadsheet: ${result.properties.title}\nID: ${result.spreadsheetId}\nURL: ${result.spreadsheetUrl}`,
          }],
        };
      } catch (error: any) {
        logger.error('sheets-create-spreadsheet error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
