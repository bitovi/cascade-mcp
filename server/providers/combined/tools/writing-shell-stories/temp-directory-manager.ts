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
  
  // Create new temp directory with deterministic prefix
  const tempDirPrefix = `shell-stories-${sessionId}-${epicKey}`;
  
  const { path: tempDirPath, cleanup } = await dir({
    prefix: tempDirPrefix,
    unsafeCleanup: true, // Remove directory even if not empty
    tmpdir: os.tmpdir()
  });
  
  console.log('  Created new temp directory:', tempDirPath);
  
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
function startPeriodicCleanup(): void {
  setInterval(() => {
    cleanupOldDirectories().catch(error => {
      console.error('Error during periodic temp directory cleanup:', error);
    });
  }, CLEANUP_INTERVAL_MS);
  
  console.log('Started periodic temp directory cleanup (every 5 minutes, max age 24 hours)');
}

// Start cleanup on module load
startPeriodicCleanup();

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
