/**
 * Download Endpoint
 * 
 * One-time zip download endpoint for figma-batch-load.
 * Not an MCP tool — a plain HTTP endpoint the agent hits via `curl`.
 * 
 * Security:
 * - Download token: crypto.randomUUID() — 122-bit entropy, not guessable
 * - Time-limited: 10-minute expiry
 * - Single-use: deleted after first download
 * - No auth header needed — the token IS the auth (signed URL pattern)
 * 
 * Cleanup strategy (same philosophy as scope-cache.ts):
 * - Delete on download: normal flow — zip lives for seconds
 * - OS temp dir: server crash, abandoned zips → OS auto-cleans
 * - Lazy sweep on creation: expired entries cleaned before new ones
 * - Max pending cap: evict oldest when limit reached
 * - Docker restart: container /tmp is ephemeral
 */

import { Express, Request, Response } from 'express';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

interface DownloadEntry {
  zipPath: string;
  expiresAt: number;
}

/** In-memory download registry */
const downloads = new Map<string, DownloadEntry>();

/** Maximum number of pending downloads before evicting oldest */
const MAX_PENDING_DOWNLOADS = 20;

/** Default TTL: 10 minutes */
const DOWNLOAD_TTL_MS = 10 * 60 * 1000;

/**
 * Register a zip file for one-time download
 * 
 * @param zipPath - Absolute path to the zip file (in os.tmpdir())
 * @returns Download token (UUID)
 */
export function registerDownload(zipPath: string): { token: string; expiresAt: Date } {
  // Lazy sweep: remove expired entries before adding new ones
  const now = Date.now();
  for (const [token, entry] of downloads) {
    if (now > entry.expiresAt) {
      downloads.delete(token);
      // Best-effort cleanup of expired zip files
      fs.unlink(entry.zipPath).catch(() => {});
    }
  }

  // Evict oldest if at capacity
  if (downloads.size >= MAX_PENDING_DOWNLOADS) {
    const oldestToken = downloads.keys().next().value;
    if (oldestToken) {
      const oldEntry = downloads.get(oldestToken);
      downloads.delete(oldestToken);
      if (oldEntry) {
        fs.unlink(oldEntry.zipPath).catch(() => {});
      }
    }
  }

  const token = crypto.randomUUID();
  const expiresAt = now + DOWNLOAD_TTL_MS;

  downloads.set(token, { zipPath, expiresAt });

  return { token, expiresAt: new Date(expiresAt) };
}

/**
 * Register the download endpoint with the Express app
 */
export function registerDownloadEndpoint(app: Express): void {
  app.get('/dl/:token', async (req: Request, res: Response) => {
    const entry = downloads.get(req.params.token);

    if (!entry || Date.now() > entry.expiresAt) {
      // Clean up expired entry if it exists
      if (entry) {
        downloads.delete(req.params.token);
        fs.unlink(entry.zipPath).catch(() => {});
      }
      res.status(404).send('Expired or already downloaded');
      return;
    }

    // Check the file still exists
    if (!existsSync(entry.zipPath)) {
      downloads.delete(req.params.token);
      res.status(404).send('File no longer available');
      return;
    }

    // Stream the file, then clean up
    res.download(entry.zipPath, 'figma-data.zip', (err) => {
      // Delete zip after download (or on error)
      fs.unlink(entry.zipPath).catch(() => {});
      downloads.delete(req.params.token);

      if (err && !res.headersSent) {
        console.log('  ❌ Download error:', err.message);
      }
    });
  });

  console.log('  ✓ GET /dl/:token (one-time zip download)');
}
