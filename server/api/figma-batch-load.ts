/**
 * REST API Handler for Figma Batch Load
 *
 * Batch-fetches Figma data for multiple URLs, builds a zip,
 * and returns a one-time download URL.
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
import { fetchFrameData } from '../providers/figma/screen-analyses-workflow/frame-data-fetcher.js';
import { generateSemanticXml } from '../providers/figma/semantic-xml-generator.js';
import { fetchFigmaFileMetadata, toKebabCase } from '../providers/figma/figma-helpers.js';
import { buildFigmaUrl } from '../providers/figma/screen-analyses-workflow/url-processor.js';
import { buildZip, type ZipFileData, type ZipFrameData } from '../providers/figma/tools/figma-batch-load/zip-builder.js';
import { registerDownload } from './download.js';

function safeNodeId(nodeId: string): string {
  return nodeId.replace(/:/g, '-');
}

function frameDirName(nodeId: string, name: string): string {
  const slug = toKebabCase(name) || 'unnamed';
  return `${safeNodeId(nodeId)}-${slug}`;
}

export async function handleFigmaBatchLoad(req: Request, res: Response): Promise<void> {
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

    // Group URLs by file key
    const urlsByFile = new Map<string, string[]>();
    for (const r of requests) {
      const match = r.url?.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
      if (!match) continue;
      const fileKey = match[2];
      const existing = urlsByFile.get(fileKey) || [];
      existing.push(r.url);
      urlsByFile.set(fileKey, existing);
    }

    if (urlsByFile.size === 0) {
      res.status(400).json({ success: false, error: 'No valid Figma URLs provided.' });
      return;
    }

    // Fetch per file
    const fileDataResults: ZipFileData[] = await Promise.all(
      Array.from(urlsByFile.entries()).map(async ([fileKey, urls]) => {
        const result = await fetchFrameData(urls, figmaClient, { imageOptions: { format: 'png', scale: 2 } });
        const metadata = await fetchFigmaFileMetadata(figmaClient, fileKey);

        const frames: ZipFrameData[] = [];
        for (const frame of result.frames) {
          const image = result.images.get(frame.nodeId);
          if (!image?.base64Data) continue;
          const nodeData = result.nodesDataMap.get(frame.nodeId);
          const structureXml = nodeData ? generateSemanticXml(nodeData) : `<!-- No node data for ${frame.name} -->`;
          frames.push({
            nodeId: frame.nodeId,
            name: frame.name,
            dirName: frameDirName(frame.nodeId, frame.name),
            imageBase64: image.base64Data,
            structureXml,
            url: buildFigmaUrl(fileKey, frame.nodeId),
            order: frame.order ?? 0,
            section: frame.sectionName,
          });
        }

        return { fileKey, fileName: metadata.name, frames };
      })
    );

    const { zipPath, manifest } = await buildZip(fileDataResults);
    const baseUrl = process.env.VITE_AUTH_SERVER_URL || `${req.protocol}://${req.get('host')}`;
    const { token, expiresAt } = registerDownload(zipPath);
    const downloadUrl = `${baseUrl}/dl/${token}`;

    res.json({
      success: true,
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      manifest,
    });
  } catch (error: any) {
    console.error('REST API: figma-batch-load failed:', error.message);
    if (error.message?.includes('403') || error.message?.includes('unauthorized')) {
      res.status(401).json({ success: false, error: 'Figma authentication failed.' });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
}
