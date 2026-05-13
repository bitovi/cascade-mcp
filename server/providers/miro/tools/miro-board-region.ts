/**
 * Miro Board Region Tool
 * 
 * Zooms into specific items on a Miro board, returning a high-res PNG
 * of the region plus detailed item information.
 * For image items in the region, downloads the actual image from Miro CDN.
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createMiroClient } from '../miro-api-client.js';
import {
  fetchBoardModifiedAt,
  isBoardCacheValid,
  saveBoardCache,
  loadBoardCache,
} from '../miro-board-cache.js';
import {
  fetchAllBoardData,
  buildBoardData,
  type NormalizedItem,
} from '../miro-data-helpers.js';
import { buildBoardSvg, renderSvgToPng } from '../miro-svg-renderer.js';

/**
 * Download an image from a URL and return as base64 data URI for SVG embedding.
 * Used for image items in region zoom mode.
 */
async function downloadImageAsBase64(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Build a detailed text description of items in the region
 */
function buildRegionDetails(
  regionItems: NormalizedItem[],
  allConnectors: { startItemId: string; endItemId: string; arrowType: string; dashed: boolean; caption: string }[],
  itemMap: Map<string, NormalizedItem>
): string {
  const regionIds = new Set(regionItems.map(i => i.id));
  const lines: string[] = ['## Region Details', ''];

  for (const item of regionItems) {
    lines.push(`### [${item.num}] ${item.text || '(empty)'}`);
    lines.push(`- **Type**: ${item.type}`);
    lines.push(`- **Shape**: ${item.shape}`);
    lines.push(`- **Color**: ${item.fillColor}`);
    lines.push(`- **Size**: ${Math.round(item.width)}×${Math.round(item.height)}`);
    lines.push(`- **Position**: (${Math.round(item.x)}, ${Math.round(item.y)})`);
    if (item.imageUrl) {
      lines.push(`- **Image URL**: ${item.imageUrl}`);
    }

    // List connections for this item
    const connections = allConnectors.filter(
      c => (c.startItemId === item.id || c.endItemId === item.id)
    );
    if (connections.length > 0) {
      lines.push('- **Connections**:');
      for (const conn of connections) {
        const otherId = conn.startItemId === item.id ? conn.endItemId : conn.startItemId;
        const other = itemMap.get(otherId);
        const direction = conn.startItemId === item.id ? '→' : '←';
        const style = conn.dashed ? ' (dashed)' : '';
        const captionStr = conn.caption ? ` "${conn.caption}"` : '';
        const otherLabel = other ? `[${other.num}] ${other.text.slice(0, 30)}` : otherId;
        const inRegion = regionIds.has(otherId) ? '' : ' *(outside region)*';
        lines.push(`  - ${direction} ${otherLabel} [${conn.arrowType}${style}]${captionStr}${inRegion}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function registerMiroBoardRegionTool(mcp: McpServer): void {
  mcp.registerTool(
    'miro-board-region',
    {
      title: 'Miro Board Region Zoom',
      description:
        'Zoom into specific items on a Miro board by their numbered IDs (from miro-board-overview). ' +
        'Returns a high-resolution PNG of the selected region plus detailed text descriptions of each item and its connections. ' +
        'When a frame or large shape container (e.g., "Sales", "Delivery") is selected, items inside it are automatically included. ' +
        'For image items, downloads and embeds the actual images. ' +
        'Tip: select multiple related items (e.g., all items in a data model area) for useful context.',
      inputSchema: {
        boardId: z.string().describe('The ID of the Miro board'),
        itemNums: z.array(z.number()).describe('Array of item numbers from the overview (e.g., [3, 5, 7])'),
        padding: z.number().optional().describe('Extra padding around the region as a fraction (default 0.15 = 15%)'),
      },
    },
    async ({ boardId, itemNums, padding }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'miro-board-region');
        const token = authInfo?.miro?.access_token;

        if (!token) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Miro access token found in authentication context' }],
          };
        }

        const client = createMiroClient(token);

        // ── Load data (prefer cache) ──
        const boardModifiedAt = await fetchBoardModifiedAt(client, boardId);
        const cacheValid = await isBoardCacheValid(boardId, boardModifiedAt);

        let rawItems: any[];
        let rawConnectors: any[];

        if (cacheValid) {
          const cached = await loadBoardCache(boardId);
          if (cached) {
            rawItems = cached.items;
            rawConnectors = cached.connectors;
          } else {
            const fetched = await fetchAllBoardData(client, boardId);
            rawItems = fetched.rawItems;
            rawConnectors = fetched.rawConnectors;
            await saveBoardCache(boardId, boardModifiedAt, rawItems, rawConnectors);
          }
        } else {
          const fetched = await fetchAllBoardData(client, boardId);
          rawItems = fetched.rawItems;
          rawConnectors = fetched.rawConnectors;
          await saveBoardCache(boardId, boardModifiedAt, rawItems, rawConnectors);
        }

        const boardData = buildBoardData(rawItems, rawConnectors);

        // ── Find requested items by their sequential numbers ──
        // Auto-expand: if a frame/container is selected, include all descendants.
        // Uses both parentId (for frames) and spatial containment (for shape containers
        // like "Sales", "Delivery" which don't have children via parentId).
        const numSet = new Set(itemNums);
        const regionItems = boardData.items.filter(i => numSet.has(i.num));

        // Recursively find all descendants via parentId
        const selectedIds = new Set(regionItems.map(i => i.id));
        let foundNew = true;
        while (foundNew) {
          foundNew = false;
          for (const item of boardData.items) {
            if (item.parentId && selectedIds.has(item.parentId) && !selectedIds.has(item.id)) {
              regionItems.push(item);
              selectedIds.add(item.id);
              foundNew = true;
            }
          }
        }

        // Spatial containment: for large selected items (area > 100k), include
        // items whose center falls within the container's bounds.
        const CONTAINER_AREA = 100_000;
        const containers = regionItems.filter(i => i.width * i.height > CONTAINER_AREA);
        for (const container of containers) {
          const cLeft = container.x - container.width / 2;
          const cTop = container.y - container.height / 2;
          const cRight = container.x + container.width / 2;
          const cBottom = container.y + container.height / 2;
          for (const item of boardData.items) {
            if (!selectedIds.has(item.id) && item.id !== container.id) {
              if (item.x >= cLeft && item.x <= cRight && item.y >= cTop && item.y <= cBottom) {
                regionItems.push(item);
                selectedIds.add(item.id);
              }
            }
          }
        }

        if (regionItems.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: No items found matching numbers [${itemNums.join(', ')}]. Use miro-board-overview first to get valid item numbers.`,
            }],
          };
        }

        const regionItemIds = new Set(regionItems.map(i => i.id));

        // ── Download images for image items in the region ──
        // (Hybrid approach: only download in region zoom, not overview)
        for (const item of regionItems) {
          if (item.type === 'image' && item.imageUrl) {
            const dataUri = await downloadImageAsBase64(item.imageUrl);
            if (dataUri) {
              // Store downloaded image data for SVG embedding
              // We'll pass this through the item itself
              (item as any)._imageDataUri = dataUri;
            }
          }
        }

        // ── Render region SVG → PNG ──
        const svgString = buildBoardSvg(boardData.items, boardData.connectors, {
          viewportWidth: 1600,
          viewportHeight: 1200,
          padding: padding || 0.15,
          fullText: true,
          itemIds: regionItemIds,
        });
        const pngBuffer = await renderSvgToPng(svgString);
        const base64Png = pngBuffer.toString('base64');

        // ── Build detailed text ──
        const detailText = buildRegionDetails(
          regionItems,
          boardData.connectors,
          boardData.itemMap
        );

        logger.info('miro-board-region completed', {
          boardId,
          requestedItems: itemNums.length,
          foundItems: regionItems.length,
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
              text: detailText,
            },
          ],
        };
      } catch (error: any) {
        logger.error('miro-board-region error', { error: error.message });
        return {
          content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
        };
      }
    },
  );
}
