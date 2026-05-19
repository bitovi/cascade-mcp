/**
 * Manage Conditional Formatting Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { hexToSheetsColor, parseA1RangeToGridRange, resolveSheetId, spreadsheetBatchUpdate } from '../sheets-helpers.js';

export function registerSheetsManageConditionalFormattingTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-manage-conditional-formatting',
    {
      title: 'Manage Conditional Formatting',
      description: 'Add or delete conditional formatting rules on a range.',
      inputSchema: {
        spreadsheetId: z.string().describe('Spreadsheet ID'),
        sheetName: z.string().describe('Sheet tab name'),
        range: z.string().describe('A1 range, e.g. A2:A100'),
        action: z.enum(['add', 'delete']).describe('Action to perform'),
        ruleIndex: z.number().int().min(0).optional().describe('Rule index for delete'),
        conditionType: z.enum(['NUMBER_GREATER', 'TEXT_CONTAINS']).optional().describe('Rule condition type for add'),
        conditionValue: z.string().optional().describe('Condition value for add'),
        backgroundColor: z.string().optional().describe('Hex color for add, e.g. #ffdddd'),
      },
    },
    async ({ spreadsheetId, sheetName, range, action, ruleIndex, conditionType, conditionValue, backgroundColor }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-manage-conditional-formatting');
        const token = authInfo?.google?.access_token;
        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);

        if (action === 'delete') {
          if (ruleIndex === undefined) {
            return { content: [{ type: 'text', text: 'Error: ruleIndex is required for delete action.' }] };
          }

          await spreadsheetBatchUpdate(client, spreadsheetId, [{
            deleteConditionalFormatRule: { sheetId, index: ruleIndex },
          }]);

          logger.info('sheets-manage-conditional-formatting delete completed', { spreadsheetId, sheetName, ruleIndex });
          return { content: [{ type: 'text', text: `Deleted conditional formatting rule ${ruleIndex} on ${sheetName}.` }] };
        }

        if (!conditionType || !conditionValue) {
          return { content: [{ type: 'text', text: 'Error: conditionType and conditionValue are required for add action.' }] };
        }

        const gridRange = parseA1RangeToGridRange(range, sheetId);
        const format: Record<string, unknown> = {};
        if (backgroundColor) {
          format.backgroundColor = hexToSheetsColor(backgroundColor);
        }

        await spreadsheetBatchUpdate(client, spreadsheetId, [{
          addConditionalFormatRule: {
            index: 0,
            rule: {
              ranges: [gridRange],
              booleanRule: {
                condition: {
                  type: conditionType,
                  values: [{ userEnteredValue: conditionValue }],
                },
                format,
              },
            },
          },
        }]);

        logger.info('sheets-manage-conditional-formatting add completed', { spreadsheetId, sheetName, range, conditionType });
        return { content: [{ type: 'text', text: `Added conditional formatting rule to ${sheetName}!${range}.` }] };
      } catch (error: any) {
        logger.error('sheets-manage-conditional-formatting error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
