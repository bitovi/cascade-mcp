import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createMiroClient } from '../miro-api-client.js';

export function registerMiroGetFrameItemsTool(mcp: McpServer): void {
  mcp.registerTool(
    'miro-get-frame-items',
    {
      title: 'Get Items in Miro Frame',
      description: 'Get all items contained within a specific frame on a Miro board. Useful for reading organized sections of a board.',
      inputSchema: {
        boardId: z.string().describe('The ID of the Miro board'),
        frameId: z.string().describe('The ID of the frame to get items from'),
        type: z.string().optional().describe('Filter by item type (e.g. sticky_note, shape, text, card, image, document, embed)'),
        limit: z.number().optional().describe('Maximum number of items to return (default 50, max 50)'),
      },
    },
    async ({ boardId, frameId, type, limit }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'miro-get-frame-items');
        const token = authInfo?.miro?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Miro access token found in authentication context' }],
          };
        }

        const client = createMiroClient(token);
        const queryParams = new URLSearchParams();
        queryParams.set('parent_item_id', frameId);
        if (type) queryParams.set('type', type);
        queryParams.set('limit', String(Math.min(limit || 50, 50)));

        const response = await client.fetch(`/boards/${boardId}/items?${queryParams.toString()}`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Miro API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        logger.info('miro-get-frame-items completed', {
          boardId,
          frameId,
          itemCount: data.data?.length || 0,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error: any) {
        logger.error('miro-get-frame-items error', { error: error.message });
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
        };
      }
    },
  );
}
