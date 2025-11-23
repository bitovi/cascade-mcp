/**
 * Combined Provider
 * 
 * Provider for tools that use multiple services (Atlassian + Figma, etc.)
 */

import type { McpServer } from '../../mcp-core/mcp-types.js';
import { registerWriteShellStoriesTool } from './tools/writing-shell-stories/index.js';
import { registerWriteNextStoryTool } from './tools/write-next-story/index.js';
import { registerAnalyzeFeatureScopeTool } from './tools/analyze-feature-scope/index.js';
// import { registerTestJiraUpdateTool } from './tools/writing-shell-stories/test-jira-update.js';

/**
 * Combined provider configuration
 * Tools here integrate multiple OAuth providers (don't handle OAuth themselves)
 */
export const combinedProvider = {
  name: 'combined',
  displayName: 'Combined Tools',
  description: 'Tools that integrate multiple providers (Jira + Figma, etc.)',
  
  registerTools: (mcp: McpServer, authContext: any) => {
    console.log('Registering combined provider tools');
    registerWriteShellStoriesTool(mcp);
    registerWriteNextStoryTool(mcp);
    registerAnalyzeFeatureScopeTool(mcp);
    // registerTestJiraUpdateTool(mcp); // Quick test tool for debugging
  },
};
