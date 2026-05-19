import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { appendSheetValues } from '../providers/google/sheets-helpers.js';

export async function handleSheetsAppendRows(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, sheetName, values, valueInputOption = 'USER_ENTERED' } = req.body;
    if (!spreadsheetId || !sheetName || values === undefined) {
      res.status(400).json({ success: false, error: 'spreadsheetId, sheetName, and values are required.' });
      return;
    }

    let parsedValues: string[][];
    try {
      parsedValues = typeof values === 'string' ? JSON.parse(values) : values;
      if (!Array.isArray(parsedValues) || !parsedValues.every(Array.isArray)) throw new Error('values must be 2D array');
    } catch {
      res.status(400).json({ success: false, error: 'values must be a valid 2D JSON array.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const result = await appendSheetValues(client, spreadsheetId, `${sheetName}!A1`, parsedValues, valueInputOption === 'RAW' ? 'RAW' : 'USER_ENTERED');

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
