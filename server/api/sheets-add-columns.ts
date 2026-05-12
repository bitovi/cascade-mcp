import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { resolveSheetId, spreadsheetBatchUpdate } from '../providers/google/sheets-helpers.js';

export async function handleSheetsAddColumns(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, sheetName, count, startIndex = 0 } = req.body;
    if (!spreadsheetId || !sheetName || typeof spreadsheetId !== 'string' || typeof sheetName !== 'string') {
      res.status(400).json({ success: false, error: 'spreadsheetId and sheetName are required string fields.' });
      return;
    }
    if (!Number.isInteger(count) || count <= 0) {
      res.status(400).json({ success: false, error: 'count must be a positive integer.' });
      return;
    }
    if (!Number.isInteger(startIndex) || startIndex < 0) {
      res.status(400).json({ success: false, error: 'startIndex must be a non-negative integer.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);
    const result = await spreadsheetBatchUpdate(client, spreadsheetId, [
      {
        insertDimension: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex,
            endIndex: startIndex + count,
          },
          inheritFromBefore: false,
        },
      },
    ]);

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
