/**
 * Cache Validator
 * 
 * Validates cache freshness via Figma's /meta endpoint (Tier 3).
 * Clears stale cache when Figma file has been updated.
 */

import {
  fetchFigmaFileMetadata as defaultFetchFigmaFileMetadata,
  type FigmaFileMetadata,
} from '../figma-helpers.js';
import {
  getFigmaFileCachePath as defaultGetFigmaFileCachePath,
  isCacheValid as defaultIsCacheValid,
  clearFigmaCache as defaultClearFigmaCache,
  saveFigmaMetadata as defaultSaveFigmaMetadata,
} from '../figma-cache.js';
import type { FigmaClient } from '../figma-api-client.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Dependencies for cache validation
 * All dependencies have sensible defaults for production use.
 * Override in tests to inject mock implementations.
 */
export interface CacheValidatorDeps {
  fetchFigmaFileMetadata?: typeof defaultFetchFigmaFileMetadata;
  getFigmaFileCachePath?: typeof defaultGetFigmaFileCachePath;
  isCacheValid?: typeof defaultIsCacheValid;
  clearFigmaCache?: typeof defaultClearFigmaCache;
  saveFigmaMetadata?: typeof defaultSaveFigmaMetadata;
}

/**
 * Result of cache validation
 */
export interface CacheValidationResult {
  /** Full path to the cache directory */
  cachePath: string;
  
  /** Whether cache was invalidated (deleted and recreated) */
  wasInvalidated: boolean;
  
  /** Timestamp when Figma file was last modified */
  lastTouchedAt: string;
  
  /** Figma file metadata (useful for saving after analysis) */
  fileMetadata: FigmaFileMetadata;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Validate cache freshness for a Figma file
 * 
 * Fetches the file's /meta endpoint (Tier 3 - lightweight, generous rate limit)
 * and compares timestamps with cached metadata. If the Figma file has been
 * updated since the cache was created, the cache is cleared.
 * 
 * @param figmaClient - Authenticated Figma API client
 * @param fileKey - Figma file key
 * @param deps - Optional dependency overrides for testing
 * @returns Validation result with cache path and status
 */
export async function validateCache(
  figmaClient: FigmaClient,
  fileKey: string,
  {
    fetchFigmaFileMetadata = defaultFetchFigmaFileMetadata,
    getFigmaFileCachePath = defaultGetFigmaFileCachePath,
    isCacheValid = defaultIsCacheValid,
    clearFigmaCache = defaultClearFigmaCache,
  }: CacheValidatorDeps = {}
): Promise<CacheValidationResult> {
  // Get cache path
  const cachePath = getFigmaFileCachePath(fileKey);
  
  // Fetch current metadata from Figma (Tier 3 - lightweight)
  console.log(`  Validating cache for file ${fileKey}...`);
  const fileMetadata = await fetchFigmaFileMetadata(figmaClient, fileKey);
  
  // Check if cache is valid
  const isValid = await isCacheValid(fileKey, fileMetadata.lastTouchedAt);
  
  if (!isValid) {
    console.log(`  Cache invalid - clearing...`);
    await clearFigmaCache(fileKey);
  } else {
    console.log(`  Cache valid`);
  }
  
  return {
    cachePath,
    wasInvalidated: !isValid,
    lastTouchedAt: fileMetadata.lastTouchedAt,
    fileMetadata,
  };
}

/**
 * Save metadata after successful analysis
 * 
 * Updates the cache metadata file with the current Figma file timestamp.
 * This should be called after successful analysis to mark the cache as valid.
 * 
 * @param fileKey - Figma file key
 * @param fileMetadata - Metadata from validation step
 * @param deps - Optional dependency overrides for testing
 */
export async function saveCacheMetadata(
  fileKey: string,
  fileMetadata: FigmaFileMetadata,
  {
    saveFigmaMetadata = defaultSaveFigmaMetadata,
  }: Pick<CacheValidatorDeps, 'saveFigmaMetadata'> = {}
): Promise<void> {
  await saveFigmaMetadata(fileKey, fileMetadata);
  console.log(`  Cache metadata saved for ${fileKey}`);
}

/**
 * Check if a specific analysis file exists in cache
 * 
 * @param cachePath - Path to cache directory
 * @param filename - Filename without extension
 * @returns true if the .analysis.md file exists
 */
export async function hasAnalysisInCache(
  cachePath: string,
  filename: string
): Promise<boolean> {
  const { existsSync } = await import('fs');
  const { join } = await import('path');
  
  const analysisPath = join(cachePath, `${filename}.analysis.md`);
  return existsSync(analysisPath);
}

/**
 * Load analysis content from cache
 * 
 * @param cachePath - Path to cache directory
 * @param filename - Filename without extension
 * @returns Analysis markdown content, or null if not cached
 */
export async function loadAnalysisFromCache(
  cachePath: string,
  filename: string
): Promise<string | null> {
  const { readFile } = await import('fs/promises');
  const { join } = await import('path');
  
  const analysisPath = join(cachePath, `${filename}.analysis.md`);
  
  try {
    return await readFile(analysisPath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save analysis content to cache
 * 
 * @param cachePath - Path to cache directory
 * @param filename - Filename without extension
 * @param analysis - Analysis markdown content
 */
export async function saveAnalysisToCache(
  cachePath: string,
  filename: string,
  analysis: string
): Promise<void> {
  const { writeFile, mkdir } = await import('fs/promises');
  const { join } = await import('path');
  
  // Ensure cache directory exists
  await mkdir(cachePath, { recursive: true });
  
  const analysisPath = join(cachePath, `${filename}.analysis.md`);
  await writeFile(analysisPath, analysis, 'utf-8');
}
