/**
 * Google Drive API Client Factory
 * 
 * Provides API client instances for OAuth and Service Account authentication.
 * Uses native fetch (no additional dependencies).
 * 
 * Authentication Methods:
 * - OAuth: Uses Bearer tokens from OAuth 2.0 flow (for user delegation)
 * - Service Account: Uses JWT tokens from Google service account JSON (for server-to-server)
 * - Encrypted Service Account: Uses RSA-encrypted service account credentials (secure storage)
 */

import type { 
  DriveAboutResponse, 
  DriveFileListResponse, 
  DriveFileListParams,
  GoogleServiceAccountCredentials
} from './types.js';
import { googleKeyManager } from '../../utils/key-manager.js';

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
  listFiles(params?: DriveFileListParams): Promise<DriveFileListResponse>;
  getDocumentContent(fileId: string): Promise<string>;
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
    
    async listFiles(params?: DriveFileListParams): Promise<DriveFileListResponse> {
      // Build query parameters
      const queryParams = new URLSearchParams();
      
      // Default fields to return (can be overridden)
      const defaultFields = 'kind,files(id,name,mimeType,kind,createdTime,modifiedTime,size,webViewLink,owners),nextPageToken,incompleteSearch';
      queryParams.append('fields', params?.fields || defaultFields);
      
      // Add optional parameters
      if (params?.query) {
        queryParams.append('q', params.query);
      }
      if (params?.pageSize) {
        queryParams.append('pageSize', params.pageSize.toString());
      }
      if (params?.pageToken) {
        queryParams.append('pageToken', params.pageToken);
      }
      if (params?.orderBy) {
        queryParams.append('orderBy', params.orderBy);
      }
      
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive API list files error (${response.status}): ${errorText}`);
      }
      
      return response.json() as Promise<DriveFileListResponse>;
    },
    
    async getDocumentContent(fileId: string): Promise<string> {
      // Export Google Doc as plain text
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive API get document error (${response.status}): ${errorText}`);
      }
      
      return response.text();
    }
  };
}


// TODO: Does not make sense. Google does not support PAT. This is using OAuth token as PAT.
/**
 * Create a Google API client using Encrypted Service Account credentials
 * 
 * Service accounts use JWT tokens for authentication. This function:
 * 1. Accepts RSA-encrypted service account credentials (string with "RSA-ENCRYPTED:" prefix)
 * 2. Decrypts the credentials using the server's private key
 * 3. Creates a JWT signed with the service account's private key
 * 4. Exchanges the JWT for an access token
 * 5. Returns a client that uses the access token
 * 
 * Note: This requires the googleapis package for JWT creation.
 * 
 * @param encryptedCredentials - Encrypted service account credentials ("RSA-ENCRYPTED:...")
 * @returns API client with Drive operations using service account auth
 * 
 * @example
 * ```typescript
 * // From environment variable
 * const client = await createGoogleClientWithServiceAccountEncrypted(
 *   process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED
 * );
 * 
 * // From encrypted string
 * const encryptedString = "RSA-ENCRYPTED:eyJhbGci...";
 * const client = await createGoogleClientWithServiceAccountEncrypted(encryptedString);
 * 
 * const userInfo = await client.fetchAboutUser();
 * ```
 */
export async function createGoogleClientWithServiceAccountEncrypted(
  encryptedCredentials: string
): Promise<GoogleClient> {
  if (!encryptedCredentials || typeof encryptedCredentials !== 'string') {
    throw new Error(
      'Missing encrypted credentials. Expected a string with "RSA-ENCRYPTED:" prefix.\n' +
      'Get encrypted credentials from /google-service-encrypt page.'
    );
  }

  if (!encryptedCredentials.startsWith('RSA-ENCRYPTED:')) {
    throw new Error(
      'Invalid encrypted credentials format. Expected "RSA-ENCRYPTED:..." prefix.\n' +
      'Get encrypted credentials from /google-service-encrypt page.'
    );
  }

  console.log('🔐 Decrypting service account credentials...');
  const serviceAccountJson = await googleKeyManager.decrypt(encryptedCredentials);
  
  return createGoogleClientWithServiceAccountJSON(serviceAccountJson);
}

/**
 * Create a Google API client using plaintext Service Account JSON credentials
 * 
 * Service accounts use JWT tokens for authentication. This function:
 * 1. Accepts plaintext service account JSON credentials
 * 2. Creates a JWT signed with the service account's private key
 * 3. Exchanges the JWT for an access token
 * 4. Returns a client that uses the access token
 * 
 * Note: This requires the googleapis package for JWT creation.
 * 
 * @param serviceAccountJson - Plaintext service account JSON credentials
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
 * const userInfo = await client.fetchAboutUser();
 * ```
 */
export async function createGoogleClientWithServiceAccountJSON(
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
  const tokenResponse = await auth.getAccessToken();
  const accessToken = tokenResponse.token;
  
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
    
    async listFiles(params?: DriveFileListParams): Promise<DriveFileListResponse> {
      // Build query parameters
      const queryParams = new URLSearchParams();
      
      // Default fields to return (can be overridden)
      const defaultFields = 'kind,files(id,name,mimeType,kind,createdTime,modifiedTime,size,webViewLink,owners),nextPageToken,incompleteSearch';
      queryParams.append('fields', params?.fields || defaultFields);
      
      // Add optional parameters
      if (params?.query) {
        queryParams.append('q', params.query);
      }
      if (params?.pageSize) {
        queryParams.append('pageSize', params.pageSize.toString());
      }
      if (params?.pageToken) {
        queryParams.append('pageToken', params.pageToken);
      }
      if (params?.orderBy) {
        queryParams.append('orderBy', params.orderBy);
      }
      
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive API list files error (${response.status}): ${errorText}`);
      }
      
      return response.json() as Promise<DriveFileListResponse>;
    },
    
    async getDocumentContent(fileId: string): Promise<string> {
      // Export Google Doc as plain text
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive API get document error (${response.status}): ${errorText}`);
      }
      
      return response.text();
    }
  };
}
