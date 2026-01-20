/**
 * Core authentication helper functions for MCP Jira tools
 * Refactored to use modularized auth context store and Atlassian helpers
 */

import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { logger } from '../observability/logger.ts';
import { 
  setAuthContext as setAuthContextStore, 
  clearAuthContext as clearAuthContextStore, 
  getAuthContext as getAuthContextStore, 
  getAuthInfo as getAuthInfoFromStore,
  type AuthContext 
} from './auth-context-store.ts';
import { handleJiraAuthError as handleJiraAuthErrorHelper } from '../providers/atlassian/atlassian-helpers.ts';

/**
 * Helper function to safely log token information without exposing sensitive data
 * @param token - The token to log info about
 * @param prefix - Prefix for the log entry
 * @returns Safe token info for logging
 */
export function getTokenLogInfo(token?: string, prefix: string = 'Token'): Record<string, any> {
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

// Test mechanisms for debugging
let testForcingAuthError = false;
let testForcingTokenExpired = false;

/**
 * Check if a JWT token is expired
 * For multi-provider auth, checks if all provider tokens are expired
 * @param authInfo - Authentication info object containing provider tokens
 * @returns True if all provider tokens are expired, false if at least one is valid
 */
export function isTokenExpired(authInfo: AuthContext | null): boolean {
  // Test mechanism to force token expiration
  if (testForcingTokenExpired) {
    logger.info('Test mechanism: forcing token expired');
    return true;
  }
  
  if (!authInfo) {
    return true;
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  // Check if at least one provider has a valid (non-expired) token
  const hasValidAtlassianToken = authInfo.atlassian && 
    authInfo.atlassian.expires_at > now;
  
  const hasValidFigmaToken = authInfo.figma && 
    authInfo.figma.expires_at > now;
  
  const hasValidGoogleToken = authInfo.google && 
    authInfo.google.expires_at > now;
  
  // If at least one provider has a valid token, not expired
  const hasAnyValidToken = hasValidAtlassianToken || hasValidFigmaToken || hasValidGoogleToken;
  
  return !hasAnyValidToken;
}

/**
 * Helper function to handle 401 responses from Jira API
 * @param response - Fetch response object
 * @param operation - Description of the operation for error messages
 * @throws InvalidTokenError when authentication fails
 * @throws Error when other API errors occur
 */
export function handleJiraAuthError(response: Response, operation: string = 'Jira API request'): void {
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
 * @param context - MCP context object
 * @returns Auth info object or null if not found
 */
export function getAuthInfo(context: any): AuthContext | null {
  const authInfo = getAuthInfoFromStore(context);
  
  if (authInfo && isTokenExpired(authInfo)) {
    throw new InvalidTokenError('The access token expired and re-authentication is needed.');
  }
  
  return authInfo;
}

/**
 * Safe wrapper for getAuthInfo with consistent error handling
 * @param context - MCP context object
 * @param toolName - Name of the tool calling this function for logging
 * @returns Auth info object
 * @throws InvalidTokenError when token is expired (to trigger OAuth re-authentication)
 * @throws Object when other errors occur (MCP tool error response format)
 */
export function getAuthInfoSafe(context: any, toolName: string = 'unknown-tool'): AuthContext {
  try {
    const authInfo = getAuthInfo(context);
    if (!authInfo) {
      throw new Error('No authentication information found');
    }
    return authInfo;
  } catch (error: any) {
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

// Re-export auth context store functions for backward compatibility
export const setAuthContext = setAuthContextStore;
export const clearAuthContext = clearAuthContextStore;
export const getAuthContext = getAuthContextStore;
