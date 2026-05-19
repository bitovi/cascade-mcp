/**
 * Get Sheet Formulas Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { readSheetFormulas } from '../sheets-helpers.js';

export function registerSheetsGetFormulasTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-get-formulas',
    {
      title: 'Get Sheet Formulas',
      description: 'Read formulas from a range using valueRenderOption=FORMULA.',
      inputSchema: {
        spreadsheetId: z.string().describe('The Google Spreadsheet ID'),
        range: z.string().optional().default('A1:Z1000').describe('A1 notation range'),
      },
    },
    async ({ spreadsheetId, range }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-get-formulas');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const result = await readSheetFormulas(client, spreadsheetId, range);

        logger.info('sheets-get-formulas completed', {
          spreadsheetId,
          range: result.range,
          rows: result.values?.length ?? 0,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ range: result.range, values: result.values || [] }, null, 2),
          }],
        };
      } catch (error: any) {
        logger.error('sheets-get-formulas error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
