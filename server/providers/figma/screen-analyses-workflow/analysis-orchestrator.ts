/**
 * Analysis Orchestrator
 * 
 * Main entry point for the Figma screen analysis workflow.
 * Coordinates all modules to produce comprehensive screen documentation.
 * 
 * Workflow:
 * 1. Parse and validate Figma URLs
 * 2. Fetch nodes from Figma API (with children for semantic XML)
 * 3. Expand container nodes to individual frames
 * 4. Check cache validity using /meta endpoint
 * 5. Download frame images
 * 6. Associate annotations (comments + sticky notes)
 * 7. Generate AI analysis for each frame
 * 8. Return consolidated results
 */

import type { FigmaClient } from '../figma-api-client.js';
import type { GenerateTextFn } from '../../../llm-client/types.js';
import { toKebabCase } from '../figma-helpers.js';
import type { 
  AnalyzedFrame, 
  FrameAnalysisResult,
} from './types.js';
import { calculateFrameOrder } from './types.js';
import { 
  fetchFrameNodesFromUrls, 
  parseFigmaUrls,
} from './url-processor.js';
import { expandNodes } from './frame-expander.js';
import { saveAnalysisToCache, validateCache, saveCacheMetadata, type CacheValidationResult } from './cache-validator.js';
import { loadFigmaMetadata, getFigmaFileCachePath, saveFigmaMetadata } from './figma-cache.js';
import { access } from 'fs/promises';
import { join } from 'path';
import { fetchAndAssociateAnnotations, checkCommentsForInvalidation } from './annotation-associator.js';
import { downloadImages } from './image-downloader.js';
import { analyzeFrames, type FrameAnalysisInput, type ScreenAnalysisOptions } from './screen-analyzer.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the analysis workflow
 */
export interface AnalysisWorkflowOptions {
  /** Image download options */
  imageOptions?: {
    format?: 'png' | 'jpg' | 'svg';
    scale?: number;
  };
  
  /** AI analysis options */
  analysisOptions?: ScreenAnalysisOptions;
  
  /** Progress notification callback */
  notify?: (message: string) => Promise<void>;
}

/**
 * Dependencies for the orchestrator
 * All dependencies have sensible defaults for production use.
 * Override in tests to inject mock implementations.
 */
export interface OrchestratorDeps {
  parseFigmaUrls?: typeof parseFigmaUrls;
  fetchFrameNodesFromUrls?: typeof fetchFrameNodesFromUrls;
  expandNodes?: typeof expandNodes;
  fetchAndAssociateAnnotations?: typeof fetchAndAssociateAnnotations;
  validateCache?: typeof validateCache;
  saveCacheMetadata?: typeof saveCacheMetadata;
  downloadImages?: typeof downloadImages;
  analyzeFrames?: typeof analyzeFrames;
  calculateFrameOrder?: typeof calculateFrameOrder;
}

// ============================================================================
// Default Dependencies
// ============================================================================

const defaultDeps: Required<OrchestratorDeps> = {
  parseFigmaUrls,
  fetchFrameNodesFromUrls,
  expandNodes,
  fetchAndAssociateAnnotations,
  validateCache,
  saveCacheMetadata,
  downloadImages,
  analyzeFrames,
  calculateFrameOrder,
};

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Analyze Figma screens from URLs
 * 
 * This is the main entry point for the screen analysis workflow.
 * Takes one or more Figma URLs pointing to frames, sections, or pages
 * and produces comprehensive documentation for each screen.
 * 
 * @param urls - Array of Figma URLs to analyze
 * @param figmaClient - Authenticated Figma API client
 * @param generateText - LLM text generation function
 * @param options - Workflow options
 * @param deps - Optional dependency overrides for testing
 * @returns Analysis results with all frames documented
 * 
 * @example
 * ```typescript
 * const result = await analyzeScreens(
 *   ['https://figma.com/file/abc/Test?node-id=1:2'],
 *   figmaClient,
 *   generateText
 * );
 * 
 * for (const frame of result.frames) {
 *   console.log(`${frame.name}: ${frame.analysis}`);
 * }
 * ```
 */
