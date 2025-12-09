import type { Request, Response } from 'express';
import { validateApiHeaders } from './api-error-helpers.js';
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client.js';
import { createLLMClient } from '../llm-client/provider-factory.js';
import { executeCheckStoryChanges } from '../providers/combined/tools/check-story-changes/core-logic.js';

export async function handleCheckStoryChanges(req: Request, res: Response) {
  try {
    const { storyKey, cloudId, siteName } = req.body;

    const tokens = validateApiHeaders(req.headers, res);
    if (!tokens) return;

    const { atlassianToken } = tokens;

    // Create API clients
    const atlassianClient = createAtlassianClientWithPAT(atlassianToken);
    const generateText = createLLMClient();

    // Execute core logic
    const result = await executeCheckStoryChanges(
      { storyKey, cloudId, siteName },
      {
        atlassianClient,
        figmaClient: null as any, // Not needed for this tool
        generateText,
        notify: async () => {}, // No-op for REST API
      }
    );

    res.json({
      success: result.success,
      analysis: result.analysis,
      metadata: result.metadata,
    });
  } catch (error: any) {
    console.error('REST API: check-story-changes failed:', error);

    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
