/**
 * REST API Handler for Analyze Figma Scope
 *
 * Accepts PAT (Personal Access Token) authentication via headers and delegates to core logic.
 * This endpoint analyzes Figma designs and posts clarifying questions as comments.
 *
 * Unlike analyze-feature-scope, this tool works independently of Jira.
 */

import type { Request, Response } from 'express';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { createProviderFromHeaders } from '../llm-client/index.js';
import { executeAnalyzeFigmaScope } from '../providers/figma/tools/analyze-figma-scope/core-logic.js';
import { logger } from '../observability/logger.js';

/**
 * POST /api/analyze-figma-scope
 *
 * Analyze Figma designs and post clarifying questions as comments
 *
 * Required Headers:
 *   X-Figma-Token: figd_...  (Figma PAT with file_comments:read and file_comments:write scopes)
 *
 * Optional LLM Provider Headers (falls back to env vars):
 *   X-LLM-Provider: anthropic|openai|google|bedrock|mistral|deepseek|groq|xai
 *   X-LLM-Model: model-id
 *   X-LLMClient-{Provider}-Api-Key: key  (e.g., X-LLMClient-OpenAI-Api-Key)
 *   See server/llm-client/providers/README.md for details
 *
 * Request body:
 * {
 *   "figmaUrls": ["https://www.figma.com/file/...", ...],
 *   "contextDescription": "Optional scope guidance. Specify what's in-scope, out-of-scope, already implemented, or should be ignored."  // optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "analysis": "...",
 *   "questions": [...],
 *   "postingResults": [...],
 *   "postingSummary": "Posted 5/7 questions"
 * }
 */
export async function handleAnalyzeFigmaScope(req: Request, res: Response): Promise<void> {
  try {
    const { figmaUrls, contextDescription } = req.body;

    // Validate required fields
    if (!figmaUrls || !Array.isArray(figmaUrls) || figmaUrls.length === 0) {
      res.status(400).json({
        success: false,
        error: 'figmaUrls is required and must be a non-empty array of Figma URLs',
      });
      return;
    }

    // Validate URL format
    for (const url of figmaUrls) {
      if (typeof url !== 'string' || !url.includes('figma.com')) {
        res.status(400).json({
          success: false,
          error: `Invalid Figma URL: ${url}`,
        });
        return;
      }
    }

    console.log(
      `Tool call: analyze-figma-scope {figmaUrls: ${figmaUrls.length}, hasContext: ${!!contextDescription}}`
    );
    // TODO: Should we have some API helpers that prep the figmaClient?
    // Extract Figma token from headers
    const figmaToken = req.headers['x-figma-token'] as string | undefined;

    if (!figmaToken) {
      res.status(401).json({
        success: false,
        error: 'Missing X-Figma-Token header. Provide a Figma PAT with file_comments:read and file_comments:write scopes.',
      });
      return;
    }

    // Create API clients
    const figmaClient = createFigmaClient(figmaToken);
    const generateText = createProviderFromHeaders(req.headers as Record<string, string>);

    // Simple console-based progress notification for REST API
    const notify = async (message: string): Promise<void> => {
      console.log(`  [analyze-figma-scope] ${message}`);
    };

    // Execute core logic
    const result = await executeAnalyzeFigmaScope(
      {
        figmaUrls,
        contextDescription,
      },
      {
        figmaClient,
        generateText,
        notify,
      }
    );

    // Return success response
    res.json({
      success: true,
      analysis: result.analysis,
      questions: result.questions,
      postingResults: result.postingResults,
      postingSummary: result.postingSummary,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error('REST API: analyze-figma-scope failed:', error);

    // Handle authentication errors
    if (error.message?.includes('403') || error.message?.includes('unauthorized')) {
      res.status(401).json({
        success: false,
        error: 'Figma authentication failed. Check your PAT token and ensure it has file_comments:read and file_comments:write scopes.',
      });
      return;
    }

    // Handle rate limit errors
    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      res.status(429).json({
        success: false,
        error: 'Figma API rate limit exceeded. Please try again later.',
        retryAfter: error.retryAfter || 60,
      });
      return;
    }

    // Return general error response
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
