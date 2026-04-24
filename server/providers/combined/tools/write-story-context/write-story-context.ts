/**
 * MCP Tool Wrapper for write-story-context
 * 
 * Registers the tool with the MCP server and handles auth context.
 * Delegates all business logic to core-logic.ts.
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createAtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { logger } from '../../../../observability/logger.js';
import { executeWriteStoryContext } from './core-logic.js';

interface ToolParams {
  issueKey: string;
  siteName: string;
}

/**
 * Register the write-story-context tool
 */
export function registerWriteStoryContextTool(mcp: McpServer): void {
  mcp.registerTool(
    'write-story-context',
    {
      title: 'Get Story Writing Context',
      description:
        'Get complete context for writing a Jira story description. ' +
        'Returns issue hierarchy, comments, linked resource URLs, and the story writing ' +
        'prompt as an embedded resource. Use with prompt-write-story.',
      inputSchema: {
        issueKey: z
          .string()
          .describe('Jira issue key (e.g., "PROJ-123")'),
        siteName: z
          .string()
          .describe(
            'Atlassian site name (e.g., "mycompany" from mycompany.atlassian.net)'
          ),
      },
    },
    async ({ issueKey, siteName }: ToolParams, mcpContext) => {
      console.log('write-story-context called');
      console.log(`  Issue: ${issueKey}, Site: ${siteName}`);

      try {
        // Get auth
        const authInfo = getAuthInfoSafe(mcpContext, 'write-story-context');
        const atlassianToken = authInfo?.atlassian?.access_token;

        if (!atlassianToken) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'No Atlassian access token found' }),
              },
            ],
            isError: true,
          };
        }

        const atlassianClient = createAtlassianClient(atlassianToken);

        // Execute core logic
        const result = await executeWriteStoryContext(
          { issueKey, siteName },
          atlassianClient
        );

        logger.info('write-story-context completed', {
          issueKey,
          siteName,
          contentBlocks: result.content.length,
          isError: !!result.isError,
        });

        return result;
      } catch (error: any) {
        logger.error('write-story-context failed', {
          error: error.message,
          issueKey,
          siteName,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: error.message || String(error) }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
