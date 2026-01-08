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
