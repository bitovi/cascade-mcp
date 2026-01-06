import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerDriveAboutUserTool } from './drive-about-user.js';
import { registerDriveListFilesTool } from './drive-list-files.js';
import { registerDriveGetDocumentTool } from './drive-get-document.js';
import { registerDriveFindAndGetDocumentTool } from './drive-find-and-get-document.js';

/**
 * Register all Google Drive-specific tools with the MCP server
 * @param mcp - MCP server instance
 * @param authContext - Authentication context (currently unused but reserved for future use)
 */
export function registerGoogleTools(mcp: McpServer, authContext: any): void {
  console.log('Registering Google Drive tools...');
  
  // User authentication test tool
  registerDriveAboutUserTool(mcp);
  
  // File listing tool
  registerDriveListFilesTool(mcp);
  
  // Document content retrieval tool
  registerDriveGetDocumentTool(mcp);
  
  // Convenience tool: find and get in one step
  registerDriveFindAndGetDocumentTool(mcp);
  
  console.log('  All Google Drive tools registered (4 tools)');
}
