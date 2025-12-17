import type { Request, Response } from 'express';
import { validateApiHeaders, handleApiError, type ErrorCommentContext } from './api-error-helpers.js';
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client.js';
import { createLLMClient } from '../llm-client/provider-factory.js';
import { executeCheckStoryChanges } from '../providers/combined/tools/check-story-changes/core-logic.js';
import { resolveCloudId } from '../providers/atlassian/atlassian-helpers.js';
import { 
  createProgressCommentManager,
  type ProgressCommentManager 
} from './progress-comment-manager.js';

export async function handleCheckStoryChanges(req: Request, res: Response) {
  let commentContext: ErrorCommentContext | null = null;
  let progressManager: ProgressCommentManager | null = null;
  
  try {
    const { storyKey, cloudId, siteName } = req.body;

    const tokens = validateApiHeaders(req.headers, res);
    if (!tokens) return;

    const { atlassianToken } = tokens;

    // Create API clients
    const atlassianClient = createAtlassianClientWithPAT(atlassianToken);
    const generateText = createLLMClient();

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
    const result = await executeCheckStoryChanges(
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
