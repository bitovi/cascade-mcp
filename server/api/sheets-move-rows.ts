import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { clearSheetValues, columnNumberToLetters, getSpreadsheetInfo, parseRowRange, readSheetValues, writeSheetValues } from '../providers/google/sheets-helpers.js';

export async function handleSheetsMoveRows(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, srcSheetName, srcRange, dstSheetName, dstStartRow = 1 } = req.body;
    if (!spreadsheetId || !srcSheetName || !srcRange || !dstSheetName) {
      res.status(400).json({ success: false, error: 'spreadsheetId, srcSheetName, srcRange, and dstSheetName are required.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const { startRow, endRow } = parseRowRange(String(srcRange));

    const info = await getSpreadsheetInfo(client, spreadsheetId);
    const srcSheet = info.sheets.find((s) => s.properties.title === srcSheetName);
    if (!srcSheet?.properties.gridProperties?.columnCount) {
      res.status(400).json({ success: false, error: 'Could not resolve source sheet column count.' });
      return;
    }

    const endColumnLetter = columnNumberToLetters(srcSheet.properties.gridProperties.columnCount);
    const sourceA1 = `${srcSheetName}!A${startRow}:${endColumnLetter}${endRow}`;
    const sourceData = await readSheetValues(client, spreadsheetId, sourceA1);
    const rows = sourceData.values || [];
    if (rows.length === 0) {
      res.json({ success: true, result: { movedRows: 0 } });
      return;
    }

    const start = Number(dstStartRow);
    const dstEndRow = start + rows.length - 1;
    const destinationA1 = `${dstSheetName}!A${start}:${endColumnLetter}${dstEndRow}`;

    await writeSheetValues(client, spreadsheetId, destinationA1, rows, 'USER_ENTERED');
    await clearSheetValues(client, spreadsheetId, sourceA1);

    res.json({ success: true, result: { movedRows: rows.length, sourceA1, destinationA1 } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
