/**
 * Figma URL Parser
 *
 * Parses and validates Figma URLs for the analyze-figma-scope tool.
 * Wraps the shared parseFigmaUrl helper to handle multiple URLs.
 */

import {
  parseFigmaUrl,
  convertNodeIdToApiFormat,
} from '../../../figma/figma-helpers.js';

/**
 * Parsed Figma URL information
 */
export interface ParsedFigmaUrl {
  /** Original URL */
  originalUrl: string;

  /** Figma file key */
  fileKey: string;

  /** Node ID in API format (with colons) if specified */
  nodeId?: string;

  /** Whether this URL targets a specific node vs the whole file */
  isNodeSpecific: boolean;
}

/**
 * Parse multiple Figma URLs
 *
 * @param urls - Array of Figma URLs to parse
 * @returns Array of parsed URL info objects
 * @throws Error if any URL is invalid
 */
export function parseFigmaUrls(urls: string[]): ParsedFigmaUrl[] {
  if (!urls || urls.length === 0) {
    throw new Error('At least one Figma URL is required');
  }

  const parsed: ParsedFigmaUrl[] = [];

  for (const url of urls) {
    const urlInfo = parseFigmaUrl(url);

    if (!urlInfo) {
      throw new Error(`Invalid Figma URL: ${url}`);
    }

    parsed.push({
      originalUrl: url,
      fileKey: urlInfo.fileKey,
      nodeId: urlInfo.nodeId ? convertNodeIdToApiFormat(urlInfo.nodeId) : undefined,
      isNodeSpecific: !!urlInfo.nodeId,
    });
  }

  return parsed;
}

/**
 * Group parsed URLs by file key
 *
 * Useful when analyzing multiple frames from the same file -
 * we only need to fetch comments once per file.
 *
 * @param parsedUrls - Array of parsed URL info
 * @returns Map of file key to array of node IDs (empty array means whole file)
 */
export function groupUrlsByFileKey(
  parsedUrls: ParsedFigmaUrl[]
): Map<string, ParsedFigmaUrl[]> {
  const byFileKey = new Map<string, ParsedFigmaUrl[]>();

  for (const parsed of parsedUrls) {
    const existing = byFileKey.get(parsed.fileKey) || [];
    existing.push(parsed);
    byFileKey.set(parsed.fileKey, existing);
  }

  return byFileKey;
}

/**
 * Extract unique file keys from parsed URLs
 *
 * @param parsedUrls - Array of parsed URL info
 * @returns Array of unique file keys
 */
export function getUniqueFileKeys(parsedUrls: ParsedFigmaUrl[]): string[] {
  return [...new Set(parsedUrls.map((p) => p.fileKey))];
}
