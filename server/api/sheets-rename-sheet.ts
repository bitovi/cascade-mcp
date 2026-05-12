import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { resolveSheetId, spreadsheetBatchUpdate } from '../providers/google/sheets-helpers.js';

export async function handleSheetsRenameSheet(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, sheetName, newName } = req.body;
    if (!spreadsheetId || !sheetName || !newName || typeof spreadsheetId !== 'string' || typeof sheetName !== 'string' || typeof newName !== 'string') {
      res.status(400).json({ success: false, error: 'spreadsheetId, sheetName, and newName are required string fields.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);
    const result = await spreadsheetBatchUpdate(client, spreadsheetId, [
      {
        updateSheetProperties: {
          properties: { sheetId, title: newName },
          fields: 'title',
        },
      },
    ]);

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
