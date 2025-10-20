import type { McpServer } from '../../../jira-mcp/mcp-types.js';
import { registerFigmaGetUserTool } from './figma-get-user.js';
import { registerFigmaGetMetadataForLayerTool } from './figma-get-metadata-for-layer.js';

/**
 * Register all Figma-specific tools with the MCP server
 * @param mcp - MCP server instance
 * @param authContext - Authentication context (currently unused but reserved for future use)
 */
export function registerFigmaTools(mcp: McpServer, authContext: any): void {
  console.log('Registering Figma tools...');
  
  registerFigmaGetUserTool(mcp);
  registerFigmaGetMetadataForLayerTool(mcp);
  
  console.log('  All Figma tools registered');
}
