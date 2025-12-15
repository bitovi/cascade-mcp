/**
 * Atlassian API interaction helpers
 * Extracted from auth-helpers.js for better separation of concerns
 */

import { logger } from '../../observability/logger.ts';
import { sanitizeObjectWithJWTs } from '../../tokens.ts';
import type { ADFDocument } from './markdown-converter.ts';
import { convertMarkdownToAdf } from './markdown-converter.ts';
import type { AtlassianClient } from './atlassian-api-client.js';
import type { JiraIssuePayload } from './types.ts';

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
export async function handleJiraAuthError(response: Response, operation: string): Promise<void> {
  // Helper to extract response headers
  const getResponseHeaders = (res: Response): Record<string, string> => {
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  };

  // Helper to safely read response body (if available)
  const getResponseBody = async (res: Response): Promise<any> => {
    try {
      // Clone response to avoid consuming the body
      const cloned = res.clone();
      const contentType = cloned.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        return await cloned.json();
      } else {
        const text = await cloned.text();
        return text.substring(0, 500); // Limit text size
      }
    } catch (error) {
      return { error: 'Could not read response body', details: String(error) };
    }
  };

  if (!response.ok) {
    const headers = getResponseHeaders(response);
    const body = await getResponseBody(response);
    
    const errorDetails = {
      status: response.status,
      statusText: response.statusText,
      headers,
      responseBody: body,
      url: response.url,
    };
    
    if (response.status === 401) {
      logger.error(`Jira API authentication failed for operation: ${operation}`, errorDetails);
      throw new Error(`Jira authentication failed for ${operation}. Please re-authenticate.`);
    }
    
    if (response.status === 403) {
      logger.error(`Jira API authorization failed for operation: ${operation}`, errorDetails);
      throw new Error(`Jira authorization failed for ${operation}. Insufficient permissions.`);
    }
    
    // Check for specific Jira error codes in the response body
    if (response.status === 400 && body?.errors?.description === 'CONTENT_LIMIT_EXCEEDED') {
      logger.error(`Jira content limit exceeded for operation: ${operation}`, errorDetails);
      throw new Error(`Jira content limit exceeded for ${operation}. The description is too large. Consider reducing content or splitting into multiple issues.`);
    }
    
    logger.error(`Jira API request failed for operation: ${operation}`, errorDetails);
    throw new Error(`Jira API request failed for ${operation}: ${response.status} ${response.statusText}`);
  }
}

/**
 * Helper to determine auth type and format authorization header
 * @param token - Atlassian access token (PAT or Bearer)
 * @returns Auth type and formatted authorization header
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

/**
 * Extract site name from Jira URL
 * @param urlOrKey - Jira issue URL or key
 * @returns Site name or undefined
 * @example
 * extractSiteName("https://bitovi.atlassian.net/browse/PROJ-123") => "bitovi"
 * extractSiteName("PROJ-123") => undefined
 */
function extractSiteName(urlOrKey: string): string | undefined {
  const match = urlOrKey.match(/https?:\/\/([^.]+)\.atlassian\.net/);
  return match ? match[1] : undefined;
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

  // For PAT tokens, use _edge/tenant_info endpoint directly (accessible-resources requires OAuth)
  if (client.authType === 'pat') {
    if (!siteName) {
      throw new Error('siteName is required when using PAT authentication without explicit cloudId');
    }
    
    logger.info('Using _edge/tenant_info for PAT authentication', {
      siteName,
      tenantInfoUrl: `https://${siteName}.atlassian.net/_edge/tenant_info`,
    });
    
    const tenantRes = await client.fetch(`https://${siteName}.atlassian.net/_edge/tenant_info`);
    
    logger.info('Tenant info API response', {
      status: tenantRes.status,
      statusText: tenantRes.statusText,
      contentType: tenantRes.headers.get('content-type'),
    });
    
    await handleJiraAuthError(tenantRes, 'Fetch tenant info');
    
    const tenantInfo = await tenantRes.json() as { cloudId: string };
    logger.info('Successfully retrieved cloudId from _edge/tenant_info', {
      cloudId: tenantInfo.cloudId,
      siteName,
    });
    
    return {
      cloudId: tenantInfo.cloudId,
      siteName,
      siteUrl: `https://${siteName}.atlassian.net`,
    };
  }

  // For OAuth tokens, use accessible-resources endpoint
  logger.info('Fetching accessible sites from Atlassian API (OAuth)', { 
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

  await handleJiraAuthError(siteRes, 'Fetch accessible sites');

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
  await handleJiraAuthError(response, `Add comment to ${issueKey}`);

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
  // Convert markdown to ADF
  const adfBody = await convertMarkdownToAdf(markdownText);

  // Construct comment update URL
  const commentUrl = `${client.getJiraBaseUrl(cloudId)}/issue/${issueKey}/comment/${commentId}`;

  // Update comment using client
  const response = await client.fetch(commentUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: adfBody }),
  });

  // Handle errors
  await handleJiraAuthError(response, `Update comment ${commentId} on ${issueKey}`);

  return response;
}

