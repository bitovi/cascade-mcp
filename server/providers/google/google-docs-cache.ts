/**
 * Google Docs Cache
 * 
 * File-based caching for Google Docs content with modifiedTime-based invalidation.
 * Stores document metadata and markdown content in the cache/google-docs/ directory.
 * 
 * Pattern: Mirrors confluence-cache.ts for consistency.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getBaseCacheDir } from '../combined/tools/writing-shell-stories/temp-directory-manager.js';
import type { DocumentRelevance, DocumentSummaryMetadata } from '../atlassian/confluence-cache.js';

/**
 * Cached metadata for a Google Doc
 */
export interface GoogleDocCacheMetadata {
  /** Google Drive document ID */
  documentId: string;
  /** Document title */
  title: string;
  /** Original URL from the epic */
  url: string;
  /** MIME type from Drive API */
  mimeType: string;
  /** Last modified timestamp (ISO 8601) from Drive API */
  modifiedTime: string;
  /** When we cached this content (ISO 8601) */
  cachedAt: string;
  /** Length of markdown content in characters */
  markdownLength: number;
  /** Relevance scoring data (populated after LLM analysis) */
  relevance?: DocumentRelevance;
  /** Summary (only present if document was summarized) */
  summary?: DocumentSummaryMetadata;
}
// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the cache directory path for Google Docs
 * 
 * @returns Full path to google-docs cache directory (e.g., cache/google-docs)
 */
export function getGoogleDocsCacheBaseDir(): string {
  const baseCacheDir = getBaseCacheDir();
  return path.join(baseCacheDir, 'google-docs');
}

/**
 * Get the cache directory path for a specific Google Doc
 * 
 * @param documentId - Google Drive document ID
 * @returns Full path to document cache directory (e.g., cache/google-docs/{documentId})
 */
export function getGoogleDocCachePath(documentId: string): string {
  return path.join(getGoogleDocsCacheBaseDir(), documentId);
}

/**
 * Get the metadata file path for a Google Doc
 * 
 * @param documentId - Google Drive document ID
 * @returns Full path to metadata.json
 */
export function getGoogleDocMetadataPath(documentId: string): string {
  return path.join(getGoogleDocCachePath(documentId), 'metadata.json');
}

/**
 * Get the markdown content file path for a Google Doc
 * 
 * @param documentId - Google Drive document ID
 * @returns Full path to content.md
 */
export function getGoogleDocMarkdownPath(documentId: string): string {
  return path.join(getGoogleDocCachePath(documentId), 'content.md');
}

// ============================================================================
// Cache Validation
// ============================================================================

/**
 * Check if cached document is still valid based on modifiedTime
 * 
 * @param cachedMetadata - Metadata from cache
 * @param currentModifiedTime - Current modifiedTime from Google Drive API
 * @returns true if cache is valid (modifiedTime matches), false if stale
 */
export function isCacheValid(
  cachedMetadata: GoogleDocCacheMetadata | null,
  currentModifiedTime: string
): boolean {
  if (!cachedMetadata || !cachedMetadata.modifiedTime || !currentModifiedTime) {
    return false;
  }

  // Normalize timestamps for comparison (handle milliseconds variations)
  const normalizeTime = (time: string): number => new Date(time).getTime();
  
  try {
    const cachedTime = normalizeTime(cachedMetadata.modifiedTime);
    const currentTime = normalizeTime(currentModifiedTime);
    return cachedTime === currentTime;
  } catch {
    return false;
  }
}

// ============================================================================
// Cache I/O Operations
// ============================================================================

/**
 * Load Google Doc metadata from cache
 * 
 * @param documentId - Google Drive document ID
 * @returns Cached metadata or null if not found
 */
export async function loadGoogleDocMetadata(documentId: string): Promise<GoogleDocCacheMetadata | null> {
  const metadataPath = getGoogleDocMetadataPath(documentId);
  
  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(content) as GoogleDocCacheMetadata;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.log(`  ⚠️ Failed to load Google Doc metadata: ${error.message}`);
    return null;
  }
}

/**
 * Load Google Doc markdown content from cache
 * 
 * @param documentId - Google Drive document ID
 * @returns Cached markdown content or null if not found
 */
