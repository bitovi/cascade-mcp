import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerUtilityTestSamplingTool } from './utility-test-sampling.js';
import { registerUtilityNotificationsTool } from './utility-notifications/index.js';

/**
 * Register all utility tools with the MCP server
 * These tools don't require authentication to external systems
 * @param mcp - MCP server instance
 * @param authContext - Authentication context (unused for utility tools)
 */
export function registerUtilityTools(mcp: McpServer, authContext: any): void {
  console.log('Registering utility tools...');
  
  registerUtilityTestSamplingTool(mcp);
  registerUtilityNotificationsTool(mcp);
  
  console.log('  All utility tools registered');
}
