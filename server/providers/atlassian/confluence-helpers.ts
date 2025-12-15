/**
 * Confluence Helpers
 * 
 * Utilities for extracting Confluence URLs from Jira ADF content and
 * fetching Confluence page data via the REST API.
 */

import type { AtlassianClient } from './atlassian-api-client.js';
import type { ADFDocument } from './markdown-converter.js';
import { extractConfluenceUrlsFromADF as extractConfluenceUrlsGeneric } from './adf-utils.js';
import { resolveCloudId } from './atlassian-helpers.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed information from a Confluence URL
 */
export interface ConfluenceUrlInfo {
  /** Original URL */
  url: string;
  /** Atlassian site name (e.g., "mycompany" from "mycompany.atlassian.net") */
  siteName: string;
  /** Confluence page ID */
  pageId: string;
  /** Space key (if present in URL) */
  spaceKey?: string;
  /** Whether this was a short link that needed resolution */
  wasShortLink: boolean;
}

/**
 * Confluence page data from the API
 */
export interface ConfluencePageData {
  /** Page ID */
  id: string;
  /** Page title */
  title: string;
  /** Page body in ADF format (same structure as Jira descriptions) */
  body: ADFDocument;
  /** Version information */
  version: {
    /** Version number */
    number: number;
    /** ISO 8601 timestamp of when this version was created (last modified) */
    createdAt: string;
    /** Optional version message/comment */
    message?: string;
    /** Whether this was a minor edit */
    minorEdit: boolean;
    /** Author's account ID */
    authorId: string;
  };
  /** Space information */
  space: {
    /** Space ID */
    id: string;
    /** Space key (e.g., "PROJ") */
    key?: string;
  };
}

// ============================================================================
// URL Parsing
// ============================================================================

/**
 * Regular expressions for Confluence URL patterns
 */
const CONFLUENCE_URL_PATTERNS = {
  // Full page URL: https://sitename.atlassian.net/wiki/spaces/SPACEKEY/pages/123456/Page+Title
  fullPage: /^https?:\/\/([^.]+)\.atlassian\.net\/wiki\/spaces\/([^/]+)\/pages\/(\d+)/,
  
  // Short link: https://sitename.atlassian.net/wiki/x/ABC123
  shortLink: /^https?:\/\/([^.]+)\.atlassian\.net\/wiki\/x\/([A-Za-z0-9_-]+)/,
  
  // Alternative page URL without space: https://sitename.atlassian.net/wiki/pages/123456
  altPage: /^https?:\/\/([^.]+)\.atlassian\.net\/wiki\/pages\/(\d+)/,
  
  // Generic pattern to detect any Confluence URL
  generic: /atlassian\.net\/wiki\//,
};

/**
 * Parse a Confluence URL to extract site name, page ID, and space key
 * 
 * Supports multiple URL formats:
 * - Full: https://site.atlassian.net/wiki/spaces/SPACE/pages/123456/Title
 * - Short: https://site.atlassian.net/wiki/x/ABC123 (requires resolution)
 * - Alt: https://site.atlassian.net/wiki/pages/123456
 * 
 * @param url - Confluence URL to parse
 * @returns Parsed URL info or null if not a valid Confluence URL
 */
export function parseConfluenceUrl(url: string): ConfluenceUrlInfo | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Try full page URL pattern
  const fullMatch = url.match(CONFLUENCE_URL_PATTERNS.fullPage);
  if (fullMatch) {
    return {
      url,
      siteName: fullMatch[1],
      spaceKey: fullMatch[2],
      pageId: fullMatch[3],
      wasShortLink: false,
    };
  }

  // Try short link pattern (will need resolution later)
  const shortMatch = url.match(CONFLUENCE_URL_PATTERNS.shortLink);
  if (shortMatch) {
    return {
      url,
      siteName: shortMatch[1],
      pageId: shortMatch[2], // This is actually the short ID, not the real page ID
      spaceKey: undefined,
      wasShortLink: true,
    };
  }

  // Try alternative page URL pattern
  const altMatch = url.match(CONFLUENCE_URL_PATTERNS.altPage);
  if (altMatch) {
    return {
      url,
      siteName: altMatch[1],
      pageId: altMatch[2],
      spaceKey: undefined,
      wasShortLink: false,
    };
  }

  return null;
}

