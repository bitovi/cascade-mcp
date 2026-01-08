/**
 * Google Drive API Client Factory
 * 
 * Provides API client instances for OAuth authentication.
 * Uses native fetch (no additional dependencies).
 * 
 * Authentication Methods:
 * - OAuth: Uses Bearer tokens from OAuth 2.0 flow (for user delegation)
 */

import type { DriveAboutResponse } from './types.js';

/**
 * Google API client interface
 * 
 * Provides methods for making authenticated requests to Google APIs.
 * All methods have the access token pre-configured via closure.
 */
export interface GoogleClient {
  /**
   * Make an authenticated fetch request to Google API
   * @param url - The full URL to fetch
   * @param options - Standard fetch options (method, body, etc.)
   * @returns Promise resolving to fetch Response
   */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  
  /**
   * Get user information from Google Drive API
   * @returns Promise resolving to Drive user information
   */
  fetchAboutUser(): Promise<DriveAboutResponse>;
  
  /**
   * Authentication type used by this client
   */
  authType: 'oauth';
}

/**
 * Create a Google API client using OAuth access token
 * @param accessToken - OAuth 2.0 Bearer token
 * @returns API client with Drive operations
 * 
 * @example
 * ```typescript
 * const client = createGoogleClient(token);
 * 
 * // Fetch with auth automatically included
 * const response = await client.fetch(
 *   'https://www.googleapis.com/drive/v3/about?fields=user',
 *   { method: 'GET' }
 * );
 * ```
 */
export function createGoogleClient(accessToken: string): GoogleClient {
  return {
    authType: 'oauth',
    
    fetch: async (url: string, options: RequestInit = {}) => {
      // Token is captured in this closure!
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
    },
    
    async fetchAboutUser(): Promise<DriveAboutResponse> {
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive API error (${response.status}): ${errorText}`);
      }
      
      return response.json() as Promise<DriveAboutResponse>;
    }
  };
}
