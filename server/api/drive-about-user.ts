/**
 * REST API Handler for Google Drive About User
 * 
 * Accepts Google service account credentials via headers (encrypted or plaintext).
 * Returns authenticated user's profile information from Google Drive.
 * 
 * Note: Google Drive API does not support Personal Access Tokens (PATs).
 * Use service account credentials instead.
 */

import type { Request, Response } from 'express';
import { 
  createGoogleClientWithServiceAccountEncrypted,
  createGoogleClientWithServiceAccountJSON 
} from '../providers/google/google-api-client.js';
import type { GoogleServiceAccountCredentials } from '../providers/google/types.js';
import { logger } from '../observability/logger.js';

/**
 * POST /api/drive-about-user
 * 
 * Retrieve information about the authenticated Google Drive user
 * 
 * Required Headers (choose one):
 *   X-Google-Encrypt: RSA-ENCRYPTED:...  (encrypted service account credentials)
 *   X-Google-Json: {...}  (plaintext service account JSON as string)
 * 
 * Get encrypted credentials from /google-service-encrypt page
 * 
 * Request body: {} (empty object)
 * 
 * Response:
 * {
 *   "user": {
 *     "kind": "drive#user",
 *     "displayName": "John Doe",
 *     "emailAddress": "johndoe@example.com",
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
    const encryptedCredentials = req.headers['x-google-encrypt'] as string;
    const jsonCredentials = req.headers['x-google-json'] as string;
    
    if (!encryptedCredentials && !jsonCredentials) {
      logger.warn('drive-about-user API: Missing credentials header');
      res.status(401).json({
        error: 'Missing credentials header',
        details: 'Please provide credentials via X-Google-Encrypt (encrypted) or X-Google-Json (plaintext) header',
      });
      return;
    }
    
    let googleClient: Awaited<ReturnType<typeof createGoogleClientWithServiceAccountEncrypted>>;
    
    // Handle encrypted credentials
    if (encryptedCredentials) {
      if (!encryptedCredentials.startsWith('RSA-ENCRYPTED:')) {
        logger.warn('drive-about-user API: Invalid encrypted credential format');
        res.status(401).json({
          error: 'Invalid encrypted credential format',
          details: 'Expected RSA-ENCRYPTED: prefix. Get encrypted credentials from /google-service-encrypt page',
        });
        return;
      }
      
      console.log('  Creating Google Drive client with encrypted service account...');
      googleClient = await createGoogleClientWithServiceAccountEncrypted(encryptedCredentials);
    }
    // Handle plaintext JSON credentials
    else if (jsonCredentials) {
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
      googleClient = await createGoogleClientWithServiceAccountJSON(serviceAccountJson);
    }
    
    // Fetch user info from Google Drive API
    console.log('  Fetching user info from Google Drive API...');
    const response = await googleClient!.fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user',
      { method: 'GET' }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Drive API error (${response.status}): ${errorText}`);
    }
    
    const userData = await response.json() as any;
    
    console.log(`  Retrieved user: ${userData.user.emailAddress}`);
    logger.info('drive-about-user API completed', {
      email: userData.user.emailAddress,
      displayName: userData.user.displayName,
      permissionId: userData.user.permissionId,
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
    if (error.message.includes('401') || error.message.includes('Invalid') || error.message.includes('RSA-ENCRYPTED')) {
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
