/**
 * Figma Get Comments Tool
 * 
 * Reads existing comments from a Figma file, grouped into threads and
 * associated with frames. Returns formatted markdown for agent consumption.
 * 
 * Comments are always fetched fresh — they cannot be cached because there
 * is no timestamp-based invalidation mechanism.
 */

import { z } from 'zod';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createFigmaClient } from '../figma-api-client.js';
import { fetchCommentsForFile, groupCommentsIntoThreads } from './figma-review-design/figma-comment-utils.js';
import type { CommentThread } from '../figma-comment-types.js';
import { isFrameOffset } from '../figma-comment-types.js';

interface FigmaGetCommentsParams {
  fileKey: string;
  nodeId?: string;
}

/**
 * Format comment threads as readable markdown
 */
function formatThreadsAsMarkdown(threads: CommentThread[], nodeIdFilter?: string): string {
  let filtered = threads;

  if (nodeIdFilter) {
    filtered = threads.filter(t => {
      const meta = t.parent.client_meta;
      return meta && isFrameOffset(meta) && meta.node_id === nodeIdFilter;
    });
  }

  if (filtered.length === 0) {
    return nodeIdFilter
      ? `No comments found for node ${nodeIdFilter}.`
      : 'No comments found for this file.';
  }

  const lines: string[] = [`# Figma Comments (${filtered.length} threads)\n`];

  for (const thread of filtered) {
    const resolved = thread.isResolved ? ' ✅ Resolved' : '';
    const meta = thread.parent.client_meta;
    const nodeInfo = meta && isFrameOffset(meta) ? ` (node: ${meta.node_id})` : '';

    lines.push(`## ${thread.parent.user.handle}${nodeInfo}${resolved}`);
    lines.push(`_${thread.parent.created_at}_\n`);
    lines.push(thread.parent.message);

    for (const reply of thread.replies) {
      lines.push(`\n> **${reply.user.handle}** (_${reply.created_at}_):`);
      lines.push(`> ${reply.message}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Register the figma-get-comments tool with the MCP server
 */
export function registerFigmaGetCommentsTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-get-comments',
    {
      title: 'Get Figma Comments',
      description: 'Read existing comments from a Figma file, grouped into threads. Returns formatted markdown. Always fetches fresh data (comments cannot be cached).',
      inputSchema: {
        fileKey: z.string()
          .describe('Figma file key (from the URL path)'),
        nodeId: z.string().optional()
          .describe('Filter to comments on a specific node. If omitted, returns all file comments.'),
      },
    },
    async ({ fileKey, nodeId }: FigmaGetCommentsParams, context) => {
      console.log('figma-get-comments called');
      console.log('  Parameters:', { fileKey, nodeId: nodeId || '(all)' });

      try {
        const authInfo = getAuthInfoSafe(context, 'figma-get-comments');
        const figmaToken = authInfo?.figma?.access_token;

        if (!figmaToken) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Figma access token found. Please authenticate with Figma.' }],
          };
        }

        const figmaClient = createFigmaClient(figmaToken);

        console.log('  Fetching comments...');
        const comments = await fetchCommentsForFile(figmaClient, fileKey);
        console.log(`  Fetched ${comments.length} comments`);

        const threads = groupCommentsIntoThreads(comments);
        console.log(`  Grouped into ${threads.length} threads`);

        const markdown = formatThreadsAsMarkdown(threads, nodeId);

        return {
          content: [{
            type: 'text' as const,
            text: markdown,
          }],
        };
      } catch (error: any) {
        if (error.constructor.name === 'InvalidTokenError') {
          throw error;
        }
        console.log('  ❌ Error fetching comments:', error.message);
        return {
          content: [{ type: 'text' as const, text: `Error fetching Figma comments: ${error.message}` }],
        };
      }
    }
  );
}
