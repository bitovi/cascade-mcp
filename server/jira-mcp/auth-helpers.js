/**
 * Authentication helper functions for MCP Jira tools
 */

import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { logger } from '../logger.js';

// Global auth context store (keyed by transport/session)
const authContextStore = new Map();

let testForcingAuthError = false;
/*
setTimeout(() => {
  testForcingAuthError = true;
  logger.info('Test forcing auth error enabled');
}, 10000); // Enable after 10 seconds for testing purposes
*/

/**
 * Helper function to handle 401 responses from Jira API
 * @param {Response} response - Fetch response object
 * @param {string} operation - Description of the operation for error messages
 * @throws {InvalidTokenError} When authentication fails
 * @throws {Error} When other API errors occur
 */
export function handleJiraAuthError(response, operation = 'Jira API request') {
  if (testForcingAuthError || response.status === 401) {
    // Token has expired or is invalid, throw the proper MCP OAuth error
    throw new InvalidTokenError(`Authentication required: ${operation} returned 401. The access token expired and re-authentication is needed.`);
  }
  if (!response.ok) {
    throw new Error(`${operation} failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * Helper function to get auth info from context
 * @param {Object} context - MCP context object
 * @returns {Object|null} Auth info object or null if not found
 */
export function getAuthInfo(context) {
  // First try to get from context if it's directly available
  if (context?.authInfo?.atlassian_access_token) {
    return context.authInfo;
  }

  // Try to get from the stored auth context using any available session identifier
  for (const [sessionId, authInfo] of authContextStore.entries()) {
    if (authInfo?.atlassian_access_token) {
      return authInfo;
    }
  }

  return null;
}

/**
 * Function to store auth info for a transport
 * @param {string} transportId - Transport identifier
 * @param {Object} authInfo - Authentication information
 */
export function setAuthContext(transportId, authInfo) {
  authContextStore.set(transportId, authInfo);
}

/**
 * Function to clear auth context
 * @param {string} transportId - Transport identifier
 */
export function clearAuthContext(transportId) {
  authContextStore.delete(transportId);
}

/**
 * Utility function to resolve cloud ID from either explicit cloudId or siteName
 * @param {string} token - Atlassian access token
 * @param {string} [cloudId] - Explicit cloud ID to use
 * @param {string} [siteName] - Site name to search for
 * @returns {Promise<{cloudId: string, siteName: string, siteUrl: string}>} Resolved site information
 * @throws {Error} If no sites are accessible or site name not found
 */
export async function resolveCloudId(token, cloudId, siteName) {
  // If cloudId is provided, return it directly (skip API call for efficiency)
  if (cloudId) {
    logger.info('Using provided cloudId', { cloudId });
    return { cloudId, siteName: 'unknown', siteUrl: 'unknown' };
  }

  // Need to fetch accessible sites
  logger.info('Fetching accessible sites', { 
    reason: siteName ? 'siteName lookup' : 'auto-detection',
    siteName: siteName || 'none' 
  });
  
  const siteRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  handleJiraAuthError(siteRes, 'Fetch accessible sites');

  const sites = await siteRes.json();
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
