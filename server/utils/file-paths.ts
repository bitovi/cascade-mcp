/**
 * File path helpers for ESM and CommonJS compatibility
 * 
 * Provides helpers to get directory paths in a way that works in both
 * ESM runtime (with import.meta.url) and Jest test environments (CommonJS).
 */

import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Get the current file's directory path
 * Works in both ESM and test/CommonJS environments
 * 
 * @returns The directory path of the calling file
 */
function getCurrentDir(): string {
  // ES module mode: use import.meta.url (wrapped in eval to avoid syntax errors in non-ESM)
  try {
    // @ts-ignore
    const importMetaUrl = eval('import.meta.url');
    if (importMetaUrl) {
      const __filename = fileURLToPath(importMetaUrl);
      return path.dirname(__filename);
    }
  } catch (e) {
    // Fall through to CommonJS mode
  }
  
  // CommonJS/test mode: __dirname is available globally
  try {
    // @ts-ignore - __dirname exists in CommonJS/Jest environment
    if (typeof __dirname !== 'undefined') {
      return __dirname;
    }
  } catch (e) {
    // Fall through to last resort
  }
  
  // Last resort: use process.cwd() + known path
  // This assumes we're running from the project root
  return path.join(process.cwd(), 'server', 'utils');
}

/**
 * Get the server root directory path
 * 
 * This assumes the helper is located at `/server/utils/file-paths.ts`
 * and returns the `/server` directory path.
 * 
 * @returns Absolute path to the `/server` directory
 */
export function getServerDir(): string {
  const currentDir = getCurrentDir();
  // From /server/utils, go up one level to /server
  return path.dirname(currentDir);
}

/**
 * Resolve a path relative to the server directory
 * 
 * @param relativePath - Path relative to /server directory
 * @returns Absolute path
 * 
 * @example
 * ```typescript
 * // Get path to /server/providers/combined/tools/foo.md
 * const filePath = resolveServerPath('providers/combined/tools/foo.md');
 * ```
 */
export function resolveServerPath(...relativePath: string[]): string {
  return path.join(getServerDir(), ...relativePath);
}
