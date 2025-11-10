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
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client.js';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { createAnthropicLLMClient } from '../llm-client/anthropic-client.js';
import { executeWriteNextStory as defaultExecuteWriteNextStory, type ExecuteWriteNextStoryParams } from '../providers/combined/tools/write-next-story/core-logic.js';
import type { ToolDependencies } from '../providers/combined/tools/types.js';

/**
 * Dependencies that can be injected for testing
 */
export interface WriteNextStoryHandlerDeps {
  executeWriteNextStory?: (params: ExecuteWriteNextStoryParams, deps: ToolDependencies) => Promise<any>;
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
 * POST /api/write-next-story
 * 
 * Write the next Jira story from shell stories in an epic
 * 
 * Headers:
 *   X-Atlassian-Token: ATATT...  (Atlassian PAT)
 *   X-Atlassian-Email: user@example.com  (Email for Basic Auth)
 *   X-Figma-Token: figd_...      (Figma PAT)
 *   X-Anthropic-Token: sk-...    (Anthropic API key)
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
  const createAnthropicLLMClientFn = deps.createAnthropicLLMClient || createAnthropicLLMClient;
  
  try {
    console.log('REST API: write-next-story called');
    
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
    
    // Call core logic (tokens NOT passed - clients have them baked in!)
    const result = await executeWriteNextStoryFn(
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
    console.error('REST API: write-next-story failed:', error);
    
    // Handle specific error types
    if (error.constructor.name === 'InvalidTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication tokens'
      });
    }
    
    // Handle "all stories complete" case
    if (error.message && error.message.includes('All stories')) {
      return res.json({
        success: true,
        complete: true,
        message: error.message
      });
    }
    
    // Handle "dependency not satisfied" case
    if (error.message && error.message.includes('Dependency')) {
      return res.status(400).json({
        success: false,
        error: 'Dependency not satisfied',
        message: error.message
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
