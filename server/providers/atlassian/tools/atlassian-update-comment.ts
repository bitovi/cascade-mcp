/**
 * Atlassian Update Comment Tool
 * 
 * Updates an existing comment on a Jira issue. Accepts markdown text,
 * converts to ADF (Atlassian Document Format) server-side.
 * Useful for incrementally building a Q&A comment.
 */

import { z } from 'zod';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import { resolveCloudId, updateIssueComment } from '../atlassian-helpers.js';
import { createAtlassianClientFromAuth } from '../atlassian-api-client.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';

interface AtlassianUpdateCommentParams {
  issueKey: string;
  commentId: string;
  comment: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Register the atlassian-update-comment tool with the MCP server
 */
export function registerAtlassianUpdateCommentTool(mcp: McpServer): void {
  mcp.registerTool(
    'atlassian-update-comment',
    {
      title: 'Update Jira Comment',
      description: 'Update an existing comment on a Jira issue. Replaces the full comment body. Accepts markdown text, which is converted to ADF (Atlassian Document Format) automatically.',
      inputSchema: {
        issueKey: z.string()
          .describe('Jira issue key (e.g., "PROJ-123")'),
        commentId: z.string()
          .describe('ID of the comment to update (returned by atlassian-add-comment)'),
        comment: z.string()
          .describe('New comment text in markdown format. Replaces the entire comment body. Converted to ADF before posting.'),
        cloudId: z.string().optional()
          .describe('Cloud ID to specify the Jira site.'),
        siteName: z.string().optional()
          .describe('Jira site name (e.g., "mycompany" from mycompany.atlassian.net).'),
      },
    },
    async ({ issueKey, commentId, comment, cloudId, siteName }: AtlassianUpdateCommentParams, context) => {
      console.log('atlassian-update-comment called');
      console.log('  Parameters:', { issueKey, commentId, cloudId, siteName, commentLength: comment.length });

      try {
        const authInfo = getAuthInfoSafe(context, 'atlassian-update-comment');
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

        console.log('  Updating comment...');
        await updateIssueComment(client, siteInfo.cloudId, issueKey, commentId, comment);
        console.log('  ✅ Comment updated');

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              issueKey,
              commentId,
            }, null, 2),
          }],
        };
      } catch (error: any) {
        if (error.constructor.name === 'InvalidTokenError') {
          throw error;
        }
        console.log('  ❌ Error updating comment:', error.message);
        return {
          content: [{ type: 'text' as const, text: `Error updating Jira comment: ${error.message}` }],
        };
      }
    }
  );
}
