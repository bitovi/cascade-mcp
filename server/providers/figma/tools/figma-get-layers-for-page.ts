/**
 * Figma Get Layers for Page Tool
 * Lists all top-level layers in a Figma page for discovery before downloading
 * 
 * Ported from figma-downloadable-image-mcp, adapted for OAuth (not PAT)
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createFigmaClient } from '../figma-api-client.js';
import { fetchFigmaFile } from '../figma-helpers.js';

// Tool parameters interface
interface FigmaGetLayersForPageParams {
  url: string;
}

/**
 * Helper function for page ID extraction from URL
 * Extracts page ID from node-id parameter (e.g., node-id=22-3056 → "22")
 */
function extractPageIdFromUrl(url: string): string | null {
  const nodeIdMatch = url.match(/[?&]node-id=([0-9]+)/);
  return nodeIdMatch ? nodeIdMatch[1] : null;
}

/**
 * Helper function for processing page layers
 * Extracts top-level layers from Figma API response
 */
function processPageLayers(apiResponse: any, fileKey: string, requestedPageId: string | null) {
  const fileName = apiResponse.name || 'Unnamed File';
  const pages = apiResponse.document?.children || [];

  console.log('  Processing pages:', pages.map((p: any) => ({ id: p.id, name: p.name })));

  // Find target page
  let targetPage = null;
  if (requestedPageId) {
    // Find page matching requested ID
    targetPage = pages.find((page: any) => page.id === requestedPageId);
    console.log('  Looking for page ID:', requestedPageId);
    console.log('  Found target page:', targetPage ? targetPage.name : 'NOT FOUND');
  }

  // Fallback to first page if not found or not specified
  if (!targetPage && pages.length > 0) {
    targetPage = pages[0];
    console.log('  Using first page:', targetPage.name);
  }

  if (!targetPage) {
    throw new Error('No pages found in file');
  }

  // Extract top-level layers (only visible ones)
  const topLevelLayers = (targetPage.children || [])
    .filter((layer: any) => layer.visible !== false)
    .map((layer: any) => ({
      id: layer.id,
      name: layer.name || 'Unnamed Layer',
      type: layer.type || 'UNKNOWN',
      visible: layer.visible !== false,
      absoluteBoundingBox: layer.absoluteBoundingBox || null,
      downloadUrl: constructDownloadUrl(fileKey, fileName, targetPage.id, layer.id),
    }));

  return {
    fileKey,
    fileName,
    pageId: targetPage.id,
    pageName: targetPage.name || 'Unnamed Page',
    layers: topLevelLayers,
    totalLayers: topLevelLayers.length,
    downloadableUrl:
      topLevelLayers.length > 0
        ? topLevelLayers[0].downloadUrl
        : `https://www.figma.com/design/${fileKey}/${encodeURIComponent(fileName)}`,
  };
}

/**
 * Helper function for URL construction (matching existing tool expectations)
 * Constructs a Figma URL suitable for use with figma-get-image-download
 */
function constructDownloadUrl(fileKey: string, fileName: string, _pageId: string, layerId: string): string {
  const urlNodeId = layerId.replace(':', '-');
  const encodedFileName = encodeURIComponent(fileName.replace(/[^a-zA-Z0-9-]/g, '-'));
  return `https://www.figma.com/design/${fileKey}/${encodedFileName}?node-id=${urlNodeId}`;
}

/**
 * Register the figma-get-layers-for-page tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerFigmaGetLayersForPageTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-get-layers-for-page',
    {
      title: 'Get Layers for Figma Page',
      description: 'List all top-level layers from a Figma page to discover available content before downloading. Returns layer IDs, names, types, and download URLs.',
      inputSchema: {
        url: z.string().url().describe('The Figma file or page URL (supports both /design/ and /file/ formats with optional page parameters)'),
      },
    },
    async ({ url }: FigmaGetLayersForPageParams, context) => {
      console.log('figma-get-layers-for-page called');
      console.log('  URL:', url);

      try {
        // 1. Get auth info with nested OAuth token access per Q22
        const authInfo = getAuthInfoSafe(context, 'figma-get-layers-for-page');
        const token = authInfo?.figma?.access_token;

        if (!token) {
          console.log('  ❌ No Figma access token found');
          return {
            content: [
              {
                type: 'text',
                text: 'Error: No Figma access token found in authentication context. Please authenticate with Figma.',
              },
            ],
          };
        }

        console.log('  ✅ Figma token found');

        // 2. Parse Figma URL - support both /file/ and /design/ formats
        console.log('  Parsing Figma URL...');
        const fileKeyMatch = url.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
        if (!fileKeyMatch) {
          console.log('  ❌ Invalid URL format');
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Invalid Figma URL format. Expected format: https://www.figma.com/design/FILEID or https://www.figma.com/file/FILEID',
              },
            ],
          };
        }
        const fileKey = fileKeyMatch[2];

        if (!fileKey) {
          console.log('  ❌ Failed to extract file key');
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Failed to extract file key from Figma URL',
              },
            ],
          };
        }

        console.log('  Extracted file key:', fileKey);

        // 3. Extract page ID from URL (optional)
        const pageId: string | null = extractPageIdFromUrl(url);
        console.log('  Extracted page ID:', pageId || 'none (will use first page)');

        // 4. Create Figma client and fetch file data using helper (includes enhanced 403 logging)
        const figmaClient = createFigmaClient(token);
        const data = await fetchFigmaFile(figmaClient, fileKey);

        console.log('  ✅ Figma API response received');
        console.log('  File name:', data.name);
        console.log('  Pages found:', data.document?.children?.length || 0);

        // Check for Figma API errors in response
        if (data.err) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Figma API error: ${data.err}`,
              },
            ],
          };
        }

        // 5. Process layers from the response
        console.log('  Processing layers...');
        const layersResult = processPageLayers(data, fileKey, pageId);

        console.log('  ✅ Layers processed successfully');
        console.log('  Total layers:', layersResult.layers.length);
        console.log('  Page:', layersResult.pageName);

        // 6. Return formatted response (same pattern as other tools)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(layersResult, null, 2),
            },
          ],
        };
      } catch (error) {
        console.log('  ❌ Unexpected error:', error);
        logger.error('Unexpected error in figma-get-layers-for-page tool', {
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          content: [
            {
              type: 'text',
              text: `Error: Unexpected error in figma-get-layers-for-page tool: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
