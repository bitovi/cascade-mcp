/**
 * MCP Prompt Registration
 * 
 * Central registry for MCP prompts. Each prompt is the agent entry point
 * for a workflow, telling the agent to call a corresponding context tool.
 * 
 * Pattern: Prompt + Context Tool Pairs (spec 061)
 * - prompt-write-story → write-story-context
 * 
 * Note: prompt-figma-page-questions was removed — the figma-ask-scope-questions-for-page
 * tool now returns workflow instructions directly in its response (self-contained pattern).
 * 
 * Prompts are registered regardless of provider authentication - they only
 * return text (user messages), not API calls.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthContext } from '../mcp-core/auth-context-store.js';
import { registerWriteStoryPrompt } from './prompt-write-story.js';

/**
 * Registers all MCP prompts with the server
 * 
 * @param mcp - MCP server instance
 * @param authContext - Session's authentication context (unused - prompts don't require auth)
 */
export function registerAllPrompts(mcp: McpServer, authContext: AuthContext): void {
  console.log('  Registering MCP prompts');
  
  // Prompt + Context Tool pairs (spec 061)
  registerWriteStoryPrompt(mcp);
  
  console.log('  ✅ MCP prompts registered');
}
