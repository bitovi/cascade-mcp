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
import { registerCreateShellStoriesTool } from './tool-create-shell-stories.ts';
import { registerSampleTestingTool } from './tool-sample-testing.ts';

// Import provider tools
import { figmaProvider } from '../providers/figma/index.js';

// Create MCP server instance
const mcp = new McpServer(
  {
    name: 'jira-tool-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
  },
);

// Register all tools
logger.info('Registering MCP tools...');

// Register Atlassian/Jira tools
registerUpdateIssueDescriptionTool(mcp);
registerGetAccessibleSitesTool(mcp);
registerGetJiraIssueTool(mcp);
registerGetJiraAttachmentsTool(mcp);
registerSampleTestingTool(mcp);
//registerCreateShellStoriesTool(mcp);

// Register Figma tools
logger.info('Registering Figma tools...');
figmaProvider.registerTools(mcp, null); // authContext not needed for registration, only for execution

logger.info('All MCP tools registered successfully');

// Export the MCP server instance and auth functions for use in server.js
export { mcp, setAuthContext, clearAuthContext, getAuthContext };
export type { AuthContext };
