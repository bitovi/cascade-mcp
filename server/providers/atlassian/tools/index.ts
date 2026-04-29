import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerAtlassianGetSitesTool } from './atlassian-get-sites.js';
import { registerAtlassianGetIssueTool } from './atlassian-get-issue.js';
import { registerAtlassianGetAttachmentsTool } from './atlassian-get-attachments.js';
import { registerAtlassianUpdateIssueDescriptionTool } from './atlassian-update-issue-description.js';
import { registerAtlassianFetchTool } from './atlassian-fetch.js';
import { registerAtlassianSearchTool } from './atlassian-search.js';
import { registerConfluenceAnalyzePageTool } from './confluence-analyze-page.js';
import { registerAtlassianAddCommentTool } from './atlassian-add-comment.js';
import { registerAtlassianUpdateCommentTool } from './atlassian-update-comment.js';

/**
 * Register all Atlassian-specific tools with the MCP server
 * @param mcp - MCP server instance
 * @param authContext - Authentication context (currently unused but reserved for future use)
 */
export function registerAtlassianTools(mcp: McpServer, authContext: any): void {
  console.log('Registering Atlassian tools...');
  
  // Standard Atlassian tools
  registerAtlassianGetSitesTool(mcp);
  registerAtlassianGetIssueTool(mcp);
  registerAtlassianGetAttachmentsTool(mcp);
  registerAtlassianUpdateIssueDescriptionTool(mcp);
  
  // Confluence tools
  registerConfluenceAnalyzePageTool(mcp);
  
  // ChatGPT-compatible tools (follow OpenAI MCP patterns)
  registerAtlassianFetchTool(mcp);
  registerAtlassianSearchTool(mcp);
  
  // Comment tools (spec 068 — plugin skills)
  registerAtlassianAddCommentTool(mcp);
  registerAtlassianUpdateCommentTool(mcp);
  
  console.log('  All Atlassian tools registered (9 tools)');
}
