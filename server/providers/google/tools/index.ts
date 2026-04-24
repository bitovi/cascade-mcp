import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerDriveAboutUserTool } from './drive-about-user.js';
import { registerDriveDocToMarkdownTool } from './drive-doc-to-markdown/index.js';
import { registerSheetsListSpreadsheetsTool } from './sheets-list-spreadsheets.js';
import { registerSheetsGetInfoTool } from './sheets-get-info.js';
import { registerSheetsReadValuesTool } from './sheets-read-values.js';
import { registerSheetsWriteValuesTool } from './sheets-write-values.js';

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
}
