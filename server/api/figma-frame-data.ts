/**
 * REST API Handler for Figma Frame Data
 *
 * Retrieves a single frame's image, context, and structure.
 * Data only — no prompts or save instructions.
 *
 * Required Headers:
 *   X-Figma-Token: figd_... (only needed if batchToken misses or is omitted)
 *
 * Request body:
 * {
 *   "url": "https://figma.com/design/FILE?node-id=1-2",
 *   "batchToken": "optional-uuid",
 *   "includeStructure": true,
 *   "maxStructureSize": 50000
 * }
 */

import type { Request, Response } from 'express';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import {
  parseFigmaUrl,
  convertNodeIdToApiFormat,
  fetchFigmaNodesBatch,
  downloadFigmaImagesBatch,
} from '../providers/figma/figma-helpers.js';
import { generateSemanticXml } from '../providers/figma/semantic-xml-generator.js';
import { getBatchCacheEntry, readBatchFrameData, type BatchCacheFrameData } from '../providers/figma/batch-cache.js';

export async function handleFigmaFrameData(req: Request, res: Response): Promise<void> {
  try {
    const { url, batchToken, includeStructure = true, maxStructureSize = 50000 } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'url is required and must be a string' });
      return;
    }

    // Parse URL
    const parsed = parseFigmaUrl(url);
    if (!parsed || !parsed.nodeId) {
      res.status(400).json({ success: false, error: 'Invalid Figma URL — must contain a node-id parameter.' });
      return;
    }
    const fileKey = parsed.fileKey;
    const nodeId = convertNodeIdToApiFormat(parsed.nodeId);

    // Try batch cache first
    let frameData: BatchCacheFrameData | null = null;

    if (batchToken) {
      const cacheEntry = await getBatchCacheEntry(batchToken);
      if (cacheEntry) {
        frameData = await readBatchFrameData(batchToken, nodeId);
      }
    }

    // Fall back to live fetch
    if (!frameData) {
      const figmaToken = req.headers['x-figma-token'] as string | undefined;
      if (!figmaToken) {
        res.status(401).json({ success: false, error: 'Missing X-Figma-Token header (required when cache miss).' });
        return;
      }

      const figmaClient = createFigmaClient(figmaToken);

      const [nodesDataMap, imageResult] = await Promise.all([
        fetchFigmaNodesBatch(figmaClient, fileKey, [nodeId]),
        downloadFigmaImagesBatch(figmaClient, fileKey, [nodeId], { format: 'png', scale: 1 }),
      ]);

      const nodeData = nodesDataMap.get(nodeId);
      if (!nodeData) {
        res.status(404).json({ success: false, error: `Frame node ${nodeId} not found in Figma file ${fileKey}` });
        return;
      }

      const frameName = nodeData.name || nodeId;
      let semanticXml = '';
      try {
        semanticXml = generateSemanticXml(nodeData);
      } catch {
        // Skip XML generation on failure
      }

      let imageBase64: string | undefined;
      const imageData = imageResult.get(nodeId);
      if (imageData) {
        imageBase64 = imageData.base64Data;
      }

      frameData = {
        nodeId,
        name: frameName,
        imageBase64,
        imageMimeType: 'image/png',
        contextMd: `# ${frameName} (Frame ${nodeId})\n\n_Standalone frame data._\n`,
        semanticXml,
      };
    }

    // Build response
    const response: any = {
      success: true,
      frameData: {
        frameId: frameData.nodeId,
        frameName: frameData.name,
        fileKey,
        context: frameData.contextMd,
        metadata: {
          structureTruncated: frameData.semanticXml.length > maxStructureSize,
          structureOriginalSize: frameData.semanticXml.length,
        },
      },
    };

    if (frameData.imageBase64) {
      response.frameData.image = {
        base64: frameData.imageBase64,
        mimeType: frameData.imageMimeType || 'image/png',
      };
    }

    if (includeStructure && frameData.semanticXml) {
      let xml = frameData.semanticXml;
      if (xml.length > maxStructureSize) {
        const cutPoint = xml.lastIndexOf('</', maxStructureSize - 200);
        const endTagEnd = cutPoint > 0 ? xml.indexOf('>', cutPoint) + 1 : maxStructureSize;
        xml = xml.substring(0, endTagEnd > 0 ? endTagEnd : maxStructureSize);
      }
      response.frameData.structure = xml;
    }

    res.json(response);
  } catch (error: any) {
    console.error('REST API: figma-frame-data failed:', error.message);
    if (error.message?.includes('403') || error.message?.includes('unauthorized')) {
      res.status(401).json({ success: false, error: 'Figma authentication failed.' });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
}
