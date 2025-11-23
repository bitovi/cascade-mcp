/**
 * Get Metadata for Figma Layer Tool
 * Retrieves detailed metadata for a specific Figma layer/node
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createFigmaClient } from '../figma-api-client.js';
import { fetchFigmaFile } from '../figma-helpers.js';

// Tool parameters interface
interface GetMetadataForLayerParams {
  url: string;
  nodeId: string;
}

// Response interface for layer metadata
interface LayerMetadata {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  absoluteBoundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

/**
 * Recursive function to find a node by ID in the document tree
 */
function findNodeInDocument(node: any, targetNodeId: string): any {
  // Check if current node matches
  if (node.id === targetNodeId) {
    return node;
  }
  
  // Search in children if they exist
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findNodeInDocument(child, targetNodeId);
      if (found) {
        return found;
      }
    }
  }
  
  return null;
}

/**
 * Extract core metadata from a Figma node
 */
function extractLayerMetadata(node: any): LayerMetadata {
  return {
    id: node.id,
    name: node.name || 'Unnamed Layer',
    type: node.type || 'UNKNOWN',
    visible: node.visible !== false,
    locked: node.locked === true,
    absoluteBoundingBox: node.absoluteBoundingBox || null
  };
}

/**
 * Register the figma-get-metadata-for-layer tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerFigmaGetMetadataForLayerTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-get-metadata-for-layer',
    {
      title: 'Get Metadata for Figma Layer',
      description: 'Get detailed metadata for a specific Figma layer including positioning and visual properties',
      inputSchema: {
        url: z.string().describe('The Figma file or page URL (supports both /design/ and /file/ formats)'),
        nodeId: z.string().describe('The target layer node ID (in URL format: "60-55")'),
      },
    },
    async ({ url, nodeId }: GetMetadataForLayerParams, context) => {
      console.log('figma-get-metadata-for-layer called', { url, nodeId });

      try {
        // Get auth info with proper error handling - uses nested access pattern per Q22
        const authInfo = getAuthInfoSafe(context, 'figma-get-metadata-for-layer');
        const token = authInfo?.figma?.access_token;

        if (!token) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: No Figma access token found in authentication context',
              },
            ],
          };
        }

        // URL parsing (reuse existing regex pattern)
        console.log('  Parsing Figma URL...');
        const fileKeyMatch = url.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
        if (!fileKeyMatch) {
          logger.error('Invalid Figma URL format', { url });
          return {
            content: [{
              type: 'text',
              text: 'Error: Invalid Figma URL format. Expected format: https://www.figma.com/design/FILEID or https://www.figma.com/file/FILEID'
            }]
          };
        }
        const fileKey = fileKeyMatch[2];
        if (!fileKey) {
          logger.error('Failed to extract file key from URL', { url });
          return {
            content: [{
              type: 'text',
              text: 'Error: Failed to extract file key from Figma URL'
            }]
          };
        }

        // Convert node ID from URL format (60-55) to API format (60:55)
        const figmaNodeId = nodeId.replace(/-/g, ':');
        console.log('  Converted node ID:', { originalNodeId: nodeId, figmaNodeId });

        // Create Figma client and fetch file data
        const figmaClient = createFigmaClient(token);
        console.log('  Fetching Figma file data...');
        
        const data = await fetchFigmaFile(figmaClient, fileKey);

        if (data.err) {
          return {
            content: [{
              type: 'text',
              text: `Error: Figma API error: ${data.err}`
            }]
          };
        }

        // Search for the target node in the document tree
        console.log('  Searching for node in document...');
        const targetNode = findNodeInDocument(data.document, figmaNodeId);
        
        if (!targetNode) {
          logger.error('Node not found in document', { nodeId: figmaNodeId });
          return {
            content: [{
              type: 'text',
              text: `Error: Node with ID "${nodeId}" not found in file. Use figma-get-layers-for-page to discover available node IDs.`
            }]
          };
        }

        // Extract metadata from the found node
        const metadata = extractLayerMetadata(targetNode);
        
        console.log('  Get metadata tool completed successfully');
        logger.info('figma-get-metadata-for-layer completed', {
          nodeId: metadata.id,
          nodeName: metadata.name,
          nodeType: metadata.type
        });

        // Return formatted response
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(metadata, null, 2)
          }]
        };

      } catch (error) {
        logger.error('Unexpected error in figma-get-metadata-for-layer tool', {
          error: error instanceof Error ? error.message : String(error)
        });

        return {
          content: [{
            type: 'text',
            text: `Error: Unexpected error in figma-get-metadata-for-layer tool: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }
    },
  );
}
