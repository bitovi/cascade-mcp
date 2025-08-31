/**
 * Authentication context store management for MCP Jira tools
 * Extracted from auth-helpers.js for better separation of concerns
 */

import { logger } from '../observability/logger.ts';

// Define the AuthContext interface based on the Atlassian token structure
export interface AuthContext {
  sessionId?: string;
  atlassian_access_token: string;
  refresh_token: string;
  exp: number;
  scope: string;
  iss: string;
  aud: string;
  sub?: string;
  iat?: number;
}

// Auth context store type
export type AuthContextStore = Map<string, AuthContext>;

// Global auth context store (keyed by transport/session)
const authContextStore: AuthContextStore = new Map();

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
 * Function to store auth info for a transport
 * @param transportId - Transport identifier
 * @param authInfo - Authentication information
 */
export function setAuthContext(transportId: string, authInfo: AuthContext): void {
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
 * @param transportId - Transport identifier
 */
export function clearAuthContext(transportId: string): void {
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
 * @param transportId - Transport identifier
 * @returns Auth info object or undefined if not found
 */
export function getAuthContext(transportId: string): AuthContext | undefined {
  return authContextStore.get(transportId);
}

/**
 * Helper function to get auth info from context
 * @param context - MCP context object
 * @returns Auth info object or null if not found
 */
export function getAuthInfo(context: any): AuthContext | null {
  // First try to get from context if it's directly available
  if (context?.authInfo?.atlassian_access_token) {
    return context.authInfo;
  }

  // Try to get session ID from context to safely retrieve auth info
  const sessionId = context?.sessionId || context?.transport?.sessionId;
  
  if (sessionId) {
    const authInfo = authContextStore.get(sessionId);
    
    if (authInfo?.atlassian_access_token) {
      return authInfo;
    }
  }

  // No auth found in context
  return null;
}

/**
 * Get the current size of the auth context store (for debugging/monitoring)
 * @returns The number of stored auth contexts
 */
export function getAuthContextStoreSize(): number {
  return authContextStore.size;
}

/**
 * Get all transport IDs currently in the auth context store (for debugging/monitoring)
 * @returns Array of transport IDs
 */
export function getStoredTransportIds(): string[] {
  return Array.from(authContextStore.keys());
}
