/**
 * Google Drive API Client Factory
 * 
 * Provides API client instances for both OAuth and PAT authentication patterns.
 * Uses native fetch (no additional dependencies).
 */

import type { DriveAboutResponse } from './types.js';

/**
 * Google API client interface
 */
export interface GoogleClient {
  fetchAboutUser(): Promise<DriveAboutResponse>;
}

/**
 * Create a Google API client using OAuth access token
 * @param accessToken - OAuth 2.0 Bearer token
 * @returns API client with Drive operations
 */
export function createGoogleClient(accessToken: string): GoogleClient {
  return {
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

/**
 * Create a Google API client using Personal Access Token (PAT)
 * For Google, PAT is the same as OAuth access token
 * @param token - Google access token
 * @returns API client with Drive operations
 */
export function createGoogleClientWithPAT(token: string): GoogleClient {
  return createGoogleClient(token);
}
