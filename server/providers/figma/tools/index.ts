import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerFigmaGetUserTool } from './figma-get-user.js';
import { registerFigmaGetMetadataForLayerTool } from './figma-get-metadata-for-layer.js';
import { registerFigmaGetImageDownloadTool } from './figma-get-image-download.js';
import { registerFigmaGetLayersForPageTool } from './figma-get-layers-for-page.js';
import { registerAnalyzeFigmaScopeTool } from './analyze-figma-scope/index.js';

/**
 * Register all Figma-specific tools with the MCP server
 * @param mcp - MCP server instance
 * @param authContext - Authentication context (currently unused but reserved for future use)
 */
export function registerFigmaTools(mcp: McpServer, authContext: any): void {
  console.log('Registering Figma tools...');
  
  // Authentication test tool
  registerFigmaGetUserTool(mcp);
  
  // Layer metadata tool
  registerFigmaGetMetadataForLayerTool(mcp);
  
  // Image download tool (ported from figma-downloadable-image-mcp)
  registerFigmaGetImageDownloadTool(mcp);
  
  // Page layers discovery tool (ported from figma-downloadable-image-mcp)
  registerFigmaGetLayersForPageTool(mcp);
  
  // Figma design analysis and question posting tool
  registerAnalyzeFigmaScopeTool(mcp);
  
  console.log('  All Figma tools registered (5 tools)');
}
