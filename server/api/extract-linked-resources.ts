/**
 * REST API Handler for Extract Linked Resources
 *
 * Universal URL fetcher — takes a single URL and returns content + discovered links
 * as markdown with YAML frontmatter.
 *
 * Required Headers (depends on URL type):
 *   X-Atlassian-Token: email:api-token — for Jira and Confluence URLs
 *   X-Google-Token: access_token — for Google Docs/Sheets URLs
 *
 * Request body:
 * {
 *   "url": "https://myco.atlassian.net/browse/PROJ-123",
 *   "siteName": "optional — e.g., myco (from myco.atlassian.net)",
 *   "commentsStartAt": 0  // optional — pagination for Jira comments
 * }
 */

import type { Request, Response } from 'express';
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client.js';
import { createAtlassianClient } from '../providers/atlassian/atlassian-api-client.js';
import { resolveCloudId, getJiraIssue } from '../providers/atlassian/atlassian-helpers.js';
import { convertAdfToMarkdown, convertAdfNodesToMarkdown } from '../providers/atlassian/markdown-converter.js';
import { extractAllUrlsFromADF } from '../providers/atlassian/adf-utils.js';
import { parseIssueLinks, parseComments, buildJiraIssueUrl } from '../providers/atlassian/types.js';
import type { JiraIssue, IssueLink } from '../providers/atlassian/types.js';
import {
  parseConfluenceUrl,
  getConfluencePage,
  resolveConfluenceShortLink,
} from '../providers/atlassian/confluence-helpers.js';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { executeDriveDocToMarkdown } from '../providers/google/tools/drive-doc-to-markdown/core-logic.js';
import {
  classifyUrlType,
  classifyUrls,
  extractJiraKeyFromUrl,
  extractSiteNameFromUrl,
  emptyClassifiedLinks,
  mergeClassifiedLinks,
  type ClassifiedUrl,
} from '../providers/combined/tools/extract-linked-resources/url-classifier.js';
import {
  formatJiraResponse,
  formatConfluenceResponse,
  formatGoogleDocResponse,
  formatFigmaResponse,
  formatUnsupportedResponse,
  type JiraResponseData,
  type ConfluenceResponseData,
  type GoogleDocResponseData,
} from '../providers/combined/tools/extract-linked-resources/response-formatter.js';

const COMMENTS_PAGE_SIZE = 20;

