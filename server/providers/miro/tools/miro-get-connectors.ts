import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createMiroClient } from '../miro-api-client.js';

export function registerMiroGetConnectorsTool(mcp: McpServer): void {
  mcp.registerTool(
    'miro-get-connectors',
    {
      title: 'Get Miro Board Connectors',
      description: 'List all connectors (lines/arrows between items) on a Miro board. Shows relationships between board items.',
      inputSchema: {
        boardId: z.string().describe('The ID of the Miro board'),
        limit: z.number().optional().describe('Maximum number of connectors to return (default 50, max 100)'),
        cursor: z.string().optional().describe('Pagination cursor from a previous response'),
      },
    },
    async ({ boardId, limit, cursor }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'miro-get-connectors');
        const token = authInfo?.miro?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Miro access token found in authentication context' }],
          };
        }

        const client = createMiroClient(token);
        const queryParams = new URLSearchParams();
        queryParams.set('limit', String(Math.min(limit || 50, 100)));
        if (cursor) queryParams.set('cursor', cursor);

        const response = await client.fetch(`/boards/${boardId}/connectors?${queryParams.toString()}`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Miro API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        logger.info('miro-get-connectors completed', {
          boardId,
          connectorCount: data.data?.length || 0,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error: any) {
        logger.error('miro-get-connectors error', { error: error.message });
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
        };
      }
    },
  );
}
