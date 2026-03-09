/**
 * Frame Data Fetcher
 * 
 * Shared data-fetching pipeline used by both `analyzeScreens` and
 * `figma-ask-scope-questions-for-page`. Handles everything from URL
 * parsing through frame enrichment (images, annotations, ordering),
 * stopping short of LLM analysis.
 * 
 * Pipeline:
 * 1. Parse and validate Figma URLs
 * 2. Validate cache (optimization)
 * 3. Fetch nodes from Figma API
 * 4. Expand container nodes to individual frames
 * 5. Download frame images
 * 6. Associate annotations (comments + sticky notes)
 * 7. Calculate frame ordering
 * 
 * This module produces enriched frame data that consumers can use
 * differently: analyzeScreens runs LLM analysis on it, while
 * ask-scope-questions builds an MCP multi-part response from it.
 */

import type { FigmaClient } from '../figma-api-client.js';
import type { FigmaNodeMetadata } from '../figma-helpers.js';
import { toKebabCase } from '../figma-helpers.js';
import type { AnalyzedFrame } from './types.js';
import { calculateFrameOrder } from './types.js';
import {
  fetchFrameNodesFromUrls,
  parseFigmaUrls,
} from './url-processor.js';
import { expandNodes } from './frame-expander.js';
import { validateCache, type CacheValidationResult } from './cache-validator.js';
import { loadFigmaMetadata } from './figma-cache.js';
import { fetchAndAssociateAnnotations, checkCommentsForInvalidation } from './annotation-associator.js';
import { downloadImages } from './image-downloader.js';
import type { DownloadedImage, ImageDownloadResult } from './image-downloader.js';
import type { AnnotationResult } from './annotation-associator.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the frame data fetching pipeline
 */
export interface FetchFrameDataOptions {
  /** Image download options */
  imageOptions?: {
    format?: 'png' | 'jpg' | 'svg';
    scale?: number;
  };

  /** Progress notification callback */
  notify?: (message: string) => Promise<void>;
}

/**
 * Result of the frame data fetching pipeline
 * 
 * Contains all enriched data for frames, ready for either LLM analysis
 * or MCP response building.
 */
export interface FetchFrameDataResult {
  /** Figma file key */
  fileKey: string;

  /** Full Figma file URL */
  fileUrl: string;

  /** Frames with annotations, ordered spatially */
  frames: AnalyzedFrame[];

  /** Map of nodeId → full node data (with children, for semantic XML) */
  nodesDataMap: Map<string, any>;

  /** Map of nodeId → downloaded image data */
  images: Map<string, DownloadedImage>;

  /** Image download failures */
  imageFailures: string[];

  /** Annotation association result (stats, unattached comments, etc.) */
  annotationResult: AnnotationResult;

  /** Cache validation result (for saving metadata later) */
  cacheResult: CacheValidationResult;

  /** Frame node IDs that were invalidated due to new comments */
  invalidatedFrameIds: string[];
}

/**
 * Dependencies for the frame data fetcher
 * All dependencies have sensible defaults for production use.
 * Override in tests to inject mock implementations.
 */
export interface FrameDataFetcherDeps {
  parseFigmaUrls?: typeof parseFigmaUrls;
  fetchFrameNodesFromUrls?: typeof fetchFrameNodesFromUrls;
  expandNodes?: typeof expandNodes;
  fetchAndAssociateAnnotations?: typeof fetchAndAssociateAnnotations;
  validateCache?: typeof validateCache;
  downloadImages?: typeof downloadImages;
  calculateFrameOrder?: typeof calculateFrameOrder;
}

// ============================================================================
// Default Dependencies
// ============================================================================

const defaultDeps: Required<FrameDataFetcherDeps> = {
  parseFigmaUrls,
  fetchFrameNodesFromUrls,
  expandNodes,
  fetchAndAssociateAnnotations,
  validateCache,
  downloadImages,
  calculateFrameOrder,
};

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Fetch and enrich frame data from Figma URLs
 * 
 * Shared pipeline that handles URL parsing, node fetching, image downloading,
 * annotation association, and spatial ordering. Produces enriched frame data
 * without running any LLM analysis.
 * 
 * Used by:
 * - `analyzeScreens()` — adds LLM analysis on top
 * - `figma-ask-scope-questions-for-page` — builds MCP response with embedded prompts
 * 
 * @param urls - Array of Figma URLs (page, section, or frame)
 * @param figmaClient - Authenticated Figma API client
 * @param options - Pipeline options (image format, notifications)
 * @param deps - Optional dependency overrides for testing
 * @returns Enriched frame data ready for downstream processing
 */
