import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { shareSpreadsheet } from '../providers/google/sheets-helpers.js';

export async function handleSheetsShare(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, email, role, sendNotification = true } = req.body;
    if (!spreadsheetId || !email || !role) {
      res.status(400).json({ success: false, error: 'spreadsheetId, email, and role are required.' });
      return;
    }

    if (!['reader', 'commenter', 'writer'].includes(role)) {
      res.status(400).json({ success: false, error: 'role must be one of reader, commenter, writer.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const result = await shareSpreadsheet(client, spreadsheetId, email, role, Boolean(sendNotification));
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
