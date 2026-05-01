/**
 * REST API Handler for Figma Batch Cache
 *
 * Batch-fetches Figma data for multiple URLs into server-side cache.
 * Returns a batchToken + manifest for subsequent figma-frame-data calls.
 *
 * Required Headers:
 *   X-Figma-Token: figd_...
 *
 * Request body:
 * {
 *   "requests": [{ "url": "https://figma.com/...", "label": "optional" }],
 *   "context": "optional feature context"
 * }
 */

import type { Request, Response } from 'express';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { fetchBatchData } from '../providers/figma/tools/figma-batch-fetch.js';
import { createBatchCache } from '../providers/figma/batch-cache.js';

export async function handleFigmaBatchCache(req: Request, res: Response): Promise<void> {
  try {
    const { requests, context } = req.body;

    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      res.status(400).json({ success: false, error: 'requests is required and must be a non-empty array' });
      return;
    }

    const figmaToken = req.headers['x-figma-token'] as string | undefined;
    if (!figmaToken) {
      res.status(401).json({ success: false, error: 'Missing X-Figma-Token header.' });
      return;
    }

    const figmaClient = createFigmaClient(figmaToken);

    // Fetch data using shared pipeline
    const fileDataResults = await fetchBatchData(requests, figmaClient);

    if (fileDataResults.length === 0) {
      res.status(400).json({ success: false, error: 'No valid Figma URLs provided.' });
      return;
    }

    // Write to batch cache
    const { batchToken, manifest } = await createBatchCache(fileDataResults);

    res.json({
      success: true,
      batchToken,
      manifest: {
        files: manifest.files,
        totalFrames: manifest.totalFrames,
      },
    });
  } catch (error: any) {
    console.error('REST API: figma-batch-cache failed:', error.message);
    if (error.message?.includes('403') || error.message?.includes('unauthorized')) {
      res.status(401).json({ success: false, error: 'Figma authentication failed.' });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
}
