/**
 * Express middleware for request debouncing
 * 
 * Prevents duplicate requests within a 5-second window based on a dedup key.
 * Primary use case: Prevent fat-finger double-clicks on Jira automation buttons.
 */

import type { Request, Response, NextFunction } from 'express';

const DEBOUNCE_WINDOW_MS = 5000;
const lastRequests = new Map<string, number>();

/**
 * Create debounce middleware with custom key extraction
 * 
 * @param keyExtractor - Function to extract dedup key from request
 * @returns Express middleware function
 * 
 * @example
 * app.post('/api/write-shell-stories',
 *   debounce(req => `write-shell-stories:${req.body.siteName}:${req.body.epicKey}`),
 *   handleWriteShellStories
 * );
 */
export function debounce(keyExtractor: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyExtractor(req);
    const now = Date.now();
    const lastTimestamp = lastRequests.get(key);

    if (lastTimestamp) {
      const elapsed = now - lastTimestamp;
      if (elapsed < DEBOUNCE_WINDOW_MS) {
        const retrySeconds = Math.ceil((DEBOUNCE_WINDOW_MS - elapsed) / 1000);
        res.status(409).json({
          success: false,
          error: `A request for this operation is already in progress. Please wait ${retrySeconds} more seconds before retrying.`
        });
        return;
      }
    }

    lastRequests.set(key, now);
    
    // Lazy cleanup when map gets large
    if (lastRequests.size > 100) {
      const cutoff = now - DEBOUNCE_WINDOW_MS;
      for (const [k, ts] of lastRequests) {
        if (ts < cutoff) lastRequests.delete(k);
      }
    }

    next();
  };
}

/**
 * Clear all debounce records (for testing)
 */
export function clearDebounceCache(): void {
  lastRequests.clear();
}

/**
 * Check debounce directly (for testing)
 * Returns whether request is allowed and retry time if not
 */
export function checkDebounce(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const lastTimestamp = lastRequests.get(key);

  if (lastTimestamp) {
    const elapsed = now - lastTimestamp;
    if (elapsed < DEBOUNCE_WINDOW_MS) {
      return { allowed: false, retryAfterMs: DEBOUNCE_WINDOW_MS - elapsed };
    }
  }

  lastRequests.set(key, now);
  return { allowed: true };
}
