/**
 * Atlassian API interaction helpers
 * Extracted from auth-helpers.js for better separation of concerns
 */

import { logger } from '../../observability/logger.ts';
import { sanitizeObjectWithJWTs } from '../../tokens.ts';
import type { ADFDocument } from './markdown-converter.ts';
import { convertMarkdownToAdf } from './markdown-converter.ts';
import type { AtlassianClient } from './atlassian-api-client.js';

// Atlassian site information structure
export interface AtlassianSite {
  id: string;
  name: string;
  url: string;
  scopes?: string[];
  avatarUrl?: string;
}

// Response from Atlassian accessible-resources API
export type AtlassianAccessibleResourcesResponse = AtlassianSite[];

// Resolved site information
export interface ResolvedSiteInfo {
  cloudId: string;
  siteName: string;
  siteUrl: string;
}

// Result from adding a comment to a Jira issue
export interface CommentResult {
  commentId: string;
  response: Response;
}

/**
 * Helper function to safely log token information without exposing sensitive data
 * @param token - The token to log info about
 * @param prefix - Prefix for the log entry
 * @returns Safe token info for logging
 */
function getTokenLogInfo(token?: string, prefix: string = 'Token'): Record<string, any> {
  if (!token) {
    return { [`${prefix.toLowerCase()}Available`]: false };
  }
  
  return {
    [`${prefix.toLowerCase()}Available`]: true,
    [`${prefix.toLowerCase()}Prefix`]: token.substring(0, 20) + '...',
    [`${prefix.toLowerCase()}Length`]: token.length,
    [`${prefix.toLowerCase()}LastFour`]: '...' + token.slice(-4),
  };
}

/**
 * Handle Jira API errors from HTTP responses
 * @param response - The fetch response object
 * @param operation - Description of the operation for logging
 * @throws Error if response indicates any failure (401, 403, 404, 500, etc.)
 */
