/**
 * MCP Tool: figma-batch-cache
 *
 * Batch-fetches Figma data for multiple URLs into a server-side cache,
 * returns a batchToken + manifest. Subagents then call figma-frame-data
 * with the batchToken to retrieve individual frames.
 *
 * This is the fallback for environments where curl is blocked (e.g., GitHub
 * cloud Copilot). All data transfer happens via MCP — no HTTP downloads.
 *
 * API budget per file: 1 Tier 3 (meta) + 1 Tier 1 (nodes) + 1 Tier 1 (images)
 */

import { z } from 'zod';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { createFigmaClient } from '../../figma-api-client.js';
import { fetchBatchData } from '../figma-batch-fetch.js';
import { createBatchCache } from '../../batch-cache.js';

interface FigmaBatchCacheParams {
  requests: Array<{ url: string; label?: string }>;
  context?: string;
}

/**
 * Register the figma-batch-cache tool with the MCP server
 */
export function registerFigmaBatchCacheTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-batch-cache',
    {
      title: 'Batch Cache Figma Data',
      description:
        'Batch-fetch Figma data for multiple URLs into server-side cache. Returns a batchToken + manifest. ' +
        'Use figma-frame-data(url, batchToken) to retrieve individual frames from cache. ' +
        'This is the alternative to figma-batch-zip for environments where curl/HTTP downloads are blocked ' +
        '(e.g., GitHub cloud Copilot). All data stays server-side until retrieved via MCP.',
      inputSchema: {
        requests: z.array(z.object({
          url: z.string().describe('Figma URL — page-level or frame-level'),
          label: z.string().optional().describe('Human label (e.g., "Login Screen")'),
        })).min(1).describe('Figma URLs to load. Can span multiple files. Deduplicates by file.'),
        context: z.string().optional()
          .describe('Feature context for annotation association'),
      },
    },
    async ({ requests, context }: FigmaBatchCacheParams, mcpContext) => {
      console.log('figma-batch-cache called');
      console.log('  Requests:', requests.length);

      try {
        const authInfo = getAuthInfoSafe(mcpContext, 'figma-batch-cache');
        const figmaToken = authInfo?.figma?.access_token;

        if (!figmaToken) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No Figma access token found. Please authenticate with Figma.' }],
          };
        }

        const figmaClient = createFigmaClient(figmaToken);

        // Fetch data using shared pipeline
        const fileDataResults = await fetchBatchData(requests, figmaClient);

        if (fileDataResults.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No valid Figma URLs provided.' }],
          };
        }

        // Write to batch cache
        console.log('  Writing to batch cache...');
        const { batchToken, manifest } = await createBatchCache(fileDataResults);
        console.log(`  ✅ Cached: ${manifest.totalFrames} frames, batchToken: ${batchToken}`);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              batchToken,
              manifest: {
                files: manifest.files,
                totalFrames: manifest.totalFrames,
              },
            }, null, 2),
          }],
        };
      } catch (error: any) {
        if (error.constructor.name === 'InvalidTokenError') {
          throw error;
        }
        console.log('  ❌ Error in figma-batch-cache:', error.message);
        return {
          content: [{ type: 'text' as const, text: `Error in figma-batch-cache: ${error.message}` }],
        };
      }
    }
  );
}
