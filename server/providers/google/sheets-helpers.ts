/**
 * Google Sheets API v4 interaction helpers
 * Reusable functions for Google Sheets API calls using the generic GoogleClient.fetch()
 */

import type { GoogleClient } from './google-api-client.js';
import type {
  SpreadsheetInfo,
  ValueRange,
  UpdateValuesResponse,
  ClearValuesResponse,
  DriveFilesListResponse,
  CreateSpreadsheetRequest,
  CreateSpreadsheetResponse,
  SpreadsheetBatchUpdateResponse,
  BatchUpdateValuesResponse,
} from './sheets-types.js';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

/**
 * List spreadsheets accessible to the authenticated user via Drive API
 * @param client - Authenticated Google API client
 * @param maxResults - Maximum number of results (default 25)
 * @param nameFilter - Optional substring filter on spreadsheet name
 * @returns Promise resolving to list of spreadsheet file entries
 */
export async function listSpreadsheets(
  client: GoogleClient,
  maxResults: number = 25,
  nameFilter?: string,
): Promise<DriveFilesListResponse> {
  let query = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
  if (nameFilter) {
    // Escape single quotes in the filter value
    const escapedFilter = nameFilter.replace(/'/g, "\\'");
    query += ` and name contains '${escapedFilter}'`;
  }

  const params = new URLSearchParams({
    q: query,
    pageSize: String(maxResults),
    fields: 'files(id,name,modifiedTime,webViewLink),nextPageToken',
    orderBy: 'modifiedTime desc',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  const response = await client.fetch(`${DRIVE_API_BASE}?${params}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Drive API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<DriveFilesListResponse>;
}

/**
 * Get spreadsheet metadata including title, locale, and sheet tab info
 * @param client - Authenticated Google API client
 * @param spreadsheetId - The spreadsheet ID
 * @returns Promise resolving to spreadsheet metadata
 */
export async function getSpreadsheetInfo(
  client: GoogleClient,
  spreadsheetId: string,
): Promise<SpreadsheetInfo> {
  const fields = 'spreadsheetId,properties(title,locale),sheets(properties(title,sheetId,index,sheetType,gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount))),spreadsheetUrl';
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent(fields)}`;

  const response = await client.fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<SpreadsheetInfo>;
}

/**
 * Read cell values from a specific range in a spreadsheet
 * @param client - Authenticated Google API client
 * @param spreadsheetId - The spreadsheet ID
 * @param range - A1 notation range (e.g. "Sheet1!A1:D10"), defaults to "A1:Z1000"
 * @returns Promise resolving to the value range
 */
export async function readSheetValues(
  client: GoogleClient,
  spreadsheetId: string,
  range: string = 'A1:Z1000',
): Promise<ValueRange> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;

  const response = await client.fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<ValueRange>;
}

/**
 * Read formulas from a specific range in a spreadsheet
 */
export async function readSheetFormulas(
  client: GoogleClient,
  spreadsheetId: string,
  range: string = 'A1:Z1000',
): Promise<ValueRange> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMULA`;

  const response = await client.fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<ValueRange>;
}

/**
 * Write values to a specific range in a spreadsheet
 * @param client - Authenticated Google API client
 * @param spreadsheetId - The spreadsheet ID
 * @param range - A1 notation range (e.g. "Sheet1!A1:D10")
 * @param values - 2D array of values to write
 * @param valueInputOption - How to interpret input ("USER_ENTERED" or "RAW"), defaults to "USER_ENTERED"
 * @returns Promise resolving to the update response
 */
export async function writeSheetValues(
  client: GoogleClient,
  spreadsheetId: string,
  range: string,
  values: string[][],
  valueInputOption: 'USER_ENTERED' | 'RAW' = 'USER_ENTERED',
): Promise<UpdateValuesResponse> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}&includeValuesInResponse=true&responseValueRenderOption=FORMATTED_VALUE`;

  const response = await client.fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<UpdateValuesResponse>;
}

/**
 * Clear values in a specific range in a spreadsheet
 * @param client - Authenticated Google API client
 * @param spreadsheetId - The spreadsheet ID
 * @param range - A1 notation range to clear
 * @returns Promise resolving to the clear response
 */
export async function clearSheetValues(
  client: GoogleClient,
  spreadsheetId: string,
  range: string,
): Promise<ClearValuesResponse> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`;

  const response = await client.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<ClearValuesResponse>;
}

/**
 * Create a new spreadsheet
 * @param client - Authenticated Google API client
 * @param title - Spreadsheet title
 * @param sheetNames - Optional initial sheet tab names
 */
export async function createSpreadsheet(
  client: GoogleClient,
  title: string,
  sheetNames?: string[],
): Promise<CreateSpreadsheetResponse> {
  const body: CreateSpreadsheetRequest = {
    properties: { title },
  };

  if (sheetNames && sheetNames.length > 0) {
    body.sheets = sheetNames.map((name) => ({
      properties: { title: name },
    }));
  }

  const response = await client.fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<CreateSpreadsheetResponse>;
}

/**
 * Run spreadsheets.batchUpdate with one or more request objects
 */
export async function spreadsheetBatchUpdate(
  client: GoogleClient,
  spreadsheetId: string,
  requests: Array<Record<string, unknown>>,
): Promise<SpreadsheetBatchUpdateResponse> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;

  const response = await client.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<SpreadsheetBatchUpdateResponse>;
}

/**
 * Run spreadsheets.values.batchUpdate with multiple ranges
 */
export async function batchUpdateSheetValues(
  client: GoogleClient,
  spreadsheetId: string,
  data: Array<{ range: string; values: string[][] }>,
  valueInputOption: 'USER_ENTERED' | 'RAW' = 'USER_ENTERED',
): Promise<BatchUpdateValuesResponse> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;

  const response = await client.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption,
      data,
      includeValuesInResponse: true,
      responseValueRenderOption: 'FORMATTED_VALUE',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<BatchUpdateValuesResponse>;
}

/**
 * Resolve a sheet tab name to numeric sheetId
 */
export async function resolveSheetId(
  client: GoogleClient,
  spreadsheetId: string,
  sheetName: string,
): Promise<number> {
  const info = await getSpreadsheetInfo(client, spreadsheetId);
  const found = info.sheets.find((sheet) => sheet.properties.title === sheetName);

  if (!found) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  return found.properties.sheetId;
}

/**
 * Read multiple ranges from one spreadsheet in a single call
 */
export async function batchGetSheetValues(
  client: GoogleClient,
  spreadsheetId: string,
  ranges: string[],
): Promise<{ spreadsheetId: string; valueRanges?: ValueRange[] }> {
  const params = new URLSearchParams();
  for (const range of ranges) {
    params.append('ranges', range);
  }

  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`;
  const response = await client.fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<{ spreadsheetId: string; valueRanges?: ValueRange[] }>;
}

/**
 * Append values to a range in a spreadsheet
 */
export async function appendSheetValues(
  client: GoogleClient,
  spreadsheetId: string,
  range: string,
  values: string[][],
  valueInputOption: 'USER_ENTERED' | 'RAW' = 'USER_ENTERED',
): Promise<Record<string, unknown>> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS&includeValuesInResponse=true`;

  const response = await client.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * Copy a sheet from one spreadsheet to another
 */
export async function copySheetToSpreadsheet(
  client: GoogleClient,
  srcSpreadsheetId: string,
  srcSheetId: number,
  dstSpreadsheetId: string,
): Promise<{ sheetId: number }> {
  const url = `${SHEETS_API_BASE}/${encodeURIComponent(srcSpreadsheetId)}/sheets/${srcSheetId}:copyTo`;
  const response = await client.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinationSpreadsheetId: dstSpreadsheetId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<{ sheetId: number }>;
}

/**
 * Share a spreadsheet through Drive permissions API
 */
export async function shareSpreadsheet(
  client: GoogleClient,
  spreadsheetId: string,
  email: string,
  role: 'reader' | 'commenter' | 'writer',
  sendNotification: boolean = true,
): Promise<Record<string, unknown>> {
  const url = `${DRIVE_API_BASE}/${encodeURIComponent(spreadsheetId)}/permissions?sendNotificationEmail=${sendNotification ? 'true' : 'false'}`;
  const response = await client.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'user',
      role,
      emailAddress: email,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Drive API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

/**
 * Convert 1-based column number to A1 column letters
 */
export function columnNumberToLetters(columnNumber: number): string {
  let n = columnNumber;
  let letters = '';

  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }

  return letters;
}

/**
 * Parse A1 range (without sheet prefix) to a Sheets GridRange
 */
export function parseA1RangeToGridRange(
  a1Range: string,
  sheetId: number,
): { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number } {
  const normalized = a1Range.includes('!') ? a1Range.split('!')[1] : a1Range;
  const [start, end] = normalized.split(':');
  const startMatch = start?.match(/^([A-Za-z]+)?(\d+)?$/);
  const endMatch = end?.match(/^([A-Za-z]+)?(\d+)?$/);

  if (!startMatch) {
    throw new Error(`Invalid A1 range: ${a1Range}`);
  }

  const colToIndex = (letters?: string): number | undefined => {
    if (!letters) return undefined;
    let num = 0;
    for (const ch of letters.toUpperCase()) {
      num = num * 26 + (ch.charCodeAt(0) - 64);
    }
    return num - 1;
  };

  const startCol = colToIndex(startMatch[1]);
  const startRow = startMatch[2] ? Number(startMatch[2]) - 1 : undefined;

  let endCol: number | undefined;
  let endRow: number | undefined;

  if (endMatch) {
    endCol = endMatch[1] ? (colToIndex(endMatch[1]) ?? 0) + 1 : undefined;
    endRow = endMatch[2] ? Number(endMatch[2]) : undefined;
  } else {
    endCol = startCol !== undefined ? startCol + 1 : undefined;
    endRow = startRow !== undefined ? startRow + 1 : undefined;
  }

  return {
    sheetId,
    startRowIndex: startRow,
    endRowIndex: endRow,
    startColumnIndex: startCol,
    endColumnIndex: endCol,
  };
}

/**
 * Convert #RRGGBB color to Sheets API color object
 */
export function hexToSheetsColor(hex: string): { red: number; green: number; blue: number } {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const red = parseInt(normalized.substring(0, 2), 16) / 255;
  const green = parseInt(normalized.substring(2, 4), 16) / 255;
  const blue = parseInt(normalized.substring(4, 6), 16) / 255;
  return { red, green, blue };
}

/**
 * Parse row range format "start:end" (1-based, inclusive)
 */
export function parseRowRange(rowRange: string): { startRow: number; endRow: number } {
  const match = rowRange.match(/^(\d+):(\d+)$/);
  if (!match) {
    throw new Error('Invalid srcRange format. Use "start:end", e.g. "2:5".');
  }

  const startRow = Number(match[1]);
  const endRow = Number(match[2]);
  if (startRow < 1 || endRow < startRow) {
    throw new Error('Invalid srcRange values. Ensure start >= 1 and end >= start.');
  }

  return { startRow, endRow };
}
