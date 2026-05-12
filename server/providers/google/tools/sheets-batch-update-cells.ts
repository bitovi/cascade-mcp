/**
 * Batch Update Cells Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { batchUpdateSheetValues } from '../sheets-helpers.js';

export function registerSheetsBatchUpdateCellsTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-batch-update-cells',
    {
      title: 'Batch Update Cells',
      description: 'Update multiple ranges in one API call. ranges must be a JSON object map: {"A1:B2":[["1","2"]]}.',
      inputSchema: {
        spreadsheetId: z.string().describe('The Google Spreadsheet ID'),
        ranges: z.string().describe('JSON object mapping A1 ranges to 2D arrays'),
        valueInputOption: z.enum(['USER_ENTERED', 'RAW']).optional().default('USER_ENTERED'),
      },
    },
    async ({ spreadsheetId, ranges, valueInputOption }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-batch-update-cells');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        let parsedRanges: Record<string, string[][]>;
        try {
          parsedRanges = JSON.parse(ranges);
          if (!parsedRanges || Array.isArray(parsedRanges)) {
            throw new Error('ranges must be an object');
          }
        } catch {
          return { content: [{ type: 'text', text: 'Error: ranges must be a valid JSON object, e.g. {"A1:B2":[["1","2"]]}' }] };
        }

        const data = Object.entries(parsedRanges).map(([range, values]) => ({ range, values }));

        const client = createGoogleClient(token);
        const result = await batchUpdateSheetValues(client, spreadsheetId, data, valueInputOption);

        logger.info('sheets-batch-update-cells completed', {
          spreadsheetId,
          ranges: data.length,
          updatedCells: result.totalUpdatedCells,
        });

        return {
          content: [{
            type: 'text',
            text: `Batch update complete. Updated cells: ${result.totalUpdatedCells ?? 0}, ranges: ${data.length}.`,
          }],
        };
      } catch (error: any) {
        logger.error('sheets-batch-update-cells error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
