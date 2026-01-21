/**
 * Google Drive API Client Factory
 * 
 * Provides API client instances for OAuth and Service Account authentication.
 * Uses native fetch (no additional dependencies for OAuth).
 * 
 * Authentication Methods:
 * - OAuth: Uses Bearer tokens from OAuth 2.0 flow (for user delegation)
 * - Service Account: Uses JWT tokens from Google service account JSON (for server-to-server)
 */

import { google } from 'googleapis';
import type { GoogleServiceAccountCredentials } from './types.js';

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
  };
}

/**
 * Create a Google API client using Service Account JSON credentials
 * 
 * Service accounts use JWT tokens for authentication. This function:
 * 1. Accepts service account JSON credentials
 * 2. Creates a JWT signed with the service account's private key
 * 3. Exchanges the JWT for an access token
 * 4. Returns a client that uses the access token
 * 
 * Note: This requires the googleapis package for JWT creation.
 * 
 * @param serviceAccountJson - Service account JSON credentials
 * @returns API client with Drive operations using service account auth
 * 
 * @example
 * ```typescript
 * const credentials = {
 *   type: 'service_account',
 *   project_id: 'my-project',
 *   private_key_id: '...',
 *   private_key: '-----BEGIN PRIVATE KEY-----...',
 *   client_email: 'my-service@my-project.iam.gserviceaccount.com',
 *   // ... other fields
 * };
 * const client = await createGoogleClientWithServiceAccountJSON(credentials);
 * const userInfo = await client.fetch('https://www.googleapis.com/drive/v3/about?fields=user');
 * ```
 */
export async function createGoogleClientWithServiceAccountJSON(
  serviceAccountJson: GoogleServiceAccountCredentials
): Promise<GoogleClient> {
  const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
  
  // Create JWT auth client
  const auth = new google.auth.JWT({
    email: serviceAccountJson.client_email,
    key: serviceAccountJson.private_key,
    scopes: SCOPES,
  });
  
  // Get access token from JWT
  const tokenResponse = await auth.getAccessToken();
  const accessToken = tokenResponse.token;
  
  if (!accessToken) {
    throw new Error('Failed to obtain access token from service account');
  }
  
  console.log('✅ Created Google client with service account:', {
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
  };
}
