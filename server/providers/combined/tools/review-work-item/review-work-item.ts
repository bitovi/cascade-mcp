/**
 * MCP Tool Handler for Review Work Item
 * 
 * Reviews a Jira work item (story, task, etc.) and generates comprehensive
 * questions identifying gaps, ambiguities, and missing information.
 * Posts the review as a Jira comment.
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createAtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../../../figma/figma-api-client.js';
import { createMcpLLMClient } from '../../../../llm-client/mcp-sampling-client.js';
import { createQueuedGenerateText } from '../../../../llm-client/queued-generate-text.js';
import { createProgressNotifier } from '../writing-shell-stories/progress-notifier.js';
import { executeReviewWorkItem } from './core-logic.js';

/**
 * Tool parameters interface
 */
interface ReviewWorkItemParams {
  issueKey: string;
  cloudId?: string;
  siteName?: string;
  maxDepth?: number;
}

/**
 * Register the review-work-item tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerReviewWorkItemTool(mcp: McpServer): void {
  mcp.registerTool(
    'review-work-item',
    {
      title: 'Review Work Item',
      description: 'Review a Jira work item (story, task, etc.) and generate comprehensive questions identifying gaps, ambiguities, and missing information. Gathers context from parent items, linked Confluence docs, and Figma designs. Posts the review as a Jira comment.',
      inputSchema: {
        issueKey: z.string()
          .describe('Jira issue key to review (e.g., "PROJ-123").'),
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional()
          .describe('Jira site subdomain (e.g., "bitovi" from https://bitovi.atlassian.net). Alternative to cloudId.'),
        maxDepth: z.number().optional()
          .describe('Maximum depth for parent hierarchy traversal (default: 5).'),
      },
    },
    async ({ issueKey, cloudId, siteName, maxDepth }: ReviewWorkItemParams, context) => {
      console.log('review-work-item called', { issueKey, cloudId, siteName, maxDepth });

      // Get auth info for Atlassian (Figma is optional for this tool)
      const authInfo = getAuthInfoSafe(context, 'review-work-item');
      
      // Extract tokens
      const atlassianToken = authInfo?.atlassian?.access_token;
      const figmaToken = authInfo?.figma?.access_token;
      
      console.log('  Extracted tokens:', {
        hasAtlassianToken: !!atlassianToken,
        hasFigmaToken: !!figmaToken,
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
        // Create API clients with tokens
        const atlassianClient = createAtlassianClient(atlassianToken);
        const figmaClient = figmaToken ? createFigmaClient(figmaToken) : createFigmaClient(''); // Figma optional
        const generateText = createQueuedGenerateText(createMcpLLMClient(context));
        const notify = createProgressNotifier(context, 6); // 6 phases total
        
        const deps = {
          atlassianClient,
          figmaClient,
          generateText,
          notify
        };
        
        const result = await executeReviewWorkItem(
          { issueKey, cloudId, siteName, maxDepth },
          deps
        );

        return {
          content: [
            {
              type: 'text',
              text: `# Work Item Review Complete ✅

**Issue**: ${issueKey}
**Questions Identified**: ${result.questionCount}
**Status**: ${result.wellDefined ? 'Well-defined ✨' : 'Needs clarification'}
**Comment ID**: ${result.commentId}

## Review Posted to Jira

${result.reviewContent}

---

**Next Steps**:
1. Review the questions posted as a comment on the Jira issue
2. Discuss with the team to resolve ambiguities
3. Update the work item with clarifications
4. Re-run the review if significant changes are made
`
            }
          ]
        };
      } catch (error: any) {
        console.error('review-work-item failed:', error);
        return {
          content: [
            {
              type: 'text',
              text: `# Work Item Review Failed ❌\n\n**Error**: ${error.message}\n\n**Details**: ${error.stack || 'No stack trace available'}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
