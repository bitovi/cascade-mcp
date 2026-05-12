import type { Request, Response } from 'express';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { resolveSheetId, spreadsheetBatchUpdate } from '../providers/google/sheets-helpers.js';

type ChartType = 'LINE' | 'AREA' | 'COLUMN' | 'BAR' | 'SCATTER' | 'COMBO';

interface ChartRangeInput {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

function isValidRange(value: unknown): value is ChartRangeInput {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const range = value as ChartRangeInput;
  return (
    Number.isInteger(range.startRowIndex) &&
    Number.isInteger(range.endRowIndex) &&
    Number.isInteger(range.startColumnIndex) &&
    Number.isInteger(range.endColumnIndex) &&
    range.startRowIndex >= 0 &&
    range.endRowIndex > range.startRowIndex &&
    range.startColumnIndex >= 0 &&
    range.endColumnIndex > range.startColumnIndex
  );
}

function toSourceRange(sheetId: number, range: ChartRangeInput) {
  return {
    sourceRange: {
      sources: [
        {
          sheetId,
          startRowIndex: range.startRowIndex,
          endRowIndex: range.endRowIndex,
          startColumnIndex: range.startColumnIndex,
          endColumnIndex: range.endColumnIndex,
        },
      ],
    },
  };
}

export async function handleSheetsCreateChart(req: Request, res: Response): Promise<void> {
  try {
    const googleToken = req.headers['x-google-token'] as string | undefined;
    if (!googleToken) {
      res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
      return;
    }

    const {
      spreadsheetId,
      sheetName,
      chartType = 'COLUMN',
      title,
      domain,
      series,
      anchorRowIndex = 0,
      anchorColumnIndex = 0,
    } = req.body;

    if (!spreadsheetId || !sheetName || typeof spreadsheetId !== 'string' || typeof sheetName !== 'string') {
      res.status(400).json({ success: false, error: 'spreadsheetId and sheetName are required string fields.' });
      return;
    }

    const validChartTypes: ChartType[] = ['LINE', 'AREA', 'COLUMN', 'BAR', 'SCATTER', 'COMBO'];
    if (!validChartTypes.includes(chartType)) {
      res.status(400).json({ success: false, error: `chartType must be one of: ${validChartTypes.join(', ')}.` });
      return;
    }

    if (!isValidRange(domain)) {
      res.status(400).json({ success: false, error: 'domain must contain valid start/end row/column indexes.' });
      return;
    }

    if (!Array.isArray(series) || series.length === 0 || !series.every(isValidRange)) {
      res.status(400).json({ success: false, error: 'series must be a non-empty array of valid row/column ranges.' });
      return;
    }

    if (!Number.isInteger(anchorRowIndex) || anchorRowIndex < 0) {
      res.status(400).json({ success: false, error: 'anchorRowIndex must be a non-negative integer.' });
      return;
    }

    if (!Number.isInteger(anchorColumnIndex) || anchorColumnIndex < 0) {
      res.status(400).json({ success: false, error: 'anchorColumnIndex must be a non-negative integer.' });
      return;
    }

    const client = createGoogleClient(googleToken);
    const sheetId = await resolveSheetId(client, spreadsheetId, sheetName);

    const result = await spreadsheetBatchUpdate(client, spreadsheetId, [
      {
        addChart: {
          chart: {
            spec: {
              title: typeof title === 'string' ? title : undefined,
              basicChart: {
                chartType,
                legendPosition: 'BOTTOM_LEGEND',
                headerCount: 1,
                domains: [{ domain: toSourceRange(sheetId, domain) }],
                series: series.map((s: ChartRangeInput) => ({ series: toSourceRange(sheetId, s) })),
              },
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId,
                  rowIndex: anchorRowIndex,
                  columnIndex: anchorColumnIndex,
                },
              },
            },
          },
        },
      },
    ]);

    const chartId = (result.replies?.[0] as any)?.addChart?.chart?.chartId;

    res.json({
      success: true,
      result,
      chartId,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
