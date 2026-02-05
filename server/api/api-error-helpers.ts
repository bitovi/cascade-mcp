/**
 * Shared helpers for REST API error handling
 * 
 * Provides common error handling patterns including error commenting to Jira
 */

import type { Response } from 'express';
import type { AtlassianClient } from '../providers/atlassian/atlassian-api-client.js';
import { addIssueComment } from '../providers/atlassian/atlassian-helpers.js';
import { logger } from '../observability/logger.js';
import type { GoogleServiceAccountCredentials } from '../providers/google/types.js';

/**
 * Context needed for posting error comments to Jira
 */
export interface ErrorCommentContext {
  epicKey: string;
  cloudId: string;
  client: AtlassianClient;
}

/**
 * Handle API errors with optional Jira commenting
 * 
 * @param error - The error that occurred
 * @param res - Express response object
 * @param commentContext - Optional context for posting error comments to Jira
 */
export async function handleApiError(
  error: any,
  res: Response,
  commentContext: ErrorCommentContext | null
): Promise<void> {
  console.error('REST API error:', error);
  
  // Handle auth errors (no comment)
  if (error.constructor.name === 'InvalidTokenError') {
    res.status(401).json({
      success: false,
      error: error.message
    });
    return;
  }
  
  // Try to post error comment to Jira
  if (commentContext) {
    await tryPostErrorComment(error, commentContext);
  }
  
  // Return error response
  res.status(500).json({
    success: false,
    error: error.message,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
}

/**
 * Attempt to post an error comment to Jira
 * Logs but doesn't throw if commenting fails
 * 
 * @param error - The error to post as a comment
 * @param context - Context with epic key, cloudId, and Atlassian client
 */
async function tryPostErrorComment(
  error: any,
  context: ErrorCommentContext
): Promise<void> {
  try {
    logger.info('Attempting to post error comment', { 
      epicKey: context.epicKey,
      cloudId: context.cloudId,
      errorType: error.constructor.name
    });
    
    const { commentId } = await addIssueComment(
      context.client,
      context.cloudId,
      context.epicKey,
      error.message  // Already markdown-formatted!
    );
    
    logger.info('Successfully posted error comment', { epicKey: context.epicKey, commentId });
  } catch (commentError: any) {
    if (commentError.status === 404) {
      logger.warn('Could not comment - epic may have been deleted', { epicKey: context.epicKey });
    } else {
      logger.error('Failed to post error comment', { 
        epicKey: context.epicKey, 
        error: commentError.message 
      });
    }
    // Don't fail the original error response
  }
}

/**
 * Validate required headers for API requests
 * 
 * @param headers - Request headers object
 * @param res - Express response object
 * @returns Object with extracted tokens, or null if validation failed (response already sent)
 * 
 * Note: LLM provider credentials are validated by createProviderFromHeaders() which supports
 * multiple providers via X-LLM-Provider header and falls back to environment variables
 */
export function validateApiHeaders(
  headers: Record<string, string | string[] | undefined>,
  res: Response
): { atlassianToken: string; figmaToken: string } | null {
  const atlassianToken = headers['x-atlassian-token'] as string;
  const figmaToken = headers['x-figma-token'] as string;
  
  if (!atlassianToken) {
    res.status(401).json({ success: false, error: 'Missing required header: X-Atlassian-Token' });
    return null;
  }
  if (!figmaToken) {
    res.status(401).json({ success: false, error: 'Missing required header: X-Figma-Token' });
    return null;
  }
  
  return { atlassianToken, figmaToken };
}

/**
 * Validate required body fields for API requests
 * 
 * @param body - Request body object
 * @param res - Express response object
 * @returns epicKey if valid, or null if validation failed (response already sent)
 */
export function validateEpicKey(
  body: { epicKey?: string },
  res: Response
): string | null {
  const { epicKey } = body;
  
  if (!epicKey) {
    res.status(400).json({ success: false, error: 'Missing required field: epicKey' });
    return null;
  }
  
  return epicKey;
}

/**
 * Validate Google service account credentials from X-Google-Token header
 * 
 * @param headers - Request headers object
 * @param res - Express response object
 * @returns Decrypted service account credentials, or null if validation failed (response already sent)
 */
export async function validateGoogleTokenApiHeaders(
  headers: Record<string, string | string[] | undefined>,
  res: Response
): Promise<GoogleServiceAccountCredentials | null> {
  const { encryptionManager } = await import('../utils/encryption-manager.js');
  const encryptedToken = headers['x-google-token'] as string;
  
  if (!encryptedToken) {
    res.status(401).json({ 
      success: false, 
      error: 'Missing required header: X-Google-Token',
      details: 'Please provide encrypted credentials via X-Google-Token header. Visit /google-service-encrypt to encrypt your service account JSON.'
    });
    return null;
  }
  
  // Decrypt the token
  let serviceAccountJson: GoogleServiceAccountCredentials;
  try {
    const decrypted = await encryptionManager.decrypt(encryptedToken);
    serviceAccountJson = JSON.parse(decrypted);
  } catch (error: any) {
    res.status(401).json({ 
      success: false, 
      error: 'Invalid or corrupted encrypted token',
      details: `Failed to decrypt X-Google-Token: ${error.message}. Please re-encrypt your credentials at /google-service-encrypt`
    });
    return null;
  }
  
  // Validate it's a service account
  if (serviceAccountJson.type !== 'service_account') {
    res.status(401).json({ 
      success: false, 
      error: 'Invalid credentials',
      details: 'Expected service account JSON with type="service_account"'
    });
    return null;
  }
  
  return serviceAccountJson;
}

/**
 * Parse optional Google service account credentials from X-Google-Token header
 * 
 * Unlike validateGoogleTokenApiHeaders, this function does NOT send error responses.
 * It returns null silently if header is missing or invalid, allowing the caller
 * to continue without Google integration.
 * 
 * @param headers - Request headers object
 * @returns Decrypted service account credentials, or null if not provided or invalid
 */
export async function parseOptionalGoogleToken(
  headers: Record<string, string | string[] | undefined>
): Promise<GoogleServiceAccountCredentials | null> {
  const { encryptionManager } = await import('../utils/encryption-manager.js');
  const encryptedToken = headers['x-google-token'] as string;
  
  console.log('🔍 parseOptionalGoogleToken called');
  console.log('  Headers keys:', Object.keys(headers));
  console.log('  x-google-token present:', !!encryptedToken);
  
  if (!encryptedToken) {
    console.log('  ⚠️ No X-Google-Token header found - skipping Google integration');
    return null; // Header not provided - this is fine for optional Google integration
  }
  
  console.log('  X-Google-Token length:', encryptedToken.length);
  console.log('  X-Google-Token preview:', encryptedToken.substring(0, 60) + '...');
  
  // Decrypt the token
  let serviceAccountJson: GoogleServiceAccountCredentials;
  try {
    const decrypted = await encryptionManager.decrypt(encryptedToken);
    serviceAccountJson = JSON.parse(decrypted);
    console.log('  ✅ Successfully decrypted token');
    console.log('  Service account keys:', Object.keys(serviceAccountJson));
  } catch (error) {
    console.log('  ⚠️ X-Google-Token decryption failed - skipping Google integration');
    console.log('  Decryption error:', error);
    return null;
  }
  
  // Validate it's a service account
  if (serviceAccountJson.type !== 'service_account') {
    console.log('  ⚠️ X-Google-Token is not a service account - skipping Google integration');
    console.log('  Type found:', serviceAccountJson.type);
    return null;
  }
  
  console.log(`  ✅ Google service account provided: ${serviceAccountJson.client_email}`);
  console.log('  Project ID:', serviceAccountJson.project_id);
  console.log('  Private key ID:', serviceAccountJson.private_key_id);
  console.log('  Private key length:', serviceAccountJson.private_key?.length || 0);
  console.log('  Private key starts with:', serviceAccountJson.private_key?.substring(0, 50));
  console.log('  Private key contains escaped newlines:', serviceAccountJson.private_key?.includes('\\n'));
  
  // Fix escaped newlines in private key (common issue with JSON serialization)
  if (serviceAccountJson.private_key?.includes('\\n')) {
    console.log('  🔧 Converting escaped newlines to actual newlines...');
    serviceAccountJson.private_key = serviceAccountJson.private_key.replace(/\\n/g, '\n');
    console.log('  ✅ Private key fixed, now starts with:', serviceAccountJson.private_key.substring(0, 50));
  }
  
  return serviceAccountJson;
}
