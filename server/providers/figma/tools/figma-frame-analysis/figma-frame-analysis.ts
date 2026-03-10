/**
 * MCP Tool: figma-frame-analysis
 *
 * Analyzes a single Figma frame. Returns one frame's image, context, structure,
 * and analysis prompt — everything a subagent needs to analyze one frame.
 *
 * Two modes:
 * - **Standalone**: Pass a Figma URL. The tool fetches from Figma, caches, and returns.
 * - **Orchestrated**: Pass URL + cacheToken. Reads from server cache (0 API calls).
 *
 * If the cache is expired, silently falls back to a live Figma fetch via the URL.
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { createFigmaClient, type FigmaClient } from '../../figma-api-client.js';
import { parseFigmaUrl, convertNodeIdToApiFormat, fetchFigmaNodesBatch, downloadFigmaImagesBatch } from '../../figma-helpers.js';
import { generateSemanticXml } from '../../semantic-xml-generator.js';
import {
  getScopeCacheEntry,
  readCachedFrameData,
  type ScopeCacheFrameData,
} from '../../scope-cache.js';
import { buildFrameContextMarkdown, findConnections } from '../figma-ask-scope-questions-for-page/frame-context-builder.js';
import { FRAME_ANALYSIS_PROMPT_TEXT } from '../figma-ask-scope-questions-for-page/prompt-constants.js';
import { fetchAndAssociateAnnotations } from '../../screen-analyses-workflow/annotation-associator.js';
import type { ContentBlock, ImageContent, TextContent, EmbeddedResource } from '../../../../utils/embedded-prompt-builder.js';

// ============================================================================
// Types
// ============================================================================

interface FrameAnalysisParams {
  url: string;
  cacheToken?: string;
  includeStructure?: boolean;
  maxStructureSize?: number;
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerFigmaFrameAnalysisTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-frame-analysis',
    {
      title: 'Analyze Single Figma Frame',
      description:
        'Returns one frame\'s image, context markdown, semantic XML, and analysis prompt. ' +
        'Use standalone with any Figma frame URL, or pass a cacheToken from ' +
        'figma-ask-scope-questions-for-page to read from server cache (faster, 0 API calls). ' +
        'Everything needed to analyze one frame is returned in a single call.',
      inputSchema: {
        url: z
          .string()
          .describe('Figma URL pointing to a specific frame (must contain node-id). The canonical identifier — always works even if cache expired.'),
        cacheToken: z
          .string()
          .optional()
          .describe('Optional cache token from figma-ask-scope-questions-for-page. Reads from server cache instead of hitting Figma API. Falls back to live fetch if expired.'),
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
    async ({ url, cacheToken, includeStructure = true, maxStructureSize = 50000 }: FrameAnalysisParams, mcpContext) => {
      console.log('figma-frame-analysis called');
      console.log(`  URL: ${url}`);
      if (cacheToken) console.log(`  cacheToken: ${cacheToken}`);

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

        // Try to resolve data from cache first, then fall back to live fetch
        const frameData = await resolveFrameData(
          { fileKey, nodeId, cacheToken, url },
          mcpContext
        );

        // Build response content
        const content = buildFrameAnalysisResponse(frameData, {
          fileKey,
          url,
          includeStructure,
          maxStructureSize,
        });

        return { content };
      } catch (error: any) {
        // Re-throw InvalidTokenError for MCP re-auth
        if (error.constructor?.name === 'InvalidTokenError') throw error;

        console.error('figma-frame-analysis error:', error.message);
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
 * Resolve frame data — try cache first, fall back to live Figma fetch.
 * Cache expiration is invisible to the caller.
 */
async function resolveFrameData(
  params: { fileKey: string; nodeId: string; cacheToken?: string; url: string },
  mcpContext: any
): Promise<ScopeCacheFrameData> {
  const { fileKey, nodeId, cacheToken } = params;

  // Attempt 1: Read from scope cache
  if (cacheToken) {
    const cacheEntry = await getScopeCacheEntry(cacheToken, fileKey);
    if (cacheEntry) {
      const cachedFrame = await readCachedFrameData(fileKey, nodeId);
      if (cachedFrame) {
        console.log('  ✅ Resolved from scope cache');
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
): Promise<ScopeCacheFrameData> {
  const { fileKey, nodeId } = params;

  // Get auth
  const authInfo = getAuthInfoSafe(mcpContext, 'figma-frame-analysis');
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

  // Build simple context (no annotations from comments API for standalone mode to save API calls)
  const contextMd = `# ${frameName} (Frame ${nodeId})\n\n_Standalone frame analysis — call figma-ask-scope-questions-for-page for full annotations._\n`;

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

function buildFrameAnalysisResponse(
  frameData: ScopeCacheFrameData,
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

  // Sanitize frame name for filesystem
  const safeName = frameName
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80) || 'unnamed';

  const outputDir = `temp/cascade/${fileKey}/frames/${safeName}`;

  // 1. Analysis prompt with save instructions
  const analysisPrompt = buildAnalysisPromptWithSaveInstructions(
    undefined, // featureContext is in the cached prompt if available
    outputDir,
    frameName
  );

  content.push({
    type: 'text',
    text: analysisPrompt,
  } as TextContent);

  // 2. Image (one frame = ~500KB, manageable)
  if (imageBase64) {
    content.push({
      type: 'image',
      data: imageBase64,
      mimeType: imageMimeType || 'image/png',
    } as ImageContent);
  }

  // 3. Context markdown
  content.push({
    type: 'resource',
    resource: {
      uri: `context://frame/${nodeId}`,
      mimeType: 'text/markdown',
      text: contextMd,
    },
  } as EmbeddedResource);

  // 4. Semantic XML (with truncation)
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

  // 5. Metadata
  content.push({
    type: 'text',
    text: JSON.stringify({
      frameId: nodeId,
      frameName,
      fileKey,
      outputPath: `${outputDir}/analysis.md`,
      structureTruncated: semanticXml.length > maxStructureSize,
      structureOriginalSize: semanticXml.length,
    }, null, 2),
  } as TextContent);

  return content;
}

function buildAnalysisPromptWithSaveInstructions(
  featureContext: string | undefined,
  outputDir: string,
  frameName: string
): string {
  return `# Frame Analysis Instructions

You are analyzing a single UI frame from a Figma design: **${frameName}**

${FRAME_ANALYSIS_PROMPT_TEXT}

${featureContext ? `## Feature Context\n\n${featureContext}\n\n` : ''}## Save Your Analysis

Write your complete analysis as markdown to:

\`${outputDir}/analysis.md\`

The analysis should follow the format specified above. If the output directory
doesn't exist, create it first.

This file will be collected by the orchestrating agent for scope synthesis
across all frames. If you are working standalone (not part of a multi-frame
workflow), the analysis is still saved for reference and re-use.`;
}

// ============================================================================
// XML Truncation
// ============================================================================

function truncateSemanticXml(xml: string, maxSize: number): string {
  if (xml.length <= maxSize) return xml;

  // Find a reasonable truncation point — try to cut at a closing tag
  const cutPoint = xml.lastIndexOf('</', maxSize - 200);
  const endTagEnd = cutPoint > 0 ? xml.indexOf('>', cutPoint) + 1 : maxSize;
  const truncated = xml.substring(0, endTagEnd > 0 ? endTagEnd : maxSize);

  const truncationNote = `\n<!-- TRUNCATED: Original XML was ${xml.length} chars (${Math.round(xml.length / 1024)}KB). Showing first ${truncated.length} chars. Use figma-get-metadata-for-layer for the full tree. -->`;

  return truncated + truncationNote;
}
