import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { readSheetValues } from '../providers/google/sheets-helpers.js';

interface Query {
  spreadsheetId: string;
  range: string;
}

export async function handleSheetsGetMultipleData(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { queries } = req.body;
    let parsedQueries: Query[];
    try {
      parsedQueries = typeof queries === 'string' ? JSON.parse(queries) : queries;
      if (!Array.isArray(parsedQueries)) throw new Error('queries must be array');
    } catch {
      res.status(400).json({ success: false, error: 'queries must be a valid JSON array.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const result = await Promise.all(parsedQueries.map(async (q) => {
      try {
        return { ...q, data: await readSheetValues(client, q.spreadsheetId, q.range) };
      } catch (error: any) {
        return { ...q, error: error.message };
      }
    }));

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
