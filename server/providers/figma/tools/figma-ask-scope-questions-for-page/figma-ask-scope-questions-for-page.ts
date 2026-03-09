/**
 * MCP Tool Wrapper for figma-ask-scope-questions-for-page
 * 
 * Self-contained design review tool. Fetches all Figma page data and returns
 * frame images, annotations, semantic XML, embedded prompts, and workflow
 * instructions for subagent-based parallel analysis.
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createFigmaClient } from '../../figma-api-client.js';
import { logger } from '../../../../observability/logger.js';
import { createProgressNotifier } from '../../../combined/tools/writing-shell-stories/progress-notifier.js';
import { executePageQuestionsContext } from './core-logic.js';

interface ToolParams {
  url: string;
  context?: string;
}

/**
 * Register the figma-ask-scope-questions-for-page tool
 */
export function registerFigmaAskScopeQuestionsForPageTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-ask-scope-questions-for-page',
    {
      title: 'Ask Scope Questions for Figma Page',
      description:
        'Analyze a Figma page and generate design scope questions. ' +
        'Returns all frame data (images, annotations, semantic XML), embedded prompts for ' +
        'frame analysis, scope synthesis, and question generation, plus workflow instructions ' +
        'for subagent-based parallel analysis. Self-contained — no separate prompt needed.',
      inputSchema: {
        url: z
          .string()
          .describe(
            'Figma page URL. Can point to a specific page/node or the file (uses first page).'
          ),
        context: z
          .string()
          .optional()
          .describe(
            'Optional feature context (epic description, project goals, scope constraints). ' +
            'Helps the analysis focus on relevant features.'
          ),
      },
    },
    async ({ url, context }: ToolParams, mcpContext) => {
      console.log('figma-ask-scope-questions-for-page called');
      console.log(`  URL: ${url}`);
      if (context) console.log(`  Context: ${context.substring(0, 100)}...`);

      try {
        // Get auth
        const authInfo = getAuthInfoSafe(mcpContext, 'figma-ask-scope-questions-for-page');
        const figmaToken = authInfo?.figma?.access_token;

        if (!figmaToken) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'No Figma access token found' }) }],
            isError: true,
          };
        }

        const figmaClient = createFigmaClient(figmaToken);
        const notify = createProgressNotifier(mcpContext, 6); // 6 phases: fetch, images, annotations, summary, XML, response

        // Execute core logic
        const result = await executePageQuestionsContext({ url, context, notify }, figmaClient);

        logger.info('figma-ask-scope-questions-for-page completed', {
          url,
          hasContext: !!context,
          contentBlocks: result.content.length,
          isError: !!result.isError,
        });

        return result;
      } catch (error: any) {
        logger.error('figma-ask-scope-questions-for-page failed', {
          error: error.message,
          url,
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