export async function loadGoogleDocMarkdown(documentId: string): Promise<string | null> {
  const markdownPath = getGoogleDocMarkdownPath(documentId);
  
  try {
    return await fs.readFile(markdownPath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.log(`  ⚠️ Failed to load Google Doc markdown: ${error.message}`);
    return null;
  }
}

/**
 * Save Google Doc metadata to cache
 * 
 * @param documentId - Google Drive document ID
 * @param metadata - Metadata to save
 */
export async function saveGoogleDocMetadata(documentId: string, metadata: GoogleDocCacheMetadata): Promise<void> {
  const cacheDir = getGoogleDocCachePath(documentId);
  const metadataPath = getGoogleDocMetadataPath(documentId);
  
  // Ensure directory exists
  await fs.mkdir(cacheDir, { recursive: true });
  
  // Write metadata with pretty formatting for debugging
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Save Google Doc markdown content to cache
 * 
 * @param documentId - Google Drive document ID
 * @param markdown - Markdown content to save
 */
export async function saveGoogleDocMarkdown(documentId: string, markdown: string): Promise<void> {
  const cacheDir = getGoogleDocCachePath(documentId);
  const markdownPath = getGoogleDocMarkdownPath(documentId);
  
  // Ensure directory exists
  await fs.mkdir(cacheDir, { recursive: true });
  
  // Write markdown content
  await fs.writeFile(markdownPath, markdown, 'utf-8');
}

/**
 * Clear cached content for a Google Doc
 * 
 * @param documentId - Google Drive document ID
 */
export async function clearGoogleDocCache(documentId: string): Promise<void> {
  const cacheDir = getGoogleDocCachePath(documentId);
  
  try {
    await fs.rm(cacheDir, { recursive: true, force: true });
    console.log(`  🗑️ Cleared stale cache for document: ${documentId}`);
  } catch (error: any) {
    // Ignore errors if directory doesn't exist
    if (error.code !== 'ENOENT') {
      console.log(`  ⚠️ Failed to clear cache: ${error.message}`);
    }
  }
}

// ============================================================================
// Cache Validation with Invalidation
// ============================================================================

/**
 * Result of cache validation check
 */
export interface CacheCheckResult {
  /** Whether the cache is valid and can be used */
  cacheHit: boolean;
  /** Cached metadata if valid, null otherwise */
  metadata: GoogleDocCacheMetadata | null;
  /** Cached markdown if valid, null otherwise */
  markdown: string | null;
}

/**
 * Check cache validity and load if valid, clear if stale
 * 
 * This function handles the full cache lifecycle:
 * 1. Check if cache exists
 * 2. Validate against current modifiedTime
 * 3. If valid: return cached content
 * 4. If stale: clear cache and return cache miss
 * 
 * @param documentId - Google Drive document ID
 * @param currentModifiedTime - Current modifiedTime from Google Drive API
 * @returns Cache check result with content if valid
 */
export async function ensureValidCacheForGoogleDoc(
  documentId: string,
  currentModifiedTime: string
): Promise<CacheCheckResult> {
  // Load existing metadata
  const cachedMetadata = await loadGoogleDocMetadata(documentId);
  
  // No cache exists
  if (!cachedMetadata) {
    return { cacheHit: false, metadata: null, markdown: null };
  }
  
  // Check if cache is valid
  if (isCacheValid(cachedMetadata, currentModifiedTime)) {
    // Load markdown content
    const markdown = await loadGoogleDocMarkdown(documentId);
    
    if (markdown) {
      console.log(`  📦 Cache hit for document: ${documentId}`);
      return { cacheHit: true, metadata: cachedMetadata, markdown };
    }
    
    // Metadata exists but markdown missing - treat as cache miss
    console.log(`  ⚠️ Cache metadata exists but markdown missing: ${documentId}`);
    await clearGoogleDocCache(documentId);
    return { cacheHit: false, metadata: null, markdown: null };
  }
  
  // Cache is stale - clear and return miss
  console.log(`  📝 Cache stale for document: ${documentId} (modified ${currentModifiedTime} vs cached ${cachedMetadata.modifiedTime})`);
  await clearGoogleDocCache(documentId);
  return { cacheHit: false, metadata: null, markdown: null };
}
