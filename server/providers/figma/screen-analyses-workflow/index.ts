/**
 * Screen Analyses Workflow
 * 
 * Consolidated Figma screen analysis workflow that extracts screens
 * from Figma URLs, downloads images, associates annotations, and
 * generates AI-powered documentation.
 * 
 * Main Entry Point:
 * - `analyzeScreens()` - Complete workflow from URLs to documented frames
 * 
 * Individual Modules (for customization):
 * - URL Processing: Parse and validate Figma URLs, fetch nodes
 * - Frame Expansion: Expand containers to individual frames
 * - Annotation Association: Associate comments and notes with frames
 * - Cache Validation: Check cache freshness using Tier 3 API
 * - Image Download: Batch download frame images
 * - Screen Analysis: Generate AI documentation
 * 
 * @example
 * ```typescript
 * import { analyzeScreens } from './screen-analyses-workflow';
 * 
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

// ============================================================================
// Main Entry Point
// ============================================================================

export {
  analyzeScreens,
  type AnalysisWorkflowOptions,
  type OrchestratorDeps,
} from './analysis-orchestrator.js';

// ============================================================================
// Types
// ============================================================================

export {
  // Core types
  type AnalyzedFrame,
  type FrameAnnotation,
  type FrameAnalysisResult,
  
  // Helper functions
  calculateFrameOrder,
  formatFramePosition,
  countAnalyzedFrames,
  countCachedFrames,
  countTotalAnnotations,
} from './types.js';

// ============================================================================
// URL Processing
// ============================================================================

export {
  parseFigmaUrls,
  fetchFrameNodesFromUrls,
  groupUrlsByFileKey,
  buildFigmaUrl,
  type ProcessedUrlsResult,
  type UrlProcessorDeps,
} from './url-processor.js';

// ============================================================================
// Frame Expansion
// ============================================================================

export {
  expandNode,
  expandNodes,
  type ExpandedFrames,
  type FrameExpanderDeps,
} from './frame-expander.js';

// ============================================================================
// Annotation Association
// ============================================================================

export {
  fetchAndAssociateAnnotations,
  type AnnotationResult,
  type AnnotationAssociatorDeps,
} from './annotation-associator.js';

// ============================================================================
// Cache Validation
// ============================================================================

export {
  validateCache,
  saveCacheMetadata,
  hasAnalysisInCache,
  loadAnalysisFromCache,
  saveAnalysisToCache,
  type CacheValidationResult,
  type CacheValidatorDeps,
} from './cache-validator.js';

// ============================================================================
// Image Download
// ============================================================================

export {
  downloadImages,
  downloadImage,
  saveImageToCache,
  type DownloadedImage,
  type ImageDownloadResult,
  type ImageDownloaderDeps,
} from './image-downloader.js';

// ============================================================================
// Screen Analysis
// ============================================================================

export {
  analyzeFrame,
  analyzeFrames,
  buildAnalysisPrompt,
  buildMessageContent,
  formatAnnotations,
  type FrameAnalysisInput,
  type FrameAnalysisOutput,
  type ScreenAnalysisOptions,
  type ScreenAnalyzerDeps,
} from './screen-analyzer.js';
