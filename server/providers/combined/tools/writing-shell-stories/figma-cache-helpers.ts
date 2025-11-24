/**
 * Figma Cache Helpers
 * 
 * Utilities for managing file-based Figma cache with timestamp validation.
 * Cache is organized by Figma file key (not epic key) to enable cross-epic reuse.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { FigmaFileMetadata, FigmaMetadata } from '../../../figma/figma-helpers.js';

/**
 * Check if cached Figma data is still valid
 * 
 * Compares stored lastTouchedAt timestamp with current Figma file timestamp.
 * 
 * @param fileCachePath - File-based cache directory path (e.g., cache/figma-files/abc123)
 * @param fileKey - Figma file key
 * @param currentLastTouchedAt - Current timestamp from Figma API
 * @returns true if cache is valid, false if needs refresh
 */
export async function isCacheValid(
  fileCachePath: string,
  fileKey: string,
  currentLastTouchedAt: string
): Promise<boolean> {
  const metadataPath = path.join(fileCachePath, '.figma-metadata.json');
  
  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: FigmaMetadata = JSON.parse(metadataContent);
    
    // Validate file key matches
    if (metadata.fileKey !== fileKey) {
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
 * @param fileCachePath - File-based cache directory path
 * @param fileMetadata - Metadata from Figma /meta endpoint
 */
export async function saveFigmaMetadata(
  fileCachePath: string,
  fileMetadata: FigmaFileMetadata
): Promise<void> {
  const metadata: FigmaMetadata = {
    fileKey: fileMetadata.fileKey,
    lastTouchedAt: fileMetadata.lastTouchedAt,
    cachedAt: new Date().toISOString(),
    version: fileMetadata.version,
    lastTouchedBy: fileMetadata.lastTouchedBy
  };
  
  const metadataPath = path.join(fileCachePath, '.figma-metadata.json');
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
