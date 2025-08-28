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

let testForcingTokenExpired = false;
/*
setTimeout(() => {
  testForcingTokenExpired = true;
  logger.info('Test forcing token expired enabled');
}, 15000); // Enable after 15 seconds for testing purposes
*/

/**
 * Check if a JWT token is expired
 * @param {Object} authInfo - Authentication info object containing exp field
 * @returns {boolean} True if token is expired, false otherwise
 */
function isTokenExpired(authInfo) {
  // Test mechanism to force token expiration
  if (testForcingTokenExpired) {
    logger.info('Test mechanism: forcing token expired');
    return true;
  }
  
  if (!authInfo?.exp) {
    // If no expiration field, assume it's expired for safety
    return true;
  }
  
  // JWT exp field is in seconds, Date.now() is in milliseconds
  const now = Math.floor(Date.now() / 1000);
  return now >= authInfo.exp;
}

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
    if (isTokenExpired(context.authInfo)) {
      logger.info('Auth token from context is expired - triggering re-authentication');
      throw new InvalidTokenError('The access token expired and re-authentication is needed.');
    }
    return context.authInfo;
  }

  // Try to get session ID from context to safely retrieve auth info
  const sessionId = context?.sessionId || context?.transport?.sessionId;
  if (sessionId) {
    const authInfo = authContextStore.get(sessionId);
    if (authInfo?.atlassian_access_token) {
      if (isTokenExpired(authInfo)) {
        logger.info('Auth token from session context is expired - triggering re-authentication');
        throw new InvalidTokenError('The access token expired and re-authentication is needed.');
      }
      return authInfo;
    }
  }

  // No auth found in context
  logger.error('No auth context found', { 
    hasDirectAuthInfo: !!context?.authInfo,
    contextSessionId: context?.sessionId || context?.transport?.sessionId,
    totalAuthContexts: authContextStore.size
  });
  return null;
}

/**
 * Safe wrapper for getAuthInfo with consistent error handling
 * @param {Object} context - MCP context object
 * @param {string} toolName - Name of the tool calling this function for logging
 * @returns {Object} Auth info object
 * @throws {InvalidTokenError} When token is expired (to trigger OAuth re-authentication)
 * @throws {Object} When other errors occur (MCP tool error response format)
 */
export function getAuthInfoSafe(context, toolName = 'unknown-tool') {
  try {
    return getAuthInfo(context);
  } catch (error) {
    // If it's an InvalidTokenError, re-throw it to trigger OAuth re-authentication
    if (error.constructor.name === 'InvalidTokenError') {
      logger.info(`Token expired in ${toolName}, re-throwing for OAuth re-auth`);
      throw error;
    }
    // For other errors, log and throw a tool error response
    logger.error(`Unexpected error getting auth info in ${toolName}:`, error);
    throw {
      content: [
        {
          type: 'text',
          text: `Error: Failed to get authentication info - ${error.message}`,
        },
      ],
    };
  }
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
 * Function to get auth context for a transport
 * @param {string} transportId - Transport identifier
 * @returns {Object|undefined} Auth info object or undefined if not found
 */
export function getAuthContext(transportId) {
  return authContextStore.get(transportId);
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
