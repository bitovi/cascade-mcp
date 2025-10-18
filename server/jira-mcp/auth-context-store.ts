/**
 * Authentication context store management for MCP tools
 * Supports multi-provider OAuth with nested token structure
 */

import { logger } from '../observability/logger.ts';

/**
 * Provider-specific authentication credentials
 */
export interface ProviderAuthInfo {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  // Provider-specific optional fields
  cloudId?: string;  // Atlassian
  user_id?: string;  // Figma
}

/**
 * Multi-provider authentication context
 * Uses nested structure for clean provider separation
 * Example: authInfo.atlassian.access_token, authInfo.figma.access_token
 */
export interface AuthContext {
  sessionId?: string;
  // Multi-provider tokens (nested structure per Q21, Q22)
  atlassian?: ProviderAuthInfo;
  figma?: ProviderAuthInfo;
  // JWT metadata (preserved for compatibility)
  iss?: string;
  aud?: string;
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
  const atlassianToken = authInfo?.atlassian?.access_token;
  const figmaToken = authInfo?.figma?.access_token;
  const now = Math.floor(Date.now() / 1000);
  
  // Calculate expiry for Atlassian tokens
  const atlassianExpiresIn = authInfo?.atlassian?.expires_at 
    ? authInfo.atlassian.expires_at - now 
    : null;
  
  logger.info('Storing auth context for transport', {
    transportId,
    providers: {
      atlassian: authInfo?.atlassian ? {
        ...getTokenLogInfo(atlassianToken, 'atlassianToken'),
        hasRefreshToken: !!authInfo.atlassian.refresh_token,
        scope: authInfo.atlassian.scope,
        expiresIn: atlassianExpiresIn,
        expiresAt: authInfo.atlassian.expires_at 
          ? new Date(authInfo.atlassian.expires_at * 1000).toISOString() 
          : null,
      } : null,
      figma: authInfo?.figma ? {
        ...getTokenLogInfo(figmaToken, 'figmaToken'),
        hasRefreshToken: !!authInfo.figma.refresh_token,
        scope: authInfo.figma.scope,
      } : null,
    },
    issuer: authInfo?.iss,
    audience: authInfo?.aud,
    authInfoKeys: Object.keys(authInfo || {}),
  });
  
  // Warn if Atlassian token is already expired or expires soon
  if (atlassianExpiresIn !== null && authInfo?.atlassian) {
    if (atlassianExpiresIn <= 0) {
      logger.warn('Storing already expired Atlassian token!', {
        transportId,
        expiredBy: Math.abs(atlassianExpiresIn),
      });
    } else if (atlassianExpiresIn < 300) { // Less than 5 minutes
      logger.warn('Storing Atlassian token that expires soon', {
        transportId,
        expiresInMinutes: Math.floor(atlassianExpiresIn / 60),
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
  if (context?.authInfo && (context.authInfo.atlassian || context.authInfo.figma)) {
    return context.authInfo;
  }

  // Try to get session ID from context to safely retrieve auth info
  const sessionId = context?.sessionId || context?.transport?.sessionId;
  
  if (sessionId) {
    const authInfo = authContextStore.get(sessionId);
    
    if (authInfo && (authInfo.atlassian || authInfo.figma)) {
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
