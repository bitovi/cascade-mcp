/**
 * Atlassian API interaction helpers
 * Extracted from auth-helpers.js for better separation of concerns
 */

import { logger } from '../observability/logger.ts';

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
 * Handle Jira authentication errors from API responses
 * @param response - The fetch response object
 * @param operation - Description of the operation for logging
 * @throws Error if response indicates authentication failure
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
  token: string, 
  cloudId?: string, 
  siteName?: string
): Promise<ResolvedSiteInfo> {
  logger.info('Starting cloud ID resolution', {
    ...getTokenLogInfo(token, 'atlassianToken'),
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
    ...getTokenLogInfo(token, 'usingToken'),
  });
  
  const siteRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

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
