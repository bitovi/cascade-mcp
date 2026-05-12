import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { getSpreadsheetInfo, readSheetValues } from '../providers/google/sheets-helpers.js';

function colIndexToLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export async function handleSheetsFind(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, searchText, sheetName } = req.body;
    if (!spreadsheetId || !searchText) {
      res.status(400).json({ success: false, error: 'spreadsheetId and searchText are required.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const tabs = sheetName
      ? [String(sheetName)]
      : (await getSpreadsheetInfo(client, spreadsheetId)).sheets.map((s) => s.properties.title);

    const needle = String(searchText).toLowerCase();
    const matches: Array<{ sheetName: string; cell: string; value: string }> = [];

    for (const tab of tabs) {
      const data = await readSheetValues(client, spreadsheetId, `${tab}!A1:Z1000`);
      const values = data.values || [];
      values.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (String(cell).toLowerCase().includes(needle)) {
            matches.push({ sheetName: tab, cell: `${colIndexToLetters(c)}${r + 1}`, value: String(cell) });
          }
        });
      });
    }

    res.json({ success: true, result: { matchCount: matches.length, matches } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
