/**
 * REST API Handler for Google Drive Document to Markdown Conversion
 * 
 * Accepts Google service account credentials via headers (plaintext only).
 * Converts a Google Docs document to Markdown format.
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
import { executeDriveDocToMarkdown } from '../providers/google/tools/drive-doc-to-markdown/core-logic.js';
import type { ConversionRequest } from '../providers/google/tools/drive-doc-to-markdown/types.js';
import { logger } from '../observability/logger.js';
import { validateGoogleJsonApiHeaders } from './api-error-helpers.js';

/**
 * POST /api/drive-doc-to-markdown
 * 
 * Convert a Google Docs document to Markdown format
 * 
 * Required Headers:
 *   X-Google-Json: {...}  (plaintext service account JSON as string)
 * 
 * ⚠️ WARNING: Passing service account credentials via HTTP headers is EXTREMELY DANGEROUS.
 * Service account keys do not expire and grant full access to resources.
 * Only use this in trusted, secure server-to-server environments.
 * 
 * Request body:
 * {
 *   "url": "https://docs.google.com/document/d/{id}/edit" OR document ID
 * }
 * 
 * Response:
 * {
 *   "markdown": "# Document Title\n\n...",
 *   "warnings": []
 * }
 */
export async function handleDriveDocToMarkdown(req: Request, res: Response): Promise<void> {
  try {
    console.log('API call: drive-doc-to-markdown');
    
    // Validate and parse service account credentials from header
    const serviceAccountJson = validateGoogleJsonApiHeaders(req.headers, res);
    if (!serviceAccountJson) return; // Response already sent
    
    // Validate request body
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
      console.log('  ❌ Missing or invalid URL in request body');
      res.status(400).json({
        error: 'Missing required field: url',
        details: 'Request body must include "url" field with Google Docs URL or document ID',
      });
      return;
    }
    
    console.log(`  URL: ${url}`);
    
    // Create Google API client with service account credentials
    console.log('  Creating Google Drive client with plaintext service account JSON...');
    const googleClient = await createGoogleClientWithServiceAccountJSON(serviceAccountJson);
    
    // Build conversion request
    const request: ConversionRequest = {
      url,
    };
    
    // Execute conversion using shared core logic
    console.log('  Starting document conversion...');
    const result = await executeDriveDocToMarkdown(request, googleClient);
    
    console.log(`  ✅ Conversion successful: ${result.markdown.length} characters`);
    logger.info('drive-doc-to-markdown API completed', {
      markdownLength: result.markdown.length,
      authType: googleClient.authType,
    });
    
    // Return successful response
    res.status(200).json(result);
    
  } catch (error: any) {
    logger.error('drive-doc-to-markdown API error', { 
      error: error.message,
      stack: error.stack 
    });
    console.error('  ❌ Error in drive-doc-to-markdown API:', error);
    
    // Handle authentication errors
    if (error.message.includes('401') || error.message.includes('Invalid')) {
      res.status(401).json({
        error: 'Invalid or expired service account credentials',
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
    
    // Handle invalid URL or document ID
    if (error.message.includes('Invalid URL') || error.message.includes('Invalid document ID')) {
      res.status(400).json({
        error: 'Invalid Google Drive URL or document ID',
        details: error.message,
      });
      return;
    }
    
    // Handle unsupported document type
    if (error.message.includes('Unsupported document type')) {
      res.status(400).json({
        error: 'Unsupported document type',
        details: error.message,
      });
      return;
    }
    
    // Handle file not found
    if (error.message.includes('404') || error.message.includes('not found')) {
      res.status(404).json({
        error: 'Document not found',
        details: error.message,
      });
      return;
    }
    
    // Generic error response
    res.status(500).json({
      error: 'Internal server error during document conversion',
      details: error.message,
    });
  }
}
