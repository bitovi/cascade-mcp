/**
 * REST API Handler for Analyze Feature Scope
 * 
 * Accepts PAT (Personal Access Token) authentication via headers and delegates to core logic.
 * This endpoint analyzes Figma screens to generate a comprehensive scope analysis document.
 */

import type { Request, Response } from 'express';
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { createGoogleClientWithServiceAccountJSON } from '../providers/google/google-api-client.js';
import { createProviderFromHeaders } from '../llm-client/index.js';
import { executeAnalyzeFeatureScope, type ExecuteAnalyzeFeatureScopeParams } from '../providers/combined/tools/analyze-feature-scope/core-logic.js';
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
 * POST /api/analyze-feature-scope
 * 
 * Analyze Figma screens to generate comprehensive scope analysis with in-scope and out-of-scope features
 * 
 * Required Headers:
 *   X-Atlassian-Token: <base64(email:token)>  (Atlassian PAT)
 *   X-Figma-Token: figd_...                    (Figma PAT)
 * 
 * Optional Headers:
 *   X-Google-Json: {...}  (Google service account JSON - enables Google Docs context)
 * 
 * Optional LLM Provider Headers (falls back to env vars):
 *   X-LLM-Provider: anthropic|openai|google|bedrock|mistral|deepseek|groq|xai
 *   X-LLM-Model: model-id
 *   X-LLMClient-{Provider}-Api-Key: key  (e.g., X-LLMClient-OpenAI-Api-Key)
 *   See server/llm-client/providers/README.md for details
 * 
 * Request body:
 * {
 *   "epicKey": "PROJ-123",
 *   "siteName": "my-jira-site",  // optional
 *   "cloudId": "uuid",            // optional
 *   "sessionId": "unique-id"      // optional - for temp directory naming
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "scopeAnalysisContent": "...",
 *   "featureAreasCount": 5,
 *   "questionsCount": 12,
 *   "screensAnalyzed": 8,
 *   "tempDirPath": "/tmp/...",
 *   "epicKey": "PROJ-123"
 * }
 */
export async function handleAnalyzeFeatureScope(req: Request, res: Response) {
  // Track context for error commenting (set after clients created)
  let commentContext: ErrorCommentContext | null = null;
  let progressManager: ProgressCommentManager | null = null;
  
  try {
    const { siteName, cloudId } = req.body;
    const epicKey = validateEpicKey(req.body, res);
    if (!epicKey) return; // Response already sent
    
    console.log(`Tool call: analyze-feature-scope {epicKey: "${epicKey}"}`);
    
    // Extract and validate tokens from headers
    const tokens = validateApiHeaders(req.headers, res);
    if (!tokens) return; // Response already sent
    
    const { atlassianToken, figmaToken } = tokens;
    
    // Create pre-configured API clients with tokens (pass siteName for PAT client)
    const atlassianClient = createAtlassianClientWithPAT(atlassianToken, siteName);
    const figmaClient = createFigmaClient(figmaToken);
    const generateText = createProviderFromHeaders(req.headers as Record<string, string>);
    
    // Create Google client if service account credentials provided (optional)
    const googleServiceAccount = parseOptionalGoogleJson(req.headers);
    const googleClient = googleServiceAccount 
      ? await createGoogleClientWithServiceAccountJSON(googleServiceAccount) 
      : undefined;
    
    // Resolve cloudId BEFORE calling execute (needed for commenting)
    const { cloudId: resolvedCloudId } = await resolveCloudId(atlassianClient, cloudId, siteName);
    console.log(`  Resolved: ${siteName || 'auto-detected'} (${resolvedCloudId})`);
    
    // Set comment context (can now comment if error occurs)
    commentContext = { epicKey, cloudId: resolvedCloudId, client: atlassianClient };
    
    // Create progress comment manager
    progressManager = createProgressCommentManager({
      ...commentContext,
      operationName: 'Analyze Feature Scope'
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
    const result = await executeAnalyzeFeatureScope(
      { 
        epicKey, 
        cloudId: resolvedCloudId,
        siteName
      },
      toolDeps
    );
    
    // Notify success
    await progressManager.notify(`✅ Jira Update Complete: Successfully identified ${result.featureAreasCount} feature areas with ${result.questionsCount} questions`);
    
    // Return success response (matches write-shell-stories format)
    res.json({
      ...result,
      epicKey
    });
    
  } catch (error: any) {
    console.error('REST API: analyze-feature-scope failed:', error);
    
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
