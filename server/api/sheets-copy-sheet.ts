import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { copySheetToSpreadsheet, resolveSheetId, spreadsheetBatchUpdate } from '../providers/google/sheets-helpers.js';

export async function handleSheetsCopySheet(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { srcSpreadsheetId, srcSheetName, dstSpreadsheetId, dstSheetName } = req.body;
    if (!srcSpreadsheetId || !srcSheetName || !dstSpreadsheetId) {
      res.status(400).json({ success: false, error: 'srcSpreadsheetId, srcSheetName, and dstSpreadsheetId are required.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const srcSheetId = await resolveSheetId(client, srcSpreadsheetId, srcSheetName);
    const copied = await copySheetToSpreadsheet(client, srcSpreadsheetId, srcSheetId, dstSpreadsheetId);

    if (typeof dstSheetName === 'string' && dstSheetName.trim()) {
      await spreadsheetBatchUpdate(client, dstSpreadsheetId, [{
        updateSheetProperties: {
          properties: { sheetId: copied.sheetId, title: dstSheetName },
          fields: 'title',
        },
      }]);
    }

    res.json({ success: true, result: copied });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
