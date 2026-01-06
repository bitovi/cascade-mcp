/**
 * REST API Handler for Google Drive List Files
 * 
 * Accepts PAT (Personal Access Token) authentication via X-Google-Token header.
 * Lists files from authenticated user's Google Drive with filtering, pagination, and sorting.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { createGoogleClientWithPAT } from '../providers/google/google-api-client.js';
import { logger } from '../observability/logger.js';

/**
 * Request body schema for drive-list-files
 */
const DriveListFilesRequestSchema = z.object({
  query: z.string().optional(),
  pageSize: z.number().min(1).max(1000).optional(),
  pageToken: z.string().optional(),
  orderBy: z.string().optional(),
});

/**
 * POST /api/drive-list-files
 * 
 * List files from the authenticated user's Google Drive
 * 
 * Required Headers:
 *   X-Google-Token: ya29.a0...  (Google OAuth access token)
 * 
 * Request body:
 * {
 *   "query": "mimeType='application/vnd.google-apps.document'",  // optional
 *   "pageSize": 50,  // optional, default 100
 *   "pageToken": "CAESBggDEAEYAQ",  // optional, for pagination
 *   "orderBy": "modifiedTime desc"  // optional
 * }
 * 
 * Response:
 * {
 *   "kind": "drive#fileList",
 *   "files": [
 *     {
 *       "id": "1abc...",
 *       "name": "Document.gdoc",
 *       "mimeType": "application/vnd.google-apps.document",
 *       "kind": "drive#file",
 *       "createdTime": "2026-01-01T10:00:00.000Z",
 *       "modifiedTime": "2026-01-05T14:30:00.000Z",
 *       "size": "24576",
 *       "webViewLink": "https://docs.google.com/...",
 *       "owners": [...]
 *     },
 *     ...
 *   ],
 *   "nextPageToken": "CAESBggDEAEYAQ",  // if more results available
 *   "incompleteSearch": false
 * }
 */
export async function handleDriveListFiles(req: Request, res: Response): Promise<void> {
  try {
    console.log('API call: drive-list-files');
    
    // Extract and validate Google token from headers
    const googleToken = req.headers['x-google-token'] as string;
    
    if (!googleToken) {
      logger.warn('drive-list-files API: Missing X-Google-Token header');
      res.status(401).json({
        error: 'Missing X-Google-Token header',
        details: 'Please provide a Google OAuth access token in the X-Google-Token header',
      });
      return;
    }
    
    // Validate request body
    const validation = DriveListFilesRequestSchema.safeParse(req.body);
    if (!validation.success) {
      logger.warn('drive-list-files API: Invalid request body', {
        errors: validation.error.errors,
      });
      res.status(400).json({
        error: 'Invalid request body',
        details: validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
      return;
    }
    
    const params = validation.data;
    
    // Log request parameters (without token)
    console.log('  Parameters:', {
      query: params.query,
      pageSize: params.pageSize,
      pageToken: params.pageToken ? '[provided]' : undefined,
      orderBy: params.orderBy,
    });
    
    // Create Google API client with PAT
    const googleClient = createGoogleClientWithPAT(googleToken);
    
    // List files from Google Drive API
    console.log('  Fetching files from Google Drive API...');
    const response = await googleClient.listFiles(params);
    
    console.log(`  Retrieved ${response.files.length} files`);
    if (response.nextPageToken) {
      console.log('  More results available (pagination)');
    }
    
    logger.info('drive-list-files API completed', {
      fileCount: response.files.length,
      hasNextPage: !!response.nextPageToken,
      query: params.query,
      pageSize: params.pageSize,
    });
    
    // Return successful response
    res.status(200).json(response);
    
  } catch (error: any) {
    logger.error('drive-list-files API error', { 
      error: error.message,
      stack: error.stack 
    });
    console.error('  Error in drive-list-files API:', error);
    
    // Handle authentication errors
    if (error.message.includes('401') || error.message.includes('Invalid or expired')) {
      res.status(401).json({
        error: 'Invalid or expired Google Drive access token',
        details: error.message,
      });
      return;
    }
    
    // Handle permission errors
    if (error.message.includes('403')) {
      res.status(403).json({
        error: 'Insufficient permissions to access Google Drive files',
        details: error.message,
      });
      return;
    }
    
    // Handle rate limiting
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