export function handleJiraAuthError(response: Response, operation: string): void {
  if (response.status === 401) {
    logger.error(`Jira API authentication failed for operation: ${operation}`, {
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Jira authentication failed for ${operation}. Please re-authenticate.`);
  }
  
  if (response.status === 403) {
    logger.error(`Jira API authorization failed for operation: ${operation}`, {
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Jira authorization failed for ${operation}. Insufficient permissions.`);
  }
  
  if (!response.ok) {
    logger.error(`Jira API request failed for operation: ${operation}`, {
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Jira API request failed for ${operation}: ${response.status} ${response.statusText}`);
  }
}

/**
 * Utility function to resolve cloud ID from either explicit cloudId or siteName
 * @param token - Atlassian access token
 * @param cloudId - Explicit cloud ID to use
 * @param siteName - Site name to search for
 * @returns Resolved site information
 * @throws Error if no sites are accessible or site name not found
 */
export async function resolveCloudId(
  client: AtlassianClient,
  cloudId?: string, 
  siteName?: string
): Promise<ResolvedSiteInfo> {
  logger.info('Starting cloud ID resolution', {
    providedCloudId: cloudId,
    providedSiteName: siteName,
  });

  // If cloudId is provided, return it directly (skip API call for efficiency)
  if (cloudId) {
    logger.info('Using provided cloudId', { cloudId });
    return { cloudId, siteName: 'unknown', siteUrl: 'unknown' };
  }

  // Need to fetch accessible sites
  logger.info('Fetching accessible sites from Atlassian API', { 
    reason: siteName ? 'siteName lookup' : 'auto-detection',
    siteName: siteName || 'none',
    apiUrl: 'https://api.atlassian.com/oauth/token/accessible-resources',
  });
  
  const siteRes = await client.fetch('https://api.atlassian.com/oauth/token/accessible-resources');

  logger.info('Atlassian accessible-resources API response', {
    status: siteRes.status,
    statusText: siteRes.statusText,
    contentType: siteRes.headers.get('content-type'),
    operation: 'Fetch accessible sites',
  });

  handleJiraAuthError(siteRes, 'Fetch accessible sites');

  const sites = await siteRes.json() as AtlassianAccessibleResourcesResponse;
  logger.info('Retrieved accessible sites', {
    sitesCount: sites.length,
    siteNames: sites.map(s => s.name),
    siteIds: sites.map(s => s.id),
  });

  if (!sites.length) {
    logger.error('No accessible Jira sites found');
    throw new Error('No accessible Jira sites found.');
  }

  // If siteName is provided, search for it
  if (siteName) {
    logger.info('Searching for site by name', { siteName, availableSites: sites.length });
    
    const matchingSite = sites.find(site => 
      site.name.toLowerCase().includes(siteName.toLowerCase()) ||
      siteName.toLowerCase().includes(site.name.toLowerCase())
    );
    
    if (matchingSite) {
      logger.info('Found matching site by name', { 
        cloudId: matchingSite.id, 
        siteName: matchingSite.name,
        siteUrl: matchingSite.url,
        searchTerm: siteName
      });
      return {
        cloudId: matchingSite.id,
        siteName: matchingSite.name,
        siteUrl: matchingSite.url
      };
    } else {
      logger.error('No site found matching the provided name', { 
        siteName, 
        availableSites: sites.map(s => s.name) 
      });
      throw new Error(`No site found with name "${siteName}". Available sites: ${sites.map(s => s.name).join(', ')}`);
    }
  } else {
    // Use first accessible site if no siteName provided
    const firstSite = sites[0];
    logger.info('Using first accessible site', { 
      cloudId: firstSite.id, 
      siteName: firstSite.name,
      siteUrl: firstSite.url 
    });
    return {
      cloudId: firstSite.id,
      siteName: firstSite.name,
      siteUrl: firstSite.url
    };
  }
}

/**
 * Add a comment to a Jira issue
 * @param client - Atlassian API client
 * @param cloudId - Cloud ID for the Jira site
 * @param issueKey - Issue key (e.g., "PROJ-123")
 * @param markdownText - Comment text in markdown format
 * @returns CommentResult with commentId and response
 * @throws Error if comment posting fails
 */
export async function addIssueComment(
  client: AtlassianClient,
  cloudId: string,
  issueKey: string,
  markdownText: string
): Promise<CommentResult> {
  logger.info('Adding comment to Jira issue', {
    issueKey,
    cloudId,
    markdownLength: markdownText.length,
  });

  // Convert markdown to ADF
  const adfBody = await convertMarkdownToAdf(markdownText);

  // Construct comment URL
  const commentUrl = `${client.getJiraBaseUrl(cloudId)}/issue/${issueKey}/comment`;

  logger.info('Making Jira API request to post comment', {
    issueKey,
    cloudId,
    commentUrl,
    adfContentBlocks: adfBody.content?.length || 0,
  });

  // Post comment using client
  const response = await client.fetch(commentUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: adfBody }),
  });

  logger.info('Comment post response', {
    issueKey,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get('content-type'),
  });

  // Handle errors
  handleJiraAuthError(response, `Add comment to ${issueKey}`);

  // Parse response to extract comment ID
  const responseJson = await response.json() as { id: string };
  const commentId = responseJson.id;

  logger.info('Comment created successfully', {
    issueKey,
    commentId,
  });

  return { commentId, response };
}

/**
 * Update an existing comment on a Jira issue
 * @param client - Atlassian API client
 * @param cloudId - Cloud ID for the Jira site
 * @param issueKey - Issue key (e.g., "PROJ-123")
 * @param commentId - ID of the comment to update
 * @param markdownText - Updated comment text in markdown format
 * @returns Response from the Jira API
 * @throws Error if comment update fails
 */
export async function updateIssueComment(
  client: AtlassianClient,
  cloudId: string,
  issueKey: string,
  commentId: string,
  markdownText: string
): Promise<Response> {
  logger.info('Updating comment on Jira issue', {
    issueKey,
    cloudId,
    commentId,
    markdownLength: markdownText.length,
  });

  // Convert markdown to ADF
  const adfBody = await convertMarkdownToAdf(markdownText);

  // Construct comment update URL
  const commentUrl = `${client.getJiraBaseUrl(cloudId)}/issue/${issueKey}/comment/${commentId}`;

  logger.info('Making Jira API request to update comment', {
    issueKey,
    cloudId,
    commentId,
    commentUrl,
    adfContentBlocks: adfBody.content?.length || 0,
  });

  // Update comment using client
  const response = await client.fetch(commentUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: adfBody }),
  });

  logger.info('Comment update response', {
    issueKey,
    commentId,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get('content-type'),
  });

  // Handle errors
  handleJiraAuthError(response, `Update comment ${commentId} on ${issueKey}`);

  return response;
}

export async function getJiraIssue(
  client: AtlassianClient,
  targetCloudId: string,
  issueKey: string,
  fields: string | undefined
) {
  let issueUrl = `${client.getJiraBaseUrl(targetCloudId)}/issue/${issueKey}`;

  // Add fields parameter if specified
  if (fields) {
    const params = new URLSearchParams({ fields });
    issueUrl += `?${params.toString()}`;
  }

  logger.info('Making Jira API request for issue details', {
    issueKey,
    cloudId: targetCloudId,
    fetchUrl: issueUrl,
  });

  // Get issue details using client
  const issueRes = await client.fetch(issueUrl);

  logger.info('Issue fetch response', {
    status: issueRes.status,
    statusText: issueRes.statusText,
    contentType: issueRes.headers.get('content-type')
  });
  return issueRes;
}
export async function createJiraIssue({
  targetCloudId, projectKey, adfDescription, token, figmaElementDescription, issueTypeId, issueTypeName, summary, priority, labels, assigneeAccountId, epicId
}: {
  targetCloudId: string;
  projectKey: string;
  adfDescription: ADFDocument;
  token: string;
  figmaElementDescription: string;
  issueTypeId?: string;
  issueTypeName?: string;
  summary: string;
  priority?: string;
  labels?: string[];
  assigneeAccountId?: string;
  epicId?: string;
}) {
  const createUrl = `https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/issue`;

  // Prepare the issue creation payload
  const issuePayload: JiraIssuePayload = {
    fields: {
      project: {
        key: projectKey
      },
      issuetype: issueTypeId ? { id: issueTypeId } : { name: issueTypeName || 'Task' },
      summary: summary.trim(),
      description: adfDescription
    }
  };

  // Add optional fields
  if (priority) {
    issuePayload.fields.priority = { name: priority };
  }

  if (labels && labels.length > 0) {
    issuePayload.fields.labels = labels;
  }

  if (assigneeAccountId) {
    issuePayload.fields.assignee = { accountId: assigneeAccountId };
  }

  if (epicId) {
    issuePayload.fields.customfield_10008 = epicId; // Adjust field ID as necessary
  }

  // Determine the appropriate authentication method
  const { authType, authorization } = getAuthHeader(token);

  console.log('Creating Jira issue', sanitizeObjectWithJWTs({
    projectKey,
    issueType: issueTypeId || issueTypeName,
    summary,
    cloudId: targetCloudId,
    createUrl,
    authType,
    adfContentBlocks: adfDescription.content?.length || 0,
    hasFigmaContent: !!figmaElementDescription,
    requestToken: token,
    epicId
  }));

  // Make the API request
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(issuePayload),
  });

  console.log('Issue creation response', {
    status: createResponse.status,
    statusText: createResponse.statusText,
    contentType: createResponse.headers.get('content-type')
  });
  return createResponse;
}
/**
 * Determine if we should use PAT (Personal Access Token) authentication
 * and format the appropriate Authorization header
 * @param token - The token to analyze
 * @returns Object with authType and Authorization header value
 */
export function getAuthHeader(token: string): { authType: 'PAT' | 'Bearer'; authorization: string; } {
  // Use PAT format when TEST_USE_MOCK_ATLASSIAN is true (indicates test mode with PATs)
  const usePAT = process.env.TEST_USE_MOCK_ATLASSIAN === 'true';

  if (usePAT) {
    // Token is already base64-encoded for Basic auth
    return {
      authType: 'PAT',
      authorization: `Basic ${token}`
    };
  }

  // Default to Bearer token (OAuth)
  return {
    authType: 'Bearer',
    authorization: `Bearer ${token}`
  };
}
// Jira issue creation payload interface
export interface JiraIssuePayload {
  fields: {
    project: {
      key: string;
    };
    issuetype: {
      id?: string;
      name?: string;
    };
    summary: string;
    description: ADFDocument;
    priority?: {
      name: string;
    };
    labels?: string[];
    assignee?: {
      accountId: string;
    };
    [key: string]: any;
  };
}
