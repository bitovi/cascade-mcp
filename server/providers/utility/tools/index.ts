import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { registerUtilityTestSamplingTool } from './utility-test-sampling.js';
import { registerUtilityNotificationsTool } from './utility-notifications/index.js';
import { registerUtilityTestMultiStepWorkflowTool } from './utility-test-multi-step-workflow.js';

/**
 * Register all utility tools with the MCP server
 * These tools don't require authentication to external systems
 * 
 * @param mcp - MCP server instance
 * @param authContext - Authentication context (unused for utility tools)
 */
export function registerUtilityTools(mcp: McpServer, authContext: any): void {
  // Check feature flag
  const shouldRegister = process.env.REGISTER_UTILITY_TOOLS === 'true';
  
  if (!shouldRegister) {
    console.log('Utility tools disabled (REGISTER_UTILITY_TOOLS != true)');
    return;
  }
  
  console.log('Registering utility tools...');
  
  registerUtilityTestSamplingTool(mcp);
  registerUtilityNotificationsTool(mcp);
  registerUtilityTestMultiStepWorkflowTool(mcp);
  
  console.log('  All utility tools registered');
}
