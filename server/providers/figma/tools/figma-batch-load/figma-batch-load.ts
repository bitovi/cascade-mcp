/**
 * Figma Batch Load Tool
 * 
 * Batch-fetches Figma data for multiple URLs (pages or frames, across files),
 * builds a zip containing frame images, structure, context, and prompts,
 * and returns a one-time download URL.
 * 
 * The agent uses `curl` + `unzip` to save everything to `.temp/cascade/figma/`.
 * 
 * API budget per file: 1 Tier 3 (meta) + 1 Tier 1 (nodes) + 1 Tier 1 (images)
 * Each frame directory includes context.md with associated comments, notes, and connections.
 */

import { z } from 'zod';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { createFigmaClient, type FigmaClient } from '../../figma-api-client.js';
import { fetchFrameData, type FetchFrameDataResult } from '../../screen-analyses-workflow/frame-data-fetcher.js';
import { generateSemanticXml } from '../../semantic-xml-generator.js';
import { fetchFigmaFileMetadata } from '../../figma-helpers.js';
import { toKebabCase } from '../../figma-helpers.js';
import { buildFigmaUrl } from '../../screen-analyses-workflow/url-processor.js';
import { buildFrameContextMarkdown, findConnections } from '../figma-ask-scope-questions-for-page/frame-context-builder.js';
import { buildZip, type ZipFileData, type ZipFrameData } from './zip-builder.js';
import { registerDownload } from '../../../../api/download.js';

interface FigmaBatchLoadParams {
  requests: Array<{ url: string; label?: string }>;
  context?: string;
}

/**
 * Convert a node ID to a safe directory name: "123:456" → "123-456"
 */
function safeNodeId(nodeId: string): string {
  return nodeId.replace(/:/g, '-');
}

/**
 * Build directory name for a frame: "{safeNodeId}-{kebab-name}"
 */
function frameDirName(nodeId: string, name: string): string {
  const slug = toKebabCase(name) || 'unnamed';
  return `${safeNodeId(nodeId)}-${slug}`;
}

/**
 * Fetch and package data for a single Figma file
 */
async function fetchFileData(
  urls: string[],
  figmaClient: FigmaClient,
  fileKey: string,
): Promise<ZipFileData> {
  console.log(`  Fetching data for file ${fileKey} (${urls.length} URLs)...`);

  // Fetch all frame data using the shared pipeline
  const result: FetchFrameDataResult = await fetchFrameData(urls, figmaClient, {
    imageOptions: { format: 'png', scale: 2 },
  });

  // Get file name
  const metadata = await fetchFigmaFileMetadata(figmaClient, fileKey);

  // Build reference list for prototype connection resolution
  const allFrameRefs = result.frames.map(f => ({ id: f.nodeId, name: f.frameName || f.name }));

  // Build per-frame zip data
  const frames: ZipFrameData[] = [];
  for (const frame of result.frames) {
    const image = result.images.get(frame.nodeId);
    if (!image?.base64Data) {
      console.log(`    ⚠️ Skipping frame ${frame.name} (${frame.nodeId}) — no image`);
      continue;
    }

    // Generate semantic XML from node data
    const nodeData = result.nodesDataMap.get(frame.nodeId);
    const structureXml = nodeData ? generateSemanticXml(nodeData) : `<!-- No node data for ${frame.name} -->`;

    // Build context markdown (comments, notes, section info, prototype connections)
    const connections = nodeData ? findConnections(nodeData, allFrameRefs) : [];
    const contextMd = buildFrameContextMarkdown(
      {
        id: frame.nodeId,
        name: frame.frameName || frame.name,
        sectionName: frame.sectionName,
        url: frame.url,
      },
      frame.annotations,
      connections
    );

    const dirName = frameDirName(frame.nodeId, frame.name);
    const url = buildFigmaUrl(fileKey, frame.nodeId);

    frames.push({
      nodeId: frame.nodeId,
      name: frame.name,
      dirName,
      imageBase64: image.base64Data,
      structureXml,
      contextMd,
      url,
      order: frame.order ?? 0,
      section: frame.sectionName,
      annotationCount: frame.annotations.length,
      width: frame.position?.width,
      height: frame.position?.height,
    });
  }

  console.log(`    ✅ ${frames.length} frames packaged for ${metadata.name}`);

  return {
    fileKey,
    fileName: metadata.name,
    frames,
  };
}

