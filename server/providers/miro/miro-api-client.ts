/**
 * Miro API Client Factory
 * 
 * Provides API client instances for OAuth and PAT authentication.
 * Uses native fetch (no additional dependencies).
 * 
 * Authentication Methods:
 * - OAuth: Uses Bearer tokens from OAuth 2.0 flow
 * - PAT: Uses personal access tokens (same Bearer format)
 */

/**
 * Miro API client interface
 */
export interface MiroClient {
  /**
   * Make an authenticated fetch request to Miro API v2
   * @param path - API path (e.g., '/boards')
   * @param options - Standard fetch options
   * @returns Promise resolving to fetch Response
   */
  fetch: (path: string, options?: RequestInit) => Promise<Response>;
  
  /**
   * Authentication type used by this client
   */
  authType: 'oauth' | 'pat';
}

const MIRO_API_BASE = 'https://api.miro.com/v2';

/**
 * Create a Miro API client using OAuth access token
 * @param accessToken - OAuth 2.0 Bearer token
 * @returns API client
 */
export function createMiroClient(accessToken: string): MiroClient {
  return {
    authType: 'oauth',
    
    fetch: async (path: string, options: RequestInit = {}) => {
      return fetch(`${MIRO_API_BASE}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
    },
  };
}

/**
 * Create a Miro API client using a personal access token
 * @param pat - Personal access token
 * @returns API client
 */
export function createMiroClientWithPAT(pat: string): MiroClient {
  return {
    authType: 'pat',
    
    fetch: async (path: string, options: RequestInit = {}) => {
      return fetch(`${MIRO_API_BASE}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/json',
        },
      });
    },
  };
}
