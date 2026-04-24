/**
 * Google Sheets API v4 Type Definitions
 */

/** Sheet tab properties within a spreadsheet */
export interface SheetProperties {
  sheetId: number;
  title: string;
  index: number;
  sheetType: string;
  gridProperties?: {
    rowCount: number;
    columnCount: number;
    frozenRowCount?: number;
    frozenColumnCount?: number;
  };
}

/** Individual sheet within a spreadsheet */
export interface Sheet {
  properties: SheetProperties;
}

/** Spreadsheet metadata from spreadsheets.get */
export interface SpreadsheetInfo {
  spreadsheetId: string;
  properties: {
    title: string;
    locale: string;
    defaultFormat?: Record<string, unknown>;
  };
  sheets: Sheet[];
  spreadsheetUrl: string;
}

/** Response from spreadsheets.values.get */
export interface ValueRange {
  range: string;
  majorDimension: string;
  values?: string[][];
}

/** Response from spreadsheets.values.update */
export interface UpdateValuesResponse {
  spreadsheetId: string;
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
  updatedData?: ValueRange;
}

/** Response from spreadsheets.values.clear */
export interface ClearValuesResponse {
  spreadsheetId: string;
  clearedRange: string;
}

/** Drive file entry from files.list */
export interface DriveFileEntry {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
}

/** Response from Drive files.list */
export interface DriveFilesListResponse {
  files: DriveFileEntry[];
  nextPageToken?: string;
}
