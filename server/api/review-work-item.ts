/**
 * REST API Handler for Review Work Item
 * 
 * Accepts PAT (Personal Access Token) authentication via headers and delegates to core logic.
 * This endpoint reviews a Jira work item and posts questions as a comment.
 */

import type { Request, Response } from 'express';
import { createAtlassianClientWithPAT, type AtlassianClient } from '../providers/atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { createProviderFromHeaders } from '../llm-client/index.js';
import { executeReviewWorkItem as defaultExecuteReviewWorkItem, type ExecuteReviewWorkItemParams } from '../providers/combined/tools/review-work-item/core-logic.js';
import type { ToolDependencies } from '../providers/combined/tools/types.js';
import { resolveCloudId } from '../providers/atlassian/atlassian-helpers.js';
import { logger } from '../observability/logger.js';
import { 
  handleApiError, 
  validateApiHeaders, 
  type ErrorCommentContext 
} from './api-error-helpers.js';
import { 
  createProgressCommentManager,
  type ProgressCommentManager 
} from './progress-comment-manager.js';

/**
 * Dependencies that can be injected for testing
 */
export interface ReviewWorkItemHandlerDeps {
  executeReviewWorkItem?: (params: ExecuteReviewWorkItemParams, deps: ToolDependencies) => Promise<any>;
  createAtlassianClient?: typeof createAtlassianClientWithPAT;
  createFigmaClient?: typeof createFigmaClient;
}

/**
 * POST /api/review-work-item
 * 
 * Review a Jira work item and post questions as a comment
 * 
 * Headers:
 *   X-Atlassian-Token: ATATT...  (Atlassian PAT)
 *   X-Atlassian-Email: user@example.com  (Email for Basic Auth)
 *   X-Figma-Token: figd_...      (Figma PAT - optional)
 *   X-Anthropic-Token: sk-...    (Anthropic API key)
 * 
 * Request body:
 * {
 *   "issueKey": "PROJ-123",
 *   "siteName": "my-jira-site",  // optional
 *   "cloudId": "uuid",           // optional
 *   "maxDepth": 5                // optional - parent hierarchy depth
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "issueKey": "PROJ-123",
 *   "reviewContent": "# Work Item Review...",
 *   "questionCount": 5,
 *   "wellDefined": false,
 *   "commentId": "10001"
 * }
 * 
 * @param deps - Optional dependencies for testing (defaults to production implementations)
 */
export async function handleReviewWorkItem(req: Request, res: Response, deps: ReviewWorkItemHandlerDeps = {}) {
  // Use injected dependencies or defaults
  const executeReviewWorkItemFn = deps.executeReviewWorkItem || defaultExecuteReviewWorkItem;
  const createAtlassianClientFn = deps.createAtlassianClient || createAtlassianClientWithPAT;
  const createFigmaClientFn = deps.createFigmaClient || createFigmaClient;
  
  // Track context for error commenting (set after clients created)
  let commentContext: ErrorCommentContext | null = null;
  let progressManager: ProgressCommentManager | null = null;
  
  try {
    console.log('REST API: review-work-item called');
    
    // Extract and validate tokens from headers
    const tokens = validateApiHeaders(req.headers, res);
    if (!tokens) return; // Response already sent
    
    const { atlassianToken, figmaToken } = tokens;
    
    // Validate request body
    const { issueKey, siteName, cloudId, maxDepth } = req.body;
    
    if (!issueKey || typeof issueKey !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid issueKey parameter'
      });
    }
    
    // Validate siteName is provided (required for REST API)
    if (!siteName) {
      res.status(400).json({
        success: false,
        error: 'siteName is required. Provide siteName (e.g., "mycompany" from mycompany.atlassian.net) in the request body.'
      });
      return;
    }
    
    console.log(`  Processing issue: ${issueKey}`);
    console.log(`  Site name: ${siteName}`);
    console.log(`  Cloud ID: ${cloudId || 'auto-detect'}`);
    console.log(`  Max depth: ${maxDepth || 'default (3)'}`);
    
    // Create pre-configured API clients with tokens (pass siteName for PAT client)
    const atlassianClient = createAtlassianClientFn(atlassianToken, siteName);
    const figmaClient = figmaToken ? createFigmaClientFn(figmaToken) : createFigmaClientFn('');
    const generateText = createProviderFromHeaders(req.headers as Record<string, string>);
    
    // Resolve cloudId BEFORE calling execute (needed for commenting)
    console.log('  Resolving cloud ID...');
    const { cloudId: resolvedCloudId } = await resolveCloudId(atlassianClient, cloudId, siteName);
    console.log(`  Resolved cloud ID: ${resolvedCloudId}`);
    
    // Set comment context (can now comment if error occurs)
    commentContext = { epicKey: issueKey, cloudId: resolvedCloudId, client: atlassianClient };
    logger.info('Comment context ready', { issueKey, cloudId: resolvedCloudId });
    
    // Create progress comment manager
    progressManager = createProgressCommentManager({
      ...commentContext,
      operationName: 'Review Work Item'
    });
    
    // Prepare dependencies with progress comment notifier
    const toolDeps = {
      atlassianClient,
      figmaClient,
      generateText,
      notify: progressManager.getNotifyFunction()
    };
    
    // Call core logic with resolved cloudId
    const result = await executeReviewWorkItemFn(
      { 
        issueKey, 
        cloudId: resolvedCloudId,
        siteName,
        maxDepth
      },
      toolDeps
    );
    
    // Notify success
    const statusEmoji = result.wellDefined ? '✨' : '❓';
    await progressManager.notify(`${statusEmoji} Review complete: ${result.questionCount} questions identified`);
    
    // Return success response
    res.json({
      success: true,
      issueKey,
      reviewContent: result.reviewContent,
      questionCount: result.questionCount,
      wellDefined: result.wellDefined,
      commentId: result.commentId
    });
    
  } catch (error: any) {
    console.error('REST API: review-work-item failed:', error);
    
    // Handle auth errors (no comment)
    if (error.constructor.name === 'InvalidTokenError') {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }
    
    // If progress manager exists, append error to progress comment
    if (progressManager) {
      await progressManager.appendError(error.message);
    } else if (commentContext) {
      // Fallback: If manager wasn't created yet, use old error comment system
      await handleApiError(error, res, commentContext);
      return;
    }
    
    // Return error response
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