export async function analyzeScreens(
  urls: string[],
  figmaClient: FigmaClient,
  generateText: GenerateTextFn,
  options: AnalysisWorkflowOptions = {},
  deps: OrchestratorDeps = {}
): Promise<FrameAnalysisResult> {
  const d = { ...defaultDeps, ...deps };
  const {
    imageOptions = {},
    analysisOptions = {},
    notify = async () => {}, // No-op default
  } = options;
  
  console.log(`\n🎨 Starting Figma screen analysis workflow`);
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
  
  // All URLs should be from the same file for this workflow
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
  const fetchResult = await d.fetchFrameNodesFromUrls(
    parsedUrls.map(p => p.url),
    figmaClient,
    { cacheValid: !cacheResult.wasInvalidated }
  );
  
  console.log(`  Fetched ${fetchResult.nodesDataMap.size} nodes`);
  
  // Step 4: Expand container nodes to individual frames
  console.log(`\n📦 Step 4: Expanding containers to frames...`);
  const expanded = d.expandNodes(fetchResult.nodesDataMap);
  
  // Use the updated nodesDataMap from expansion (includes child node data)
  const nodesDataMap = expanded.nodesDataMap;
  
  console.log(`  Expanded to ${expanded.frames.length} frames, ${expanded.notes.length} notes`);
  
  // Step 5: Download frame images
  console.log(`\n🖼️ Step 5: Downloading frame images...`);
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
  const annotationResult = await d.fetchAndAssociateAnnotations(
    figmaClient,
    fileKey,
    expanded.frames,
    expanded.notes
  );
  
  const framesToAnalyze = annotationResult.frames;
  
  // Notify about screens being analyzed (after annotation association)
  const screenNames = expanded.frames.map(f => f.name).join(', ');
  const matchedComments = annotationResult.stats.matchedCommentThreads;
  const totalComments = annotationResult.stats.totalCommentThreads;
  const unattachedCount = annotationResult.unattachedComments.length;
  const commentBreakdown = unattachedCount > 0
    ? `${matchedComments} matched and ${unattachedCount} unattached of ${totalComments}`
    : `${matchedComments} of ${totalComments}`;
  await notify(`🤖 Analyzing Figma: ${expanded.frames.length} frame(s) [${screenNames}], ${expanded.notes.length} note(s), ${commentBreakdown} comment thread(s)...`);
  
  // Step 6.5: Check for comment-triggered invalidations
  const cacheMetadata = await loadFigmaMetadata(fileKey);
  if (cacheMetadata && !cacheResult.wasInvalidated) {
    const invalidationResult = checkCommentsForInvalidation(
      framesToAnalyze,
      { cachedAt: cacheMetadata.cachedAt }
    );
    // Store invalidated frames for potential future use
    annotationResult.invalidatedFrames = invalidationResult.invalidatedFrames;
  }
  
  // Step 7: Prepare inputs and run AI analysis
  
  // Build analysis inputs
  const analysisInputs: FrameAnalysisInput[] = framesToAnalyze.map(frame => ({
    frame,
    nodeData: nodesDataMap.get(frame.nodeId) || {},
    image: imageResult.images.get(frame.nodeId),
  }));
  
  const analysisResults = await d.analyzeFrames(
    analysisInputs,
    generateText,
    {
      ...analysisOptions,
      fileKey,
      invalidatedFrameIds: annotationResult.invalidatedFrames || [],
    }
  );
  
  // Step 7.5: Save analyses to cache
  const cachePath = getFigmaFileCachePath(fileKey);
  
  // Save all analyses and verify they're readable
  const savedFiles: string[] = [];
  for (const result of analysisResults) {
    if (result.success && result.frame.analysis && !result.frame.cached) {
      const filename = result.frame.cacheFilename || result.frame.name;
      // Prepend Figma URL to analysis content before saving
      const analysisWithUrl = `**Figma URL:** ${result.frame.url}\n\n${result.frame.analysis}`;
      await saveAnalysisToCache(cachePath, filename, analysisWithUrl);
      savedFiles.push(filename);
    }
  }
  
  // Verify saved files are readable (helps catch race conditions early)
  if (savedFiles.length > 0) {
    for (const filename of savedFiles) {
      const analysisPath = join(cachePath, `${filename}.analysis.md`);
      try {
        await access(analysisPath);
      } catch (error: any) {
        console.warn(`  ⚠️  Warning: Saved file ${filename}.analysis.md not immediately accessible (${error.code})`);
      }
    }
  }
  
  // Extract frames from results
  const analyzedFrames = analysisResults.map(r => r.frame);
  
  // Count cached vs newly analyzed
  const cachedCount = analyzedFrames.filter(f => f.cached).length;
  const newCount = analyzedFrames.length - cachedCount;
  
  // Notify about analysis completion
  const cacheExplanation = cachedCount > 0 && newCount === 0 ? ' (Figma file unchanged)' : '';
  await notify(`Frame analysis complete: ${cachedCount} cached, ${newCount} new${cacheExplanation}`);
  
  // Step 8: Calculate ordering and build result
  const orderedFrames = d.calculateFrameOrder(analyzedFrames);
  
  // Save cache metadata if it was invalidated
  if (cacheResult.wasInvalidated) {
    await d.saveCacheMetadata(fileKey, cacheResult.fileMetadata);
  }
  
  return {
    frames: orderedFrames,
    figmaFileUrl: fileUrl,
  };
}

// ============================================================================
// Convenience Exports
// ============================================================================

export { 
  // Types from types.ts
  type AnalyzedFrame,
  type FrameAnalysisResult,
  type FrameAnnotation,
} from './types.js';

export {
  type ScreenAnalysisOptions,
  type FrameAnalysisInput,
} from './screen-analyzer.js';

export {
  type CacheValidationResult,
} from './cache-validator.js';
