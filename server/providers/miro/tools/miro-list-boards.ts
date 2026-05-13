import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createMiroClient } from '../miro-api-client.js';

export function registerMiroListBoardsTool(mcp: McpServer): void {
  mcp.registerTool(
    'miro-list-boards',
    {
      title: 'List Miro Boards',
      description: 'List Miro boards accessible to the authenticated user. Returns board IDs, names, and view links. Use board IDs for subsequent operations.',
      inputSchema: {
        query: z.string().optional().describe('Search boards by name'),
        limit: z.number().optional().describe('Maximum number of boards to return (default 20, max 50)'),
      },
    },
    async ({ query, limit }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'miro-list-boards');
        const token = authInfo?.miro?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Miro access token found in authentication context' }],
          };
        }

        const client = createMiroClient(token);
        const queryParams = new URLSearchParams();
        if (query) queryParams.set('query', query);
        queryParams.set('limit', String(Math.min(limit || 20, 50)));

        const response = await client.fetch(`/boards?${queryParams.toString()}`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Miro API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        logger.info('miro-list-boards completed', {
          boardCount: data.data?.length || 0,
          total: data.total,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error: any) {
        logger.error('miro-list-boards error', { error: error.message });
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
        };
      }
    },
  );
}
