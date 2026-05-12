/**
 * Add Chart Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { parseA1RangeToGridRange, resolveSheetId, spreadsheetBatchUpdate } from '../sheets-helpers.js';

export function registerSheetsAddChartTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-add-chart',
    {
      title: 'Add Chart',
      description: 'Create a chart from a data range in a sheet tab.',
      inputSchema: {
        spreadsheetId: z.string().describe('Spreadsheet ID'),
        sheetName: z.string().describe('Sheet tab name'),
        chartType: z.enum(['COLUMN', 'BAR', 'LINE', 'AREA', 'PIE', 'SCATTER', 'COMBO', 'HISTOGRAM']).describe('Chart type'),
        dataRange: z.string().describe('A1 data range, e.g. A1:C10'),
        title: z.string().optional().describe('Chart title'),
        xAxisLabel: z.string().optional().describe('X-axis label'),
        yAxisLabel: z.string().optional().describe('Y-axis label'),
        positionX: z.number().int().min(0).optional().default(0),
        positionY: z.number().int().min(0).optional().default(0),
      },
    },
    async ({ spreadsheetId, sheetName, chartType, dataRange, title, xAxisLabel, yAxisLabel, positionX, positionY }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-add-chart');
        const token = authInfo?.google?.access_token;
        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);
        const gridRange = parseA1RangeToGridRange(dataRange, sheetId);

        const reply = await spreadsheetBatchUpdate(client, spreadsheetId, [{
          addChart: {
            chart: {
              spec: {
                title,
                basicChart: {
                  chartType,
                  legendPosition: 'BOTTOM_LEGEND',
                  axis: [
                    { position: 'BOTTOM_AXIS', title: xAxisLabel },
                    { position: 'LEFT_AXIS', title: yAxisLabel },
                  ],
                  domains: [{ domain: { sourceRange: { sources: [gridRange] } } }],
                  series: [{ series: { sourceRange: { sources: [gridRange] } } }],
                  headerCount: 1,
                },
              },
              position: {
                overlayPosition: {
                  anchorCell: {
                    sheetId,
                    rowIndex: positionY,
                    columnIndex: positionX,
                  },
                },
              },
            },
          },
        }]);

        logger.info('sheets-add-chart completed', { spreadsheetId, sheetName, chartType, dataRange });
        return { content: [{ type: 'text', text: JSON.stringify(reply, null, 2) }] };
      } catch (error: any) {
        logger.error('sheets-add-chart error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
