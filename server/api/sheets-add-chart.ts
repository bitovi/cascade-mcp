import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { parseA1RangeToGridRange, resolveSheetId, spreadsheetBatchUpdate } from '../providers/google/sheets-helpers.js';

export async function handleSheetsAddChart(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const { spreadsheetId, sheetName, chartType, dataRange, title, xAxisLabel, yAxisLabel, positionX = 0, positionY = 0 } = req.body;
    if (!spreadsheetId || !sheetName || !chartType || !dataRange) {
      res.status(400).json({ success: false, error: 'spreadsheetId, sheetName, chartType, and dataRange are required.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);
    const gridRange = parseA1RangeToGridRange(dataRange, sheetId);

    const result = await spreadsheetBatchUpdate(client, spreadsheetId, [{
      addChart: {
        chart: {
          spec: {
            title,
            basicChart: {
              chartType,
              legendPosition: 'BOTTOM_LEGEND',
              axis: [
                { position: 'BOTTOM_AXIS', title: xAxisLabel },
                { position: 'LEFT_AXIS', title: yAxisLabel },
              ],
              domains: [{ domain: { sourceRange: { sources: [gridRange] } } }],
              series: [{ series: { sourceRange: { sources: [gridRange] } } }],
              headerCount: 1,
            },
          },
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId,
                rowIndex: Number(positionY),
                columnIndex: Number(positionX),
              },
            },
          },
        },
      },
    }]);

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
