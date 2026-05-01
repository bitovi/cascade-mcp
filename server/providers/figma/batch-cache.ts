/**
 * Figma Batch Cache
 *
 * Request-token-based server-side cache for batch Figma data (spec 069).
 * Each batch gets an isolated directory keyed by a random UUID (batchToken).
 * No cross-request sharing — separate users/sessions get separate caches.
 *
 * Cache characteristics:
 * - 10-minute TTL (extended on read access)
 * - Lazy cleanup on creation (same pattern as scope-cache.ts)
 * - Directory: cache/figma-batch/{batchToken}/
 * - Security: batchToken is a random UUID — no data leaks between sessions
 */

import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getBaseCacheDir } from '../combined/tools/writing-shell-stories/temp-directory-manager.js';
import type { FetchedFileData, FetchedFrameData } from '../figma/tools/figma-batch-fetch.js';
import { safeNodeId } from '../figma/tools/figma-batch-fetch.js';

// ============================================================================
// Constants
// ============================================================================

/** Default TTL in milliseconds (10 minutes) */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** TTL extension on successful read (5 minutes) */
const TTL_EXTENSION_MS = 5 * 60 * 1000;

// ============================================================================
// Types
// ============================================================================

export interface BatchCacheMetadata {
  batchToken: string;
  createdAt: string;
  expiresAt: string;
  files: Array<{
    fileKey: string;
    fileName: string;
    frames: Array<{
      nodeId: string;
      name: string;
      dirName: string;
      url: string;
      order: number;
      section?: string;
      annotationCount: number;
      width?: number;
      height?: number;
    }>;
  }>;
  totalFrames: number;
}

export interface BatchCacheFrameData {
  nodeId: string;
  name: string;
  imageBase64?: string;
  imageMimeType?: string;
  contextMd: string;
  semanticXml: string;
}

// ============================================================================
// Path Helpers
// ============================================================================

function getBatchCacheBaseDir(): string {
  return path.join(getBaseCacheDir(), 'figma-batch');
}

function getBatchDir(batchToken: string): string {
  return path.join(getBatchCacheBaseDir(), batchToken);
}

function getMetadataPath(batchToken: string): string {
  return path.join(getBatchDir(batchToken), '.cache-metadata.json');
}

function getFrameDir(batchToken: string, nodeId: string): string {
  return path.join(getBatchDir(batchToken), 'frames', safeNodeId(nodeId));
}

// ============================================================================
// Cache CRUD Operations
// ============================================================================

/**
 * Create a batch cache entry with all file/frame data.
 * Returns a batchToken and manifest for the caller to return to the agent.
 */
export async function createBatchCache(
  fileDataResults: FetchedFileData[]
): Promise<{ batchToken: string; manifest: BatchCacheMetadata }> {
  const batchToken = crypto.randomUUID();
  const batchDir = getBatchDir(batchToken);
  const now = new Date();

  // Create directory structure
  await fs.mkdir(path.join(batchDir, 'frames'), { recursive: true });

  // Build manifest and write frame data
  const manifestFiles: BatchCacheMetadata['files'] = [];

  for (const fileData of fileDataResults) {
    const frameManifests: BatchCacheMetadata['files'][0]['frames'] = [];

    for (const frame of fileData.frames) {
      const frameDir = getFrameDir(batchToken, frame.nodeId);
      await fs.mkdir(frameDir, { recursive: true });

      // Write image
      if (frame.imageBase64) {
        const imageBuffer = Buffer.from(frame.imageBase64, 'base64');
        await fs.writeFile(path.join(frameDir, 'image.png'), imageBuffer);
      }

      // Write context markdown
      await fs.writeFile(path.join(frameDir, 'context.md'), frame.contextMd, 'utf-8');

      // Write semantic XML
      await fs.writeFile(path.join(frameDir, 'structure.xml'), frame.structureXml, 'utf-8');

      frameManifests.push({
        nodeId: frame.nodeId,
        name: frame.name,
        dirName: frame.dirName,
        url: frame.url,
        order: frame.order,
        section: frame.section,
        annotationCount: frame.annotationCount,
        width: frame.width,
        height: frame.height,
      });
    }

    manifestFiles.push({
      fileKey: fileData.fileKey,
      fileName: fileData.fileName,
      frames: frameManifests,
    });
  }

  const totalFrames = manifestFiles.reduce((sum, f) => sum + f.frames.length, 0);

  const manifest: BatchCacheMetadata = {
    batchToken,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
    files: manifestFiles,
    totalFrames,
  };

  // Write metadata
  await fs.writeFile(getMetadataPath(batchToken), JSON.stringify(manifest, null, 2), 'utf-8');

  // Trigger lazy cleanup of other expired entries
  cleanupExpiredBatchCaches().catch(() => {
    // Fire and forget — cleanup is best-effort
  });

  return { batchToken, manifest };
}

