/**
 * Image Downloader
 * 
 * Batch downloads frame images from Figma CDN.
 * Uses single API call to get all image URLs, then downloads in parallel.
 */

import {
  downloadFigmaImagesBatch as defaultDownloadFigmaImagesBatch,
  type FigmaImageDownloadResult,
  type FigmaImageDownloadOptions,
} from '../figma-helpers.js';
import type { FigmaClient } from '../figma-api-client.js';
import { getFigmaFileCachePath } from './figma-cache.js';
import { readFile, access, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Dependencies for image downloading
 * All dependencies have sensible defaults for production use.
 * Override in tests to inject mock implementations.
 */
export interface ImageDownloaderDeps {
  downloadFigmaImagesBatch?: typeof defaultDownloadFigmaImagesBatch;
}

/**
 * Downloaded image with additional metadata
 */
export interface DownloadedImage {
  /** Figma node ID */
  nodeId: string;
  
  /** Base64-encoded image data */
  base64Data: string;
  
  /** MIME type (e.g., "image/png") */
  mimeType: string;
  
  /** Image size in bytes */
  byteSize: number;
}

/**
 * Result of batch image download
 */
export interface ImageDownloadResult {
  /** Map of nodeId -> downloaded image data */
  images: Map<string, DownloadedImage>;
  
  /** Node IDs that failed to download */
  failed: string[];
  
  /** Total bytes downloaded */
  totalBytes: number;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Download images for multiple frames in a single batch
 * 
 * Makes one API call to get all image URLs from Figma, then downloads
 * from CDN in parallel. For large batches (>50 images), automatically
 * chunks the API requests. Checks cache first to avoid re-downloading.
 * 
 * @param figmaClient - Authenticated Figma API client
 * @param fileKey - Figma file key
 * @param nodeIds - Array of node IDs in API format (e.g., "123:456")
 * @param options - Download options (format, scale, cacheFilenames)
 * @param deps - Optional dependency overrides for testing
 * @returns Download result with images and failure info
 */
export async function downloadImages(
  figmaClient: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  options: FigmaImageDownloadOptions & { cacheFilenames?: Map<string, string> } = {},
  {
    downloadFigmaImagesBatch = defaultDownloadFigmaImagesBatch,
  }: ImageDownloaderDeps = {}
): Promise<ImageDownloadResult> {
  if (nodeIds.length === 0) {
    return { images: new Map(), failed: [], totalBytes: 0 };
  }
  
  const { cacheFilenames } = options;
  
  // Check cache first if filenames provided
  const images = new Map<string, DownloadedImage>();
  const failed: string[] = [];
  let totalBytes = 0;
  const nodeIdsToDownload: string[] = [];
  
  if (cacheFilenames) {
    const cachePath = getFigmaFileCachePath(fileKey);
    
    for (const nodeId of nodeIds) {
      const filename = cacheFilenames.get(nodeId);
      if (!filename) {
        nodeIdsToDownload.push(nodeId);
        continue;
      }
      
      const imagePath = join(cachePath, `${filename}.png`);
      
      try {
        await access(imagePath);
        // File exists - load from cache
        const imageBuffer = await readFile(imagePath);
        const base64Data = imageBuffer.toString('base64');
        
        images.set(nodeId, {
          nodeId,
          base64Data,
          mimeType: 'image/png',
          byteSize: imageBuffer.length,
        });
        totalBytes += imageBuffer.length;
      } catch {
        // Cache miss - need to download
        nodeIdsToDownload.push(nodeId);
      }
    }
  } else {
    // No cache filenames provided, download all
    nodeIdsToDownload.push(...nodeIds);
  }
  
  // Download any images not in cache
  if (nodeIdsToDownload.length > 0) {
    const rawResults = await downloadFigmaImagesBatch(
      figmaClient,
      fileKey,
      nodeIdsToDownload,
      options
    );
    
    // Process download results
    for (const nodeId of nodeIdsToDownload) {
      const result = rawResults.get(nodeId);
      
      if (result) {
        images.set(nodeId, {
          nodeId,
          base64Data: result.base64Data,
          mimeType: result.mimeType,
          byteSize: result.byteSize,
        });
        totalBytes += result.byteSize;
        
        // Save to cache if filename provided
        if (cacheFilenames) {
          const filename = cacheFilenames.get(nodeId);
          if (filename) {
            const cachePath = getFigmaFileCachePath(fileKey);
            await saveImageToCache(cachePath, filename, {
              nodeId,
              base64Data: result.base64Data,
              mimeType: result.mimeType,
              byteSize: result.byteSize,
            });
          }
        }
      } else {
        failed.push(nodeId);
      }
    }
  }
  
  return { images, failed, totalBytes };
}

/**
 * Download a single image
 * 
 * Convenience wrapper for downloading one image.
 * 
 * @param figmaClient - Authenticated Figma API client
 * @param fileKey - Figma file key
 * @param nodeId - Node ID in API format
 * @param options - Download options
 * @param deps - Optional dependency overrides
 * @returns Downloaded image or null if failed
 */
export async function downloadImage(
  figmaClient: FigmaClient,
  fileKey: string,
  nodeId: string,
  options: FigmaImageDownloadOptions = {},
  deps: ImageDownloaderDeps = {}
): Promise<DownloadedImage | null> {
  const result = await downloadImages(figmaClient, fileKey, [nodeId], options, deps);
  return result.images.get(nodeId) || null;
}

/**
 * Save image to cache directory
 * 
 * @param cachePath - Path to cache directory
 * @param filename - Filename without extension
 * @param image - Downloaded image data
 */
export async function saveImageToCache(
  cachePath: string,
  filename: string,
  image: DownloadedImage
): Promise<void> {
  // Ensure cache directory exists
  await mkdir(cachePath, { recursive: true });
  
  // Determine extension from MIME type
  const ext = image.mimeType === 'image/jpeg' ? '.jpg' : '.png';
  const imagePath = join(cachePath, `${filename}${ext}`);
  
  // Convert base64 to buffer and save
  const buffer = Buffer.from(image.base64Data, 'base64');
  await writeFile(imagePath, buffer);
}
