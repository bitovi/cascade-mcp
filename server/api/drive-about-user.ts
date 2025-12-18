/**
 * REST API Handler for Google Drive About User
 * 
 * Accepts PAT (Personal Access Token) authentication via X-Google-Token header.
 * Returns authenticated user's profile information from Google Drive.
 */

import type { Request, Response } from 'express';
import { createGoogleClientWithPAT } from '../providers/google/google-api-client.js';
import { logger } from '../observability/logger.js';

/**
 * POST /api/drive-about-user
 * 
 * Retrieve information about the authenticated Google Drive user
 * 
 * Required Headers:
 *   X-Google-Token: ya29.a0...  (Google OAuth access token)
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
    
    // Extract and validate Google token from headers
    const googleToken = req.headers['x-google-token'] as string;
    
    if (!googleToken) {
      logger.warn('drive-about-user API: Missing X-Google-Token header');
      res.status(401).json({
        error: 'Missing X-Google-Token header',
        details: 'Please provide a Google OAuth access token in the X-Google-Token header',
      });
      return;
    }
    
    // Create Google API client with PAT
    const googleClient = createGoogleClientWithPAT(googleToken);
    
    // Fetch user info from Google Drive API
    console.log('  Fetching user info from Google Drive API...');
    const userData = await googleClient.fetchAboutUser();
    
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
    if (error.message.includes('401') || error.message.includes('Invalid or expired')) {
      res.status(401).json({
        error: 'Invalid or expired Google Drive access token',
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
