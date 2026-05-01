/**
 * MCP Tool: figma-frame-data
 *
 * Returns one frame's image, context markdown, semantic XML, and metadata.
 * Data only — no prompt text, no save instructions.
 *
 * Two modes:
 * - **Cached**: Pass URL + batchToken from figma-batch-cache. Reads from server cache (0 API calls).
 * - **Standalone**: Pass URL only. Fetches from Figma API directly (costs API calls).
 *
 * Falls back to live fetch if cache is expired.
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createFigmaClient } from '../../figma-api-client.js';
import {
  parseFigmaUrl,
  convertNodeIdToApiFormat,
  fetchFigmaNodesBatch,
  downloadFigmaImagesBatch,
} from '../../figma-helpers.js';
import { generateSemanticXml } from '../../semantic-xml-generator.js';
import { getBatchCacheEntry, readBatchFrameData, type BatchCacheFrameData } from '../../batch-cache.js';
import type { ContentBlock, ImageContent, TextContent, EmbeddedResource } from '../../../../utils/embedded-prompt-builder.js';

// ============================================================================
// Types
// ============================================================================

interface FrameDataParams {
  url: string;
  batchToken?: string;
  includeStructure?: boolean;
  maxStructureSize?: number;
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerFigmaFrameDataTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-frame-data',
    {
      title: 'Get Figma Frame Data',
      description:
        'Returns one frame\'s image, context markdown, semantic XML, and metadata — data only, no prompts or save instructions. ' +
        'Pass a batchToken from figma-batch-cache to read from server cache (0 API calls). ' +
        'Without batchToken, fetches directly from Figma API. Falls back to live fetch if cache expired.',
      inputSchema: {
        url: z
          .string()
          .describe('Figma URL pointing to a specific frame (must contain node-id).'),
        batchToken: z
          .string()
          .optional()
          .describe('Batch token from figma-batch-cache. Reads from server cache (0 API calls). Falls back to live fetch if expired.'),
        includeStructure: z
          .boolean()
          .optional()
          .default(true)
          .describe('Include semantic XML structure in response (default: true). Set false to reduce response size.'),
        maxStructureSize: z
          .number()
          .optional()
          .default(50000)
          .describe('Max characters for semantic XML before truncation (default: 50000).'),
      },
    },
    async ({ url, batchToken, includeStructure = true, maxStructureSize = 50000 }: FrameDataParams, mcpContext) => {
      console.log('figma-frame-data called');
      console.log(`  URL: ${url}`);
      if (batchToken) console.log(`  batchToken: ${batchToken}`);

      try {
        // Parse URL to extract fileKey and nodeId
        const parsed = parseFigmaUrl(url);
        if (!parsed || !parsed.nodeId) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid Figma URL — must contain a node-id parameter.' }) }],
            isError: true,
          };
        }
        const fileKey = parsed.fileKey;
        const nodeId = convertNodeIdToApiFormat(parsed.nodeId);

        // Resolve data from cache or live fetch
        const frameData = await resolveFrameData(
          { fileKey, nodeId, batchToken, url },
          mcpContext
        );

        // Build response content (data only — no prompts)
        const content = buildFrameDataResponse(frameData, {
          fileKey,
          url,
          includeStructure,
          maxStructureSize,
        });

        return { content };
      } catch (error: any) {
        if (error.constructor?.name === 'InvalidTokenError') throw error;

        console.error('figma-frame-data error:', error.message);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: error.message || String(error) }) }],
          isError: true,
        };
      }
    }
  );
}

// ============================================================================
// Data Resolution
// ============================================================================

/**
 * Resolve frame data — try batch cache first, fall back to live Figma fetch.
 */
async function resolveFrameData(
  params: { fileKey: string; nodeId: string; batchToken?: string; url: string },
  mcpContext: any
): Promise<BatchCacheFrameData> {
  const { nodeId, batchToken } = params;

  // Attempt 1: Read from batch cache
  if (batchToken) {
    const cacheEntry = await getBatchCacheEntry(batchToken);
    if (cacheEntry) {
      const cachedFrame = await readBatchFrameData(batchToken, nodeId);
      if (cachedFrame) {
        console.log('  ✅ Resolved from batch cache');
        return cachedFrame;
      }
    }
    console.log('  ⚠️ Cache miss (expired or not found) — falling back to live fetch');
  }

  // Attempt 2: Live fetch from Figma API
  return await fetchSingleFrameData(params, mcpContext);
}

