import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { createSpreadsheet } from '../providers/google/sheets-helpers.js';

export async function handleSheetsCreateSpreadsheet(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { title, sheetNames } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({ success: false, error: 'title is required and must be a string.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const result = await createSpreadsheet(client, title, Array.isArray(sheetNames) ? sheetNames : undefined);

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