/**
 * Register the figma-batch-load tool with the MCP server
 */
export function registerFigmaBatchLoadTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-batch-load',
    {
      title: 'Batch Load Figma Data',
      description: 'Batch-fetch Figma data for multiple URLs (pages or frames, across files). Returns a one-time download URL for a zip containing per-frame image.png, structure.xml, context.md (comments, notes, prototype connections), and analysis prompts. Use curl + unzip to extract to .temp/cascade/figma/.',
      inputSchema: {
        requests: z.array(z.object({
          url: z.string().describe('Figma URL — page-level or frame-level'),
          label: z.string().optional().describe('Human label (e.g., "Login Screen")'),
        })).min(1).describe('Figma URLs to load. Can span multiple files. Deduplicates by file.'),
        context: z.string().optional()
          .describe('Feature context for annotation association'),
      },
    },
    async ({ requests, context }: FigmaBatchLoadParams, mcpContext) => {
      console.log('figma-batch-load called');
      console.log('  Requests:', requests.length);

      try {
        const authInfo = getAuthInfoSafe(mcpContext, 'figma-batch-load');
        const figmaToken = authInfo?.figma?.access_token;

        if (!figmaToken) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Figma access token found. Please authenticate with Figma.' }],
          };
        }

        const figmaClient = createFigmaClient(figmaToken);

        // Group URLs by file key
        const urlsByFile = new Map<string, string[]>();
        for (const req of requests) {
          const match = req.url.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
          if (!match) {
            console.log(`  ⚠️ Skipping invalid URL: ${req.url}`);
            continue;
          }
          const fileKey = match[2];
          const existing = urlsByFile.get(fileKey) || [];
          existing.push(req.url);
          urlsByFile.set(fileKey, existing);
        }

        if (urlsByFile.size === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No valid Figma URLs provided.' }],
          };
        }

        console.log(`  ${urlsByFile.size} unique files to fetch`);

        // Fetch data per file (parallel across files)
        const fileDataPromises = Array.from(urlsByFile.entries()).map(
          ([fileKey, urls]) => fetchFileData(urls, figmaClient, fileKey)
        );
        const fileDataResults = await Promise.all(fileDataPromises);

        // Build zip
        console.log('  Building zip...');
        const { zipPath, manifest } = await buildZip(fileDataResults);
        console.log(`  ✅ Zip built: ${manifest.totalFrames} frames, ${manifest.zipSizeBytes} bytes`);

        // Register for one-time download
        const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
        const { token, expiresAt } = registerDownload(zipPath);
        const downloadUrl = `${baseUrl}/dl/${token}`;

        console.log('  Download URL registered, expires:', expiresAt.toISOString());

        const saveInstructions = `curl -sL "${downloadUrl}" -o /tmp/cascade-figma.zip && unzip -qo /tmp/cascade-figma.zip -d .temp/cascade/figma/ && rm /tmp/cascade-figma.zip`;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              downloadUrl,
              expiresAt: expiresAt.toISOString(),
              manifest,
              saveInstructions,
            }, null, 2),
          }],
        };
      } catch (error: any) {
        if (error.constructor.name === 'InvalidTokenError') {
          throw error;
        }
        console.log('  ❌ Error in figma-batch-load:', error.message);
        return {
          content: [{ type: 'text' as const, text: `Error in figma-batch-load: ${error.message}` }],
        };
      }
    }
  );
}
