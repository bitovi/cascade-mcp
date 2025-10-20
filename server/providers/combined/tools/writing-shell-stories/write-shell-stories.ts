/**
 * Write Shell Stories Tool
 * 
 * Generates shell stories from Figma designs linked in a Jira epic.
 * This tool orchestrates fetching Jira content, analyzing Figma designs,
 * and generating user stories through AI-powered sampling.
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';

/**
 * Tool parameters interface
 */
interface WriteShellStoriesParams {
  epicKey: string;
}

/**
 * Register the write-shell-stories tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerWriteShellStoriesTool(mcp: McpServer): void {
  mcp.registerTool(
    'write-shell-stories',
    {
      title: 'Write Shell Stories from Figma',
      description: 'Generate shell stories from Figma designs linked in a Jira epic. Analyzes screens, downloads assets, and creates prioritized user stories.',
      inputSchema: {
        epicKey: z.string()
          .describe('The Jira epic key (e.g., "PROJ-123", "USER-10"). The epic description should contain Figma design URLs.'),
      },
    },
    async ({ epicKey }: WriteShellStoriesParams, context) => {
      console.log('write-shell-stories called', { epicKey });

      // Get auth info for both Atlassian and Figma
      const authInfo = getAuthInfoSafe(context, 'write-shell-stories');

      try {
        console.log('  Starting shell story generation for epic:', epicKey);

        // TODO: Implement phases:
        // Phase 1: Fetch epic and extract Figma URLs
        // Phase 2: Fetch Figma metadata
        // Phase 3: Generate screens.yaml
        // Phase 4: Download images and notes
        // Phase 5: AI analysis via sampling
        // Phase 6: Write back to Jira

        // For now, return a simple acknowledgment
        return {
          content: [
            {
              type: 'text',
              text: `Shell story generation started for epic: ${epicKey}\n\nThis is a skeleton implementation. Full functionality coming soon.`,
            },
          ],
        };

      } catch (error: any) {
        console.error('  Error in write-shell-stories:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error generating shell stories: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}
