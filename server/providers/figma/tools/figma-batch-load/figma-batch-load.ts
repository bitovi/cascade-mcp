/**
 * Figma Batch Load Tool (figma-batch-zip)
 * 
 * Batch-fetches Figma data for multiple URLs (pages or frames, across files),
 * builds a zip containing frame images, structure, context, and prompts,
 * and returns a one-time download URL.
 * 
 * The agent uses `curl` + `unzip` to save everything to `.temp/cascade/figma/`.
 * For environments where curl is blocked (e.g., GitHub cloud Copilot),
 * use `figma-batch-cache` instead — it caches data server-side and
 * subagents retrieve individual frames via `figma-frame-data`.
 * 
 * API budget per file: 1 Tier 3 (meta) + 1 Tier 1 (nodes) + 1 Tier 1 (images)
 */

import { z } from 'zod';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { createFigmaClient } from '../../figma-api-client.js';
import { fetchBatchData } from '../figma-batch-fetch.js';
import { buildZip } from './zip-builder.js';
import { registerDownload } from '../../../../api/download.js';

interface FigmaBatchZipParams {
  requests: Array<{ url: string; label?: string }>;
  context?: string;
}

/**
 * Register the figma-batch-zip tool with the MCP server
 */
export function registerFigmaBatchZipTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-batch-zip',
    {
      title: 'Batch Load Figma Data (Zip)',
      description: 'Batch-fetch Figma data for multiple URLs (pages or frames, across files). Returns a one-time download URL for a zip containing per-frame image.png, structure.xml, context.md (comments, notes, prototype connections), and analysis prompts. Use curl + unzip to extract to .temp/cascade/figma/. For environments where curl is blocked, use figma-batch-cache instead.',
      inputSchema: {
        requests: z.array(z.object({
          url: z.string().describe('Figma URL — page-level or frame-level'),
          label: z.string().optional().describe('Human label (e.g., "Login Screen")'),
        })).min(1).describe('Figma URLs to load. Can span multiple files. Deduplicates by file.'),
        context: z.string().optional()
          .describe('Feature context for annotation association'),
      },
    },
    async ({ requests, context }: FigmaBatchZipParams, mcpContext) => {
      console.log('figma-batch-zip called');
      console.log('  Requests:', requests.length);

      try {
        const authInfo = getAuthInfoSafe(mcpContext, 'figma-batch-zip');
        const figmaToken = authInfo?.figma?.access_token;

        if (!figmaToken) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Figma access token found. Please authenticate with Figma.' }],
          };
        }

        const figmaClient = createFigmaClient(figmaToken);

        // Fetch data using shared pipeline (handles URL grouping + dedup)
        const fileDataResults = await fetchBatchData(requests, figmaClient);

        if (fileDataResults.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No valid Figma URLs provided.' }],
          };
        }

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
        console.log('  ❌ Error in figma-batch-zip:', error.message);
        return {
          content: [{ type: 'text' as const, text: `Error in figma-batch-zip: ${error.message}` }],
        };
      }
    }
  );
}
