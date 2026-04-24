/**
 * MCP Resource Registration
 * 
 * Central registry for MCP resources. Resources provide static text content
 * (prompt instructions, workflow orchestration documents) that agents can
 * read via resources/list and resources/read.
 * 
 * Resources are always registered regardless of provider authentication —
 * they only return static text, not API-dependent data.
 * 
 * Categories:
 * - Prompt resources: Reusable prompt instructions (prompt://*)
 * - Workflow resources: Multi-step orchestration documents (workflow://*)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPromptResources } from './prompt-resources.js';
import { registerWorkflowResources } from './workflow-resources.js';

export function registerAllResources(mcp: McpServer): void {
  console.log('  Registering MCP resources');
  registerPromptResources(mcp);
  registerWorkflowResources(mcp);
  console.log('  ✅ MCP resources registered');
}
