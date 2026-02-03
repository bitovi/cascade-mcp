/**
 * URL Processor
 * 
 * Handles Figma URL parsing, validation, and batch fetching of node data.
 * Implements a two-phase fetching strategy:
 * 
 * Phase 1: Fetch metadata for URL-specified nodes to discover frames
 * Phase 2: Batch fetch discovered frames WITH children (for semantic XML + comments)
 */

import {
  parseFigmaUrl as defaultParseFigmaUrl,
  convertNodeIdToApiFormat as defaultConvertNodeIdToApiFormat,
  fetchFigmaNodesBatch as defaultFetchFigmaNodesBatch,
  type FigmaUrlInfo,
} from '../figma-helpers.js';
import type { FigmaClient } from '../figma-api-client.js';
import { getFigmaFileCachePath } from './figma-cache.js';
import * as path from 'path';
import * as fs from 'fs/promises';

// ============================================================================
// Types
// ============================================================================

/**
 * Cached node data structure
 */
interface CachedNodesData {
  /** Original node IDs requested */
  requestedNodeIds: string[];
  /** Full node data with children */
  nodesDataMap: Record<string, any>;
  /** ISO timestamp when cached */
  cachedAt: string;
}

/**
 * Dependencies for URL processing
 * All dependencies have sensible defaults for production use.
 * Override in tests to inject mock implementations.
 */
export interface UrlProcessorDeps {
  parseFigmaUrl?: typeof defaultParseFigmaUrl;
  convertNodeIdToApiFormat?: typeof defaultConvertNodeIdToApiFormat;
  fetchFigmaNodesBatch?: typeof defaultFetchFigmaNodesBatch;
}

/**
 * Options for fetchFrameNodesFromUrls
 */
export interface FetchFrameNodesOptions {
  /** Whether cache is valid (skip API if true and nodes cached) */
  cacheValid?: boolean;
}

/**
 * Result of processing Figma URLs
 */
export interface ProcessedUrlsResult {
  /** The Figma file key (all URLs must be from the same file) */
  figmaFileKey: string;
  
  /** Parsed URL information for each valid URL */
  parsedUrls: Array<{
    url: string;
    fileKey: string;
    nodeId: string; // In API format (e.g., "123:456")
  }>;
  
  /** Map of nodeId -> node data (with children) from batch fetch */
  nodesDataMap: Map<string, any>;
  
