import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerFigmaGetUserTool } from './figma-get-user.js';
import { registerFigmaGetMetadataForLayerTool } from './figma-get-metadata-for-layer.js';
import { registerFigmaGetImageDownloadTool } from './figma-get-image-download.js';
import { registerFigmaGetLayersForPageTool } from './figma-get-layers-for-page.js';
import { registerFigmaReviewDesignTool } from './figma-review-design/index.js';
import { registerFigmaAskScopeQuestionsForPageTool } from './figma-ask-scope-questions-for-page/index.js';
import { registerFigmaFrameAnalysisTool } from './figma-frame-analysis/index.js';
import { registerFigmaBatchZipTool } from './figma-batch-load/index.js';
import { registerFigmaBatchCacheTool } from './figma-batch-cache/index.js';
import { registerFigmaFrameDataTool } from './figma-frame-data/index.js';
import { registerFigmaPostCommentTool } from './figma-post-comment.js';
import { registerFigmaGetCommentsTool } from './figma-get-comments.js';

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
  
  // Figma design analysis and question posting tool (monolithic)
  registerFigmaReviewDesignTool(mcp);
  
  // Self-contained design review scope questions tool (spec 061/063)
  registerFigmaAskScopeQuestionsForPageTool(mcp);
  
  // Per-frame analysis retrieval tool (spec 067 — server-side cache approach)
  registerFigmaFrameAnalysisTool(mcp);
  
  // Batch load Figma frames to zip (spec 068 — plugin skills)
  registerFigmaBatchZipTool(mcp);
  
  // Batch cache Figma frames for MCP retrieval (spec 069 — cloud fallback)
  registerFigmaBatchCacheTool(mcp);
  
  // Per-frame data retrieval, data only (spec 069 — works with batch cache)
  registerFigmaFrameDataTool(mcp);
  
  // Comment tools (spec 068 — plugin skills)
  registerFigmaPostCommentTool(mcp);
  registerFigmaGetCommentsTool(mcp);
  
  console.log('  All Figma tools registered (12 tools)');
}
