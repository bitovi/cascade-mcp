/**
 * REST API Handler for Google Drive Find and Get Document
 * 
 * Accepts PAT (Personal Access Token) authentication via X-Google-Token header.
 * Searches for a document and retrieves its content in one step.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { createGoogleClientWithPAT } from '../providers/google/google-api-client.js';
import { logger } from '../observability/logger.js';

/**
 * Request body schema for drive-find-and-get-document
 */
const DriveFindAndGetDocumentRequestSchema = z.object({
  searchQuery: z.string().min(1),
  mimeType: z.string().optional(),
});

/**
 * POST /api/drive-find-and-get-document
 * 
 * Search for a Google document and retrieve its content in one step
 * 
 * Required Headers:
 *   X-Google-Token: ya29.a0...  (Google OAuth access token)
 * 
 * Request body:
 * {
 *   "searchQuery": "1395",  // ticket number or search term
 *   "mimeType": "application/vnd.google-apps.document"  // optional, defaults to Google Docs
 * }
 * 
 * Response:
 * {
 *   "fileName": "Ticket 1395 - Feature Request.gdoc",
 *   "fileId": "1abc...xyz",
 *   "webViewLink": "https://docs.google.com/...",
 *   "modifiedTime": "2026-01-05T14:30:00.000Z",
 *   "content": "Plain text content of the document...",
 *   "contentLength": 12345,
 *   "lineCount": 234,
 *   "matchCount": 3  // total files matching search
 * }
 */
export async function handleDriveFindAndGetDocument(req: Request, res: Response): Promise<void> {
  try {
    console.log('API call: drive-find-and-get-document');
    
    // Extract and validate Google token from headers
    const googleToken = req.headers['x-google-token'] as string;
    
    if (!googleToken) {
      logger.warn('drive-find-and-get-document API: Missing X-Google-Token header');
      res.status(401).json({
        error: 'Missing X-Google-Token header',
        details: 'Please provide a Google OAuth access token in the X-Google-Token header',
      });
      return;
    }
    
    // Validate request body
    const validation = DriveFindAndGetDocumentRequestSchema.safeParse(req.body);
    if (!validation.success) {
      logger.warn('drive-find-and-get-document API: Invalid request body', {
        errors: validation.error.errors,
      });
      res.status(400).json({
        error: 'Invalid request body',
        details: validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      });
      return;
    }
    
    const { searchQuery, mimeType } = validation.data;
    
    console.log(`  Search query: ${searchQuery}`);
    
    // Create Google API client with PAT
    const googleClient = createGoogleClientWithPAT(googleToken);
    
    // Build search query
    const defaultMimeType = 'application/vnd.google-apps.document';
    const targetMimeType = mimeType || defaultMimeType;
    
    const driveQuery = `name contains '${searchQuery}' and mimeType='${targetMimeType}'`;
    
    console.log('  Step 1: Searching for matching files...');
    
    // Search for matching files
    const searchResponse = await googleClient.listFiles({
      query: driveQuery,
      pageSize: 10,
      orderBy: 'modifiedTime desc',
    });
    
    if (searchResponse.files.length === 0) {
      logger.info('drive-find-and-get-document API: No matches found', {
        searchQuery,
        mimeType: targetMimeType,
      });
      
      res.status(404).json({
        error: 'No documents found',
        searchQuery,
        suggestions: [
          'Try a shorter or more general search term',
          'Check if the file name is spelled correctly',
          'Verify you have access to the document',
        ],
      });
      return;
    }
    
    // Get the first (most recently modified) matching file
    const matchedFile = searchResponse.files[0];
    const matchCount = searchResponse.files.length;
    
    console.log(`  Found ${matchCount} matching file(s)`);
    console.log(`  Selected: "${matchedFile.name}" (ID: ${matchedFile.id})`);
    
    // Step 2: Get document content
    console.log('  Step 2: Retrieving document content...');
    const content = await googleClient.getDocumentContent(matchedFile.id);
    
    console.log(`  Retrieved content (${content.length} characters)`);
    
    logger.info('drive-find-and-get-document API completed', {
      searchQuery,
      matchCount,
      selectedFile: matchedFile.name,
      fileId: matchedFile.id,
      contentLength: content.length,
    });
    
    // Return successful response
    res.status(200).json({
      fileName: matchedFile.name,
      fileId: matchedFile.id,
      webViewLink: matchedFile.webViewLink,
      modifiedTime: matchedFile.modifiedTime,
      content,
      contentLength: content.length,
      lineCount: content.split('\n').length,
      matchCount,
    });
    
  } catch (error: any) {
    logger.error('drive-find-and-get-document API error', { 
      error: error.message,
      stack: error.stack 
    });
    console.error('  Error in drive-find-and-get-document API:', error);
    
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
    
    // Generic error response
    res.status(500).json({
      error: 'Google Drive API error',
      details: error.message,
    });
  }
}