/**
 * Validate and retrieve batch cache metadata.
 * Returns null if cache is expired or doesn't exist.
 * Extends TTL on successful read.
 */
export async function getBatchCacheEntry(
  batchToken: string
): Promise<BatchCacheMetadata | null> {
  const metadataPath = getMetadataPath(batchToken);

  try {
    const raw = await fs.readFile(metadataPath, 'utf-8');
    const metadata: BatchCacheMetadata = JSON.parse(raw);

    // Validate batchToken matches
    if (metadata.batchToken !== batchToken) {
      return null;
    }

    // Check TTL
    if (new Date(metadata.expiresAt).getTime() < Date.now()) {
      // Expired — clean up
      await fs.rm(getBatchDir(batchToken), { recursive: true, force: true }).catch(() => {});
      return null;
    }

    // Extend TTL on access
    metadata.expiresAt = new Date(
      Math.max(new Date(metadata.expiresAt).getTime(), Date.now() + TTL_EXTENSION_MS)
    ).toISOString();
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8').catch(() => {});

    return metadata;
  } catch {
    return null;
  }
}

/**
 * Read cached frame data for a specific frame from a batch.
 * Node IDs are unique within a batch — no file-key routing needed.
 */
export async function readBatchFrameData(
  batchToken: string,
  nodeId: string
): Promise<BatchCacheFrameData | null> {
  const frameDir = getFrameDir(batchToken, nodeId);

  try {
    await fs.access(frameDir);
  } catch {
    return null;
  }

  let imageBase64: string | undefined;
  let imageMimeType: string | undefined;
  try {
    const imageBuffer = await fs.readFile(path.join(frameDir, 'image.png'));
    imageBase64 = imageBuffer.toString('base64');
    imageMimeType = 'image/png';
  } catch {
    // No image cached
  }

  let contextMd = '';
  try {
    contextMd = await fs.readFile(path.join(frameDir, 'context.md'), 'utf-8');
  } catch {
    // No context
  }

  let semanticXml = '';
  try {
    semanticXml = await fs.readFile(path.join(frameDir, 'structure.xml'), 'utf-8');
  } catch {
    // No structure
  }

  // Try to get the name from manifest metadata
  let name = nodeId;
  try {
    const metaRaw = await fs.readFile(getMetadataPath(batchToken), 'utf-8');
    const meta: BatchCacheMetadata = JSON.parse(metaRaw);
    for (const file of meta.files) {
      const frameInfo = file.frames.find(f => f.nodeId === nodeId);
      if (frameInfo) {
        name = frameInfo.name;
        break;
      }
    }
  } catch {
    // Use nodeId as fallback name
  }

  return {
    nodeId,
    name,
    imageBase64,
    imageMimeType,
    contextMd,
    semanticXml,
  };
}

/**
 * Lazy cleanup: remove expired batch cache entries.
 * Called when a new cache is created.
 */
async function cleanupExpiredBatchCaches(): Promise<void> {
  const baseDir = getBatchCacheBaseDir();

  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metaPath = path.join(baseDir, entry.name, '.cache-metadata.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf-8');
        const metadata: BatchCacheMetadata = JSON.parse(raw);

        if (new Date(metadata.expiresAt).getTime() < now) {
          await fs.rm(path.join(baseDir, entry.name), { recursive: true, force: true });
          console.log(`  Cleaned expired batch cache: ${entry.name}`);
        }
      } catch {
        // Can't read metadata — skip
      }
    }
  } catch {
    // Base dir doesn't exist yet — nothing to clean
  }
}
