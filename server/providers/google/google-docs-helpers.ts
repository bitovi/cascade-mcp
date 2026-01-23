/**
 * Google Docs Helpers
 * 
 * Utilities for extracting Google Docs URLs from Jira ADF content,
 * parsing document IDs, and validating MIME types.
 * 
 * Pattern: Mirrors confluence-helpers.ts for consistency.
 */

import { extractUrlsFromADF } from '../atlassian/adf-utils.js';
import type { ADFDocument } from '../atlassian/markdown-converter.js';
import {
  parseGoogleDriveUrl,
  GOOGLE_DOCS_URL_PATTERN,
  GOOGLE_DOCS_PLAIN_TEXT_REGEX,
} from './tools/drive-doc-to-markdown/url-parser.js';

// ============================================================================
// URL Extraction
// ============================================================================

/**
 * Extract Google Docs URLs from an ADF document
 * 
 * Only matches Google Docs URLs (docs.google.com/document/...), 
 * not Sheets, Slides, or other Drive files.
 * 
 * @param adf - ADF document to search
 * @returns Array of unique Google Docs URLs found in the document
 * 
 * @example
 * ```typescript
 * const adf = epicDescription; // From Jira API
 * const googleDocsUrls = extractGoogleDocsUrlsFromADF(adf);
 * // ['https://docs.google.com/document/d/abc123/edit', ...]
 * ```
 */
export function extractGoogleDocsUrlsFromADF(adf: ADFDocument): string[] {
  return extractUrlsFromADF(adf, {
    urlPattern: GOOGLE_DOCS_URL_PATTERN,
    plainTextRegex: GOOGLE_DOCS_PLAIN_TEXT_REGEX,
  });
}

// ============================================================================
// URL Parsing
// ============================================================================

/**
 * Parse a Google Docs URL to extract the document ID
 * 
 * Wraps the existing parseGoogleDriveUrl function but returns null
 * instead of throwing on invalid URLs. Also validates that the URL
 * is specifically for a Google Doc (not Sheets/Slides).
 * 
 * Supported formats:
 * - Standard: https://docs.google.com/document/d/{id}/edit
 * - Mobile: https://docs.google.com/document/u/0/d/{id}/mobilebasic
 * - Direct: https://docs.google.com/document/d/{id}
 * - With query params: https://docs.google.com/document/d/{id}/edit?usp=sharing
 * 
 * @param url - Google Docs URL to parse
 * @returns Object with documentId, or null if URL is invalid or not a Google Doc
 * 
 * @example
 * ```typescript
 * const result = parseGoogleDocUrl('https://docs.google.com/document/d/abc123/edit');
 * // { documentId: 'abc123' }
 * 
 * const invalid = parseGoogleDocUrl('https://docs.google.com/spreadsheets/d/xyz/edit');
 * // null (not a Google Doc)
 * ```
 */
export function parseGoogleDocUrl(url: string): { documentId: string } | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // First, verify this is a Google Docs URL (not Sheets, Slides, etc.)
  if (!url.includes('docs.google.com/document')) {
    return null;
  }

  try {
    return parseGoogleDriveUrl(url);
  } catch {
    return null;
  }
}

// ============================================================================
// MIME Type Validation
// ============================================================================

/** Google Docs MIME type constant */
export const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

/**
 * Check if a MIME type is a Google Doc
 * 
 * Returns true only for Google Docs, not for:
 * - Google Sheets (application/vnd.google-apps.spreadsheet)
 * - Google Slides (application/vnd.google-apps.presentation)
 * - Google Drive folders (application/vnd.google-apps.folder)
 * - Other file types
 * 
 * @param mimeType - MIME type string from Drive API
 * @returns true if the file is a Google Doc
 * 
 * @example
 * ```typescript
 * const metadata = await getDocumentMetadata(client, documentId);
 * if (!isGoogleDoc(metadata.mimeType)) {
 *   console.warn('Not a Google Doc, skipping...');
 *   return;
 * }
 * ```
 */
export function isGoogleDoc(mimeType: string): boolean {
  return mimeType === GOOGLE_DOC_MIME_TYPE;
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Deduplicate URLs by document ID
 * 
 * Multiple URLs may point to the same document (e.g., /edit vs /view).
 * This function keeps only the first occurrence of each unique document ID.
 * 
 * @param urls - Array of Google Docs URLs
 * @returns Deduplicated array of URLs (first occurrence preserved)
 * 
 * @example
 * ```typescript
 * const urls = [
 *   'https://docs.google.com/document/d/abc123/edit',
 *   'https://docs.google.com/document/d/xyz456/edit',
 *   'https://docs.google.com/document/d/abc123/view', // Duplicate
 * ];
 * const unique = deduplicateByDocumentId(urls);
 * // ['https://docs.google.com/document/d/abc123/edit', 'https://docs.google.com/document/d/xyz456/edit']
 * ```
 */
export function deduplicateByDocumentId(urls: string[]): string[] {
  const seenIds = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    const parsed = parseGoogleDocUrl(url);
    
    if (!parsed) {
      // Skip URLs that cannot be parsed
      continue;
    }

    if (!seenIds.has(parsed.documentId)) {
      seenIds.add(parsed.documentId);
      result.push(url);
    }
  }

  return result;
}
