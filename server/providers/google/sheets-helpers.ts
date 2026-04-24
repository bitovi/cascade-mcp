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
