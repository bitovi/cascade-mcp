/**
 * URL Parser for Google Drive Documents
 * 
 * Parses Google Drive document URLs in various formats and extracts document IDs.
 * Supports standard sharing URLs, mobile URLs, and bare document IDs.
 * 
 * This module is the single source of truth for all Google Docs URL patterns.
 */

// ============================================================================
// URL Pattern Constants
// ============================================================================

/**
 * URL pattern for matching Google Docs URLs (used for substring matching)
 * Matches: docs.google.com/document/...
 * Does NOT match: docs.google.com/spreadsheets/... or docs.google.com/presentation/...
 */
export const GOOGLE_DOCS_URL_PATTERN = 'docs.google.com/document';

/**
 * Regex for extracting Google Docs URLs from plain text
 * Used by extractGoogleDocsUrlsFromADF to find URLs in ADF content.
 * 
 * Character class excludes common URL terminators: whitespace, ), >, ], ", '
 */
export const GOOGLE_DOCS_PLAIN_TEXT_REGEX = /https?:\/\/docs\.google\.com\/document\/[^\s)>\]"']+/g;

/**
 * Parse a Google Drive document URL or ID and extract the document ID
 * 
 * Supported formats:
 * 1. Standard sharing URL: https://docs.google.com/document/d/{id}/edit
 * 2. Mobile/app URL: https://docs.google.com/document/u/0/d/{id}/mobilebasic
 * 3. Bare document ID: {id} (25-44 alphanumeric characters with underscores/hyphens)
 * 
 * @param input - Google Drive URL or document ID
 * @returns Object containing the extracted document ID
 * @throws Error if input format is invalid
 * 
 * @example
 * parseGoogleDriveUrl("https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit")
 * // Returns: { documentId: "1a2b3c4d5e6f7g8h9i0j" }
 * 
 * @example
 * parseGoogleDriveUrl("1a2b3c4d5e6f7g8h9i0j")
 * // Returns: { documentId: "1a2b3c4d5e6f7g8h9i0j" }
 */
export function parseGoogleDriveUrl(input: string): { documentId: string } {
  console.log('Parsing Google Drive URL');
  
  // Remove whitespace
  const trimmed = input.trim();
  
  console.log('  Trimmed input:', trimmed.substring(0, 100));
  
  // Pattern 1: Standard sharing URL - https://docs.google.com/document/d/{id}/...
  let match = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const documentId = match[1];
    console.log('  Matched standard URL format, extracted ID:', documentId);
    return { documentId };
  }
  
  // Pattern 2: Mobile/app URL - https://docs.google.com/document/u/{userId}/d/{id}/...
  match = trimmed.match(/\/document\/u\/\d+\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const documentId = match[1];
    console.log('  Matched mobile URL format, extracted ID:', documentId);
    return { documentId };
  }
  
  // Pattern 3: Bare document ID (25-44 characters, alphanumeric + underscore + hyphen)
  if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
    console.log('  Matched bare document ID format');
    return { documentId: trimmed };
  }
  
  // No patterns matched - provide helpful error message
  console.log('  No patterns matched, input invalid');
  throw new Error(
    `Invalid Google Drive URL format. Expected formats:\n` +
    `  - https://docs.google.com/document/d/{id}/edit\n` +
    `  - https://docs.google.com/document/u/0/d/{id}/mobilebasic\n` +
    `  - {documentId} (bare ID, 25+ characters)\n` +
    `Received: ${trimmed.substring(0, 100)}${trimmed.length > 100 ? '...' : ''}`
  );
}
