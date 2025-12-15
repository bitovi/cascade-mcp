/**
 * Confluence Cache Management
 * 
 * Utilities for managing file-based Confluence page cache with timestamp validation.
 * Cache is organized by page ID to enable cross-epic reuse.
 * 
 * Pattern: Mirrors the Figma cache pattern from figma-cache.ts
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { getBaseCacheDir } from '../combined/tools/writing-shell-stories/temp-directory-manager.js';
import type { AtlassianClient } from './atlassian-api-client.js';
import { getConfluencePageVersion } from './confluence-helpers.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Relevance score for a specific decision point
 */
export interface DecisionPointScore {
  /** ID of the decision point (e.g., "feature-identification") */
  decisionPointId: string;
  /** Score from 0-10 */
  score: number;
  /** Brief explanation of the score */
  reasoning: string;
}

/**
 * Relevance score for a specific tool
 */
export interface ToolRelevanceScore {
  /** Tool ID */
  toolId: 'analyze-feature-scope' | 'write-shell-stories' | 'write-next-story';
  /** Scores for each decision point */
  decisionPointScores: DecisionPointScore[];
  /** Overall score (average of decision point scores) */
  overallScore: number;
  /** Brief summary of relevance to this tool */
  summary: string;
}

/**
 * Document relevance information
 */
export interface DocumentRelevance {
  /** Categorized document type */
  documentType: 'requirements' | 'technical' | 'context' | 'dod' | 'unknown';
  /** Relevance scores for each tool */
  toolScores: ToolRelevanceScore[];
}

/**
 * Summary information (for large documents)
 */
export interface DocumentSummaryMetadata {
  /** Summary text */
  text: string;
  /** Original document length in characters */
  originalLength: number;
  /** Summary length in characters */
  summaryLength: number;
  /** Main topics covered */
  keyTopics: string[];
  /** ISO 8601 timestamp when summary was generated */
  generatedAt: string;
}

/**
 * Metadata stored with cached Confluence pages
 */