/**
 * Check if a URL is a Confluence URL
 * 
 * @param url - URL to check
 * @returns true if this is a Confluence URL
 */
export function isConfluenceUrl(url: string): boolean {
  return CONFLUENCE_URL_PATTERNS.generic.test(url);
}

// ============================================================================
// ADF Extraction
// ============================================================================

/**
 * Extract all Confluence URLs from an ADF (Atlassian Document Format) document
 * 
 * Searches through:
 * - inlineCard nodes (embedded links)
 * - text nodes with link marks
 * - plain text URLs (fallback regex)
 * 
 * @param adf - The ADF document to parse
 * @returns Array of unique Confluence URLs found
 */
export function extractConfluenceUrlsFromADF(adf: ADFDocument): string[] {
  return extractConfluenceUrlsGeneric(adf);
}

// ============================================================================
// Short Link Resolution
// ============================================================================

/** Cache for resolved short links (shortId -> resolved URL info) */
const shortLinkCache = new Map<string, ConfluenceUrlInfo>();

/**
 * Resolve a Confluence short link to get the actual page ID
 * 
 * Short links (e.g., /wiki/x/ABC123) redirect to full page URLs.
 * This function follows the redirect to extract the real page ID.
 * 
 * @param client - Atlassian client for making requests
 * @param shortLinkInfo - Parsed short link info
 * @returns Resolved URL info with actual page ID, or null if resolution fails
 */
export async function resolveConfluenceShortLink(
  client: AtlassianClient,
  shortLinkInfo: ConfluenceUrlInfo
): Promise<ConfluenceUrlInfo | null> {
  if (!shortLinkInfo.wasShortLink) {
    return shortLinkInfo; // Not a short link, return as-is
  }

  // Check cache first
  const cacheKey = `${shortLinkInfo.siteName}:${shortLinkInfo.pageId}`;
  const cached = shortLinkCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Make a HEAD request to follow the redirect
    const response = await client.fetch(shortLinkInfo.url, {
      method: 'HEAD',
      redirect: 'follow',
    });

    // Get the final URL after redirects
    const finalUrl = response.url;
    
    // Parse the final URL to get the real page ID
    const resolvedInfo = parseConfluenceUrl(finalUrl);
    
    if (resolvedInfo && !resolvedInfo.wasShortLink) {
      // Update with original URL for reference
      resolvedInfo.url = shortLinkInfo.url;
      
      // Cache the result
      shortLinkCache.set(cacheKey, resolvedInfo);
      
      return resolvedInfo;
    }

    console.log(`  ⚠️  Could not resolve Confluence short link: ${shortLinkInfo.url}`);
    return null;
  } catch (error: any) {
    console.log(`  ⚠️  Error resolving Confluence short link: ${error.message}`);
    return null;
  }
}

// ============================================================================
// Confluence API
// ============================================================================

/**
 * Fetch a Confluence page by ID
 * 
 * Uses the Confluence v2 API with atlas_doc_format to get ADF content
 * (same format as Jira descriptions, allowing reuse of convertAdfToMarkdown).
 * 
 * For OAuth tokens, this routes through the Atlassian API gateway using cloud ID.
 * For PAT tokens, this uses direct site URLs.
 * 
 * @param client - Atlassian client for authentication
 * @param siteName - Site name (e.g., "mycompany" for mycompany.atlassian.net)
 * @param pageId - Confluence page ID
 * @returns Page data including ADF body
 */
