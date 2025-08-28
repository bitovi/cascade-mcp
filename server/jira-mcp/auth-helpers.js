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
 * Helper function to check if a JWT token is expired
 * @param {Object} authInfo - Auth info object containing JWT claims
 * @returns {boolean} True if token is expired
 */
function isTokenExpired(authInfo) {
  if (!authInfo?.exp) {
    logger.warn('No expiration time found in auth info');
    return true; // Assume expired if no exp claim
  }
  
  const now = Math.floor(Date.now() / 1000);
  const isExpired = now >= authInfo.exp;
  
  if (isExpired) {
    logger.warn('Token is expired', {
      exp: authInfo.exp,
      now,
      expiredBy: now - authInfo.exp,
      expiredDate: new Date(authInfo.exp * 1000).toISOString(),
    });
  }
  
  return isExpired;
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
    const authInfo = context.authInfo;
    
    // Check if token is expired
    if (isTokenExpired(authInfo)) {
      logger.warn('Direct context token is expired, skipping', {
        source: 'direct_context',
        exp: authInfo.exp,
        iss: authInfo.iss,
      });
    } else {
      const token = authInfo.atlassian_access_token;
      logger.info('Found valid auth token from direct context', {
        source: 'direct_context',
        ...getTokenLogInfo(token, 'atlassianToken'),
        hasRefreshToken: !!authInfo.refresh_token,
        scope: authInfo.scope,
        issuer: authInfo.iss,
        audience: authInfo.aud,
        exp: authInfo.exp,
        expiresIn: authInfo.exp - Math.floor(Date.now() / 1000),
      });
      return authInfo;
    }
  }

  // Try to get from the stored auth context using any available session identifier
  for (const [sessionId, authInfo] of authContextStore.entries()) {
    if (authInfo?.atlassian_access_token) {
      // Check if stored token is expired
      if (isTokenExpired(authInfo)) {
        logger.warn('Stored context token is expired, removing from store', {
          source: 'auth_context_store',
          sessionId,
          exp: authInfo.exp,
          iss: authInfo.iss,
        });
        // Remove expired token from store
        authContextStore.delete(sessionId);
        continue;
      }
      
      const token = authInfo.atlassian_access_token;
      logger.info('Found valid auth token from stored context', {
        source: 'auth_context_store',
        sessionId,
        ...getTokenLogInfo(token, 'atlassianToken'),
        hasRefreshToken: !!authInfo.refresh_token,
        scope: authInfo.scope,
        issuer: authInfo.iss,
        audience: authInfo.aud,
        exp: authInfo.exp,
        expiresIn: authInfo.exp - Math.floor(Date.now() / 1000),
      });
      return authInfo;
    }
  }

  logger.warn('No auth token found in any context', {
    checkedDirectContext: !!context?.authInfo,
    checkedStoredContexts: authContextStore.size,
    availableSessionIds: Array.from(authContextStore.keys()),
  });
  return null;
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
 * Cleanup expired tokens from the auth context store
 * This can be called periodically to prevent accumulation of expired tokens
 */
export function cleanupExpiredTokens() {
  const expiredSessions = [];
  
  for (const [sessionId, authInfo] of authContextStore.entries()) {
    if (isTokenExpired(authInfo)) {
      expiredSessions.push(sessionId);
    }
  }
  
  if (expiredSessions.length > 0) {
    logger.info('Cleaning up expired tokens from auth store', {
      expiredCount: expiredSessions.length,
      totalSessions: authContextStore.size,
      expiredSessions,
    });
    
    expiredSessions.forEach(sessionId => {
      authContextStore.delete(sessionId);
    });
  }
  
  return expiredSessions.length;
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

// Set up periodic cleanup of expired tokens (every 5 minutes)
setInterval(() => {
  const cleanedCount = cleanupExpiredTokens();
  if (cleanedCount > 0) {
    logger.info('Periodic token cleanup completed', { cleanedCount });
  }
}, 5 * 60 * 1000); // 5 minutes
