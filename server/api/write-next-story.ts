/**
 * REST API Handler for Write Next Story
 * 
 * Accepts PAT (Personal Access Token) authentication via headers and d    // Call core logic (tokens NOT passed - clients have them baked in!)
    const result = await executeWriteNextStoryFn(
      { 
        epicKey, 
        cloudId, 
        siteName, 
        sessionId
      },
      toolDeps
    );o core logic.
 * This endpoint writes the next Jira story from shell stories in an epic.
 */

import type { Request, Response } from 'express';
import { createAtlassianClientWithPAT, type AtlassianClient } from '../providers/atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { createGoogleClientWithServiceAccountJSON } from '../providers/google/google-api-client.js';
import { createProviderFromHeaders } from '../llm-client/index.js';
import { executeWriteNextStory as defaultExecuteWriteNextStory, type ExecuteWriteNextStoryParams } from '../providers/combined/tools/write-next-story/core-logic.js';
import type { ToolDependencies } from '../providers/combined/tools/types.js';
import { resolveCloudId } from '../providers/atlassian/atlassian-helpers.js';
import { logger } from '../observability/logger.js';
import { 
  handleApiError, 
  validateApiHeaders, 
  validateEpicKey,
  parseOptionalGoogleToken,
  type ErrorCommentContext 
} from './api-error-helpers.js';
import { 
  createProgressCommentManager,
  type ProgressCommentManager 
} from './progress-comment-manager.js';

/**
 * Dependencies that can be injected for testing
 */
export interface WriteNextStoryHandlerDeps {
  executeWriteNextStory?: (params: ExecuteWriteNextStoryParams, deps: ToolDependencies) => Promise<any>;
  createAtlassianClient?: typeof createAtlassianClientWithPAT;
  createFigmaClient?: typeof createFigmaClient;
}

/**
 * POST /api/write-next-story
 * 
 * Write the next Jira story from shell stories in an epic
 * 
 * Required Headers:
 *   X-Atlassian-Token: ATATT...  (Atlassian PAT)
 *   X-Atlassian-Email: user@example.com  (Email for Basic Auth)
 *   X-Figma-Token: figd_...      (Figma PAT)
 * 
 * Optional Headers:
 *   X-Google-Token: RSA-ENCRYPTED:...  (Encrypted Google service account - enables Google Docs context)
 *   X-Anthropic-Token: sk-...    (Anthropic API key, or use X-LLM-Provider)
 * 
 * Request body:
 * {
 *   "epicKey": "PROJ-123",
 *   "siteName": "my-jira-site",  // optional
 *   "cloudId": "uuid",            // optional
 *   "sessionId": "unique-id"      // optional - for temp directory naming
 * }
 * 
 * Response (story created):
 * {
 *   "success": true,
 *   "issueKey": "PROJ-124",
 *   "issueSelf": "https://bitovi.atlassian.net/rest/api/3/issue/12345",
 *   "storyTitle": "User can login with email",
 *   "epicKey": "PROJ-123"
 * }
 * 
 * Response (all complete):
 * {
 *   "success": true,
 *   "complete": true,
 *   "message": "All stories in epic PROJ-123 have been written! 🎉..."
 * }
 * 
 * @param deps - Optional dependencies for testing (defaults to production implementations)
 */
export async function handleWriteNextStory(req: Request, res: Response, deps: WriteNextStoryHandlerDeps = {}) {
  // Use injected dependencies or defaults
  const executeWriteNextStoryFn = deps.executeWriteNextStory || defaultExecuteWriteNextStory;
  const createAtlassianClientFn = deps.createAtlassianClient || createAtlassianClientWithPAT;
  const createFigmaClientFn = deps.createFigmaClient || createFigmaClient;
  
  // Track context for error commenting (set after clients created)
  let commentContext: ErrorCommentContext | null = null;
  let progressManager: ProgressCommentManager | null = null;
  
  try {
    console.log('REST API: write-next-story called');
    
    // Extract and validate tokens from headers
    const tokens = validateApiHeaders(req.headers, res);
    if (!tokens) return; // Response already sent
    
    const { atlassianToken, figmaToken } = tokens;
    
    // Validate request body
    const { siteName, cloudId } = req.body;
    const epicKey = validateEpicKey(req.body, res);
    if (!epicKey) return;
    
    // Validate siteName is provided (required for REST API)
    if (!siteName) {
      res.status(400).json({
        success: false,
        error: 'siteName is required. Provide siteName (e.g., "mycompany" from mycompany.atlassian.net) in the request body.'
      });
      return;
    }
    
    console.log(`  Processing epic: ${epicKey}`);
    console.log(`  Site name: ${siteName}`);
    console.log(`  Cloud ID: ${cloudId || 'auto-detect'}`);
    
    // Create pre-configured API clients with tokens (pass siteName for PAT client)
    const atlassianClient = createAtlassianClientFn(atlassianToken, siteName);
    const figmaClient = createFigmaClientFn(figmaToken);
    const generateText = createProviderFromHeaders(req.headers as Record<string, string>);
    
    // Create Google client if service account credentials provided (optional)
    const googleServiceAccount = await parseOptionalGoogleToken(req.headers);
    const googleClient = googleServiceAccount 
      ? await createGoogleClientWithServiceAccountJSON(googleServiceAccount) 
      : undefined;
    
    // Resolve cloudId BEFORE calling execute (needed for commenting)
    console.log('  Resolving cloud ID...');
    const { cloudId: resolvedCloudId } = await resolveCloudId(atlassianClient, cloudId, siteName);
    console.log(`  Resolved cloud ID: ${resolvedCloudId}`);
    
    // Set comment context (can now comment if error occurs)
    commentContext = { epicKey, cloudId: resolvedCloudId, client: atlassianClient };
    logger.info('Comment context ready', { epicKey, cloudId: resolvedCloudId });
    
    // Create progress comment manager
    progressManager = createProgressCommentManager({
      ...commentContext,
      operationName: 'Write Next Story'
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
    const result = await executeWriteNextStoryFn(
      { 
        epicKey, 
        cloudId: resolvedCloudId,
        siteName
      },
      toolDeps
    );
    
    // Notify success based on result type
    if (result.complete) {
      await progressManager.notify(`✅ All stories in epic ${epicKey} have been written!`);
    } else {
      await progressManager.notify(`✅ Successfully created story: ${result.storyTitle} (${result.issueKey})`);
    }
    
    // Return success response
    res.json({
      ...result,
      epicKey
    });
    
  } catch (error: any) {
    console.error('REST API: write-next-story failed:', error);
    
    // Handle auth errors (no comment)
    if (error.constructor.name === 'InvalidTokenError') {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }
    
    // If progress manager exists, append error to progress comment
    // This replaces the separate error comment functionality
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
