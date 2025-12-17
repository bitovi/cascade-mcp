import type { Request, Response } from 'express';
import { validateAtlassianHeaders, handleApiError, type ErrorCommentContext } from './api-error-helpers.js';
import { createAtlassianClientWithPAT, type AtlassianClient } from '../providers/atlassian/atlassian-api-client.js';
import { createProviderFromHeaders } from '../llm-client/index.js';
import { executeCheckStoryChanges as defaultExecuteCheckStoryChanges, type ExecuteCheckStoryChangesParams } from '../providers/combined/tools/check-story-changes/core-logic.js';
import type { ToolDependencies } from '../providers/combined/tools/types.js';
import { resolveCloudId } from '../providers/atlassian/atlassian-helpers.js';
import { 
  createProgressCommentManager,
  type ProgressCommentManager 
} from './progress-comment-manager.js';

/**
 * Dependencies that can be injected for testing
 */
export interface CheckStoryChangesHandlerDeps {
  executeCheckStoryChanges?: (params: ExecuteCheckStoryChangesParams, deps: ToolDependencies) => Promise<any>;
  createAtlassianClient?: typeof createAtlassianClientWithPAT;
}

/**
 * POST /api/check-story-changes
 * 
 * Analyze divergences between a child story and its parent epic
 * 
 * Headers:
 *   X-Atlassian-Token: ATATT...  (Atlassian PAT)
 *   X-Atlassian-Email: user@example.com  (Email for Basic Auth)
 *   X-Anthropic-Token: sk-...    (Anthropic API key)
 * 
 * Request body:
 * {
 *   "storyKey": "PROJ-124",
 *   "siteName": "my-jira-site",  // optional
 *   "cloudId": "uuid"            // optional
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "analysis": "# Divergence Analysis\n\n...",
 *   "metadata": {
 *     "parentKey": "PROJ-100",
 *     "childKey": "PROJ-124",
 *     "tokensUsed": 500
 *   }
 * }
 * 
 * @param deps - Optional dependencies for testing (defaults to production implementations)
 */
export async function handleCheckStoryChanges(req: Request, res: Response, deps: CheckStoryChangesHandlerDeps = {}) {
  // Use injected dependencies or defaults
  const executeCheckStoryChangesFn = deps.executeCheckStoryChanges || defaultExecuteCheckStoryChanges;
  const createAtlassianClientFn = deps.createAtlassianClient || createAtlassianClientWithPAT;
  
  let commentContext: ErrorCommentContext | null = null;
  let progressManager: ProgressCommentManager | null = null;
  
  try {
    const { cloudId, siteName } = req.body;

    // Validate storyKey
    const storyKey = req.body.storyKey;
    if (!storyKey) {
      res.status(400).json({ success: false, error: 'Missing required field: storyKey' });
      return;
    }

    const tokens = validateAtlassianHeaders(req.headers, res);
    if (!tokens) return;

    const { atlassianToken } = tokens;

    // Create API clients
    const atlassianClient = createAtlassianClientFn(atlassianToken);
    const generateText = createProviderFromHeaders(req.headers as Record<string, string>);

    // Resolve cloudId BEFORE calling execute (needed for commenting)
    console.log('  Resolving cloud ID...');
    const { cloudId: resolvedCloudId } = await resolveCloudId(atlassianClient, cloudId, siteName);
    console.log(`  Resolved cloud ID: ${resolvedCloudId}`);
    
    // Set comment context (can now comment on the story)
    commentContext = { epicKey: storyKey, cloudId: resolvedCloudId, client: atlassianClient };
    
    // Create progress comment manager for the story being checked
    progressManager = createProgressCommentManager({
      epicKey: storyKey,
      cloudId: resolvedCloudId,
      client: atlassianClient,
      operationName: 'Check Story Changes'
    });

    // Execute core logic
    const result = await executeCheckStoryChangesFn(
      { storyKey, cloudId: resolvedCloudId, siteName },
      {
        atlassianClient,
        figmaClient: null as any, // Not needed for this tool
        generateText,
        notify: progressManager.getNotifyFunction(),
      }
    );

    // Append the analysis result to the progress comment
    await progressManager.append(result.analysis);

    // Return the result to the API caller
    res.json({
      success: result.success,
      analysis: result.analysis,
      metadata: result.metadata,
    });
  } catch (error: any) {
    console.error('REST API: check-story-changes failed:', error);
    
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

    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
