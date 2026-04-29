/**
 * Extract Linked Resources Tool
 * 
 * Universal "fetch any URL → return content + discovered links" tool.
 * Takes a single URL (Jira, Confluence, Google Doc, Google Sheet),
 * fetches the content, extracts all embedded URLs, and returns
 * markdown-with-frontmatter that the agent writes to disk as-is.
 * 
 * Supports Jira comment pagination via commentsStartAt parameter.
 */

import { z } from 'zod';
import { logger } from '../../../../observability/logger.ts';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.ts';
import { createAtlassianClientFromAuth } from '../../../atlassian/atlassian-api-client.ts';
import { resolveCloudId, getJiraIssue } from '../../../atlassian/atlassian-helpers.ts';
import { convertAdfToMarkdown } from '../../../atlassian/markdown-converter.ts';
import { extractAllUrlsFromADF } from '../../../atlassian/adf-utils.ts';
import {
  parseConfluenceUrl,
  getConfluencePage,
  resolveConfluenceShortLink,
} from '../../../atlassian/confluence-helpers.ts';
import { convertAdfNodesToMarkdown } from '../../../atlassian/markdown-converter.ts';
import { createGoogleClient } from '../../../google/google-api-client.ts';
import { executeDriveDocToMarkdown } from '../../../google/tools/drive-doc-to-markdown/core-logic.ts';
import type { JiraIssue, IssueLink, IssueComment } from '../../../atlassian/types.ts';
import { parseIssueLinks, parseComments, buildJiraIssueUrl } from '../../../atlassian/types.ts';
import type { McpServer } from '../../../../mcp-core/mcp-types.ts';
import {
  classifyUrlType,
  classifyUrls,
  extractJiraKeyFromUrl,
  extractSiteNameFromUrl,
  emptyClassifiedLinks,
  mergeClassifiedLinks,
  type ClassifiedLinks,
  type ClassifiedUrl,
} from './url-classifier.ts';
import {
  formatJiraResponse,
  formatConfluenceResponse,
  formatGoogleDocResponse,
  formatFigmaResponse,
  formatUnsupportedResponse,
  type JiraResponseData,
  type ConfluenceResponseData,
  type GoogleDocResponseData,
} from './response-formatter.ts';

// ============================================================================
// Constants
// ============================================================================

/** Maximum comments to include per page (Jira API default is also 20) */
const COMMENTS_PAGE_SIZE = 20;

/** Helper to build a properly typed MCP text response */
function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

// ============================================================================
// Tool Parameters
// ============================================================================

