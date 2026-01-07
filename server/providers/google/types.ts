/**
 * Google Drive OAuth Type Definitions
 * 
 * TypeScript interfaces for Google OAuth 2.0 credentials and Drive API responses.
 */

/**
 * OAuth 2.0 credentials for an authenticated Google Drive user session
 */
export interface GoogleOAuthCredentials {
  access_token: string;
  refresh_token?: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  issued_at?: number;
}

/**
 * Google Service Account credentials from google.json file
 * 
 * Used for server-to-server authentication without user delegation.
 * The service account must be granted access to resources explicitly.
 */
export interface GoogleServiceAccountCredentials {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

/**
 * Encrypted Google Service Account credentials
 * 
 * RSA-encrypted service account JSON that can be safely stored and transmitted.
 * Server-side decryption required before use.
 * 
 * Format: "RSA-ENCRYPTED:<base64-encoded-data>"
 */
export interface GoogleEncryptedServiceAccountCredentials {
  type: 'encrypted_service_account';
  encrypted_data: string; // Base64-encoded RSA-encrypted JSON
  encryption_version: '1'; // For future encryption algorithm changes
}

/**
 * Google Drive user profile information
 * Source: https://www.googleapis.com/drive/v3/about?fields=user
 */
export interface DriveUser {
  kind: 'drive#user';
  displayName: string;
  emailAddress: string;
  permissionId: string;
  photoLink?: string;
  me: true;
}

/**
 * Response from Google Drive API /about endpoint
 */
export interface DriveAboutResponse {
  user: DriveUser;
}
