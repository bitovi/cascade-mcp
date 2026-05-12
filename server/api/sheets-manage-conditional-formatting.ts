import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { hexToSheetsColor, parseA1RangeToGridRange, resolveSheetId, spreadsheetBatchUpdate } from '../providers/google/sheets-helpers.js';

export async function handleSheetsManageConditionalFormatting(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, sheetName, range, action, ruleIndex, conditionType, conditionValue, backgroundColor } = req.body;
    if (!spreadsheetId || !sheetName || !range || !action) {
      res.status(400).json({ success: false, error: 'spreadsheetId, sheetName, range, and action are required.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);

    let result: unknown;
    if (action === 'delete') {
      if (!Number.isInteger(ruleIndex)) {
        res.status(400).json({ success: false, error: 'ruleIndex is required for delete action.' });
        return;
      }

      result = await spreadsheetBatchUpdate(client, spreadsheetId, [{
        deleteConditionalFormatRule: { sheetId, index: ruleIndex },
      }]);
    } else {
      if (!conditionType || !conditionValue) {
        res.status(400).json({ success: false, error: 'conditionType and conditionValue are required for add action.' });
        return;
      }

      const gridRange = parseA1RangeToGridRange(range, sheetId);
      const format: Record<string, unknown> = {};
      if (typeof backgroundColor === 'string') {
        format.backgroundColor = hexToSheetsColor(backgroundColor);
      }

      result = await spreadsheetBatchUpdate(client, spreadsheetId, [{
        addConditionalFormatRule: {
          index: 0,
          rule: {
            ranges: [gridRange],
            booleanRule: {
              condition: {
                type: String(conditionType),
                values: [{ userEnteredValue: String(conditionValue) }],
              },
              format,
            },
          },
        },
      }]);
    }

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
