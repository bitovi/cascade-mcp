/**
 * URL Classification Utilities
 * 
 * Classifies URLs by provider type and extracts identifiers.
 * Adds Google Docs/Sheets support on top of the patterns in link-extractor.ts.
 */

// ============================================================================
// Types
// ============================================================================

export type UrlType = 'jira' | 'confluence' | 'figma' | 'google-doc' | 'google-sheet' | 'other';

export interface ClassifiedUrl {
  url: string;
  type: UrlType;
  /** Where this URL was found */
  context?: string;
  /** Jira-specific relationship (parent, blocks, is-blocked-by, relates-to, etc.) */
  relationship?: string;
}

export interface ClassifiedLinks {
  figma: ClassifiedUrl[];
  confluence: ClassifiedUrl[];
  jira: ClassifiedUrl[];
  googleDocs: ClassifiedUrl[];
  googleSheets: ClassifiedUrl[];
  other: ClassifiedUrl[];
}

// ============================================================================
// URL Type Detection
// ============================================================================

export function classifyUrlType(url: string): UrlType {
  if (isJiraUrl(url)) return 'jira';
  if (isConfluenceUrl(url)) return 'confluence';
  if (isFigmaUrl(url)) return 'figma';
  if (isGoogleDocUrl(url)) return 'google-doc';
  if (isGoogleSheetUrl(url)) return 'google-sheet';
  return 'other';
}

export function isJiraUrl(url: string): boolean {
  return /atlassian\.net\/browse\/[A-Z]+-\d+/i.test(url);
}

export function isConfluenceUrl(url: string): boolean {
  return url.includes('atlassian.net/wiki/');
}

export function isFigmaUrl(url: string): boolean {
  return url.includes('figma.com/');
}

export function isGoogleDocUrl(url: string): boolean {
  return url.includes('docs.google.com/document/');
}

export function isGoogleSheetUrl(url: string): boolean {
  return url.includes('docs.google.com/spreadsheets/');
}

// ============================================================================
// Identifier Extraction
// ============================================================================

/**
 * Extract Jira issue key from a browse URL
 */
export function extractJiraKeyFromUrl(url: string): string | null {
  const match = url.match(/browse\/([A-Z]+-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Extract site name from an Atlassian URL
 */
export function extractSiteNameFromUrl(url: string): string | null {
  const match = url.match(/^https?:\/\/([^.]+)\.atlassian\.net/);
  return match ? match[1] : null;
}

// ============================================================================
// Bulk Classification
// ============================================================================

/**
 * Classify a set of raw URLs into typed groups
 */
export function classifyUrls(
  urls: string[],
  context: string,
  excludeJiraKeys?: Set<string>,
): ClassifiedLinks {
  const result: ClassifiedLinks = {
    figma: [],
    confluence: [],
    jira: [],
    googleDocs: [],
    googleSheets: [],
    other: [],
  };

  for (const url of urls) {
    const type = classifyUrlType(url);
    const entry: ClassifiedUrl = { url, type, context };

    // Skip already-known Jira keys
    if (type === 'jira' && excludeJiraKeys) {
      const key = extractJiraKeyFromUrl(url);
      if (key && excludeJiraKeys.has(key)) continue;
    }

    switch (type) {
      case 'figma': result.figma.push(entry); break;
      case 'confluence': result.confluence.push(entry); break;
      case 'jira': result.jira.push(entry); break;
      case 'google-doc': result.googleDocs.push(entry); break;
      case 'google-sheet': result.googleSheets.push(entry); break;
      default: result.other.push(entry); break;
    }
  }

  return result;
}

/**
 * Merge two ClassifiedLinks objects, deduplicating by URL
 */
export function mergeClassifiedLinks(a: ClassifiedLinks, b: ClassifiedLinks): ClassifiedLinks {
  const dedup = (items: ClassifiedUrl[]): ClassifiedUrl[] => {
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  };

  return {
    figma: dedup([...a.figma, ...b.figma]),
    confluence: dedup([...a.confluence, ...b.confluence]),
    jira: dedup([...a.jira, ...b.jira]),
    googleDocs: dedup([...a.googleDocs, ...b.googleDocs]),
    googleSheets: dedup([...a.googleSheets, ...b.googleSheets]),
    other: dedup([...a.other, ...b.other]),
  };
}

/**
 * Create an empty ClassifiedLinks object
 */
export function emptyClassifiedLinks(): ClassifiedLinks {
  return { figma: [], confluence: [], jira: [], googleDocs: [], googleSheets: [], other: [] };
}
