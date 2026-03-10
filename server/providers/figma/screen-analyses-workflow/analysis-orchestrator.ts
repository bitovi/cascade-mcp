/**
 * Analysis Orchestrator
 * 
 * Main entry point for the Figma screen analysis workflow.
 * Coordinates frame data fetching with AI-powered analysis.
 * 
 * Workflow:
 * 1. Fetch frame data (URL parsing, node fetching, images, annotations, ordering)
 *    — delegated to fetchFrameData() shared pipeline
 * 2. Generate AI analysis for each frame
 * 3. Save analyses to cache
 * 4. Return consolidated results
 */

import type { FigmaClient } from '../figma-api-client.js';
import type { GenerateTextFn } from '../../../llm-client/types.js';
import type { 
  AnalyzedFrame, 
  FrameAnalysisResult,
} from './types.js';
import { saveAnalysisToCache, saveCacheMetadata as saveCacheMetadataDefault, type CacheValidationResult } from './cache-validator.js';
import { getFigmaFileCachePath } from './figma-cache.js';
import { access } from 'fs/promises';
import { join } from 'path';
import { analyzeFrames, type FrameAnalysisInput, type ScreenAnalysisOptions } from './screen-analyzer.js';
import { fetchFrameData, type FetchFrameDataResult, type FrameDataFetcherDeps } from './frame-data-fetcher.js';

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
export interface OrchestratorDeps extends FrameDataFetcherDeps {
  analyzeFrames?: typeof analyzeFrames;
  saveCacheMetadata?: typeof saveCacheMetadataDefault;
}

// ============================================================================
// Default Dependencies
// ============================================================================

const defaultAnalysisDeps = {
  analyzeFrames,
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
 * Uses the shared `fetchFrameData()` pipeline for data fetching, then
 * adds LLM-powered analysis and cache management on top.
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
  const {
    imageOptions = {},
    analysisOptions = {},
    notify = async () => {},
  } = options;

  // Extract orchestrator-specific deps, pass the rest to fetchFrameData
  const { 
    analyzeFrames: analyzeFramesFn = defaultAnalysisDeps.analyzeFrames,
    saveCacheMetadata: saveCacheMetadataFn = saveCacheMetadataDefault,
    ...fetchDeps 
  } = deps;

  console.log(`\n🎨 Starting Figma screen analysis workflow`);
  console.log(`  URLs: ${urls.length}`);

  // ==========================================
  // Phase 1: Fetch frame data (shared pipeline)
  // ==========================================
  const frameData = await fetchFrameData(
    urls,
    figmaClient,
    { imageOptions, notify },
    fetchDeps
  );

  const { fileKey, fileUrl, frames, nodesDataMap, images, annotationResult, cacheResult, invalidatedFrameIds } = frameData;

  // Notify about analysis start
  await notify(`🤖 Analyzing ${frames.length} frame(s)...`);

  // ==========================================
  // Phase 2: Run AI analysis
  // ==========================================
  
  // Build analysis inputs
  const analysisInputs: FrameAnalysisInput[] = frames.map(frame => ({
    frame,
    nodeData: nodesDataMap.get(frame.nodeId) || {},
    image: images.get(frame.nodeId),
  }));
  
  const analysisResults = await analyzeFramesFn(
    analysisInputs,
    generateText,
    {
      ...analysisOptions,
      fileKey,
      invalidatedFrameIds: invalidatedFrameIds || [],
    }
  );
  
  // ==========================================
  // Phase 3: Save analyses to cache
  // ==========================================
  const cachePath = getFigmaFileCachePath(fileKey);
  
  const savedFiles: string[] = [];
  for (const result of analysisResults) {
    if (result.success && result.frame.analysis && !result.frame.cached) {
      const filename = result.frame.cacheFilename || result.frame.name;
      const analysisWithUrl = `**Figma URL:** ${result.frame.url}\n\n${result.frame.analysis}`;
      await saveAnalysisToCache(cachePath, filename, analysisWithUrl);
      savedFiles.push(filename);
    }
  }
  
  // Verify saved files are readable
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
  
  const cacheExplanation = cachedCount > 0 && newCount === 0 ? ' (Figma file unchanged)' : '';
  await notify(`Frame analysis complete: ${cachedCount} cached, ${newCount} new${cacheExplanation}`);
  
  // ==========================================
  // Phase 4: Finalize
  // ==========================================

  // Save cache metadata if it was invalidated
  if (cacheResult.wasInvalidated) {
    await saveCacheMetadataFn(fileKey, cacheResult.fileMetadata);
  }
  
  return {
    frames: analyzedFrames,
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
