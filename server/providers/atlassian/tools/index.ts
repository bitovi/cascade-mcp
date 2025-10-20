import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerAtlassianGetSitesTool } from './atlassian-get-sites.js';
import { registerAtlassianGetIssueTool } from './atlassian-get-issue.js';
import { registerAtlassianGetAttachmentsTool } from './atlassian-get-attachments.js';
import { registerAtlassianUpdateIssueDescriptionTool } from './atlassian-update-issue-description.js';
import { registerAtlassianCreateShellStoriesTool } from './atlassian-create-shell-stories.js';

/**
 * Register all Atlassian-specific tools with the MCP server
 * @param mcp - MCP server instance
 * @param authContext - Authentication context (currently unused but reserved for future use)
 */
export function registerAtlassianTools(mcp: McpServer, authContext: any): void {
  console.log('Registering Atlassian tools...');
  
  registerAtlassianGetSitesTool(mcp);
  registerAtlassianGetIssueTool(mcp);
  registerAtlassianGetAttachmentsTool(mcp);
  registerAtlassianUpdateIssueDescriptionTool(mcp);
  registerAtlassianCreateShellStoriesTool(mcp);
  
  console.log('  All Atlassian tools registered');
}
