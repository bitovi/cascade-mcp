/**
 * REST API Handler for Google Drive Get Document
 * 
 * Accepts PAT (Personal Access Token) authentication via X-Google-Token header.
 * Retrieves plain text content from a Google Doc using its file ID.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { createGoogleClient } from '../providers/google/google-api-client.js';
import { logger } from '../observability/logger.js';

/**
 * Request body schema for drive-get-document
 */
const DriveGetDocumentRequestSchema = z.object({
  fileId: z.string().min(1),
});

/**
 * POST /api/drive-get-document
 * 
 * Retrieve plain text content from a Google Doc
 * 
 * Required Headers:
 *   X-Google-Token: ya29.a0...  (Google OAuth access token)
 * 
 * Request body:
 * {
 *   "fileId": "1abc...xyz"
 * }
 * 
 * Response:
 * {
 *   "fileId": "1abc...xyz",
 *   "content": "Plain text content of the document...",
 *   "contentLength": 12345,
 *   "lineCount": 234
 * }
 */
export async function handleDriveGetDocument(req: Request, res: Response): Promise<void> {
  try {
    console.log('API call: drive-get-document');
    
    // Extract and validate Google token from headers
    const googleToken = req.headers['x-google-token'] as string;
    
    if (!googleToken) {
      logger.warn('drive-get-document API: Missing X-Google-Token header');
      res.status(401).json({
        error: 'Missing X-Google-Token header',
        details: 'Please provide a Google OAuth access token in the X-Google-Token header',
      });
      return;
    }
    
    // Validate request body
    const validation = DriveGetDocumentRequestSchema.safeParse(req.body);
    if (!validation.success) {
      logger.warn('drive-get-document API: Invalid request body', {
        errors: validation.error.errors,
      });
      res.status(400).json({
        error: 'Invalid request body',
        details: validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
      return;
    }
    
    const { fileId } = validation.data;
    
    console.log(`  File ID: ${fileId}`);
    
    // Create Google API client with PAT
    const googleClient = createGoogleClient(googleToken);
    
    // Get document content from Google Drive API
    console.log('  Fetching document content from Google Drive API...');
    const content = await googleClient.getDocumentContent(fileId);
    
    console.log(`  Retrieved document content (${content.length} characters)`);
    
    logger.info('drive-get-document API completed', {
      fileId,
      contentLength: content.length,
      lineCount: content.split('\n').length,
    });
    
    // Return successful response
    res.status(200).json({
      fileId,
      content,
      contentLength: content.length,
      lineCount: content.split('\n').length,
    });
    
  } catch (error: any) {
    logger.error('drive-get-document API error', { 
      error: error.message,
      stack: error.stack 
    });
    console.error('  Error in drive-get-document API:', error);
    
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
        error: 'Insufficient permissions to access this document',
        details: error.message,
      });
      return;
    }
    
    // Handle not found errors
    if (error.message.includes('404')) {
      res.status(404).json({
        error: 'Document not found',
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
    
    // Handle unsupported file types
    if (error.message.includes('export') || error.message.includes('mimeType')) {
      res.status(400).json({
        error: 'Unsupported file type',
        details: 'This file type cannot be exported as plain text. Only Google Docs are currently supported.',
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