interface ExtractLinkedResourcesParams {
  url: string;
  siteName?: string;
  commentsStartAt?: number;
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerExtractLinkedResourcesTool(mcp: McpServer): void {
  mcp.registerTool(
    'extract-linked-resources',
    {
      title: 'Extract Linked Resources',
      description:
        'Fetch a URL (Jira issue, Confluence page, Google Doc) and return its content as markdown with YAML frontmatter. ' +
        'Automatically discovers and classifies all embedded links (Figma, Confluence, Jira, Google Docs). ' +
        'For Jira issues, also discovers parent/blocker relationships from issue links. ' +
        'Returns paginated comments for Jira issues. ' +
        'The response can be saved directly to .temp/cascade/context/ as a markdown file.',
      inputSchema: {
        url: z.string().describe(
          'URL to fetch. Supports: Jira issues (https://site.atlassian.net/browse/PROJ-123), ' +
          'Confluence pages (https://site.atlassian.net/wiki/...), ' +
          'Google Docs (https://docs.google.com/document/...). ' +
          'For Figma URLs, returns a message to use figma-batch-load instead.'
        ),
        siteName: z.string().optional().describe(
          'Atlassian site name (e.g., "mycompany" from mycompany.atlassian.net). ' +
          'Auto-detected from URL if possible.'
        ),
        commentsStartAt: z.number().optional().describe(
          'Pagination offset for Jira comments. Use when hasMoreComments is true in a previous response. ' +
          'When provided, returns only the comments section (no description).'
        ),
      },
    },
    async (params: ExtractLinkedResourcesParams, context) => {
      const { url, siteName, commentsStartAt } = params;

      logger.info('extract-linked-resources called', { url, siteName, commentsStartAt });

      try {
        const urlType = classifyUrlType(url);

        switch (urlType) {
          case 'jira':
            return await handleJiraUrl(url, siteName, commentsStartAt, context);
          case 'confluence':
            return await handleConfluenceUrl(url, siteName, context);
          case 'google-doc':
          case 'google-sheet':
            return await handleGoogleDocUrl(url, context);
          case 'figma':
            return textResult(formatFigmaResponse({ url }));
          default:
            return textResult(formatUnsupportedResponse(url));
        }
      } catch (err: any) {
        if (err.constructor?.name === 'InvalidTokenError') throw err;
        logger.error('extract-linked-resources error:', err);
        return textResult(`Error fetching ${url}: ${err.message}`);
      }
    },
  );
}

// ============================================================================
// Jira Handler
// ============================================================================

async function handleJiraUrl(
  url: string,
  siteNameOverride: string | undefined,
  commentsStartAt: number | undefined,
  context: any,
) {
  const authInfo = getAuthInfoSafe(context, 'extract-linked-resources');
  const token = authInfo?.atlassian?.access_token;
  if (!token) {
    return textResult('Error: No Atlassian access token. Please authenticate first.');
  }

  const issueKey = extractJiraKeyFromUrl(url);
  if (!issueKey) {
    return textResult(`Error: Could not extract issue key from URL: ${url}`);
  }

  const siteName = siteNameOverride || extractSiteNameFromUrl(url);
  if (!siteName) {
    return textResult(`Error: Could not determine site name from URL: ${url}. Please provide siteName parameter.`);
  }

  const client = createAtlassianClientFromAuth(authInfo.atlassian!, siteName);
  const siteInfo = await resolveCloudId(client, undefined, siteName);
  const cloudId = siteInfo.cloudId;

  // Fetch the issue
  const issueRes = await getJiraIssue(client, cloudId, issueKey);
  if (issueRes.status === 404) {
    return textResult(`Issue ${issueKey} not found.`);
  }
  if (!issueRes.ok) {
    const errText = await issueRes.text();
    return textResult(`Error fetching ${issueKey}: ${issueRes.status} - ${errText}`);
  }
  const issue = await issueRes.json() as JiraIssue;

  // Extract links from description
  const descriptionUrls = issue.fields.description
    ? extractAllUrlsFromADF(issue.fields.description)
    : [];
  const descLinks = classifyUrls(descriptionUrls, 'embedded in description', new Set([issueKey]));

  // Extract links from issue links (parent, blockers, related)
  const issueLinksData = parseIssueLinks(issue.fields.issuelinks);
  const issueLinkEntries = buildJiraRelationshipLinks(issueLinksData, siteName);

  // Parent issue
  const parentKey = issue.fields.parent?.key;
  if (parentKey) {
    issueLinkEntries.push({
      url: buildJiraIssueUrl(parentKey, siteName),
      type: 'jira',
      relationship: 'parent',
    });
  }

  // Process comments
  const allComments = parseComments(issue.fields.comment?.comments);
  const commentsTotal = issue.fields.comment?.total || allComments.length;
  const startIdx = commentsStartAt || 0;
  const pageComments = allComments.slice(startIdx, startIdx + COMMENTS_PAGE_SIZE);
  const commentsIncluded = pageComments.length;
  const hasMoreComments = (startIdx + commentsIncluded) < commentsTotal;

  // Extract links from comments
  const commentUrls: string[] = [];
  for (const comment of allComments) {
    const urls = extractAllUrlsFromADF(comment.body);
    commentUrls.push(...urls);
  }
  const commentLinks = classifyUrls(commentUrls, 'mentioned in comments', new Set([issueKey]));

  // Convert comments to markdown
  const commentsMd = pageComments.map(c => ({
    author: c.author,
    body: convertAdfToMarkdown(c.body),
    created: c.created,
  }));

  // Merge all discovered links
  let discoveredLinks = mergeClassifiedLinks(descLinks, commentLinks);

  // Add relationship-based Jira links
  for (const entry of issueLinkEntries) {
    const existing = discoveredLinks.jira.find(j => j.url === entry.url);
    if (!existing) {
      discoveredLinks.jira.push(entry);
    }
  }

  // Convert description to markdown
  const descriptionMarkdown = issue.fields.description
    ? convertAdfToMarkdown(issue.fields.description)
    : '';

  // If this is a comments-only pagination request, return just comments
  if (commentsStartAt !== undefined && commentsStartAt > 0) {
    return textResult(formatJiraResponse({
      url,
      issueKey,
      summary: issue.fields.summary,
      status: issue.fields.status?.name || 'Unknown',
      issueType: issue.fields.issuetype?.name || 'Unknown',
      parentKey,
      descriptionMarkdown: '(See initial response for description)',
      comments: commentsMd,
      commentsTotal,
      commentsIncluded,
      hasMoreComments,
      discoveredLinks: emptyClassifiedLinks(), // Links already returned in first call
    }));
  }

  const responseData: JiraResponseData = {
    url,
    issueKey,
    summary: issue.fields.summary,
    status: issue.fields.status?.name || 'Unknown',
    issueType: issue.fields.issuetype?.name || 'Unknown',
    parentKey,
    descriptionMarkdown,
    comments: commentsMd,
    commentsTotal,
    commentsIncluded,
    hasMoreComments,
    discoveredLinks,
  };

  return textResult(formatJiraResponse(responseData));
}

// ============================================================================
// Confluence Handler
// ============================================================================

async function handleConfluenceUrl(
  url: string,
  siteNameOverride: string | undefined,
  context: any,
) {
  const authInfo = getAuthInfoSafe(context, 'extract-linked-resources');
  const token = authInfo?.atlassian?.access_token;
  if (!token) {
    return textResult('Error: No Atlassian access token. Please authenticate first.');
  }

  const parsed = parseConfluenceUrl(url);
  if (!parsed) {
    return textResult(`Error: Could not parse Confluence URL: ${url}`);
  }

  const siteName = siteNameOverride || parsed.siteName;
  const client = createAtlassianClientFromAuth(authInfo.atlassian!, siteName);

  // Resolve short links if needed
  let pageInfo = parsed;
  if (parsed.wasShortLink) {
    const resolved = await resolveConfluenceShortLink(client, parsed);
    if (!resolved) {
      return textResult(`Error: Could not resolve Confluence short link: ${url}`);
    }
    pageInfo = resolved;
  }

  // Fetch the page
  const pageData = await getConfluencePage(client, siteName, pageInfo.pageId);

  // Convert body to markdown
  const contentMarkdown = convertAdfNodesToMarkdown(pageData.body.content || []);

  // Extract links from page body
  const pageUrls = extractAllUrlsFromADF(pageData.body);
  const discoveredLinks = classifyUrls(pageUrls, 'embedded in body');

  // Add parent page as a discovered link if ancestors are available
  // (Note: v2 API doesn't return ancestors directly; would need separate call.
  //  For v1, we'd check pageData.ancestors. Skip for now.)

  const responseData: ConfluenceResponseData = {
    url,
    pageId: pageData.id,
    title: pageData.title,
    spaceKey: pageData.space.key,
    contentMarkdown,
    discoveredLinks,
  };

  return textResult(formatConfluenceResponse(responseData));
}

// ============================================================================
// Google Doc Handler
// ============================================================================

async function handleGoogleDocUrl(url: string, context: any) {
  const authInfo = getAuthInfoSafe(context, 'extract-linked-resources');
  const googleToken = authInfo?.google?.access_token;
  if (!googleToken) {
    return textResult('Error: No Google access token. Please authenticate with Google first.');
  }

  const googleClient = createGoogleClient(googleToken);
  const result = await executeDriveDocToMarkdown({ url }, googleClient);

  // Extract URLs from the markdown content
  const urlRegex = /https?:\/\/[^\s)>\]"']+/gi;
  const foundUrls = (result.markdown.match(urlRegex) || []).map(u => u.replace(/[,.\]}>)]+$/, '').trim());
  const discoveredLinks = classifyUrls(foundUrls, 'embedded in document');

  // Try to extract title from first heading
  const titleMatch = result.markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : 'Untitled Google Doc';

  const responseData: GoogleDocResponseData = {
    url,
    title,
    contentMarkdown: result.markdown,
    discoveredLinks,
  };

  return textResult(formatGoogleDocResponse(responseData));
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert Jira issue links into ClassifiedUrl entries with relationships
 */
function buildJiraRelationshipLinks(links: IssueLink[], siteName: string): ClassifiedUrl[] {
  return links.map(link => ({
    url: buildJiraIssueUrl(link.linkedIssueKey, siteName),
    type: 'jira' as const,
    relationship: link.type, // e.g., "Blocks", "is blocked by", "relates to"
  }));
}
