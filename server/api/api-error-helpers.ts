/**
 * Shared helpers for REST API error handling
 * 
 * Provides common error handling patterns including error commenting to Jira
 */

import type { Response } from 'express';
import type { AtlassianClient } from '../providers/atlassian/atlassian-api-client.js';
import { addIssueComment } from '../providers/atlassian/atlassian-helpers.js';
import { logger } from '../observability/logger.js';

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
 */
export function validateApiHeaders(
  headers: Record<string, string | string[] | undefined>,
  res: Response
): { atlassianToken: string; figmaToken: string; anthropicApiKey: string } | null {
  const atlassianToken = headers['x-atlassian-token'] as string;
  const figmaToken = headers['x-figma-token'] as string;
  const anthropicApiKey = headers['x-anthropic-token'] as string;
  
  if (!atlassianToken) {
    res.status(401).json({ success: false, error: 'Missing required header: X-Atlassian-Token' });
    return null;
  }
  if (!figmaToken) {
    res.status(401).json({ success: false, error: 'Missing required header: X-Figma-Token' });
    return null;
  }
  if (!anthropicApiKey) {
    res.status(401).json({ success: false, error: 'Missing required header: X-Anthropic-Token' });
    return null;
  }
  
  return { atlassianToken, figmaToken, anthropicApiKey };
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