export interface ConfluenceMetadata {
  /** Confluence page ID */
  pageId: string;
  /** Page title */
  title: string;
  /** Space key (if known) */
  spaceKey?: string;
  /** Original URL */
  url: string;
  /** ISO 8601 timestamp from Confluence API (version.createdAt) */
  lastModified: string;
  /** ISO 8601 timestamp when we cached this */
  cachedAt: string;
  /** Confluence version number */
  versionNumber: number;
  /** Length of markdown content in characters */
  markdownLength: number;
  /** Relevance scoring (populated after LLM analysis) */
  relevance?: DocumentRelevance;
  /** Summary (only present if document was summarized) */
  summary?: DocumentSummaryMetadata;
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the cache directory path for Confluence pages
 * 
 * @returns Full path to confluence cache directory (e.g., cache/confluence-pages)
 */
export function getConfluenceCacheBaseDir(): string {
  const baseCacheDir = getBaseCacheDir();
  return path.join(baseCacheDir, 'confluence-pages');
}

/**
 * Get the cache directory path for a specific Confluence page
 * 
 * @param pageId - Confluence page ID
 * @returns Full path to page cache directory (e.g., cache/confluence-pages/123456)
 */
export function getConfluencePageCachePath(pageId: string): string {
  return path.join(getConfluenceCacheBaseDir(), pageId);
}

/**
 * Get the metadata file path for a Confluence page
 * 
 * @param pageId - Confluence page ID
 * @returns Full path to metadata file (e.g., cache/confluence-pages/123456/.confluence-metadata.json)
 */
export function getConfluenceMetadataPath(pageId: string): string {
  return path.join(getConfluencePageCachePath(pageId), '.confluence-metadata.json');
}

/**
 * Get the markdown content file path for a Confluence page
 * 
 * @param pageId - Confluence page ID
 * @returns Full path to markdown file (e.g., cache/confluence-pages/123456/123456.md)
 */
export function getConfluenceMarkdownPath(pageId: string): string {
  return path.join(getConfluencePageCachePath(pageId), `${pageId}.md`);
}

/**
 * Get the summary file path for a Confluence page
 * 
 * @param pageId - Confluence page ID
 * @returns Full path to summary file (e.g., cache/confluence-pages/123456/123456-summary.md)
 */
export function getConfluenceSummaryPath(pageId: string): string {
  return path.join(getConfluencePageCachePath(pageId), `${pageId}-summary.md`);
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Clear and recreate the cache directory for a Confluence page
 * 
 * Deletes the entire cache folder and recreates it empty.
 * Use when cache is stale or corrupted.
 * 
 * @param pageId - Confluence page ID
 */
export async function clearConfluenceCache(pageId: string): Promise<void> {
  const cachePath = getConfluencePageCachePath(pageId);
  await fs.rm(cachePath, { recursive: true, force: true });
  await fs.mkdir(cachePath, { recursive: true });
}

/**
 * Check if cached Confluence data is still valid
 * 
 * Compares stored lastModified timestamp with current Confluence page timestamp.
 * 
 * @param pageId - Confluence page ID
 * @param currentLastModified - Current timestamp from Confluence API
 * @returns true if cache is valid, false if needs refresh
 */
export async function isCacheValid(
  pageId: string,
  currentLastModified: string
): Promise<boolean> {
  const metadataPath = getConfluenceMetadataPath(pageId);

  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: ConfluenceMetadata = JSON.parse(metadataContent);

    // Validate page ID matches
    if (metadata.pageId !== pageId) {
      console.log('    ⚠️  Cache page ID mismatch - treating cache as invalid');
      return false;
    }

    // Compare timestamps
    const cachedTimestamp = new Date(metadata.lastModified).getTime();
    const currentTimestamp = new Date(currentLastModified).getTime();

    if (currentTimestamp > cachedTimestamp) {
      console.log(`    ♻️  Confluence page updated: ${metadata.lastModified} → ${currentLastModified}`);
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
 * Ensure cache directory exists and is valid
 * 
 * Checks if cache exists and validates it against Confluence's last modified timestamp.
 * If cache is stale or corrupt, clears it. If cache doesn't exist, creates it.
 * 
 * @param client - Atlassian API client for fetching page version
 * @param siteName - Atlassian site name
 * @param pageId - Confluence page ID
 * @returns Object indicating if cache was valid and current version info
 */
export async function ensureValidCacheForConfluencePage(
  client: AtlassianClient,
  siteName: string,
  pageId: string
): Promise<{ cacheValid: boolean; lastModified: string; versionNumber: number }> {
  const metadataPath = getConfluenceMetadataPath(pageId);
  const cachePath = getConfluencePageCachePath(pageId);

  let cacheExists = false;
  try {
    await fs.access(metadataPath);
    cacheExists = true;
  } catch {
    // Cache doesn't exist - will need to fetch fresh data
  }

  // Fetch current version info from Confluence
  const versionInfo = await getConfluencePageVersion(client, siteName, pageId);

  if (cacheExists) {
    const cacheValid = await isCacheValid(pageId, versionInfo.lastModified);

    if (!cacheValid) {
      // Cache invalid - delete entire folder and recreate
      console.log('    🗑️  Deleting stale Confluence cache');
      await clearConfluenceCache(pageId);
      return { cacheValid: false, ...versionInfo };
    }

    // Cache is valid
    return { cacheValid: true, ...versionInfo };
  } else {
    // No cache - ensure directory exists
    await fs.mkdir(cachePath, { recursive: true });
    return { cacheValid: false, ...versionInfo };
  }
}

// ============================================================================
// Metadata Operations
// ============================================================================

/**
 * Save Confluence page metadata to cache
 * 
 * @param metadata - Metadata to save
 */
export async function saveConfluenceMetadata(metadata: ConfluenceMetadata): Promise<void> {
  const metadataPath = getConfluenceMetadataPath(metadata.pageId);
  
  // Ensure directory exists
  const cachePath = getConfluencePageCachePath(metadata.pageId);
  await fs.mkdir(cachePath, { recursive: true });
  
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Load Confluence page metadata from cache
 * 
 * @param pageId - Confluence page ID
 * @returns Cached metadata or null if not found
 */
export async function loadConfluenceMetadata(pageId: string): Promise<ConfluenceMetadata | null> {
  const metadataPath = getConfluenceMetadataPath(pageId);

  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(content) as ConfluenceMetadata;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save markdown content to cache
 * 
 * @param pageId - Confluence page ID
 * @param markdown - Markdown content to save
 */
export async function saveConfluenceMarkdown(pageId: string, markdown: string): Promise<void> {
  const markdownPath = getConfluenceMarkdownPath(pageId);
  
  // Ensure directory exists
  const cachePath = getConfluencePageCachePath(pageId);
  await fs.mkdir(cachePath, { recursive: true });
  
  await fs.writeFile(markdownPath, markdown, 'utf-8');
}

/**
 * Load markdown content from cache
 * 
 * @param pageId - Confluence page ID
 * @returns Cached markdown or null if not found
 */
export async function loadConfluenceMarkdown(pageId: string): Promise<string | null> {
  const markdownPath = getConfluenceMarkdownPath(pageId);

  try {
    return await fs.readFile(markdownPath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Save document summary to cache
 * 
 * @param pageId - Confluence page ID
 * @param summary - Summary text to save
 */
export async function saveConfluenceSummary(pageId: string, summary: string): Promise<void> {
  const summaryPath = getConfluenceSummaryPath(pageId);
  
  // Ensure directory exists
  const cachePath = getConfluencePageCachePath(pageId);
  await fs.mkdir(cachePath, { recursive: true });
  
  await fs.writeFile(summaryPath, summary, 'utf-8');
}

/**
 * Load document summary from cache
 * 
 * @param pageId - Confluence page ID
 * @returns Cached summary or null if not found
 */
export async function loadConfluenceSummary(pageId: string): Promise<string | null> {
  const summaryPath = getConfluenceSummaryPath(pageId);

  try {
    return await fs.readFile(summaryPath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Update relevance scores in cached metadata
 * 
 * @param pageId - Confluence page ID
 * @param relevance - Relevance scoring data
 */
export async function updateConfluenceRelevance(
  pageId: string,
  relevance: DocumentRelevance
): Promise<void> {
  const metadata = await loadConfluenceMetadata(pageId);
  
  if (!metadata) {
    throw new Error(`Cannot update relevance: no cached metadata for page ${pageId}`);
  }

  metadata.relevance = relevance;
  await saveConfluenceMetadata(metadata);
}

/**
 * Update summary in cached metadata
 * 
 * @param pageId - Confluence page ID
 * @param summaryMetadata - Summary metadata
 */
export async function updateConfluenceSummaryMetadata(
  pageId: string,
  summaryMetadata: DocumentSummaryMetadata
): Promise<void> {
  const metadata = await loadConfluenceMetadata(pageId);
  
  if (!metadata) {
    throw new Error(`Cannot update summary: no cached metadata for page ${pageId}`);
  }

  metadata.summary = summaryMetadata;
  await saveConfluenceMetadata(metadata);
}

/**
 * Check if a page is cached (has metadata)
 * 
 * @param pageId - Confluence page ID
 * @returns true if page is cached
 */
export async function isPageCached(pageId: string): Promise<boolean> {
  const metadataPath = getConfluenceMetadataPath(pageId);
  
  try {
    await fs.access(metadataPath);
    return true;
  } catch {
    return false;
  }
}
