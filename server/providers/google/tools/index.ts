import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerDriveAboutUserTool } from './drive-about-user.js';
import { registerDriveDocToMarkdownTool } from './drive-doc-to-markdown/index.js';
import { registerSheetsListSpreadsheetsTool } from './sheets-list-spreadsheets.js';
import { registerSheetsGetInfoTool } from './sheets-get-info.js';
import { registerSheetsReadValuesTool } from './sheets-read-values.js';
import { registerSheetsWriteValuesTool } from './sheets-write-values.js';
import { registerSheetsCreateSpreadsheetTool } from './sheets-create-spreadsheet.js';
import { registerSheetsCreateSheetTool } from './sheets-create-sheet.js';
import { registerSheetsRenameSheetTool } from './sheets-rename-sheet.js';
import { registerSheetsAddRowsTool } from './sheets-add-rows.js';
import { registerSheetsAddColumnsTool } from './sheets-add-columns.js';
import { registerSheetsBatchUpdateCellsTool } from './sheets-batch-update-cells.js';
import { registerSheetsGetFormulasTool } from './sheets-get-formulas.js';
import { registerSheetsCopySheetTool } from './sheets-copy-sheet.js';
import { registerSheetsShareTool } from './sheets-share.js';
import { registerSheetsGetMultipleDataTool } from './sheets-get-multiple-data.js';
import { registerSheetsAppendRowsTool } from './sheets-append-rows.js';
import { registerSheetsFindTool } from './sheets-find.js';
import { registerSheetsFormatRangeTool } from './sheets-format-range.js';
import { registerSheetsAddChartTool } from './sheets-add-chart.js';
import { registerSheetsManageConditionalFormattingTool } from './sheets-manage-conditional-formatting.js';
import { registerSheetsMoveRowsTool } from './sheets-move-rows.js';

/**
 * Register all Google-specific tools with the MCP server
 * @param mcp - MCP server instance
 * @param authContext - Authentication context (currently unused but reserved for future use)
 */
export function registerGoogleTools(mcp: McpServer, authContext: any): void {
  // User authentication test tool
  registerDriveAboutUserTool(mcp);

  // Google Docs to Markdown conversion tool
  registerDriveDocToMarkdownTool(mcp);

  // Google Sheets tools
  registerSheetsListSpreadsheetsTool(mcp);
  registerSheetsGetInfoTool(mcp);
  registerSheetsReadValuesTool(mcp);
  registerSheetsWriteValuesTool(mcp);
  registerSheetsCreateSpreadsheetTool(mcp);
  registerSheetsCreateSheetTool(mcp);
  registerSheetsRenameSheetTool(mcp);
  registerSheetsAddRowsTool(mcp);
  registerSheetsAddColumnsTool(mcp);
  registerSheetsBatchUpdateCellsTool(mcp);
  registerSheetsGetFormulasTool(mcp);
  registerSheetsCopySheetTool(mcp);
  registerSheetsShareTool(mcp);
  registerSheetsGetMultipleDataTool(mcp);
  registerSheetsAppendRowsTool(mcp);
  registerSheetsFindTool(mcp);
  registerSheetsFormatRangeTool(mcp);
  registerSheetsAddChartTool(mcp);
  registerSheetsManageConditionalFormattingTool(mcp);
  registerSheetsMoveRowsTool(mcp);
}
