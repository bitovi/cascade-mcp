/**
 * Write Shell Stories Tool
 * 
 * Generates shell stories from Figma designs linked in a Jira epic.
 * This tool orchestrates fetching Jira content, analyzing Figma designs,
 * and generating user stories through AI-powered sampling.
 * 
 * PREREQUISITE: Epic must contain a "## Scope Analysis" section.
 * Run the "analyze-feature-scope" tool first if this section doesn't exist.
 * 
 * The tool uses scope analysis from the epic description to organize features
 * into an incremental delivery plan (shell stories).
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createAtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../../../figma/figma-api-client.js';
import { createGoogleClient } from '../../../google/google-api-client.js';
import { createMcpLLMClient } from '../../../../llm-client/mcp-sampling-client.js';
import { createQueuedGenerateText } from '../../../../llm-client/queued-generate-text.js';
import { createProgressNotifier } from './progress-notifier.js';
import { executeWriteShellStories } from './core-logic.js';

/**
 * Tool parameters interface
 */
interface WriteShellStoriesParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
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
      description: 'Generate shell stories from Figma designs linked in a Jira epic. Analyzes screens, downloads assets, and creates prioritized user stories. Uses epic description content to guide prioritization and scope decisions.',
      inputSchema: {
        epicKey: z.string()
          .describe('Jira epic key (e.g., "PROJ-123" from https://bitovi.atlassian.net/browse/PROJ-123). Epic description must contain Figma design URLs and may include context about priorities, scope, and constraints.'),
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional()
          .describe('Jira site subdomain (e.g., "bitovi" from https://bitovi.atlassian.net). Alternative to cloudId.'),
      },
    },
    async ({ epicKey, cloudId, siteName }: WriteShellStoriesParams, context) => {
      console.log('write-shell-stories called', { epicKey, cloudId, siteName });

      // Get auth info for both Atlassian and Figma
      const authInfo = getAuthInfoSafe(context, 'write-shell-stories');
      
      // Extract tokens
      const atlassianToken = authInfo?.atlassian?.access_token;
      const figmaToken = authInfo?.figma?.access_token;
      const googleToken = authInfo?.google?.access_token;
      
      console.log('  Extracted tokens:', {
        hasAtlassianToken: !!atlassianToken,
        atlassianTokenPreview: atlassianToken?.substring(0, 20) + '...',
        hasFigmaToken: !!figmaToken,
        figmaTokenPreview: figmaToken?.substring(0, 20) + '...',
        hasGoogleToken: !!googleToken,
      });
      
      if (!atlassianToken) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Atlassian access token found. Please authenticate with Atlassian first.',
            },
          ],
        };
      }
      
      if (!figmaToken) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Figma access token found. Please authenticate with Figma first.',
            },
          ],
        };
      }

      try {
        // Create API clients with tokens captured in closures
        const atlassianClient = createAtlassianClient(atlassianToken);
        const figmaClient = createFigmaClient(figmaToken);
        const googleClient = googleToken ? createGoogleClient(googleToken) : undefined;
        const generateText = createQueuedGenerateText(createMcpLLMClient(context));
        const notify = createProgressNotifier(context, 7);
        
        // Execute core logic (tokens NOT passed - clients have them baked in!)
        const result = await executeWriteShellStories(
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

        // Return result based on action taken (self-healing workflow)
        let responseText: string;
        
        if (result.action === 'proceed') {
          // Shell stories were created successfully
          responseText = result.shellStoriesContent || 'Shell stories generated successfully.';
        } else if (result.action === 'clarify') {
          // Too many questions, needs clarification
          responseText = `## Clarification Needed

${result.questionCount} unanswered questions found (threshold: 5). Please answer the questions in the Scope Analysis section and run this tool again.

${result.scopeAnalysisContent || ''}`;
        } else if (result.action === 'regenerate') {
          // Regenerated scope analysis with answered questions
          responseText = `## Scope Analysis Regenerated

${result.questionCount} unanswered questions found after incorporating your answers. Please answer the remaining questions and run this tool again.

${result.scopeAnalysisContent || ''}`;
        } else {
          responseText = result.shellStoriesContent || 'Completed.';
        }
        
        return {
          content: [
            {
              type: 'text' as const,
              text: responseText,
            },
          ],
        };

      } catch (error: any) {
        console.error('  Error in write-shell-stories:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error generating shell stories: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}
