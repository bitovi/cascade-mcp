/**
 * Temp Directory Manager
 * 
 * Manages temporary directories for shell story generation with:
 * - Deterministic naming based on sessionId and epicKey
 * - Lookup capability to reuse existing directories
 * - 24-hour auto-cleanup of unused directories
 */

import { dir } from 'tmp-promise';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getProjectRoot } from '../../../../utils/file-paths.js';

interface TempDirInfo {
  path: string;
  sessionId: string;
  epicKey: string;
  created: number;
  lastAccessed: number;
  cleanup: () => Promise<void>;
}

// In-memory store of active temp directories
const activeDirs = new Map<string, TempDirInfo>();

// Cleanup interval (check every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Max age before cleanup (24 hours)
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Generate lookup key from sessionId and epicKey
 */
function getLookupKey(sessionId: string, epicKey: string): string {
  return `${sessionId}:${epicKey}`;
}

/**
 * Get the base directory for cache files
 * 
 * In development mode with DEV_CACHE_DIR set, uses that directory.
 * Otherwise, uses OS temp directory.
 * 
 * @returns Absolute path to base cache directory
 */
function getBaseCacheDir(): string {
  const devCacheDir = process.env.DEV_CACHE_DIR;
  
  if (!devCacheDir) {
    // No override - use OS temp directory
    return os.tmpdir();
  }
  
  // Check if path is absolute
  if (path.isAbsolute(devCacheDir)) {
    console.log('  Using absolute DEV_CACHE_DIR:', devCacheDir);
    return devCacheDir;
  }
  
  // Relative path - resolve from project root
  const projectRoot = getProjectRoot();
  const resolvedPath = path.resolve(projectRoot, devCacheDir);
  console.log('  Using relative DEV_CACHE_DIR:', devCacheDir, '→', resolvedPath);
  return resolvedPath;
}

/**
 * Get or create a temp directory for shell story generation
 * 
 * @param sessionId - Session identifier (from auth context)
 * @param epicKey - Jira epic key (e.g., "PROJ-123")
 * @returns Temp directory path and cleanup function
 */
export async function getTempDir(
  sessionId: string,
  epicKey: string
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const lookupKey = getLookupKey(sessionId, epicKey);
  
  // Check if we already have a directory for this session/epic
  const existing = activeDirs.get(lookupKey);
  if (existing) {
    console.log('  Reusing existing temp directory:', existing.path);
    
    // Update last accessed time
    existing.lastAccessed = Date.now();
    
    // Verify directory still exists
    try {
      await fs.access(existing.path);
      return {
        path: existing.path,
        cleanup: existing.cleanup
      };
    } catch (error) {
      console.log('  Existing temp directory not found, creating new one');
      activeDirs.delete(lookupKey);
      // Fall through to create new directory
    }
  }
  
  // Determine base directory and create temp directory
  const baseCacheDir = getBaseCacheDir();
  let tempDirPath: string;
  let cleanup: () => Promise<void>;

  if (process.env.DEV_CACHE_DIR) {
    // Manual directory creation for dev mode
    tempDirPath = path.join(baseCacheDir, sessionId, epicKey);
    
    // Create directory if it doesn't exist
    await fs.mkdir(tempDirPath, { recursive: true });
    
    console.log('  Created/reused dev cache directory:', tempDirPath);
    
    // Create cleanup function (for consistency, but won't auto-delete in dev mode)
    cleanup = async () => {
      console.log('  Cleanup called for dev cache directory:', tempDirPath);
      // Note: In dev mode, we don't actually delete the directory
      // This preserves artifacts for debugging across sessions
    };
  } else {
    // Production mode - use tmp-promise with OS temp directory
    const tempDirPrefix = `shell-stories-${sessionId}-${epicKey}`;
    
    const tmpResult = await dir({
      prefix: tempDirPrefix,
      unsafeCleanup: true,
      tmpdir: baseCacheDir
    });
    
    tempDirPath = tmpResult.path;
    cleanup = tmpResult.cleanup;
    
    console.log('  Created new temp directory:', tempDirPath);
  }
  
  // Store in active directories map
  const now = Date.now();
  const dirInfo: TempDirInfo = {
    path: tempDirPath,
    sessionId,
    epicKey,
    created: now,
    lastAccessed: now,
    cleanup
  };
  
  activeDirs.set(lookupKey, dirInfo);
  
  return {
    path: tempDirPath,
    cleanup
  };
}

/**
 * Clean up old temp directories (called periodically)
 */
async function cleanupOldDirectories(): Promise<void> {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (const [key, dirInfo] of activeDirs.entries()) {
    const age = now - dirInfo.lastAccessed;
    
    if (age > MAX_AGE_MS) {
      console.log(`Cleaning up old temp directory (${Math.round(age / 3600000)}h old):`, dirInfo.path);
      
      try {
        await dirInfo.cleanup();
        keysToDelete.push(key);
      } catch (error) {
        console.error('  Failed to cleanup temp directory:', error);
      }
    }
  }
  
  // Remove cleaned up directories from map
  for (const key of keysToDelete) {
    activeDirs.delete(key);
  }
  
  if (keysToDelete.length > 0) {
    console.log(`  Cleaned up ${keysToDelete.length} old temp director(ies)`);
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
  
  console.log('Started periodic temp directory cleanup (every 5 minutes, max age 24 hours)');
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

// Start cleanup on module load (only in non-test environments and when not using DEV_CACHE_DIR)
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID && !process.env.DEV_CACHE_DIR) {
  startPeriodicCleanup();
}

/**
 * List all active temp directories (for debugging)
 */
export function listActiveDirs(): TempDirInfo[] {
  return Array.from(activeDirs.values());
}

/**
 * Manually cleanup a specific directory
 */
export async function cleanupDir(sessionId: string, epicKey: string): Promise<boolean> {
  const lookupKey = getLookupKey(sessionId, epicKey);
  const dirInfo = activeDirs.get(lookupKey);
  
  if (!dirInfo) {
    return false;
  }
  
  try {
    await dirInfo.cleanup();
    activeDirs.delete(lookupKey);
    console.log('  Manually cleaned up temp directory:', dirInfo.path);
    return true;
  } catch (error) {
    console.error('  Failed to cleanup temp directory:', error);
    return false;
  }
}
