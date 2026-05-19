import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { batchUpdateSheetValues } from '../providers/google/sheets-helpers.js';

export async function handleSheetsBatchUpdateCells(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, ranges, valueInputOption = 'USER_ENTERED' } = req.body;
    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      res.status(400).json({ success: false, error: 'spreadsheetId is required and must be a string.' });
      return;
    }

    let parsedRanges: Record<string, string[][]>;
    try {
      parsedRanges = typeof ranges === 'string' ? JSON.parse(ranges) : ranges;
      if (!parsedRanges || Array.isArray(parsedRanges)) {
        throw new Error('ranges must be an object');
      }
    } catch {
      res.status(400).json({ success: false, error: 'ranges must be a valid JSON object.' });
      return;
    }

    const data = Object.entries(parsedRanges).map(([range, values]) => ({ range, values }));
    const client = createGoogleClient(googleToken);
    const result = await batchUpdateSheetValues(client, spreadsheetId, data, valueInputOption === 'RAW' ? 'RAW' : 'USER_ENTERED');

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
