/**
 * Figma Post Comment Tool
 * 
 * Posts a single comment to a Figma file, optionally pinned to a specific frame node.
 * Exposes the internal postComment capability from figma-comment-utils as a standalone MCP tool.
 */

import { z } from 'zod';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createFigmaClient } from '../figma-api-client.js';
import { parseFigmaUrl, convertNodeIdToApiFormat } from '../figma-helpers.js';
import type { PostCommentRequest } from '../figma-comment-types.js';

interface FigmaPostCommentParams {
  fileKey: string;
  message: string;
  nodeId?: string;
}

/**
 * Register the figma-post-comment tool with the MCP server
 */
export function registerFigmaPostCommentTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-post-comment',
    {
      title: 'Post Figma Comment',
      description: 'Post a comment to a Figma file, optionally pinned to a specific frame node.',
      inputSchema: {
        fileKey: z.string()
          .describe('Figma file key (from the URL path, e.g., "abc123" from figma.com/design/abc123/...)'),
        message: z.string()
          .describe('Comment text to post'),
        nodeId: z.string().optional()
          .describe('Node ID to pin the comment to a specific frame (e.g., "123:456"). If omitted, posts as a file-level comment.'),
      },
    },
    async ({ fileKey, message, nodeId }: FigmaPostCommentParams, context) => {
      console.log('figma-post-comment called');
      console.log('  Parameters:', { fileKey, nodeId: nodeId || '(file-level)', messageLength: message.length });

      try {
        const authInfo = getAuthInfoSafe(context, 'figma-post-comment');
        const figmaToken = authInfo?.figma?.access_token;

        if (!figmaToken) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Figma access token found. Please authenticate with Figma.' }],
          };
        }

        const figmaClient = createFigmaClient(figmaToken);

        const request: PostCommentRequest = { message };
        if (nodeId) {
          request.client_meta = {
            node_id: nodeId,
            node_offset: { x: 0, y: 0 },
          };
        }

        console.log('  Posting comment to Figma...');
        const comment = await figmaClient.postComment(fileKey, request);
        console.log('  ✅ Comment posted, id:', comment.id);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              commentId: comment.id,
              fileKey,
              nodeId: nodeId || null,
              message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
            }, null, 2),
          }],
        };
      } catch (error: any) {
        if (error.constructor.name === 'InvalidTokenError') {
          throw error;
        }
        console.log('  ❌ Error posting comment:', error.message);
        return {
          content: [{ type: 'text' as const, text: `Error posting Figma comment: ${error.message}` }],
        };
      }
    }
  );
}
