/**
 * Miro Board Cache Management
 * 
 * File-based cache for Miro board data with timestamp validation.
 * Cache is organized by board ID. Validates against board modifiedAt timestamp.
 * Follows the Figma cache pattern from figma-cache.ts.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { getBaseCacheDir } from '../combined/tools/writing-shell-stories/temp-directory-manager.js';
import type { MiroClient } from './miro-api-client.js';

export interface MiroBoardCacheMetadata {
  boardId: string;
  boardModifiedAt: string;
  maxItemModifiedAt: string;
  cachedAt: string;
  itemCount: number;
  connectorCount: number;
}

export interface CachedBoardData {
  metadata: MiroBoardCacheMetadata;
  items: any[];
  connectors: any[];
}

/**
 * Get the cache directory path for a Miro board
 */
export function getMiroBoardCachePath(boardId: string): string {
  const baseCacheDir = getBaseCacheDir();
  // Board IDs can contain = and other URL-unsafe chars
  const safeBoardId = boardId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(baseCacheDir, 'miro-boards', safeBoardId);
}

/**
 * Get the metadata file path for a cached board
 */
function getMetadataPath(boardId: string): string {
  return path.join(getMiroBoardCachePath(boardId), '.cache-metadata.json');
}

/**
 * Get the board data file path
 */
function getBoardDataPath(boardId: string): string {
  return path.join(getMiroBoardCachePath(boardId), 'board-data.json');
}

/**
 * Fetch the board's modifiedAt timestamp from Miro API
 */
export async function fetchBoardModifiedAt(
  client: MiroClient,
  boardId: string
): Promise<string> {
  const response = await client.fetch(`/boards/${boardId}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Miro API error fetching board (${response.status}): ${errorText}`);
  }
  const board = await response.json();
  return board.modifiedAt;
}

/**
 * Check if cached board data is still valid
 */
export async function isBoardCacheValid(
  boardId: string,
  currentModifiedAt: string
): Promise<boolean> {
  const metadataPath = getMetadataPath(boardId);

  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: MiroBoardCacheMetadata = JSON.parse(metadataContent);

    if (metadata.boardId !== boardId) {
      return false;
    }

    const cachedTimestamp = new Date(metadata.boardModifiedAt).getTime();
    const currentTimestamp = new Date(currentModifiedAt).getTime();

    return currentTimestamp <= cachedTimestamp;
  } catch {
    return false;
  }
}

/**
 * Save board data to cache
 */
export async function saveBoardCache(
  boardId: string,
  boardModifiedAt: string,
  items: any[],
  connectors: any[]
): Promise<void> {
  const cachePath = getMiroBoardCachePath(boardId);
  await fs.mkdir(cachePath, { recursive: true });

  // Compute max item modifiedAt as secondary fingerprint
  let maxItemModifiedAt = '';
  for (const item of items) {
    if (item.modifiedAt && item.modifiedAt > maxItemModifiedAt) {
      maxItemModifiedAt = item.modifiedAt;
    }
  }
  for (const connector of connectors) {
    if (connector.modifiedAt && connector.modifiedAt > maxItemModifiedAt) {
      maxItemModifiedAt = connector.modifiedAt;
    }
  }

  const metadata: MiroBoardCacheMetadata = {
    boardId,
    boardModifiedAt,
    maxItemModifiedAt,
    cachedAt: new Date().toISOString(),
    itemCount: items.length,
    connectorCount: connectors.length,
  };

  await fs.writeFile(getMetadataPath(boardId), JSON.stringify(metadata, null, 2), 'utf-8');
  await fs.writeFile(getBoardDataPath(boardId), JSON.stringify({ items, connectors }, null, 2), 'utf-8');
}

/**
 * Load board data from cache
 */
export async function loadBoardCache(boardId: string): Promise<CachedBoardData | null> {
  try {
    const [metadataContent, dataContent] = await Promise.all([
      fs.readFile(getMetadataPath(boardId), 'utf-8'),
      fs.readFile(getBoardDataPath(boardId), 'utf-8'),
    ]);

    const metadata: MiroBoardCacheMetadata = JSON.parse(metadataContent);
    const { items, connectors } = JSON.parse(dataContent);

    return { metadata, items, connectors };
  } catch {
    return null;
  }
}

/**
 * Clear the cache for a board
 */
export async function clearBoardCache(boardId: string): Promise<void> {
  const cachePath = getMiroBoardCachePath(boardId);
  await fs.rm(cachePath, { recursive: true, force: true });
}