export async function getConfluencePage(
  client: AtlassianClient,
  siteName: string,
  pageId: string
): Promise<ConfluencePageData> {
  console.log(`  📄 Fetching Confluence page: ${pageId} from ${siteName}`);

  // Resolve cloud ID from site name
  const siteInfo = await resolveCloudId(client, undefined, siteName);
  const baseUrl = client.getConfluenceBaseUrl(siteInfo.cloudId);
  const url = `${baseUrl}/pages/${pageId}?body-format=atlas_doc_format`;

  console.log(`    🔗 API URL: ${url.substring(0, 80)}...`);

  const response = await client.fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Confluence page ${pageId}: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Parse the response into our structure
  const pageData: ConfluencePageData = {
    id: data.id,
    title: data.title,
    body: data.body?.atlas_doc_format?.value 
      ? JSON.parse(data.body.atlas_doc_format.value) 
      : { version: 1, type: 'doc', content: [] },
    version: {
      number: data.version?.number ?? 1,
      createdAt: data.version?.createdAt ?? new Date().toISOString(),
      message: data.version?.message,
      minorEdit: data.version?.minorEdit ?? false,
      authorId: data.version?.authorId ?? '',
    },
    space: {
      id: data.spaceId ?? '',
      key: undefined, // Space key not directly in v2 response, would need separate call
    },
  };

  console.log(`    ✅ Fetched: "${pageData.title}" (version ${pageData.version.number})`);

  return pageData;
}

/**
 * Fetch page metadata only (for cache validation)
 * 
 * Lighter weight than full page fetch - only gets version info.
 * 
 * @param client - Atlassian client
 * @param siteName - Site name (e.g., "mycompany" for mycompany.atlassian.net)
 * @param pageId - Confluence page ID
 * @returns Version info with lastModified timestamp
 */
export async function getConfluencePageVersion(
  client: AtlassianClient,
  siteName: string,
  pageId: string
): Promise<{ lastModified: string; versionNumber: number }> {
  // Resolve cloud ID from site name
  const siteInfo = await resolveCloudId(client, undefined, siteName);
  const baseUrl = client.getConfluenceBaseUrl(siteInfo.cloudId);
  // Fetch without body to reduce payload
  const url = `${baseUrl}/pages/${pageId}`;

  const response = await client.fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Confluence page version ${pageId}: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    lastModified: data.version?.createdAt ?? new Date().toISOString(),
    versionNumber: data.version?.number ?? 1,
  };
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Extract and parse all Confluence URLs from an ADF document
 * 
 * Returns parsed URL info for each valid Confluence URL found.
 * Short links are identified but not resolved (call resolveConfluenceShortLink separately).
 * 
 * @param adf - ADF document to extract from
 * @returns Array of parsed Confluence URL info
 */
export function extractAndParseConfluenceUrls(adf: ADFDocument): ConfluenceUrlInfo[] {
  const urls = extractConfluenceUrlsFromADF(adf);
  const parsedUrls: ConfluenceUrlInfo[] = [];

  for (const url of urls) {
    const parsed = parseConfluenceUrl(url);
    if (parsed) {
      parsedUrls.push(parsed);
    } else {
      console.log(`  ⚠️  Could not parse Confluence URL: ${url}`);
    }
  }

  return parsedUrls;
}

/**
 * Resolve all short links in a list of parsed URLs
 * 
 * @param client - Atlassian client
 * @param urlInfos - Parsed URL infos (may include short links)
 * @returns Array of resolved URL infos (short links resolved to real page IDs)
 */
export async function resolveAllShortLinks(
  client: AtlassianClient,
  urlInfos: ConfluenceUrlInfo[]
): Promise<ConfluenceUrlInfo[]> {
  const resolved: ConfluenceUrlInfo[] = [];

  for (const info of urlInfos) {
    if (info.wasShortLink) {
      const resolvedInfo = await resolveConfluenceShortLink(client, info);
      if (resolvedInfo) {
        resolved.push(resolvedInfo);
      }
      // Skip unresolved short links
    } else {
      resolved.push(info);
    }
  }

  // Deduplicate by page ID (short links might resolve to same page as full links)
  const seenPageIds = new Set<string>();
  return resolved.filter(info => {
    if (seenPageIds.has(info.pageId)) {
      return false;
    }
    seenPageIds.add(info.pageId);
    return true;
  });
}
