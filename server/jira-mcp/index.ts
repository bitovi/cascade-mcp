/**
 * MCP (Model Context Protocol) Tool Endpoints
 *
 * This module provides MCP-compatible endpoints for interacting with Jira
 * through the OAuth-secured authentication server using the official MCP SDK.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../observability/logger.ts';

// Import auth helpers and types
import { setAuthContext, clearAuthContext, getAuthContext } from './auth-helpers.ts';
import type { AuthContext } from './auth-context-store.ts';

// Import tool registration functions
import { registerUpdateIssueDescriptionTool } from './tool-update-issue-description.ts';
import { registerGetAccessibleSitesTool } from './tool-get-accessible-sites.ts';
import { registerGetJiraIssueTool } from './tool-get-jira-issue.ts';
import { registerGetJiraAttachmentsTool } from './tool-get-jira-attachments.ts';
import { registerFetchTool } from './tool-fetch.ts';
import { registerSearchTool } from './tool-search.ts';

// Create MCP server instance
const mcp = new McpServer(
  {
    name: 'bitovi-jira-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {
        fetch: true,
        search: true,
        actions: true,
      },
    },
    
  },
);

// Register all tools
logger.info('Registering MCP tools...');

// registerUpdateIssueDescriptionTool(mcp);
// registerGetAccessibleSitesTool(mcp);
// registerGetJiraIssueTool(mcp);
// registerGetJiraAttachmentsTool(mcp);
registerFetchTool(mcp);
registerSearchTool(mcp);

logger.info('All MCP tools registered successfully');

// Export the MCP server instance and auth functions for use in server.js
export { mcp, setAuthContext, clearAuthContext, getAuthContext };
export type { AuthContext };
