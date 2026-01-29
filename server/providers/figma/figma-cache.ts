/**
 * Figma Cache Management
 * 
 * Utilities for managing file-based Figma cache with timestamp validation.
 * Cache is organized by Figma file key (not epic key) to enable cross-epic reuse.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { getBaseCacheDir } from '../combined/tools/writing-shell-stories/temp-directory-manager.js';
import type { FigmaClient } from './figma-api-client.js';
import type { FigmaFileMetadata, FigmaMetadata } from './figma-helpers.js';
import { fetchFigmaFileMetadata, FigmaUnrecoverableError } from './figma-helpers.js';

/**
 * Get the cache directory path for a Figma file
 * 
 * @param figmaFileKey - Figma file key
 * @returns Full path to file cache directory (e.g., cache/figma-files/abc123)
 */
export function getFigmaFileCachePath(figmaFileKey: string): string {
  const baseCacheDir = getBaseCacheDir();
  return path.join(baseCacheDir, 'figma-files', figmaFileKey);
}

/**
 * Get the metadata file path for a Figma file
 * 
 * @param figmaFileKey - Figma file key
 * @returns Full path to metadata file (e.g., cache/figma-files/abc123/.figma-metadata.json)
 */
export function getFigmaMetadataPath(figmaFileKey: string): string {
  return path.join(getFigmaFileCachePath(figmaFileKey), '.figma-metadata.json');
}

/**
 * Clear and recreate the cache directory for a Figma file
 * 
 * Deletes the entire cache folder and recreates it empty.
 * Use when cache is stale or corrupted.
 * 
 * @param figmaFileKey - Figma file key
 */
export async function clearFigmaCache(figmaFileKey: string): Promise<void> {
  const fileCachePath = getFigmaFileCachePath(figmaFileKey);
  await fs.rm(fileCachePath, { recursive: true, force: true });
  await fs.mkdir(fileCachePath, { recursive: true });
}

/**
 * Ensure cache directory exists and is valid
 * 
 * Checks if cache exists and validates it against Figma's last modified timestamp.
 * If cache is stale or corrupt, clears it. If cache doesn't exist, creates it.
 * 
 * @param figmaClient - Figma API client for fetching metadata
 * @param figmaFileKey - Figma file key
 */
export async function ensureValidCacheForFigmaFile(
  figmaClient: FigmaClient,
  figmaFileKey: string
): Promise<void> {
  const metadataPath = getFigmaMetadataPath(figmaFileKey);
  const fileCachePath = getFigmaFileCachePath(figmaFileKey);
  
  let cacheExists = false;
  try {
    await fs.access(metadataPath);
    cacheExists = true;
  } catch {
    // Cache doesn't exist - will need to fetch fresh data
  }
  
  if (cacheExists) {
    try {
      const fileMetadata = await fetchFigmaFileMetadata(figmaClient, figmaFileKey);
      const cacheValid = await isCacheValid(figmaFileKey, fileMetadata.lastTouchedAt);
      
      if (!cacheValid) {
        // Cache invalid - delete entire folder and fetch fresh
        console.log('  🗑️  Deleting stale cache folder');
        await clearFigmaCache(figmaFileKey);
      }
      // If valid, cache is ready to use
    } catch (error: any) {
      // Re-throw unrecoverable errors (403 permission denied, 429 rate limit)
      // These indicate authentication/authorization issues that won't be fixed by retrying
      if (error instanceof FigmaUnrecoverableError) {
        throw error;
      }
      // Other errors - clear cache and rebuild
      console.log(`    ⚠️  Error validating cache: ${error.message}`);
      console.log('  🗑️  Clearing cache folder due to error');
      await clearFigmaCache(figmaFileKey);
    }
  } else {
    // No cache - ensure directory exists
    await fs.mkdir(fileCachePath, { recursive: true });
  }
}

/**
 * Check if cached Figma data is still valid
 * 
 * Compares stored lastTouchedAt timestamp with current Figma file timestamp.
 * 
 * @param figmaFileKey - Figma file key
 * @param currentLastTouchedAt - Current timestamp from Figma API
 * @returns true if cache is valid, false if needs refresh
 */
export async function isCacheValid(
  figmaFileKey: string,
  currentLastTouchedAt: string
): Promise<boolean> {
  const metadataPath = getFigmaMetadataPath(figmaFileKey);
  
  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: FigmaMetadata = JSON.parse(metadataContent);
    
    // Validate file key matches
    if (metadata.fileKey !== figmaFileKey) {
      console.log('    ⚠️  Cache file key mismatch - treating cache as invalid');
      return false;
    }
    
    // Compare timestamps
    const cachedTimestamp = new Date(metadata.lastTouchedAt).getTime();
    const currentTimestamp = new Date(currentLastTouchedAt).getTime();
    
    if (currentTimestamp > cachedTimestamp) {
      console.log(`    ♻️  Figma file updated: ${metadata.lastTouchedAt} → ${currentLastTouchedAt}`);
      return false;
    }
    
    return true;
    
  } catch (error: any) {
    // Metadata file doesn't exist or is corrupt - treat as invalid
    if (error.code === 'ENOENT') {
      // No log needed - this is normal on first run
    } else {
      console.log(`    ⚠️  Error reading cache metadata: ${error.message}`);
    }
    return false;
  }
}

/**
 * Save Figma metadata to cache
 * 
 * @param figmaFileKey - Figma file key
 * @param fileMetadata - Metadata from Figma /meta endpoint
 */
export async function saveFigmaMetadata(
  figmaFileKey: string,
  fileMetadata: FigmaFileMetadata
): Promise<void> {
  const metadata: FigmaMetadata = {
    fileKey: fileMetadata.fileKey,
    lastTouchedAt: fileMetadata.lastTouchedAt,
    cachedAt: new Date().toISOString(),
    version: fileMetadata.version,
    lastTouchedBy: fileMetadata.lastTouchedBy
  };
  
  const metadataPath = getFigmaMetadataPath(figmaFileKey);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Get file path for cached node asset
 * 
 * Converts node IDs (with colons) to filesystem-safe names
 * 
 * @param fileCachePath - File-based cache directory
 * @param nodeId - Figma node ID (e.g., "1234:5678")
 * @param type - Asset type (png, analysis, notes)
 * @returns Full path to cached file
 */
export function getCachedNodePath(
  fileCachePath: string,
  nodeId: string,
  type: 'png' | 'analysis' | 'notes'
): string {
  // Convert "1234:5678" → "1234-5678"
  const safeName = nodeId.replace(/:/g, '-');
  
  const extensions = {
    png: '.png',
    analysis: '.analysis.md',
    notes: '.notes.md'
  };
  
  return path.join(fileCachePath, safeName + extensions[type]);
}
