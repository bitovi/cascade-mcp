/**
 * Figma Get Image Download Tool
 * Downloads images from Figma design URLs with OAuth authentication
 * 
 * Ported from figma-downloadable-image-mcp, adapted for OAuth (not PAT)
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createRateLimitErrorMessage } from '../figma-helpers.js';

// Tool parameters interface
interface FigmaGetImageDownloadParams {
  url: string;
  nodeId: string;
  format?: string;
  scale?: number;
}

/**
 * Register the figma-get-image-download tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerFigmaGetImageDownloadTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-get-image-download',
    {
      title: 'Download Figma Image',
      description: 'Download an image from a Figma file by providing the file URL and node ID. Returns both base64-encoded image and metadata.',
      inputSchema: {
        url: z.string().url().describe('The Figma file URL (supports both /design/ and /file/ formats)'),
        nodeId: z.string().describe('The specific node ID to download (from node-id parameter in URL, e.g., "60-55")'),
        format: z.string().optional().default('png').describe('The image format (png, jpg, svg, pdf)'),
        scale: z.number().optional().default(1).describe('The scale factor for the image (0.1-4)'),
      },
    },
    async ({ url, nodeId, format = 'png', scale = 1 }: FigmaGetImageDownloadParams, context) => {
      console.log('figma-get-image-download called');
      console.log('  Parameters:', { url, nodeId, format, scale });

      try {
        // 1. Get auth info with nested OAuth token access per Q22
        const authInfo = getAuthInfoSafe(context, 'figma-get-image-download');
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

        console.log('  Extracted file key:', fileKey);

        // 3. Convert node ID from URL format (60-55) to Figma API format (60:55)
        const figmaNodeId = nodeId.replace('-', ':');
        console.log('  Converted node ID:', nodeId, '→', figmaNodeId);

        // 4. Call Figma API to get image URL
        const figmaApiUrl = `https://api.figma.com/v1/images/${fileKey}`;
        const params = new URLSearchParams({
          ids: figmaNodeId,
          format,
          scale: scale.toString(),
        });

        const fullUrl = `${figmaApiUrl}?${params}`;
        console.log('  Calling Figma API:', fullUrl);

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

        let data: any;
        try {
          const response = await fetch(fullUrl, {
            headers: {
              'Authorization': `Bearer ${token}`, // OAuth Bearer token per Q10
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          console.log('  Figma API response:', response.status, response.statusText);

          if (!response.ok) {
            const errorText = await response.text();
            console.log('  ❌ Figma API error:', errorText);
            
            // Handle rate limiting with user-friendly message
            if (response.status === 429) {
              const message = await createRateLimitErrorMessage(fullUrl, response, errorText);
              return {
                content: [
                  {
                    type: 'text',
                    text: `Error: ${message}`,
                  },
                ],
              };
            }
            
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: Figma API error: ${response.status} ${response.statusText} - ${errorText}`,
                },
              ],
            };
          }

          data = await response.json();
          console.log('  ✅ Figma API response received');
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.log('  ❌ Request timed out');
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: Figma API request timed out after 60 seconds',
                },
              ],
            };
          }
          console.log('  ❌ Fetch error:', fetchError);
          throw fetchError;
        }

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

        // Extract image URL from response
        const imageUrl = data.images[figmaNodeId];
        if (!imageUrl) {
          console.log('  ❌ No image URL returned');
          console.log('  Available node IDs:', Object.keys(data.images || {}));
          return {
            content: [
              {
                type: 'text',
                text: `Error: No image URL returned from Figma API for node ${figmaNodeId}. Available nodes: ${Object.keys(data.images || {}).join(', ')}`,
              },
            ],
          };
        }

        console.log('  ✅ Image URL received');
        console.log('  Downloading image from Figma CDN...');

        // 5. Download the actual image from Figma's CDN
        const imageController = new AbortController();
        const imageTimeoutId = setTimeout(() => imageController.abort(), 30000); // 30 second timeout for image download

        try {
          const imageResponse = await fetch(imageUrl, {
            signal: imageController.signal,
          });

          clearTimeout(imageTimeoutId);

          if (!imageResponse.ok) {
            console.log('  ❌ Failed to download image:', imageResponse.status);
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: Failed to download image from Figma CDN: ${imageResponse.status} ${imageResponse.statusText}`,
                },
              ],
            };
          }

          const imageBlob = await imageResponse.blob();
          console.log('  ✅ Image downloaded:', Math.round(imageBlob.size / 1024), 'KB');

          // 6. Convert blob to base64
          const arrayBuffer = await imageBlob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64Data = buffer.toString('base64');

          console.log('  ✅ Image converted to base64');

          // 7. Return the image as MCP image content type (following jira-mcp-auth-bridge pattern)
          return {
            content: [
              {
                type: 'image',
                mimeType: imageBlob.type || 'image/png',
                data: base64Data,
              },
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    fileKey,
                    nodeId,
                    format,
                    scale,
                    imageUrl,
                    mimeType: imageBlob.type || 'image/png',
                    byteSize: imageBlob.size,
                    createdAt: new Date().toISOString(),
                    message: `Downloaded Figma image: ${nodeId} from file ${fileKey} (${Math.round(imageBlob.size / 1024)}KB)`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (imageError: any) {
          clearTimeout(imageTimeoutId);
          if (imageError.name === 'AbortError') {
            console.log('  ❌ Image download timed out');
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: Image download timed out after 30 seconds',
                },
              ],
            };
          }
          console.log('  ❌ Image download error:', imageError);
          return {
            content: [
              {
                type: 'text',
                text: `Error: Failed to download image: ${imageError.message}`,
              },
            ],
          };
        }
      } catch (error) {
        console.log('  ❌ Unexpected error:', error);
        logger.error('Unexpected error in figma-get-image-download tool', {
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          content: [
            {
              type: 'text',
              text: `Error: Unexpected error in figma-get-image-download tool: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
