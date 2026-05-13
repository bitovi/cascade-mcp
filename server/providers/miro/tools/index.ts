import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerMiroListBoardsTool } from './miro-list-boards.js';
import { registerMiroGetBoardTool } from './miro-get-board.js';
import { registerMiroGetBoardItemsTool } from './miro-get-board-items.js';
import { registerMiroGetItemTool } from './miro-get-item.js';
import { registerMiroGetFrameItemsTool } from './miro-get-frame-items.js';
import { registerMiroGetConnectorsTool } from './miro-get-connectors.js';
import { registerMiroGetTagsTool } from './miro-get-tags.js';
import { registerMiroBoardOverviewTool } from './miro-board-overview/index.js';
import { registerMiroBoardRegionTool } from './miro-board-region.js';

/**
 * Register all Miro-specific read tools with the MCP server
 */
export function registerMiroTools(mcp: McpServer, authContext: any): void {
  registerMiroListBoardsTool(mcp);
  registerMiroGetBoardTool(mcp);
  registerMiroGetBoardItemsTool(mcp);
  registerMiroGetItemTool(mcp);
  registerMiroGetFrameItemsTool(mcp);
  registerMiroGetConnectorsTool(mcp);
  registerMiroGetTagsTool(mcp);
  registerMiroBoardOverviewTool(mcp);
  registerMiroBoardRegionTool(mcp);
}
