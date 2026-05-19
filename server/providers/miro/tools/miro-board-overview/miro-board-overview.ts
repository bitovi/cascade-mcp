/**
 * Miro Board Overview Tool
 * 
 * Returns a PNG image of the full board + Mermaid text graph.
 * Uses numbered labels bridging visual and semantic layers.
 * Caches by board modifiedAt timestamp.
 */

import { z } from 'zod';
import { logger } from '../../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { createMiroClient } from '../../miro-api-client.js';
import {
  fetchBoardModifiedAt,
  isBoardCacheValid,
  saveBoardCache,
  loadBoardCache,
} from '../../miro-board-cache.js';
import {
  fetchAllBoardData,
  buildBoardData,
} from '../../miro-data-helpers.js';
import { buildBoardSvg, renderSvgToPng } from '../../miro-svg-renderer.js';
import { buildMermaidGraph } from '../../miro-mermaid-builder.js';

export function registerMiroBoardOverviewTool(mcp: McpServer): void {
  mcp.registerTool(
    'miro-board-overview',
    {
      title: 'Miro Board Overview',
      description:
        'Get a visual overview of a Miro board as a PNG image plus a Mermaid relationship graph. ' +
        'Returns numbered items that can be referenced in follow-up calls to miro-board-region for zoomed detail. ' +
        'Caches board data and invalidates when the board is modified.',
      inputSchema: {
        boardId: z.string().describe('The ID of the Miro board (e.g., "uXjVGXH3a-E=")'),
      },
    },
    async ({ boardId }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'miro-board-overview');
        const token = authInfo?.miro?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Miro access token found in authentication context' }],
          };
        }

        const client = createMiroClient(token);

        // ── Check cache ──
        const boardModifiedAt = await fetchBoardModifiedAt(client, boardId);
        const cacheValid = await isBoardCacheValid(boardId, boardModifiedAt);

        let rawItems: any[];
        let rawConnectors: any[];

        if (cacheValid) {
          logger.info('miro-board-overview using cached data', { boardId });
          const cached = await loadBoardCache(boardId);
          if (cached) {
            rawItems = cached.items;
            rawConnectors = cached.connectors;
          } else {
            // Cache metadata valid but data file missing — re-fetch
            const fetched = await fetchAllBoardData(client, boardId);
            rawItems = fetched.rawItems;
            rawConnectors = fetched.rawConnectors;
            await saveBoardCache(boardId, boardModifiedAt, rawItems, rawConnectors);
          }
        } else {
          logger.info('miro-board-overview fetching fresh data', { boardId });
          const fetched = await fetchAllBoardData(client, boardId);
          rawItems = fetched.rawItems;
          rawConnectors = fetched.rawConnectors;
          await saveBoardCache(boardId, boardModifiedAt, rawItems, rawConnectors);
        }

        // ── Normalize ──
        const boardData = buildBoardData(rawItems, rawConnectors);

        logger.info('miro-board-overview normalized', {
          boardId,
          itemCount: boardData.items.length,
          connectorCount: boardData.connectors.length,
        });

        // ── Render SVG → PNG ──
        const svgString = buildBoardSvg(boardData.items, boardData.connectors, {
          viewportWidth: 1200,
          viewportHeight: 900,
        });
        const pngBuffer = await renderSvgToPng(svgString);
        const base64Png = pngBuffer.toString('base64');

        // ── Build Mermaid graph ──
        const mermaidText = buildMermaidGraph(
          boardData.items,
          boardData.connectors,
          boardData.itemMap
        );

        logger.info('miro-board-overview completed', {
          boardId,
          pngSizeKB: Math.round(pngBuffer.length / 1024),
        });

        return {
          content: [
            {
              type: 'image' as const,
              mimeType: 'image/png',
              data: base64Png,
            },
            {
              type: 'text' as const,
              text: mermaidText,
            },
          ],
        };
      } catch (error: any) {
        logger.error('miro-board-overview error', { error: error.message });
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
        };
      }
    },
  );
}
