/**
 * REST API Handler for Write Shell Stories
 * 
 * Accepts PAT (Personal Access Token) authentication via headers and delegates to core logic.
 * This endpoint generates shell stories from Figma designs linked in a Jira epic.
 */

import type { Request, Response } from 'express';
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { createAnthropicLLMClient } from '../llm-client/anthropic-client.js';
import { executeWriteShellStories as defaultExecuteWriteShellStories, type ExecuteWriteShellStoriesParams } from '../providers/combined/tools/writing-shell-stories/core-logic.js';
import type { ToolDependencies } from '../providers/combined/tools/types.js';

/**
 * Dependencies that can be injected for testing
 */
export interface WriteShellStoriesHandlerDeps {
  executeWriteShellStories?: (params: ExecuteWriteShellStoriesParams, deps: ToolDependencies) => Promise<any>;
  createAtlassianClient?: typeof createAtlassianClientWithPAT;
  createFigmaClient?: typeof createFigmaClient;
  createAnthropicLLMClient?: typeof createAnthropicLLMClient;
}

/**
 * Simple progress notifier for REST API
 * Logs progress to console instead of sending to MCP client
 */
function createRestProgressNotifier() {
  return async (message: string) => {
    console.log(`[Progress] ${message}`);
  };
}

/**
 * POST /api/write-shell-stories
 * 
 * Generate shell stories from Figma designs in a Jira epic
 * 
 * Headers:
 *   X-Atlassian-Token: <base64(email:token)>  (Atlassian PAT - see link below)
 *   X-Figma-Token: figd_...      (Figma PAT)
 *   X-Anthropic-Token: sk-...    (Anthropic API key)
 * 
 * To create the Atlassian token, see:
 * https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token
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
 *   "shellStoriesContent": "...",
 *   "storyCount": 12,
 *   "screensAnalyzed": 8,
 *   "tempDirPath": "/tmp/...",
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
  const createAnthropicLLMClientFn = deps.createAnthropicLLMClient || createAnthropicLLMClient;
  try {
    console.log('REST API: write-shell-stories called');
    
    // Extract tokens from headers
    const atlassianToken = req.headers['x-atlassian-token'] as string;
    const figmaToken = req.headers['x-figma-token'] as string;
    const anthropicApiKey = req.headers['x-anthropic-token'] as string;
    
    // Validate tokens
    if (!atlassianToken) {
      return res.status(401).json({ success: false, error: 'Missing required header: X-Atlassian-Token' });
    }
    if (!figmaToken) {
      return res.status(401).json({ success: false, error: 'Missing required header: X-Figma-Token' });
    }
    if (!anthropicApiKey) {
      return res.status(401).json({ success: false, error: 'Missing required header: X-Anthropic-Token' });
    }
    
    // Validate request body
    const { epicKey, siteName, cloudId, sessionId } = req.body;
    
    if (!epicKey) {
      return res.status(400).json({ success: false, error: 'Missing required field: epicKey' });
    }
    
    console.log(`  Processing epic: ${epicKey}`);
    console.log(`  Site name: ${siteName || 'auto-detect'}`);
    console.log(`  Cloud ID: ${cloudId || 'auto-detect'}`);
    
    // Create pre-configured API clients with tokens
    // Note: atlassianToken should be base64(email:api_token) for Basic Auth
    const atlassianClient = createAtlassianClientFn(atlassianToken);
    const figmaClient = createFigmaClientFn(figmaToken);
    const generateText = createAnthropicLLMClientFn(anthropicApiKey);
    
    // Prepare dependencies with REST progress notifier
    const toolDeps = {
      atlassianClient,
      figmaClient,
      generateText,
      notify: createRestProgressNotifier()
    };
    
    // Call core logic
    const result = await executeWriteShellStoriesFn(
      { 
        epicKey, 
        cloudId, 
        siteName, 
        sessionId
      },
      toolDeps
    );
    
    // Return success response
    res.json({
      ...result,
      epicKey
    });
    
  } catch (error: any) {
    console.error('REST API: write-shell-stories failed:', error);
    
    // Handle specific error types
    if (error.constructor.name === 'InvalidTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication tokens'
      });
    }
    
    // Generic error response
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
