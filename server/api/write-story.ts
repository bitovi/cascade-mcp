/**
 * REST API Handler for Write Story
 * 
 * Accepts PAT (Personal Access Token) authentication via headers and delegates to core logic.
 * This endpoint generates or refines a Jira story's description with scope analysis and questions.
 */

import type { Request, Response } from 'express';
import { createAtlassianClientWithPAT, type AtlassianClient } from '../providers/atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { createGoogleClientWithServiceAccountJSON } from '../providers/google/google-api-client.js';
import { createProviderFromHeaders } from '../llm-client/index.js';
import { executeWriteStory as defaultExecuteWriteStory, type ExecuteWriteStoryParams, type ExecuteWriteStoryResult } from '../providers/combined/tools/write-story/core-logic.js';
import type { ToolDependencies } from '../providers/combined/tools/types.js';
import { resolveCloudId } from '../providers/atlassian/atlassian-helpers.js';
import { logger } from '../observability/logger.js';
import { 
  handleApiError, 
  validateApiHeaders,
  parseOptionalGoogleJson,
  type ErrorCommentContext 
} from './api-error-helpers.js';
import { 
  createProgressCommentManager,
  type ProgressCommentManager 
} from './progress-comment-manager.js';

/**
 * Dependencies that can be injected for testing
 */
export interface WriteStoryHandlerDeps {
  executeWriteStory?: (params: ExecuteWriteStoryParams, deps: ToolDependencies) => Promise<ExecuteWriteStoryResult>;
  createAtlassianClient?: typeof createAtlassianClientWithPAT;
  createFigmaClient?: typeof createFigmaClient;
}

/**
 * Validate issue key from request body
 */
function validateIssueKey(body: any, res: Response): string | null {
  const { issueKey } = body;
  if (!issueKey || typeof issueKey !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Missing required field: issueKey (Jira issue key, e.g., PROJ-123)'
    });
    return null;
  }
  // Validate format: PROJECT-NUMBER
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(issueKey)) {
    res.status(400).json({
      success: false,
      error: `Invalid issueKey format: ${issueKey}. Expected format: PROJ-123`
    });
    return null;
  }
  return issueKey;
}

/**
 * POST /api/write-story
 * 
 * Generate or refine a Jira story's description with scope analysis and questions
 * 
 * Required Headers:
 *   X-Atlassian-Token: ATATT...  (Atlassian PAT)
 *   X-Atlassian-Email: user@example.com  (Email for Basic Auth)
 *   X-Figma-Token: figd_...      (Figma PAT)
 * 
 * Optional Headers:
 *   X-Google-Json: {...}  (Google service account JSON - enables Google Docs context)
 *   X-Anthropic-Token: sk-...    (Anthropic API key, or use X-LLM-Provider)
 * 
 * Request body:
 * {
 *   "issueKey": "PROJ-123",
 *   "siteName": "my-jira-site",  // optional - for cloudId resolution
 *   "cloudId": "uuid",            // optional - skip resolution if provided
 *   "maxDepth": 3                 // optional - hierarchy depth (default: 3)
 * }
 * 
 * Response (story written):
 * {
 *   "success": true,
 *   "action": "wrote",
 *   "issueKey": "PROJ-123",
 *   "questionCount": 2,
 *   "answeredCount": 0,
 *   "isFirstRun": true,
 *   "changesIncorporated": ["New comment from user@example.com"]
 * }
 * 
 * Response (no changes):
 * {
 *   "success": true,
 *   "action": "no-changes",
 *   "issueKey": "PROJ-123",
 *   "questionCount": 0,
 *   "answeredCount": 3,
 *   "message": "No context changes detected since last run..."
 * }
 * 
 * @param deps - Optional dependencies for testing (defaults to production implementations)
 */
export async function handleWriteStory(req: Request, res: Response, deps: WriteStoryHandlerDeps = {}) {
  // Use injected dependencies or defaults
  const executeWriteStoryFn = deps.executeWriteStory || defaultExecuteWriteStory;
  const createAtlassianClientFn = deps.createAtlassianClient || createAtlassianClientWithPAT;
  const createFigmaClientFn = deps.createFigmaClient || createFigmaClient;
  
  // Track context for error commenting (set after clients created)
  let commentContext: ErrorCommentContext | null = null;
  let progressManager: ProgressCommentManager | null = null;
  
  try {
    console.log('REST API: write-story called');
    
    // Extract and validate tokens from headers
    const tokens = validateApiHeaders(req.headers, res);
    if (!tokens) return; // Response already sent
    
    const { atlassianToken, figmaToken } = tokens;
    
    // Validate request body
    const { siteName, cloudId, maxDepth } = req.body;
    const issueKey = validateIssueKey(req.body, res);
    if (!issueKey) return;
    
    console.log(`  Processing issue: ${issueKey}`);
    console.log(`  Site name: ${siteName || 'auto-detect'}`);
    console.log(`  Cloud ID: ${cloudId || 'auto-detect'}`);
    console.log(`  Max depth: ${maxDepth || 'default (3)'}`);
    
    // Create pre-configured API clients with tokens
    const atlassianClient = createAtlassianClientFn(atlassianToken);
    const figmaClient = createFigmaClientFn(figmaToken);
    const generateText = createProviderFromHeaders(req.headers as Record<string, string>);
    
    // Create Google client if service account credentials provided (optional)
    const googleServiceAccount = parseOptionalGoogleJson(req.headers);
    const googleClient = googleServiceAccount 
      ? await createGoogleClientWithServiceAccountJSON(googleServiceAccount) 
      : undefined;
    
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
      epicKey: issueKey, // Override with issueKey for this tool
      operationName: 'Write Story'
    });
    
    // Prepare dependencies with progress comment notifier
    const toolDeps: ToolDependencies = {
      atlassianClient,
      figmaClient,
      googleClient,
      generateText,
      notify: progressManager.getNotifyFunction()
    };
    
    // Call core logic with resolved cloudId
    const result = await executeWriteStoryFn(
      { 
        issueKey, 
        cloudId: resolvedCloudId,
        siteName,
        maxDepth
      },
      toolDeps
    );
    
    // Notify success based on result type
    if (result.action === 'wrote') {
      const questionInfo = result.questionCount > 0 
        ? ` (${result.questionCount} question${result.questionCount === 1 ? '' : 's'} to answer)` 
        : '';
      await progressManager.notify(`✅ Successfully wrote story: ${issueKey}${questionInfo}`);
    } else {
      await progressManager.notify(`ℹ️ No changes detected for ${issueKey} - story not updated`);
    }
    
    // Return success response
    res.json(result);
    
  } catch (error: any) {
    console.error('REST API: write-story failed:', error);
    
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
