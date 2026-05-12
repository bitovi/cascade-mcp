import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { spreadsheetBatchUpdate } from '../providers/google/sheets-helpers.js';

export async function handleSheetsCreateSheet(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, title } = req.body;
    if (!spreadsheetId || !title || typeof spreadsheetId !== 'string' || typeof title !== 'string') {
      res.status(400).json({ success: false, error: 'spreadsheetId and title are required string fields.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const result = await spreadsheetBatchUpdate(client, spreadsheetId, [
      { addSheet: { properties: { title } } },
    ]);

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
