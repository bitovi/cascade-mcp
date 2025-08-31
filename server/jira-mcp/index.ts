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

// Note: Using 'as any' here because the tool registration functions were converted
// to TypeScript with simplified interfaces that don't exactly match the complex
// MCP SDK types. The runtime behavior is correct, but TypeScript needs the cast
// to allow the type mismatch. This could be fixed in a future refactor by either:
// 1. Using the exact MCP SDK types throughout, or
// 2. Creating wrapper functions that properly bridge the type differences
registerUpdateIssueDescriptionTool(mcp as any);
registerGetAccessibleSitesTool(mcp as any);
registerGetJiraIssueTool(mcp as any);
registerGetJiraAttachmentsTool(mcp as any);

logger.info('All MCP tools registered successfully');

// Export the MCP server instance and auth functions for use in server.js
export { mcp, setAuthContext, clearAuthContext, getAuthContext };
export type { AuthContext };
