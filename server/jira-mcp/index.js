/**
 * MCP (Model Context Protocol) Tool Endpoints
 *
 * This module provides MCP-compatible endpoints for interacting with Jira
 * through the OAuth-secured authentication server using the official MCP SDK.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../logger.js';

// Import auth helpers
import { setAuthContext, clearAuthContext, cleanupExpiredTokens } from './auth-helpers.js';

// Import tool registration functions
import { registerUpdateIssueDescriptionTool } from './tool-update-issue-description.js';
import { registerGetAccessibleSitesTool } from './tool-get-accessible-sites.js';
import { registerGetJiraIssueTool } from './tool-get-jira-issue.js';
import { registerGetJiraAttachmentsTool } from './tool-get-jira-attachments.js';

// Create MCP server instance
const mcp = new McpServer(
  {
    name: 'jira-tool-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Register all tools
logger.info('Registering MCP tools...');

registerUpdateIssueDescriptionTool(mcp);
registerGetAccessibleSitesTool(mcp);
registerGetJiraIssueTool(mcp);
registerGetJiraAttachmentsTool(mcp);

logger.info('All MCP tools registered successfully');

// Export the MCP server instance and auth functions for use in server.js
export { mcp, setAuthContext, clearAuthContext, cleanupExpiredTokens };