/**
 * Fetch a single frame's data directly from the Figma API.
 */
async function fetchSingleFrameData(
  params: { fileKey: string; nodeId: string; url: string },
  mcpContext: any
): Promise<BatchCacheFrameData> {
  const { fileKey, nodeId } = params;

  const authInfo = getAuthInfoSafe(mcpContext, 'figma-frame-data');
  const figmaToken = authInfo?.figma?.access_token;
  if (!figmaToken) {
    throw new Error('No Figma access token found in authentication context.');
  }
  const figmaClient = createFigmaClient(figmaToken);

  console.log('  🌐 Fetching frame data from Figma API...');

  // Parallel fetch: node data + image
  const [nodesDataMap, imageResult] = await Promise.all([
    fetchFigmaNodesBatch(figmaClient, fileKey, [nodeId]),
    downloadFigmaImagesBatch(figmaClient, fileKey, [nodeId], { format: 'png', scale: 1 }),
  ]);

  const nodeData = nodesDataMap.get(nodeId);
  if (!nodeData) {
    throw new Error(`Frame node ${nodeId} not found in Figma file ${fileKey}`);
  }

  const frameName = nodeData.name || nodeId;

  // Generate semantic XML
  let semanticXml = '';
  try {
    semanticXml = generateSemanticXml(nodeData);
  } catch (err) {
    console.warn(`  Failed to generate semantic XML for ${frameName}: ${err}`);
  }

  // Get image
  let imageBase64: string | undefined;
  let imageMimeType: string | undefined;
  const imageData = imageResult.get(nodeId);
  if (imageData) {
    imageBase64 = imageData.base64Data;
    imageMimeType = imageData.mimeType || 'image/png';
  }

  // Build simple context (no full annotations in standalone mode)
  const contextMd = `# ${frameName} (Frame ${nodeId})\n\n_Standalone frame data — use figma-batch-cache for full annotations and context._\n`;

  return {
    nodeId,
    name: frameName,
    imageBase64,
    imageMimeType,
    contextMd,
    semanticXml,
  };
}

// ============================================================================
// Response Builder
// ============================================================================

/**
 * Build data-only response content blocks — no prompts, no save instructions.
 */
function buildFrameDataResponse(
  frameData: BatchCacheFrameData,
  options: {
    fileKey: string;
    url: string;
    includeStructure: boolean;
    maxStructureSize: number;
  }
): ContentBlock[] {
  const { fileKey, includeStructure, maxStructureSize } = options;
  const { nodeId, name: frameName, imageBase64, imageMimeType, contextMd, semanticXml } = frameData;
  const content: ContentBlock[] = [];

  // 1. Image
  if (imageBase64) {
    content.push({
      type: 'image',
      data: imageBase64,
      mimeType: imageMimeType || 'image/png',
    } as ImageContent);
  }

  // 2. Context markdown
  content.push({
    type: 'resource',
    resource: {
      uri: `context://frame/${nodeId}`,
      mimeType: 'text/markdown',
      text: contextMd,
    },
  } as EmbeddedResource);

  // 3. Semantic XML (with truncation)
  if (includeStructure && semanticXml) {
    const xml = truncateSemanticXml(semanticXml, maxStructureSize);
    content.push({
      type: 'resource',
      resource: {
        uri: `structure://frame/${nodeId}`,
        mimeType: 'application/xml',
        text: xml,
      },
    } as EmbeddedResource);
  }

  // 4. Metadata
  content.push({
    type: 'text',
    text: JSON.stringify({
      frameId: nodeId,
      frameName,
      fileKey,
      structureTruncated: semanticXml.length > maxStructureSize,
      structureOriginalSize: semanticXml.length,
    }, null, 2),
  } as TextContent);

  return content;
}

// ============================================================================
// XML Truncation
// ============================================================================

function truncateSemanticXml(xml: string, maxSize: number): string {
  if (xml.length <= maxSize) return xml;

  const cutPoint = xml.lastIndexOf('</', maxSize - 200);
  const endTagEnd = cutPoint > 0 ? xml.indexOf('>', cutPoint) + 1 : maxSize;
  const truncated = xml.substring(0, endTagEnd > 0 ? endTagEnd : maxSize);

  const truncationNote = `\n<!-- TRUNCATED: Original XML was ${xml.length} chars (${Math.round(xml.length / 1024)}KB). Showing first ${truncated.length} chars. Use figma-get-metadata-for-layer for the full tree. -->`;

  return truncated + truncationNote;
}
