import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { hexToSheetsColor, parseA1RangeToGridRange, resolveSheetId, spreadsheetBatchUpdate } from '../providers/google/sheets-helpers.js';

export async function handleSheetsFormatRange(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, sheetName, range, bold, italic, fontSize, fontColor, backgroundColor } = req.body;
    if (!spreadsheetId || !sheetName || !range) {
      res.status(400).json({ success: false, error: 'spreadsheetId, sheetName, and range are required.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);
    const gridRange = parseA1RangeToGridRange(range, sheetId);

    const textFormat: Record<string, unknown> = {};
    if (bold !== undefined) textFormat.bold = Boolean(bold);
    if (italic !== undefined) textFormat.italic = Boolean(italic);
    if (fontSize !== undefined) textFormat.fontSize = Number(fontSize);
    if (typeof fontColor === 'string') textFormat.foregroundColor = hexToSheetsColor(fontColor);

    const cellFormat: Record<string, unknown> = {};
    if (Object.keys(textFormat).length > 0) cellFormat.textFormat = textFormat;
    if (typeof backgroundColor === 'string') cellFormat.backgroundColor = hexToSheetsColor(backgroundColor);

    if (Object.keys(cellFormat).length === 0) {
      res.status(400).json({ success: false, error: 'No formatting properties provided.' });
      return;
    }

    const result = await spreadsheetBatchUpdate(client, spreadsheetId, [{
      repeatCell: {
        range: gridRange,
        cell: { userEnteredFormat: cellFormat },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    }]);

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