  /** URLs that failed to parse or fetch */
  errors: Array<{
    url: string;
    error: string;
  }>;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Parse and batch-fetch frame nodes from Figma URLs
 * 
 * This function:
 * 1. Parses each URL to extract fileKey and nodeId
 * 2. Groups URLs by file key (currently requires all URLs from same file)
 * 3. Checks cache if cacheValid option is true
 * 4. Batch-fetches nodes from API if cache miss or invalid
 * 5. Saves fetched nodes to cache for future use
 * 
 * The returned nodesDataMap contains full node data with children,
 * suitable for both semantic XML generation and comment association.
 * 
 * @param urls - Array of Figma URLs to process
 * @param figmaClient - Authenticated Figma API client
 * @param options - Optional fetch options (caching control)
 * @param deps - Optional dependency overrides for testing
 * @returns Processed result with node data and any errors
 * @throws Error if no valid URLs or multiple file keys detected
 */
export async function fetchFrameNodesFromUrls(
  urls: string[],
  figmaClient: FigmaClient,
  options: FetchFrameNodesOptions = {},
  deps: UrlProcessorDeps = {}
): Promise<ProcessedUrlsResult> {
  const {
    parseFigmaUrl = defaultParseFigmaUrl,
    convertNodeIdToApiFormat = defaultConvertNodeIdToApiFormat,
    fetchFigmaNodesBatch = defaultFetchFigmaNodesBatch,
  } = deps;
  
  const { cacheValid = false } = options;
  
  // Step 1: Parse all URLs
  const parsedUrls: ProcessedUrlsResult['parsedUrls'] = [];
  const errors: ProcessedUrlsResult['errors'] = [];
  const fileKeys = new Set<string>();
  
  for (const url of urls) {
    const parsed = parseFigmaUrl(url);
    
    if (!parsed) {
      errors.push({ url, error: 'Invalid Figma URL format' });
      continue;
    }
    
    if (!parsed.nodeId) {
      errors.push({ url, error: 'URL missing node-id parameter' });
      continue;
    }
    
    const nodeId = convertNodeIdToApiFormat(parsed.nodeId);
    
    parsedUrls.push({
      url,
      fileKey: parsed.fileKey,
      nodeId,
    });
    
    fileKeys.add(parsed.fileKey);
  }
  
  // Validate we have URLs
  if (parsedUrls.length === 0) {
    throw new Error('No valid Figma URLs to process');
  }
  
  // Currently require all URLs from same file
  // TODO: Support multiple file keys (Gap #2)
  if (fileKeys.size > 1) {
    throw new Error(
      `URLs from multiple Figma files detected (${fileKeys.size} files). ` +
      `Currently only single-file batches are supported.`
    );
  }
  
  const figmaFileKey = parsedUrls[0].fileKey;
  const nodeIds = parsedUrls.map(p => p.nodeId);
  
  // Step 2: Try to load from cache if valid
  let nodesDataMap: Map<string, any>;
  
  if (cacheValid) {
    const cachedNodes = await loadCachedNodes(figmaFileKey, nodeIds);
    if (cachedNodes) {
      nodesDataMap = cachedNodes;
    } else {
      // Cache miss - fetch from API
      nodesDataMap = await fetchFigmaNodesBatch(figmaClient, figmaFileKey, nodeIds);
      await saveNodesToCache(figmaFileKey, nodeIds, nodesDataMap);
    }
  } else {
    // Cache invalid or not checked - always fetch fresh
    nodesDataMap = await fetchFigmaNodesBatch(figmaClient, figmaFileKey, nodeIds);
    await saveNodesToCache(figmaFileKey, nodeIds, nodesDataMap);
  }
  
  // Check for nodes that weren't found
  for (const parsed of parsedUrls) {
    if (!nodesDataMap.has(parsed.nodeId)) {
      errors.push({
        url: parsed.url,
        error: `Node ${parsed.nodeId} not found in file`,
      });
    }
  }
  
  return {
    figmaFileKey,
    parsedUrls,
    nodesDataMap,
    errors,
  };
}

/**
 * Parse multiple Figma URLs and validate them upfront
 * 
 * Use this for early validation before starting the workflow.
 * Returns parsed info without making any API calls.
 * 
 * @param urls - Array of Figma URLs to validate
 * @param deps - Optional dependency overrides for testing
 * @returns Array of parsed URLs and validation errors
 */
export function parseFigmaUrls(
  urls: string[],
  {
    parseFigmaUrl = defaultParseFigmaUrl,
    convertNodeIdToApiFormat = defaultConvertNodeIdToApiFormat,
  }: Pick<UrlProcessorDeps, 'parseFigmaUrl' | 'convertNodeIdToApiFormat'> = {}
): {
  valid: Array<{ url: string; fileKey: string; nodeId: string }>;
  invalid: Array<{ url: string; error: string }>;
} {
  const valid: Array<{ url: string; fileKey: string; nodeId: string }> = [];
  const invalid: Array<{ url: string; error: string }> = [];
  
  for (const url of urls) {
    const parsed = parseFigmaUrl(url);
    
    if (!parsed) {
      invalid.push({ url, error: 'Invalid Figma URL format' });
      continue;
    }
    
    if (!parsed.nodeId) {
      invalid.push({ url, error: 'URL missing node-id parameter' });
      continue;
    }
    
    valid.push({
      url,
      fileKey: parsed.fileKey,
      nodeId: convertNodeIdToApiFormat(parsed.nodeId),
    });
  }
  
  return { valid, invalid };
}

/**
 * Group parsed URLs by file key
 * 
 * Useful when processing URLs from multiple Figma files.
 * 
 * @param parsedUrls - Array of parsed URL info
 * @returns Map of fileKey -> array of parsed URLs
 */
export function groupUrlsByFileKey(
  parsedUrls: Array<{ url: string; fileKey: string; nodeId: string }>
): Map<string, Array<{ url: string; nodeId: string }>> {
  const grouped = new Map<string, Array<{ url: string; nodeId: string }>>();
  
  for (const parsed of parsedUrls) {
    const existing = grouped.get(parsed.fileKey) || [];
    existing.push({ url: parsed.url, nodeId: parsed.nodeId });
    grouped.set(parsed.fileKey, existing);
  }
  
  return grouped;
}

/**
 * Build full Figma URL from file key and node ID
 * 
 * @param fileKey - Figma file key
 * @param nodeId - Node ID in API format (e.g., "123:456")
 * @returns Full Figma design URL
 */
export function buildFigmaUrl(fileKey: string, nodeId: string): string {
  const urlNodeId = nodeId.replace(/:/g, '-');
  return `https://www.figma.com/design/${fileKey}?node-id=${urlNodeId}`;
}

// ============================================================================
// Node Caching Functions
// ============================================================================

/**
 * Get path to node cache file
 * 
 * @param fileKey - Figma file key
 * @returns Path to .nodes-cache.json
 */
function getNodeCachePath(fileKey: string): string {
  return path.join(getFigmaFileCachePath(fileKey), '.nodes-cache.json');
}

/**
 * Load cached nodes for a Figma file
 * 
 * Returns cached node data if:
 * 1. Cache file exists
 * 2. All requested nodeIds are present in cache
 * 
 * @param fileKey - Figma file key
 * @param nodeIds - Array of node IDs to load
 * @returns Cached nodes map, or null if cache miss
 */
export async function loadCachedNodes(
  fileKey: string,
  nodeIds: string[]
): Promise<Map<string, any> | null> {
  const cachePath = getNodeCachePath(fileKey);
  
  try {
    const content = await fs.readFile(cachePath, 'utf-8');
    const cached: CachedNodesData = JSON.parse(content);
    
    // Check if all requested nodeIds are in cache
    const cachedNodeIds = new Set(Object.keys(cached.nodesDataMap));
    const allPresent = nodeIds.every(id => cachedNodeIds.has(id));
    
    if (!allPresent) {
      console.log(`  ⚠️  Node cache incomplete (need ${nodeIds.length}, have ${cachedNodeIds.size})`);
      return null;
    }
    
    // Convert record to Map
    const nodesMap = new Map<string, any>();
    for (const nodeId of nodeIds) {
      nodesMap.set(nodeId, cached.nodesDataMap[nodeId]);
    }
    
    console.log(`  ✅ Loaded ${nodeIds.length} nodes from cache`);
    return nodesMap;
    
  } catch (error) {
    // Cache file doesn't exist or is corrupted
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`  ℹ️  No node cache found`);
    } else {
      console.log(`  ⚠️  Failed to read node cache: ${(error as Error).message}`);
    }
    return null;
  }
}

/**
 * Save nodes to cache
 * 
 * Writes node data to .nodes-cache.json for future use.
 * 
 * @param fileKey - Figma file key
 * @param nodeIds - Array of node IDs being cached
 * @param nodesDataMap - Map of node data to cache
 */
export async function saveNodesToCache(
  fileKey: string,
  nodeIds: string[],
  nodesDataMap: Map<string, any>
): Promise<void> {
  const cachePath = getNodeCachePath(fileKey);
  
  // Convert Map to Record for JSON serialization
  const nodesRecord: Record<string, any> = {};
  for (const [nodeId, nodeData] of nodesDataMap.entries()) {
    nodesRecord[nodeId] = nodeData;
  }
  
  const cacheData: CachedNodesData = {
    requestedNodeIds: nodeIds,
    nodesDataMap: nodesRecord,
    cachedAt: new Date().toISOString(),
  };
  
  try {
    await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');
    console.log(`  💾 Saved ${nodeIds.length} nodes to cache`);
  } catch (error) {
    console.log(`  ⚠️  Failed to save node cache: ${(error as Error).message}`);
  }
}
