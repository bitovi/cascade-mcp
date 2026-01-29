/**
 * Write Story Tool - MCP Wrapper
 * 
 * Generates or refines a Jira story by gathering comprehensive context 
 * and writing the best possible story with inline questions for missing information.
 * 
 * This is the MCP tool wrapper that uses OAuth context from ToolDependencies.
 * The core business logic is in core-logic.ts and is shared with the REST API.
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
import { executeWriteStory } from './core-logic.js';

/**
 * Tool parameters interface
 */
interface WriteStoryParams {
  issueKey: string;
  cloudId?: string;
  siteName?: string;
  maxDepth?: number;
}

/**
 * Register the write-story tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerWriteStoryTool(mcp: McpServer): void {
  mcp.registerTool(
    'write-story',
    {
      title: 'Write Story',
      description: 'Generate or refine a Jira story by gathering comprehensive context (parent hierarchy, comments, linked Figma/Confluence/Google Docs) and writing the best possible story. Includes a Scope Analysis section with ❓ markers for missing information. Re-run to incorporate answers and refine the story.',
      inputSchema: {
        issueKey: z.string()
          .describe('Jira issue key for the story (e.g., "PROJ-123"). The tool will fetch the issue, its parent hierarchy, comments, and any linked resources.'),
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional()
          .describe('Jira site subdomain (e.g., "bitovi" from https://bitovi.atlassian.net). Alternative to cloudId.'),
        maxDepth: z.number().optional()
          .describe('Maximum depth for parent traversal (default: 5). Higher values gather more context but take longer.'),
      },
    },
    async ({ issueKey, cloudId, siteName, maxDepth }: WriteStoryParams, context) => {
      console.log('write-story called', { issueKey, cloudId, siteName, maxDepth });

      // Get auth info for Atlassian, Figma, and Google
      const authInfo = getAuthInfoSafe(context, 'write-story');
      
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

      try {
        // Create API clients with tokens captured in closures
        const atlassianClient = createAtlassianClient(atlassianToken);
        const figmaClient = figmaToken ? createFigmaClient(figmaToken) : undefined;
        const googleClient = googleToken ? createGoogleClient(googleToken) : undefined;
        const generateText = createQueuedGenerateText(createMcpLLMClient(context));
        
        // Create progress notifier for MCP protocol (6 phases total)
        const notify = createProgressNotifier(context, 6);
        
        // Call core logic
        const result = await executeWriteStory(
          { issueKey, cloudId, siteName, maxDepth },
          {
            atlassianClient,
            figmaClient,
            googleClient,
            generateText,
            notify,
          }
        );
        
        // Format response based on action
        let responseText: string;
        
        if (result.action === 'no-changes') {
          responseText = `✅ Story ${issueKey} is up to date. No changes detected since last update.`;
        } else {
          const parts = [
            `✅ Story ${issueKey} has been ${result.isFirstRun ? 'created' : 'updated'}.`,
          ];
          
          if (result.questionCount > 0) {
            parts.push(`\n\n📋 **${result.questionCount} unanswered questions** (❓) require clarification.`);
            parts.push('Add answers inline after the questions, then re-run this tool to incorporate them.');
          }
          
          if (result.answeredCount > 0) {
            parts.push(`\n\n💬 **${result.answeredCount} questions answered** and incorporated into the story.`);
          }
          
          if (result.changesIncorporated && result.changesIncorporated.length > 0) {
            parts.push(`\n\n📊 **Changes incorporated:**`);
            result.changesIncorporated.forEach(change => {
              parts.push(`\n  - ${change}`);
            });
          }
          
          responseText = parts.join('');
        }
        
        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      } catch (error) {
        console.error('write-story error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        
        return {
          content: [
            {
              type: 'text',
              text: `Error writing story: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
