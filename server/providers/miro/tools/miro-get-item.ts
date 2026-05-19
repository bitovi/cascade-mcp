import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createMiroClient } from '../miro-api-client.js';

export function registerMiroGetItemTool(mcp: McpServer): void {
  mcp.registerTool(
    'miro-get-item',
    {
      title: 'Get Miro Item Details',
      description: 'Get full details of a specific item on a Miro board, including content, position, geometry, style, and timestamps.',
      inputSchema: {
        boardId: z.string().describe('The ID of the Miro board'),
        itemId: z.string().describe('The ID of the item to retrieve'),
      },
    },
    async ({ boardId, itemId }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'miro-get-item');
        const token = authInfo?.miro?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Miro access token found in authentication context' }],
          };
        }

        const client = createMiroClient(token);
        const response = await client.fetch(`/boards/${boardId}/items/${itemId}`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Miro API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        logger.info('miro-get-item completed', {
          boardId,
          itemId,
          itemType: data.type,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error: any) {
        logger.error('miro-get-item error', { error: error.message });
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
        };
      }
    },
  );
}
