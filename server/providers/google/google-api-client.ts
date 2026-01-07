/**
 * Google Drive API Client Factory
 * 
 * Provides API client instances for OAuth and Service Account authentication.
 * Uses native fetch (no additional dependencies).
 * 
 * Authentication Methods:
 * - OAuth: Uses Bearer tokens from OAuth 2.0 flow (for user delegation)
 * - Service Account: Uses JWT tokens from Google service account JSON (for server-to-server)
 */

import type { DriveAboutResponse, GoogleServiceAccountCredentials } from './types.js';

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
  authType: 'oauth' | 'service-account';
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

/**
 * Create a Google API client using Personal Access Token (PAT)
 * For Google, PAT is the same as OAuth access token
 * @param token - Google access token
 * @returns API client with Drive operations
 */
export function createGoogleClientWithPAT(token: string): GoogleClient {
  return createGoogleClient(token);
}

/**
 * Create a Google API client using Service Account credentials
 * 
 * Service accounts use JWT tokens for authentication. This function:
 * 1. Creates a JWT signed with the service account's private key
 * 2. Exchanges the JWT for an access token
 * 3. Returns a client that uses the access token
 * 
 * Note: This requires the googleapis package for JWT creation.
 * 
 * @param serviceAccountJson - Google service account JSON credentials
 * @returns API client with Drive operations using service account auth
 * 
 * @example
 * ```typescript
 * const credentials = JSON.parse(fs.readFileSync('google.json', 'utf-8'));
 * const client = await createGoogleClientWithServiceAccount(credentials);
 * const userInfo = await client.fetchAboutUser();
 * ```
 */
export async function createGoogleClientWithServiceAccount(
  serviceAccountJson: GoogleServiceAccountCredentials
): Promise<GoogleClient> {
  // Import googleapis dynamically to avoid bundling it unnecessarily
  const { google } = await import('googleapis');
  
  const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
  
  // Create JWT auth client
  const auth = new google.auth.JWT({
    email: serviceAccountJson.client_email,
    key: serviceAccountJson.private_key,
    scopes: SCOPES,
  });
  
  // Get access token from JWT
  const credentials = await auth.getAccessToken();
  const accessToken = credentials.token;
  
  if (!accessToken) {
    throw new Error('Failed to obtain access token from service account');
  }
  
  console.log('Created Google client with service account:', {
    clientEmail: serviceAccountJson.client_email,
    projectId: serviceAccountJson.project_id,
    tokenPrefix: accessToken.substring(0, 20) + '...',
  });
  
  return {
    authType: 'service-account',
    
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
