/**
 * File-Based Cache Manager
 * 
 * Manages file-based Figma caches and debug artifact directories:
 * - Automatic cleanup of stale caches (7 days)
 * - File-based cache structure (cache/figma-files/{fileKey}/)
 * - Debug directories for artifacts (only when DEV_CACHE_DIR is set)
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { getProjectRoot } from '../../../../utils/file-paths.js';

// Cleanup interval (check every hour for cache cleanup)
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// Max age before cleanup (7 days for file-based caches)
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Get the base directory for cache files
 * 
 * When DEV_CACHE_DIR is set, uses that directory.
 * Otherwise, uses './cache' in the project root as default.
 * 
 * @returns Absolute path to base cache directory
 */
export function getBaseCacheDir(): string {
  const devCacheDir = process.env.DEV_CACHE_DIR;
  
  if (!devCacheDir) {
    // Use default cache directory in project root
    const projectRoot = getProjectRoot();
    return path.resolve(projectRoot, 'cache');
  }
  
  // Check if path is absolute
  if (path.isAbsolute(devCacheDir)) {
    return devCacheDir;
  }
  
  // Relative path - resolve from project root
  const projectRoot = getProjectRoot();
  return path.resolve(projectRoot, devCacheDir);
}

/**
 * Get debug directory for an epic (only when DEV_SAVE_DEBUG_OUTPUT is enabled)
 * 
 * Returns a path where debug artifacts (screens.yaml, prompts, etc.) can be written.
 * Only creates the directory when DEV_SAVE_DEBUG_OUTPUT environment variable is set.
 * This allows file-based caching to work always, while debug artifacts are opt-in.
 * 
 * @param epicKey - Jira epic key
 * @returns Debug directory path or null if debug output disabled
 */
export async function getDebugDir(epicKey: string): Promise<string | null> {
  // Debug directory only when explicitly enabled via environment variable
  if (!process.env.DEV_SAVE_DEBUG_OUTPUT) {
    return null;
  }
  
  const baseCacheDir = getBaseCacheDir();
  
  // Create debug directory: cache/{epicKey}/
  const debugDir = path.join(baseCacheDir, epicKey);
  await fs.mkdir(debugDir, { recursive: true });
  
  return debugDir;
}

/**
 * Clean up stale file-based caches and debug directories
 */
async function cleanupOldDirectories(): Promise<void> {
  await cleanupFigmaFileCaches();
  await cleanupDebugDirectories();
}

/**
 * Clean up stale file-based Figma caches (cache/figma-files/)
 * 
 * Removes cache folders that haven't been accessed in over 7 days.
 */
async function cleanupFigmaFileCaches(): Promise<void> {
  const baseCacheDir = getBaseCacheDir();
  if (!baseCacheDir) return;
  
  const figmaCacheDir = path.join(baseCacheDir, 'figma-files');
  
  // Check if figma-files directory exists
  try {
    await fs.access(figmaCacheDir);
  } catch {
    // Directory doesn't exist - nothing to clean up
    return;
  }
  
  const now = Date.now();
  const entries = await fs.readdir(figmaCacheDir, { withFileTypes: true });
  let cleanedCount = 0;
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const cachePath = path.join(figmaCacheDir, entry.name);
    const metadataPath = path.join(cachePath, '.figma-metadata.json');
    
    try {
      const stats = await fs.stat(metadataPath);
      const age = now - stats.mtimeMs;
      
      if (age > CACHE_MAX_AGE_MS) {
        const daysOld = Math.floor(age / (24 * 60 * 60 * 1000));
        console.log(`  🗑️  Cleaning up stale Figma cache: ${entry.name} (${daysOld} days old)`);
        await fs.rm(cachePath, { recursive: true, force: true });
        cleanedCount++;
      }
    } catch (error: any) {
      // Error reading metadata or deleting - skip this entry
      if (error.code !== 'ENOENT') {
        console.log(`  ⚠️  Error cleaning up ${entry.name}: ${error.message}`);
      }
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`  Cleaned up ${cleanedCount} stale Figma cache folder(s)`);
  }
}

/**
 * Clean up stale debug directories (cache/{epicKey}/)
 * 
 * Removes debug folders that haven't been accessed in over 7 days.
 */
async function cleanupDebugDirectories(): Promise<void> {
  const baseCacheDir = getBaseCacheDir();
  if (!baseCacheDir) return;
  
  const now = Date.now();
  
  try {
    const entries = await fs.readdir(baseCacheDir, { withFileTypes: true });
    let cleanedCount = 0;
    
    for (const entry of entries) {
      // Skip figma-files directory (handled separately)
      if (entry.name === 'figma-files' || !entry.isDirectory()) continue;
      
      const debugPath = path.join(baseCacheDir, entry.name);
      
      try {
        const stats = await fs.stat(debugPath);
        const age = now - stats.mtimeMs;
        
        if (age > CACHE_MAX_AGE_MS) {
          const daysOld = Math.floor(age / (24 * 60 * 60 * 1000));
          console.log(`  🗑️  Cleaning up stale debug directory: ${entry.name} (${daysOld} days old)`);
          await fs.rm(debugPath, { recursive: true, force: true });
          cleanedCount++;
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.log(`  ⚠️  Error cleaning up ${entry.name}: ${error.message}`);
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`  Cleaned up ${cleanedCount} stale debug folder(s)`);
    }
  } catch (error) {
    // Base cache directory doesn't exist - nothing to clean up
  }
}

/**
 * Start periodic cleanup of old directories
 */
let cleanupIntervalHandle: NodeJS.Timeout | null = null;

function startPeriodicCleanup(): void {
  // Don't start multiple intervals
  if (cleanupIntervalHandle) {
    return;
  }
  
  cleanupIntervalHandle = setInterval(() => {
    cleanupOldDirectories().catch(error => {
      console.error('Error during periodic temp directory cleanup:', error);
    });
  }, CLEANUP_INTERVAL_MS);
  
  // Unref the timer so it doesn't keep the process alive in test environments
  cleanupIntervalHandle.unref();
  
  console.log('  🧹 Started cache cleanup task (7 day max age, checks hourly)');
}

/**
 * Stop periodic cleanup (useful for tests)
 */
export function stopPeriodicCleanup(): void {
  if (cleanupIntervalHandle) {
    clearInterval(cleanupIntervalHandle);
    cleanupIntervalHandle = null;
  }
}

// Start cleanup on module load (only in non-test environments)
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  startPeriodicCleanup();
}
