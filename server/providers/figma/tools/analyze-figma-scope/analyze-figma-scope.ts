/**
 * MCP Tool Handler for Analyze Figma Scope
 *
 * Analyzes Figma screen designs directly and posts clarifying questions
 * as comments on the Figma file. This is a standalone tool that doesn't
 * require Jira integration.
 *
 * User Story 2: Post AI-Generated Questions as Figma Comments
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createFigmaClient } from '../../../figma/figma-api-client.js';
import { createMcpLLMClient } from '../../../../llm-client/mcp-sampling-client.js';
import { createQueuedGenerateText } from '../../../../llm-client/queued-generate-text.js';
import { createProgressNotifier } from '../../../combined/tools/writing-shell-stories/progress-notifier.js';
import { executeAnalyzeFigmaScope } from './core-logic.js';

/**
 * Tool parameters interface
 */
interface AnalyzeFigmaScopeParams {
  figmaUrls: string[];
  contextDescription?: string;
}

/**
 * Register the analyze-figma-scope tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerAnalyzeFigmaScopeTool(mcp: McpServer): void {
  mcp.registerTool(
    'analyze-figma-scope',
    {
      title: 'Analyze Figma Scope',
      description:
        'Analyze Figma screen designs and post clarifying questions as comments. ' +
        'Provide one or more Figma URLs to analyze. Questions will be posted directly ' +
        'to the Figma file as comments on relevant frames.',
      inputSchema: {
        figmaUrls: z
          .array(z.string())
          .min(1)
          .describe(
            'One or more Figma URLs to analyze. Supports file URLs, specific frame URLs, or node URLs.'
          ),
        contextDescription: z
          .string()
          .optional()
          .describe(
            'Optional context description including scope guidance. Use this to specify what features are in-scope, out-of-scope, already implemented, or should be ignored. Example: "Focus on the checkout flow only. Ignore payment processing (already implemented) and admin features (out of scope)."'
          ),
      },
    },
    async ({ figmaUrls, contextDescription }: AnalyzeFigmaScopeParams, context) => {
      console.log('analyze-figma-scope called', {
        figmaUrls,
        hasContextDescription: !!contextDescription,
      });

      // Get auth info for Figma
      const authInfo = getAuthInfoSafe(context, 'analyze-figma-scope');

      // Extract Figma token
      const figmaToken = authInfo?.figma?.access_token;

      console.log('  Extracted tokens:', {
        hasFigmaToken: !!figmaToken,
      });

      // Debug Figma token details
      if (figmaToken) {
        console.log('  Figma token details:', {
          length: figmaToken.length,
          prefix: figmaToken.substring(0, 10),
          type: figmaToken.startsWith('figu_')
            ? 'OAuth'
            : figmaToken.startsWith('figd_')
              ? 'PAT'
              : 'Unknown',
          scope: authInfo?.figma?.scope,
          expiresAt: authInfo?.figma?.expires_at
            ? new Date(authInfo.figma.expires_at * 1000).toISOString()
            : 'no expiry',
        });
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
        // Create API clients with tokens
        const figmaClient = createFigmaClient(figmaToken);
        const generateText = createQueuedGenerateText(createMcpLLMClient(context));
        const notify = createProgressNotifier(context, 8); // 8 phases total

        // Execute core logic
        const result = await executeAnalyzeFigmaScope(
          {
            figmaUrls,
            contextDescription,
          },
          {
            figmaClient,
            generateText,
            notify,
          }
        );

        // Build response content
        let responseText = `# Figma Scope Analysis Complete ✅

**URLs Analyzed**: ${figmaUrls.length}
**Questions Generated**: ${result.questions.length}`;

        // Add posting summary if available
        if (result.postingSummary) {
          responseText += `\n**Posting**: ${result.postingSummary}`;
        }

        // Add errors if any
        if (result.errors && result.errors.length > 0) {
          responseText += `\n\n## Warnings\n`;
          for (const error of result.errors) {
            responseText += `\n- ⚠️ ${error}`;
          }
        }

        // Add questions section (FR-019: always include questions)
        if (result.questions.length > 0) {
          responseText += `\n\n## Questions Generated\n`;
          for (const question of result.questions) {
            const frameLabel = question.frameName ? ` (${question.frameName})` : '';
            responseText += `\n- ❓ ${question.text}${frameLabel}`;
          }
        }

        // Add scope analysis
        if (result.analysis) {
          responseText += `\n\n## Scope Analysis\n\n${result.analysis}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        console.error('analyze-figma-scope failed:', error);
        return {
          content: [
            {
              type: 'text',
              text: `# Figma Scope Analysis Failed ❌\n\n**Error**: ${error.message}\n\n**Details**: ${error.stack || 'No stack trace available'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
