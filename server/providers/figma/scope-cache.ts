/**
 * Figma Scope Cache
 *
 * Short-lived server-side cache for design review workflows (spec 067).
 * Stores fetched Figma data (images, context, structure, prompts) so that
 * per-frame analysis tools can read from cache instead of re-fetching.
 *
 * Cache characteristics:
 * - 10-minute TTL (extended on access)
 * - Lazy cleanup on access (no background timers)
 * - Directory: cache/figma-scope/{fileKey}/
 * - cacheToken = "{fileKey}-{timestamp}" for session uniqueness
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { getBaseCacheDir } from '../combined/tools/writing-shell-stories/temp-directory-manager.js';

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

export interface ScopeCacheMetadata {
  fileKey: string;
  fileName: string;
  pageName: string;
  pageId: string;
  cacheToken: string;
  createdAt: string;
  expiresAt: string;
  frameCount: number;
  frames: ScopeCacheFrameInfo[];
  featureContext?: string;
}

export interface ScopeCacheFrameInfo {
  nodeId: string;
  name: string;
  dirName: string;
  order: number;
  section: string | null;
  annotationCount: number;
  hasImage: boolean;
  hasStructure: boolean;
  url: string;
}

export interface ScopeCacheFrameData {
  nodeId: string;
  name: string;
  imageBase64?: string;
  imageMimeType?: string;
  contextMd: string;
  semanticXml: string;
}

export interface CreateScopeCacheInput {
  fileKey: string;
  fileName: string;
  pageName: string;
  pageId: string;
  featureContext?: string;
  frames: Array<{
    nodeId: string;
    name: string;
    order: number;
    section: string | null;
    annotationCount: number;
    url: string;
    imageBase64?: string;
    imageMimeType?: string;
    contextMd: string;
    semanticXml: string;
  }>;
}

// ============================================================================
// Path Helpers
// ============================================================================

function getScopeCacheDir(): string {
  return path.join(getBaseCacheDir(), 'figma-scope');
}

function getFileCacheDir(fileKey: string): string {
  return path.join(getScopeCacheDir(), fileKey);
}

function getMetadataPath(fileKey: string): string {
  return path.join(getFileCacheDir(fileKey), '.cache-metadata.json');
}

/** Convert node ID to filesystem-safe name: "123:456" → "123-456" */
function safeNodeId(nodeId: string): string {
  return nodeId.replace(/:/g, '-');
}

/** Sanitize frame name for directory usage */
function sanitizeFrameName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80) || 'unnamed';
}

function getFrameDir(fileKey: string, nodeId: string): string {
  return path.join(getFileCacheDir(fileKey), 'frames', safeNodeId(nodeId));
}

// ============================================================================
// Cache CRUD Operations
// ============================================================================

/**
 * Create a scope cache entry with all frame data and prompts.
 * Returns a cacheToken that can be passed to per-frame tools.
 */
export async function createScopeCache(input: CreateScopeCacheInput): Promise<string> {
  const { fileKey } = input;
  const cacheDir = getFileCacheDir(fileKey);
  const now = new Date();
  const cacheToken = `${fileKey}-${now.getTime()}`;

  // Clean up any existing cache for this file
  try {
    await fs.rm(cacheDir, { recursive: true, force: true });
  } catch {
    // Ignore — may not exist
  }

  // Create directory structure
  await fs.mkdir(path.join(cacheDir, 'frames'), { recursive: true });

  // Build frame info for metadata
  const frameInfos: ScopeCacheFrameInfo[] = [];

  // Write frame data
  for (const frame of input.frames) {
    const frameDirName = sanitizeFrameName(frame.name);
    const frameDir = getFrameDir(fileKey, frame.nodeId);
    await fs.mkdir(frameDir, { recursive: true });

    // Write image
    if (frame.imageBase64) {
      const imageBuffer = Buffer.from(frame.imageBase64, 'base64');
      await fs.writeFile(path.join(frameDir, 'image.png'), imageBuffer);
    }

    // Write context markdown
    await fs.writeFile(path.join(frameDir, 'context.md'), frame.contextMd, 'utf-8');

    // Write semantic XML
    if (frame.semanticXml) {
      await fs.writeFile(path.join(frameDir, 'structure.xml'), frame.semanticXml, 'utf-8');
    }

    frameInfos.push({
      nodeId: frame.nodeId,
      name: frame.name,
      dirName: frameDirName,
      order: frame.order,
      section: frame.section,
      annotationCount: frame.annotationCount,
      hasImage: !!frame.imageBase64,
      hasStructure: !!frame.semanticXml,
      url: frame.url,
    });
  }

  // Write metadata
  const metadata: ScopeCacheMetadata = {
    fileKey,
    fileName: input.fileName,
    pageName: input.pageName,
    pageId: input.pageId,
    cacheToken,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
    frameCount: input.frames.length,
    frames: frameInfos,
    featureContext: input.featureContext,
  };

  await fs.writeFile(getMetadataPath(fileKey), JSON.stringify(metadata, null, 2), 'utf-8');

  // Trigger lazy cleanup of other expired entries
  cleanupExpiredScopeCaches().catch(() => {
    // Fire and forget — cleanup is best-effort
  });

  return cacheToken;
}

/**
 * Validate and retrieve scope cache metadata.
 * Returns null if cache is expired or doesn't exist.
 * Extends TTL on successful read.
 */
export async function getScopeCacheEntry(
  cacheToken: string,
  fileKey: string
): Promise<ScopeCacheMetadata | null> {
  const metadataPath = getMetadataPath(fileKey);

  try {
    const raw = await fs.readFile(metadataPath, 'utf-8');
    const metadata: ScopeCacheMetadata = JSON.parse(raw);

    // Validate cacheToken matches
    if (metadata.cacheToken !== cacheToken) {
      return null;
    }

    // Check TTL
    if (new Date(metadata.expiresAt).getTime() < Date.now()) {
      // Expired — clean up
      await fs.rm(getFileCacheDir(fileKey), { recursive: true, force: true }).catch(() => {});
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
 * Read cached frame data (image, context, structure) for a specific frame.
 */
export async function readCachedFrameData(
  fileKey: string,
  nodeId: string
): Promise<ScopeCacheFrameData | null> {
  const frameDir = getFrameDir(fileKey, nodeId);

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

  // Try to get the name from parent metadata
  let name = nodeId;
  try {
    const metaRaw = await fs.readFile(getMetadataPath(fileKey), 'utf-8');
    const meta: ScopeCacheMetadata = JSON.parse(metaRaw);
    const frameInfo = meta.frames.find(f => f.nodeId === nodeId);
    if (frameInfo) name = frameInfo.name;
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
 * Lazy cleanup: remove expired scope cache entries.
 * Called when a new cache is created.
 */
export async function cleanupExpiredScopeCaches(): Promise<void> {
  const scopeDir = getScopeCacheDir();

  try {
    const entries = await fs.readdir(scopeDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metaPath = path.join(scopeDir, entry.name, '.cache-metadata.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf-8');
        const metadata: ScopeCacheMetadata = JSON.parse(raw);

        if (new Date(metadata.expiresAt).getTime() < now) {
          await fs.rm(path.join(scopeDir, entry.name), { recursive: true, force: true });
          console.log(`  Cleaned expired scope cache: ${entry.name}`);
        }
      } catch {
        // Can't read metadata — skip
      }
    }
  } catch {
    // Scope dir doesn't exist yet — nothing to clean
  }
}
