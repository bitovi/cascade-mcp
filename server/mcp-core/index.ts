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

// Import provider tools
import { atlassianProvider } from '../providers/atlassian/index.js';
import { figmaProvider } from '../providers/figma/index.js';
import { utilityProvider } from '../providers/utility/index.js';

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

// Register Atlassian/Jira tools via provider
logger.info('Registering Atlassian tools...');
atlassianProvider.registerTools(mcp, null); // authContext not needed for registration, only for execution

// Register Figma tools via provider
logger.info('Registering Figma tools...');
figmaProvider.registerTools(mcp, null); // authContext not needed for registration, only for execution

// Register utility tools via provider
logger.info('Registering utility tools...');
utilityProvider.registerTools(mcp, null); // No auth needed for utility tools

logger.info('All MCP tools registered successfully');

// Export the MCP server instance and auth functions for use in server.js
export { mcp, setAuthContext, clearAuthContext, getAuthContext };
export type { AuthContext };
