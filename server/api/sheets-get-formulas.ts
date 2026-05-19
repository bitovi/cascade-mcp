import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { readSheetFormulas } from '../providers/google/sheets-helpers.js';

export async function handleSheetsGetFormulas(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, range = 'A1:Z1000' } = req.body;
    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      res.status(400).json({ success: false, error: 'spreadsheetId is required and must be a string.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const result = await readSheetFormulas(client, spreadsheetId, String(range));

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