export async function fetchFrameData(
  urls: string[],
  figmaClient: FigmaClient,
  options: FetchFrameDataOptions = {},
  deps: FrameDataFetcherDeps = {}
): Promise<FetchFrameDataResult> {
  const d = { ...defaultDeps, ...deps };
  const {
    imageOptions = {},
    notify = async () => {},
  } = options;

  console.log(`\n🎨 Fetching Figma frame data`);
  console.log(`  URLs: ${urls.length}`);

  // Step 1: Parse and validate URLs
  console.log(`\n📝 Step 1: Parsing URLs...`);
  const { valid: parsedUrls, invalid: invalidUrls } = d.parseFigmaUrls(urls);

  if (parsedUrls.length === 0) {
    throw new Error('No valid Figma URLs provided');
  }

  if (invalidUrls.length > 0) {
    console.log(`  ⚠️ ${invalidUrls.length} invalid URLs skipped`);
  }

  const fileKey = parsedUrls[0].fileKey;
  const fileUrl = `https://www.figma.com/file/${fileKey}`;

  console.log(`  File key: ${fileKey}`);
  console.log(`  Valid node IDs: ${parsedUrls.map(p => p.nodeId).join(', ')}`);

  // Step 2: Validate cache BEFORE fetching nodes (optimization)
  console.log(`\n💾 Step 2: Validating cache...`);
  const cacheResult = await d.validateCache(figmaClient, fileKey);
  console.log(`  Cache was ${cacheResult.wasInvalidated ? 'invalidated' : 'valid'}`);

  // Step 3: Fetch nodes from Figma API (uses cache if valid)
  console.log(`\n🌐 Step 3: Fetching nodes from Figma API...`);
  await notify('🔗 Fetching Figma page data...');
  const fetchResult = await d.fetchFrameNodesFromUrls(
    parsedUrls.map(p => p.url),
    figmaClient,
    { cacheValid: !cacheResult.wasInvalidated }
  );

  console.log(`  Fetched ${fetchResult.nodesDataMap.size} nodes`);

  // Step 4: Expand container nodes to individual frames
  console.log(`\n📦 Step 4: Expanding containers to frames...`);
  const expanded = d.expandNodes(fetchResult.nodesDataMap);
  const nodesDataMap = expanded.nodesDataMap;

  console.log(`  Expanded to ${expanded.frames.length} frames, ${expanded.notes.length} notes`);

  // Step 5: Download frame images
  console.log(`\n🖼️ Step 5: Downloading frame images...`);
  await notify(`🖼️ Downloading ${expanded.frames.length} frame images...`);
  const frameNodeIds = expanded.frames.map(f => f.id);

  // Build cache filename map for image caching
  const cacheFilenames = new Map<string, string>();
  for (const frame of expanded.frames) {
    const filename = `${toKebabCase(frame.name)}_${frame.id.replace(/:/g, '-')}`;
    cacheFilenames.set(frame.id, filename);
  }

  const imageResult = await d.downloadImages(
    figmaClient,
    fileKey,
    frameNodeIds,
    { ...imageOptions, cacheFilenames }
  );

  // Step 6: Associate annotations
  console.log(`\n💬 Step 6: Associating annotations...`);
  await notify('💬 Associating comments and annotations...');
  const annotationResult = await d.fetchAndAssociateAnnotations(
    figmaClient,
    fileKey,
    expanded.frames,
    expanded.notes
  );

  const framesToProcess = annotationResult.frames;

  // Notify about screens found
  const screenNames = expanded.frames.map(f => f.name).join(', ');
  const matchedComments = annotationResult.stats.matchedCommentThreads;
  const totalComments = annotationResult.stats.totalCommentThreads;
  const unattachedCount = annotationResult.unattachedComments.length;
  const commentBreakdown = unattachedCount > 0
    ? `${matchedComments} matched and ${unattachedCount} unattached of ${totalComments}`
    : `${matchedComments} of ${totalComments}`;
  await notify(`📊 Found ${expanded.frames.length} frame(s) [${screenNames}], ${expanded.notes.length} note(s), ${commentBreakdown} comment thread(s)`);

  // Step 6.5: Check for comment-triggered invalidations
  let invalidatedFrameIds: string[] = [];
  const cacheMetadata = await loadFigmaMetadata(fileKey);
  if (cacheMetadata && !cacheResult.wasInvalidated) {
    const invalidationResult = checkCommentsForInvalidation(
      framesToProcess,
      { cachedAt: cacheMetadata.cachedAt }
    );
    invalidatedFrameIds = invalidationResult.invalidatedFrames;
    annotationResult.invalidatedFrames = invalidatedFrameIds;
  }

  // Step 7: Calculate spatial ordering
  console.log(`\n📐 Step 7: Calculating frame ordering...`);
  const orderedFrames = d.calculateFrameOrder(framesToProcess);

  return {
    fileKey,
    fileUrl,
    frames: orderedFrames,
    nodesDataMap,
    images: imageResult.images,
    imageFailures: imageResult.failed,
    annotationResult,
    cacheResult,
    invalidatedFrameIds,
  };
}
