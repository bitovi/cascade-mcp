/**
 * Check Story Changes Tool - MCP Handler
 * 
 * Thin MCP wrapper that handles authentication and delegates to core logic.
 * This tool analyzes divergences between a child story and its parent epic.
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createAtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { createMcpLLMClient } from '../../../../llm-client/mcp-sampling-client.js';
import { executeCheckStoryChanges } from './core-logic.js';

/**
 * Tool parameters interface
 */
interface CheckStoryChangesParams {
  storyKey: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Register the check-story-changes tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerCheckStoryChangesTool(mcp: McpServer): void {
  mcp.registerTool(
    'check-story-changes',
    {
      title: 'Check Story Changes',
      description: 'Analyze divergences between a child story and its parent epic. Identifies conflicts, additions, missing content, and interpretation differences between the story description and the parent epic.',
      inputSchema: {
        storyKey: z.string()
          .describe('The Jira story key (e.g., "PROJ-123", "USER-10"). The story must have a parent epic.'),
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional()
          .describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
      },
    },
    async ({ storyKey, cloudId, siteName }: CheckStoryChangesParams, context) => {
      console.log('check-story-changes called', { storyKey, cloudId, siteName });

      // Get auth info for Atlassian
      const authInfo = getAuthInfoSafe(context, 'check-story-changes');
      
      // Extract token
      const atlassianToken = authInfo?.atlassian?.access_token;

      if (!atlassianToken) {
        return {
          content: [{
            type: 'text',
            text: 'Error: No valid Atlassian access token found in session context.',
          }],
        };
      }

      try {
        // Create API clients with token captured in closure
        const atlassianClient = createAtlassianClient(atlassianToken);
        const generateText = createMcpLLMClient(context);
        
        // Execute core logic (token NOT passed - client has it baked in!)
        const result = await executeCheckStoryChanges(
          {
            storyKey,
            cloudId,
            siteName
          },
          {
            atlassianClient,
            generateText,
            // Unused dependencies for this tool
            figmaClient: null as any,
            notify: async () => {}, // No-op for MCP mode (no progress notifications needed)
          }
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };

      } catch (error: any) {
        console.error('Error in check-story-changes:', error);
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`,
          }],
        };
      }
    }
  );
}
