/**
 * Atlassian Add Comment Tool
 * 
 * Posts a comment to a Jira issue. Accepts markdown text,
 * converts to ADF (Atlassian Document Format) server-side.
 */

import { z } from 'zod';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import { resolveCloudId, addIssueComment } from '../atlassian-helpers.js';
import { createAtlassianClientFromAuth } from '../atlassian-api-client.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';

interface AtlassianAddCommentParams {
  issueKey: string;
  comment: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Register the atlassian-add-comment tool with the MCP server
 */
export function registerAtlassianAddCommentTool(mcp: McpServer): void {
  mcp.registerTool(
    'atlassian-add-comment',
    {
      title: 'Add Jira Comment',
      description: 'Post a comment to a Jira issue. Accepts markdown text, which is converted to ADF (Atlassian Document Format) automatically.',
      inputSchema: {
        issueKey: z.string()
          .describe('Jira issue key (e.g., "PROJ-123")'),
        comment: z.string()
          .describe('Comment text in markdown format. Converted to ADF before posting.'),
        cloudId: z.string().optional()
          .describe('Cloud ID to specify the Jira site.'),
        siteName: z.string().optional()
          .describe('Jira site name (e.g., "mycompany" from mycompany.atlassian.net).'),
      },
    },
    async ({ issueKey, comment, cloudId, siteName }: AtlassianAddCommentParams, context) => {
      console.log('atlassian-add-comment called');
      console.log('  Parameters:', { issueKey, cloudId, siteName, commentLength: comment.length });

      try {
        const authInfo = getAuthInfoSafe(context, 'atlassian-add-comment');
        const token = authInfo?.atlassian?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Atlassian access token found. Please authenticate with Atlassian.' }],
          };
        }

        const client = createAtlassianClientFromAuth(authInfo.atlassian!, siteName);

        console.log('  Resolving cloud ID...');
        const siteInfo = await resolveCloudId(client, cloudId, siteName);
        console.log('  Cloud ID:', siteInfo.cloudId);

        console.log('  Posting comment...');
        const result = await addIssueComment(client, siteInfo.cloudId, issueKey, comment);
        console.log('  ✅ Comment posted, id:', result.commentId);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              issueKey,
              commentId: result.commentId,
            }, null, 2),
          }],
        };
      } catch (error: any) {
        if (error.constructor.name === 'InvalidTokenError') {
          throw error;
        }
        console.log('  ❌ Error posting comment:', error.message);
        return {
          content: [{ type: 'text' as const, text: `Error posting Jira comment: ${error.message}` }],
        };
      }
    }
  );
}
