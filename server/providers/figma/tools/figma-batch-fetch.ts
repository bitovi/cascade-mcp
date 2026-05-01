/**
 * Shared Figma Batch Data Pipeline
 *
 * Fetches Figma data for multiple URLs grouped by file.
 * Used by both figma-batch-zip (builds downloadable zip) and
 * figma-batch-cache (writes to server-side cache).
 *
 * Handles URL grouping, deduplication, and per-file parallel fetching.
 * Callers decide what to do with the structured data (zip or cache).
 *
 * API budget per file: 1 Tier 3 (meta) + 1 Tier 1 (nodes) + 1 Tier 1 (images)
 */

import type { FigmaClient } from '../figma-api-client.js';
import { fetchFrameData, type FetchFrameDataResult } from '../screen-analyses-workflow/frame-data-fetcher.js';
import { generateSemanticXml } from '../semantic-xml-generator.js';
import { fetchFigmaFileMetadata, toKebabCase } from '../figma-helpers.js';
import { buildFigmaUrl } from '../screen-analyses-workflow/url-processor.js';
import { buildFrameContextMarkdown, findConnections } from './figma-ask-scope-questions-for-page/frame-context-builder.js';

// ============================================================================
// Types
// ============================================================================

export interface FetchedFrameData {
  nodeId: string;
  name: string;
  dirName: string;
  imageBase64: string;
  structureXml: string;
  contextMd: string;
  url: string;
  order: number;
  section?: string;
  annotationCount: number;
  width?: number;
  height?: number;
}

export interface FetchedFileData {
  fileKey: string;
  fileName: string;
  frames: FetchedFrameData[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a node ID to a safe directory name: "123:456" → "123-456"
 */
export function safeNodeId(nodeId: string): string {
  return nodeId.replace(/:/g, '-');
}

/**
 * Build directory name for a frame: "{safeNodeId}-{kebab-name}"
 */
export function frameDirName(nodeId: string, name: string): string {
  const slug = toKebabCase(name) || 'unnamed';
  return `${safeNodeId(nodeId)}-${slug}`;
}

/**
 * Group URLs by Figma file key, deduplicating within each file.
 * Returns a Map of fileKey → unique URLs.
 */
export function groupUrlsByFileKey(
  requests: Array<{ url: string; label?: string }>
): Map<string, string[]> {
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

  return urlsByFile;
}

// ============================================================================
// Main Pipeline
// ============================================================================

/**
 * Fetch and package data for a single Figma file.
 * Returns structured frame data with images, XML, and context.
 */
export async function fetchFileData(
  urls: string[],
  figmaClient: FigmaClient,
  fileKey: string,
): Promise<FetchedFileData> {
  console.log(`  Fetching data for file ${fileKey} (${urls.length} URLs)...`);

  // Fetch all frame data using the shared pipeline
  const result: FetchFrameDataResult = await fetchFrameData(urls, figmaClient, {
    imageOptions: { format: 'png', scale: 2 },
  });

  // Get file name
  const metadata = await fetchFigmaFileMetadata(figmaClient, fileKey);

  // Build reference list for prototype connection resolution
  const allFrameRefs = result.frames.map(f => ({ id: f.nodeId, name: f.frameName || f.name }));

  // Build per-frame data
  const frames: FetchedFrameData[] = [];
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
 * Batch-fetch Figma data for multiple URLs, grouped by file.
 * Handles URL grouping/deduplication and parallel fetching across files.
 *
 * @param requests - Array of Figma URLs with optional labels
 * @param figmaClient - Authenticated Figma API client
 * @returns Array of per-file structured data
 */
export async function fetchBatchData(
  requests: Array<{ url: string; label?: string }>,
  figmaClient: FigmaClient,
): Promise<FetchedFileData[]> {
  const urlsByFile = groupUrlsByFileKey(requests);

  if (urlsByFile.size === 0) {
    return [];
  }

  console.log(`  ${urlsByFile.size} unique files to fetch`);

  // Fetch data per file (parallel across files)
  const fileDataPromises = Array.from(urlsByFile.entries()).map(
    ([fileKey, urls]) => fetchFileData(urls, figmaClient, fileKey)
  );

  return Promise.all(fileDataPromises);
}