export async function getJiraIssue(
  client: AtlassianClient,
  targetCloudId: string,
  issueKey: string,
  fields?: string
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

  await handleJiraAuthError(issueRes, `Get issue ${issueKey}`);

  return issueRes;
}

/**
 * Get Jira project information
 * @param client - Atlassian API client
 * @param cloudId - Cloud ID for the Jira site
 * @param projectKey - Project key (e.g., "PROJ")
 * @returns Response from the Jira API with project details
 * @throws Error if fetch fails
 */
export async function getJiraProject(
  client: AtlassianClient,
  cloudId: string,
  projectKey: string
): Promise<Response> {
  const projectUrl = `${client.getJiraBaseUrl(cloudId)}/project/${projectKey}`;

  logger.info('Making Jira API request for project details', {
    projectKey,
    cloudId,
    fetchUrl: projectUrl,
  });

  const projectRes = await client.fetch(projectUrl);

  logger.info('Project fetch response', {
    projectKey,
    status: projectRes.status,
    statusText: projectRes.statusText,
    contentType: projectRes.headers.get('content-type')
  });

  await handleJiraAuthError(projectRes, `Get project ${projectKey}`);

  return projectRes;
}

/**
 * Delete a Jira issue
 * @param client - Atlassian API client
 * @param cloudId - Cloud ID for the Jira site
 * @param issueKey - Issue key to delete (e.g., "PROJ-123")
 * @returns Response from the Jira API
 * @throws Error if deletion fails
 */
export async function deleteJiraIssue(
  client: AtlassianClient,
  cloudId: string,
  issueKey: string
): Promise<Response> {
  const deleteUrl = `${client.getJiraBaseUrl(cloudId)}/issue/${issueKey}`;

  logger.info('Deleting Jira issue', {
    issueKey,
    cloudId,
    deleteUrl,
  });

  const response = await client.fetch(deleteUrl, {
    method: 'DELETE',
  });

  logger.info('Issue deletion response', {
    issueKey,
    status: response.status,
    statusText: response.statusText,
  });

  await handleJiraAuthError(response, `Delete issue ${issueKey}`);

  return response;
}
/**
 * Create a Jira issue (story, task, epic, etc.)
 * @param client - Atlassian API client
 * @param cloudId - Cloud ID for the Jira site
 * @param projectKey - Project key (e.g., "PROJ")
 * @param summary - Issue summary/title
 * @param adfDescription - Issue description in ADF format
 * @param options - Optional fields (issueType, priority, labels, etc.)
 * @returns Response from the Jira API with created issue details
 * @throws Error if creation fails
 */
export async function createJiraIssue(
  client: AtlassianClient,
  cloudId: string,
  projectKey: string,
  summary: string,
  adfDescription: ADFDocument,
  options?: {
    issueTypeId?: string;
    issueTypeName?: string;
    priority?: string;
    labels?: string[];
    assigneeAccountId?: string;
    epicId?: string;
    [key: string]: any;
  }
): Promise<Response> {
  const createUrl = `${client.getJiraBaseUrl(cloudId)}/issue`;

  // Prepare the issue creation payload
  const issuePayload: JiraIssuePayload = {
    fields: {
      project: {
        key: projectKey
      },
      issuetype: options?.issueTypeId 
        ? { id: options.issueTypeId } 
        : { name: options?.issueTypeName || 'Task' },
      summary: summary.trim(),
      description: adfDescription
    }
  };

  // Add optional fields
  if (options?.priority) {
    issuePayload.fields.priority = { name: options.priority };
  }

  if (options?.labels && options.labels.length > 0) {
    issuePayload.fields.labels = options.labels;
  }

  if (options?.assigneeAccountId) {
    issuePayload.fields.assignee = { accountId: options.assigneeAccountId };
  }

  if (options?.epicId) {
    issuePayload.fields.customfield_10008 = options.epicId; // Adjust field ID as necessary
  }

  logger.info('Creating Jira issue', {
    projectKey,
    issueType: options?.issueTypeId || options?.issueTypeName || 'Task',
    summary: summary.substring(0, 100),
    cloudId,
    createUrl,
    authType: client.authType,
    adfContentBlocks: adfDescription.content?.length || 0,
    epicId: options?.epicId,
  });

  // Make the API request
  const createResponse = await client.fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(issuePayload),
  });

  logger.info('Issue creation response', {
    status: createResponse.status,
    statusText: createResponse.statusText,
    contentType: createResponse.headers.get('content-type')
  });

  await handleJiraAuthError(createResponse, 'Create Jira issue');

  return createResponse;
}

// JiraIssuePayload is now imported from ./types.ts
// Re-export for backwards compatibility
export type { JiraIssuePayload } from './types.ts';
