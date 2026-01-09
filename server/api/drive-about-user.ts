/**
 * REST API Handler for Google Drive About User
 * 
 * Accepts Google service account credentials via headers (plaintext only).
 * Returns authenticated user's profile information from Google Drive.
 * 
 * ⚠️ SECURITY WARNING: This endpoint accepts unencrypted service account credentials.
 * Service account keys do not expire and provide full access to resources shared with the account.
 * Use this API endpoint ONLY in secure, server-to-server environments.
 * DO NOT expose this endpoint to client-side applications or untrusted networks.
 * 
 * Note: Google Drive API does not support Personal Access Tokens (PATs).
 * Use service account credentials instead.
 */

import type { Request, Response } from 'express';
import { createGoogleClientWithServiceAccountJSON } from '../providers/google/google-api-client.js';
import { getGoogleDriveUser } from '../providers/google/google-helpers.js';
import type { GoogleServiceAccountCredentials } from '../providers/google/types.js';
import { logger } from '../observability/logger.js';

/**
 * POST /api/drive-about-user
 * 
 * Retrieve information about the authenticated Google Drive user
 * 
 * Required Headers:
 *   X-Google-Json: {...}  (plaintext service account JSON as string)
 * 
 * ⚠️ WARNING: Passing service account credentials via HTTP headers is EXTREMELY DANGEROUS.
 * Service account keys do not expire and grant full access to resources.
 * Only use this in trusted, secure server-to-server environments.
 * 
 * Request body: {} (empty object)
 * 
 * Response:
 * {
 *   "user": {
 *     "kind": "drive#user",
 *     "displayName": "Service Account Name",
 *     "emailAddress": "service-account@project.iam.gserviceaccount.com",
 *     "permissionId": "00112233445566778899",
 *     "photoLink": "https://...",
 *     "me": true
 *   }
 * }
 */
export async function handleDriveAboutUser(req: Request, res: Response): Promise<void> {
  try {
    console.log('API call: drive-about-user');
    
    // Check for credentials in headers
    const jsonCredentials = req.headers['x-google-json'] as string;
    
    if (!jsonCredentials) {
      logger.warn('drive-about-user API: Missing credentials header');
      res.status(401).json({
        error: 'Missing credentials header',
        details: 'Please provide credentials via X-Google-Json header (plaintext service account JSON)',
      });
      return;
    }
    
    // Parse and validate plaintext JSON credentials
    let serviceAccountJson: GoogleServiceAccountCredentials;
    
    try {
      serviceAccountJson = JSON.parse(jsonCredentials);
    } catch {
      logger.warn('drive-about-user API: Invalid JSON format');
      res.status(401).json({
        error: 'Invalid JSON format',
        details: 'X-Google-Json header must contain valid JSON',
      });
      return;
    }
    
    if (serviceAccountJson.type !== 'service_account') {
      logger.warn('drive-about-user API: Not a service account');
      res.status(401).json({
        error: 'Invalid credentials',
        details: 'Expected service account JSON with type="service_account"',
      });
      return;
    }
    
    console.log('  Creating Google Drive client with plaintext service account JSON...');
    const googleClient = await createGoogleClientWithServiceAccountJSON(serviceAccountJson);
    
    // Fetch user info from Google Drive API using shared helper
    console.log('  Fetching user info from Google Drive API...');
    const userData = await getGoogleDriveUser(googleClient);
    
    console.log(`  Retrieved user: ${userData.user.emailAddress}`);
    logger.info('drive-about-user API completed', {
      email: userData.user.emailAddress,
      displayName: userData.user.displayName,
      permissionId: userData.user.permissionId,
      authType: googleClient.authType,
    });
    
    // Return successful response
    res.status(200).json(userData);
    
  } catch (error: any) {
    logger.error('drive-about-user API error', { 
      error: error.message,
      stack: error.stack 
    });
    console.error('  Error in drive-about-user API:', error);
    
    // Handle authentication errors
    if (error.message.includes('401') || error.message.includes('Invalid')) {
      res.status(401).json({
        error: 'Invalid or expired service account credentials',
        details: error.message,
      });
      return;
    }
    
    // Handle rate limiting or other API errors
    if (error.message.includes('429')) {
      res.status(429).json({
        error: 'Google Drive API rate limit exceeded',
        details: error.message,
      });
      return;
    }
    
    // Generic error response
    res.status(500).json({
      error: 'Google Drive API error',
      details: error.message,
    });
  }
}
