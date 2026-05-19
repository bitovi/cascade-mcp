import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createMiroClient } from '../miro-api-client.js';

export function registerMiroGetBoardItemsTool(mcp: McpServer): void {
  mcp.registerTool(
    'miro-get-board-items',
    {
      title: 'Get Miro Board Items',
      description: 'List items on a Miro board. Supports filtering by item type and cursor-based pagination. Types include: sticky_note, shape, text, card, frame, image, document, embed.',
      inputSchema: {
        boardId: z.string().describe('The ID of the Miro board'),
        type: z.string().optional().describe('Filter by item type (e.g. sticky_note, shape, text, card, frame, image, document, embed)'),
        limit: z.number().optional().describe('Maximum number of items to return (default 50, max 50)'),
        cursor: z.string().optional().describe('Pagination cursor from a previous response'),
      },
    },
    async ({ boardId, type, limit, cursor }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'miro-get-board-items');
        const token = authInfo?.miro?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Miro access token found in authentication context' }],
          };
        }

        const client = createMiroClient(token);
        const queryParams = new URLSearchParams();
        if (type) queryParams.set('type', type);
        queryParams.set('limit', String(Math.min(limit || 50, 50)));
        if (cursor) queryParams.set('cursor', cursor);

        const response = await client.fetch(`/boards/${boardId}/items?${queryParams.toString()}`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Miro API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        logger.info('miro-get-board-items completed', {
          boardId,
          itemCount: data.data?.length || 0,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error: any) {
        logger.error('miro-get-board-items error', { error: error.message });
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
        };
      }
    },
  );
}
