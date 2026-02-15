/**
 * REST API Handler for Write Shell Stories
 * 
 * Accepts PAT (Personal Access Token) authentication via headers and delegates to core logic.
 * This endpoint generates shell stories from Figma designs linked in a Jira epic.
 */

import type { Request, Response } from 'express';
import { createAtlassianClientWithPAT, type AtlassianClient } from '../providers/atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { createGoogleClientWithServiceAccountJSON } from '../providers/google/google-api-client.js';
import { createProviderFromHeaders } from '../llm-client/index.js';
import { executeWriteShellStories as defaultExecuteWriteShellStories, type ExecuteWriteShellStoriesParams } from '../providers/combined/tools/writing-shell-stories/core-logic.js';
import type { ToolDependencies } from '../providers/combined/tools/types.js';
import { resolveCloudId } from '../providers/atlassian/atlassian-helpers.js';
import { logger } from '../observability/logger.js';
import { 
  handleApiError, 
  validateApiHeaders, 
  validateEpicKey,
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
export interface WriteShellStoriesHandlerDeps {
  executeWriteShellStories?: (params: ExecuteWriteShellStoriesParams, deps: ToolDependencies) => Promise<any>;
  createAtlassianClient?: typeof createAtlassianClientWithPAT;
  createFigmaClient?: typeof createFigmaClient;
}

/**
 * POST /api/write-shell-stories
 * 
 * Generate shell stories from Figma designs in a Jira epic
 * 
 * Required Headers:
 *   X-Atlassian-Token: <base64(email:token)>  (Atlassian PAT - see link below)
 *   X-Figma-Token: figd_...      (Figma PAT)
 * 
 * Optional Headers:
 *   X-Google-Json: {...}  (Google service account JSON - enables Google Docs context)
 *   X-Anthropic-Token: sk-...    (Anthropic API key, or use X-LLM-Provider)
 * 
 * To create the Atlassian token, see:
 * https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token
 * 
 * Request body:
 * {
 *   "epicKey": "PROJ-123",
 *   "siteName": "my-jira-site",  // optional
 *   "cloudId": "uuid"             // optional
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "shellStoriesContent": "...",
 *   "storyCount": 12,
 *   "screensAnalyzed": 8,
 *   "epicKey": "PROJ-123"
 * }
 * 
 * @param deps - Optional dependencies for testing (defaults to production implementations)
 */
export async function handleWriteShellStories(req: Request, res: Response, deps: WriteShellStoriesHandlerDeps = {}) {
  // Use injected dependencies or defaults
  const executeWriteShellStoriesFn = deps.executeWriteShellStories || defaultExecuteWriteShellStories;
  const createAtlassianClientFn = deps.createAtlassianClient || createAtlassianClientWithPAT;
  const createFigmaClientFn = deps.createFigmaClient || createFigmaClient;
  
  // Track context for error commenting (set after clients created)
  let commentContext: ErrorCommentContext | null = null;
  let progressManager: ProgressCommentManager | null = null;
  
  try {
    console.log('REST API: write-shell-stories called');
    
    // Extract and validate tokens from headers
    const tokens = validateApiHeaders(req.headers, res);
    if (!tokens) return; // Response already sent
    
    const { atlassianToken, figmaToken } = tokens;
    
    // Validate request body
    const { siteName, cloudId } = req.body;
    const epicKey = validateEpicKey(req.body, res);
    if (!epicKey) return;
    
    console.log(`  Processing epic: ${epicKey}`);
    console.log(`  Site name: ${siteName || 'auto-detect'}`);
    console.log(`  Cloud ID: ${cloudId || 'auto-detect'}`);
    
    // Create pre-configured API clients with tokens (pass siteName for PAT client)
    // Note: atlassianToken should be base64(email:api_token) for Basic Auth
    const atlassianClient = createAtlassianClientFn(atlassianToken, siteName);
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
    commentContext = { epicKey, cloudId: resolvedCloudId, client: atlassianClient };
    logger.info('Comment context ready', { epicKey, cloudId: resolvedCloudId });
    
    // Create progress comment manager
    progressManager = createProgressCommentManager({
      ...commentContext,
      operationName: 'Write Shell Stories'
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
    const result = await executeWriteShellStoriesFn(
      { 
        epicKey, 
        cloudId: resolvedCloudId,
        siteName
      },
      toolDeps
    );
    
    // Note: No notifications here - core-logic.ts handles all final messaging (per spec 040)
    
    // Return success response
    res.json({
      ...result,
      epicKey
    });
    
  } catch (error: any) {
    console.error('REST API: write-shell-stories failed:', error);
    
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
