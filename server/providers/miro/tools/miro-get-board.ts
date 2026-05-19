import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createMiroClient } from '../miro-api-client.js';

export function registerMiroGetBoardTool(mcp: McpServer): void {
  mcp.registerTool(
    'miro-get-board',
    {
      title: 'Get Miro Board Details',
      description: 'Get detailed information about a specific Miro board including name, description, owner, creation date, and sharing policy.',
      inputSchema: {
        boardId: z.string().describe('The ID of the Miro board'),
      },
    },
    async ({ boardId }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'miro-get-board');
        const token = authInfo?.miro?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Miro access token found in authentication context' }],
          };
        }

        const client = createMiroClient(token);
        const response = await client.fetch(`/boards/${boardId}`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Miro API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        logger.info('miro-get-board completed', {
          boardId,
          boardName: data.name,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error: any) {
        logger.error('miro-get-board error', { error: error.message });
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
        };
      }
    },
  );
}
