import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerDriveAboutUserTool } from './drive-about-user.js';
import { registerDriveDocToMarkdownTool } from './drive-doc-to-markdown/index.js';

/**
 * Register all Google Drive-specific tools with the MCP server
 * @param mcp - MCP server instance
 * @param authContext - Authentication context (currently unused but reserved for future use)
 */
export function registerGoogleTools(mcp: McpServer, authContext: any): void {
  // User authentication test tool
  registerDriveAboutUserTool(mcp);

  // Google Docs to Markdown conversion tool
  registerDriveDocToMarkdownTool(mcp);
}
