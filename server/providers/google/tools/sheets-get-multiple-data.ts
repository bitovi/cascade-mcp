/**
 * Get Multiple Sheet Data Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { readSheetValues } from '../sheets-helpers.js';

interface MultiQuery {
  spreadsheetId: string;
  range: string;
}

export function registerSheetsGetMultipleDataTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-get-multiple-data',
    {
      title: 'Get Multiple Sheet Data',
      description: 'Fetch data from multiple ranges across one or more spreadsheets.',
      inputSchema: {
        queries: z.string().describe('JSON array of { spreadsheetId, range } objects'),
      },
    },
    async ({ queries }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-get-multiple-data');
        const token = authInfo?.google?.access_token;
        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        let parsedQueries: MultiQuery[];
        try {
          parsedQueries = JSON.parse(queries);
          if (!Array.isArray(parsedQueries)) throw new Error('queries must be array');
        } catch {
          return { content: [{ type: 'text', text: 'Error: queries must be valid JSON array, e.g. [{"spreadsheetId":"...","range":"Sheet1!A1:B2"}]' }] };
        }

        const client = createGoogleClient(token);
        const results = await Promise.all(parsedQueries.map(async (q) => {
          try {
            const data = await readSheetValues(client, q.spreadsheetId, q.range);
            return { ...q, data };
          } catch (error: any) {
            return { ...q, error: error.message };
          }
        }));

        logger.info('sheets-get-multiple-data completed', { queryCount: parsedQueries.length });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      } catch (error: any) {
        logger.error('sheets-get-multiple-data error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
