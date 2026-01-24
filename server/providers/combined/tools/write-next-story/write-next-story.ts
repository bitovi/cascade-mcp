/**
 * Write Next Story Tool - MCP Handler
 * 
 * Thin MCP wrapper that handles authentication and delegates to core logic.
 * This tool writes the next Jira story from shell stories in an epic.
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createAtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../../../figma/figma-api-client.js';
import { createGoogleClient } from '../../../google/google-api-client.js';
import { createMcpLLMClient } from '../../../../llm-client/mcp-sampling-client.js';
import { createQueuedGenerateText } from '../../../../llm-client/queued-generate-text.js';
import { createProgressNotifier } from '../writing-shell-stories/progress-notifier.js';
import { executeWriteNextStory } from './core-logic.js';

/**
 * Tool parameters interface
 */
interface WriteNextStoryParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Register the write-next-story tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerWriteNextStoryTool(mcp: McpServer): void {
  mcp.registerTool(
    'write-epics-next-story',
    {
      title: 'Write Next Epic Story',
      description: 'Write the next Jira story from shell stories in an epic. Validates dependencies, generates full story content, creates Jira issue, and updates epic with completion marker.',
      inputSchema: {
        epicKey: z.string()
          .describe('The Jira epic key (e.g., "PROJ-123", "USER-10"). The epic description should contain a Shell Stories section with prioritized stories.'),
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional()
          .describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
      },
    },
    async ({ epicKey, cloudId, siteName }: WriteNextStoryParams, context) => {
      console.log('write-epics-next-story called', { epicKey, cloudId, siteName });

      // Get auth info for both Atlassian and Figma
      const authInfo = getAuthInfoSafe(context, 'write-epics-next-story');
      
      // Extract tokens
      const atlassianToken = authInfo?.atlassian?.access_token;
      const figmaToken = authInfo?.figma?.access_token;
      const googleToken = authInfo?.google?.access_token;

      if (!atlassianToken) {
        return {
          content: [{
            type: 'text',
            text: 'Error: No valid Atlassian access token found in session context.',
          }],
        };
      }

      if (!figmaToken) {
        return {
          content: [{
            type: 'text',
            text: 'Error: No valid Figma access token found. Please authenticate with Figma.',
          }],
        };
      }

      try {
        // Create API clients with tokens captured in closures
        const atlassianClient = createAtlassianClient(atlassianToken);
        const figmaClient = createFigmaClient(figmaToken);
        const googleClient = googleToken ? createGoogleClient(googleToken) : undefined;
        const generateText = createQueuedGenerateText(createMcpLLMClient(context));
        const notify = createProgressNotifier(context, 8);
        
        // Execute core logic (tokens NOT passed - clients have them baked in!)
        const result = await executeWriteNextStory(
          {
            epicKey,
            cloudId,
            siteName
          },
          {
            atlassianClient,
            figmaClient,
            googleClient,
            generateText,
            notify
          }
        );

        // Return success message to user
        return {
          content: [{
            type: 'text',
            text: `✅ Created and linked Jira story: ${result.issueKey}\n\n**${result.storyTitle}**\n\n${result.issueSelf}\n\nEpic ${result.epicKey} has been updated with the Jira link and completion timestamp.`,
          }],
        };

      } catch (error: any) {
        console.error('Error in write-epics-next-story:', error);
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
