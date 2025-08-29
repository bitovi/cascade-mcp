/**
 * Authentication helper functions for MCP Jira tools
 */

import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { logger } from '../logger.js';

// Global auth context store (keyed by transport/session)
const authContextStore = new Map();

/**
 * Helper function to safely log token information without exposing sensitive data
 * @param {string} token - The token to log info about
 * @param {string} [prefix='Token'] - Prefix for the log entry
 * @returns {Object} Safe token info for logging
 */
function getTokenLogInfo(token, prefix = 'Token') {
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
    logger.error(`401 Authentication error for ${operation}`, {
      status: response.status,
      statusText: response.statusText,
      operation
    });
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
  logger.info('Getting auth info from context', {
    hasDirectAuthInfo: !!context?.authInfo?.atlassian_access_token,
    authContextStoreSize: authContextStore.size,
    contextKeys: Object.keys(context || {}),
  });

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
  const token = authInfo?.atlassian_access_token;
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = authInfo?.exp ? authInfo.exp - now : null;
  
  logger.info('Storing auth context for transport', {
    transportId,
    ...getTokenLogInfo(token, 'atlassianToken'),
    hasRefreshToken: !!authInfo?.refresh_token,
    scope: authInfo?.scope,
    issuer: authInfo?.iss,
    audience: authInfo?.aud,
    exp: authInfo?.exp,
    expiresIn,
    expiresAt: authInfo?.exp ? new Date(authInfo.exp * 1000).toISOString() : null,
    authInfoKeys: Object.keys(authInfo || {}),
  });
  
  // Warn if token is already expired or expires soon
  if (expiresIn !== null) {
    if (expiresIn <= 0) {
      logger.warn('Storing already expired token!', {
        transportId,
        expiredBy: Math.abs(expiresIn),
      });
    } else if (expiresIn < 300) { // Less than 5 minutes
      logger.warn('Storing token that expires soon', {
        transportId,
        expiresInMinutes: Math.floor(expiresIn / 60),
      });
    }
  }
  
  authContextStore.set(transportId, authInfo);
}

/**
 * Function to clear auth context
 * @param {string} transportId - Transport identifier
 */
export function clearAuthContext(transportId) {
  const hadContext = authContextStore.has(transportId);
  logger.info('Clearing auth context for transport', {
    transportId,
    hadContext,
    remainingContexts: authContextStore.size - (hadContext ? 1 : 0),
  });
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

  const sites = await siteRes.json();
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
 * Function to clean up expired tokens from the auth context store
 * @returns {number} Number of expired tokens cleaned up
 */
function cleanupExpiredTokens() {
  let cleanedCount = 0;
  const now = Math.floor(Date.now() / 1000);
  
  for (const [transportId, authInfo] of authContextStore.entries()) {
    if (isTokenExpired(authInfo)) {
      logger.info('Cleaning up expired token for transport', { 
        transportId,
        exp: authInfo?.exp,
        expiredBy: authInfo?.exp ? now - authInfo.exp : 'unknown'
      });
      authContextStore.delete(transportId);
      cleanedCount++;
    }
  }
  
  return cleanedCount;
}

// Set up periodic cleanup of expired tokens (every 5 minutes)
setInterval(() => {
  const cleanedCount = cleanupExpiredTokens();
  if (cleanedCount > 0) {
    logger.info('Periodic token cleanup completed', { cleanedCount });
  }
}, 5 * 60 * 1000); // 5 minutes