export async function handleExtractLinkedResources(req: Request, res: Response): Promise<void> {
  try {
    const { url, siteName, commentsStartAt } = req.body;

    if (!url) {
      res.status(400).json({ success: false, error: 'url is required.' });
      return;
    }

    const urlType = classifyUrlType(url);

    switch (urlType) {
      case 'jira':
      case 'confluence':
        return await handleAtlassianUrl(req, res, url, urlType, siteName, commentsStartAt);
      case 'google-doc':
      case 'google-sheet':
        return await handleGoogleUrl(req, res, url);
      case 'figma':
        res.json({ success: true, content: formatFigmaResponse({ url }) });
        return;
      default:
        res.json({ success: true, content: formatUnsupportedResponse(url) });
        return;
    }
  } catch (error: any) {
    console.error('REST API: extract-linked-resources failed:', error.message);
    if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
      res.status(401).json({ success: false, error: 'Authentication failed.' });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
}

async function handleAtlassianUrl(
  req: Request,
  res: Response,
  url: string,
  urlType: 'jira' | 'confluence',
  siteNameOverride?: string,
  commentsStartAt?: number,
): Promise<void> {
  const atlassianToken = req.headers['x-atlassian-token'] as string | undefined;
  if (!atlassianToken) {
    res.status(401).json({ success: false, error: 'Missing X-Atlassian-Token header (format: email:api-token).' });
    return;
  }

  const [email, ...apiTokenParts] = atlassianToken.split(':');
  const apiToken = apiTokenParts.join(':');
  if (!email || !apiToken) {
    res.status(401).json({ success: false, error: 'X-Atlassian-Token must be in format email:api-token.' });
    return;
  }

  const base64Credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
  const client = createAtlassianClientWithPAT(base64Credentials);

  if (urlType === 'jira') {
    const issueKey = extractJiraKeyFromUrl(url);
    if (!issueKey) {
      res.status(400).json({ success: false, error: `Could not extract issue key from URL: ${url}` });
      return;
    }

    const siteName = siteNameOverride || extractSiteNameFromUrl(url);
    if (!siteName) {
      res.status(400).json({ success: false, error: `Could not determine site name from URL: ${url}. Provide siteName.` });
      return;
    }

    const siteInfo = await resolveCloudId(client, undefined, siteName);
    const issueRes = await getJiraIssue(client, siteInfo.cloudId, issueKey);
    if (issueRes.status === 404) {
      res.status(404).json({ success: false, error: `Issue ${issueKey} not found.` });
      return;
    }
    if (!issueRes.ok) {
      const errText = await issueRes.text();
      res.status(issueRes.status).json({ success: false, error: errText });
      return;
    }
    const issue = await issueRes.json() as JiraIssue;

    const descriptionUrls = issue.fields.description
      ? extractAllUrlsFromADF(issue.fields.description)
      : [];
    const descLinks = classifyUrls(descriptionUrls, 'embedded in description', new Set([issueKey]));

    const issueLinksData = parseIssueLinks(issue.fields.issuelinks);
    const issueLinkEntries = buildJiraRelationshipLinks(issueLinksData, siteName);

    const parentKey = issue.fields.parent?.key;
    if (parentKey) {
      issueLinkEntries.push({
        url: buildJiraIssueUrl(parentKey, siteName),
        type: 'jira',
        relationship: 'parent',
      });
    }

    const allComments = parseComments(issue.fields.comment?.comments);
    const commentsTotal = issue.fields.comment?.total || allComments.length;
    const startIdx = commentsStartAt || 0;
    const pageComments = allComments.slice(startIdx, startIdx + COMMENTS_PAGE_SIZE);
    const commentsIncluded = pageComments.length;
    const hasMoreComments = (startIdx + commentsIncluded) < commentsTotal;

    const commentUrls: string[] = [];
    for (const comment of allComments) {
      const urls = extractAllUrlsFromADF(comment.body);
      commentUrls.push(...urls);
    }
    const commentLinks = classifyUrls(commentUrls, 'mentioned in comments', new Set([issueKey]));

    const commentsMd = pageComments.map(c => ({
      author: c.author,
      body: convertAdfToMarkdown(c.body),
      created: c.created,
    }));

    let discoveredLinks = mergeClassifiedLinks(descLinks, commentLinks);
    for (const entry of issueLinkEntries) {
      if (!discoveredLinks.jira.find(j => j.url === entry.url)) {
        discoveredLinks.jira.push(entry);
      }
    }

    const descriptionMarkdown = issue.fields.description
      ? convertAdfToMarkdown(issue.fields.description)
      : '';

    const responseData: JiraResponseData = {
      url,
      issueKey,
      summary: issue.fields.summary,
      status: issue.fields.status?.name || 'Unknown',
      issueType: issue.fields.issuetype?.name || 'Unknown',
      parentKey,
      descriptionMarkdown: commentsStartAt ? '(See initial response for description)' : descriptionMarkdown,
      comments: commentsMd,
      commentsTotal,
      commentsIncluded,
      hasMoreComments,
      discoveredLinks: commentsStartAt ? emptyClassifiedLinks() : discoveredLinks,
    };

    res.json({ success: true, content: formatJiraResponse(responseData) });

  } else {
    // Confluence
    const parsed = parseConfluenceUrl(url);
    if (!parsed) {
      res.status(400).json({ success: false, error: `Could not parse Confluence URL: ${url}` });
      return;
    }

    const siteName = siteNameOverride || parsed.siteName;
    let pageInfo = parsed;
    if (parsed.wasShortLink) {
      const resolved = await resolveConfluenceShortLink(client, parsed);
      if (!resolved) {
        res.status(400).json({ success: false, error: `Could not resolve Confluence short link: ${url}` });
        return;
      }
      pageInfo = resolved;
    }

    const pageData = await getConfluencePage(client, siteName, pageInfo.pageId);
    const contentMarkdown = convertAdfNodesToMarkdown(pageData.body.content || []);
    const pageUrls = extractAllUrlsFromADF(pageData.body);
    const discoveredLinks = classifyUrls(pageUrls, 'embedded in body');

    const responseData: ConfluenceResponseData = {
      url,
      pageId: pageData.id,
      title: pageData.title,
      spaceKey: pageData.space.key,
      contentMarkdown,
      discoveredLinks,
    };

    res.json({ success: true, content: formatConfluenceResponse(responseData) });
  }
}

async function handleGoogleUrl(req: Request, res: Response, url: string): Promise<void> {
  const googleToken = req.headers['x-google-token'] as string | undefined;
  if (!googleToken) {
    res.status(401).json({ success: false, error: 'Missing X-Google-Token header.' });
    return;
  }

  const googleClient = createGoogleClient(googleToken);
  const result = await executeDriveDocToMarkdown({ url }, googleClient);

  const urlRegex = /https?:\/\/[^\s)>\]"']+/gi;
  const foundUrls = (result.markdown.match(urlRegex) || []).map(u => u.replace(/[,.\]}>)]+$/, '').trim());
  const discoveredLinks = classifyUrls(foundUrls, 'embedded in document');

  const titleMatch = result.markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : 'Untitled Google Doc';

  const responseData: GoogleDocResponseData = {
    url,
    title,
    contentMarkdown: result.markdown,
    discoveredLinks,
  };

  res.json({ success: true, content: formatGoogleDocResponse(responseData) });
}

function buildJiraRelationshipLinks(links: ReturnType<typeof parseIssueLinks>, siteName: string): ClassifiedUrl[] {
  return links.map(link => ({
    url: buildJiraIssueUrl(link.linkedIssueKey, siteName),
    type: 'jira' as const,
    relationship: link.type,
  }));
}
