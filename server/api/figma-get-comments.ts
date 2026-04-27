/**
 * REST API Handler for Figma Get Comments
 *
 * Required Headers:
 *   X-Figma-Token: figd_...
 *
 * Query params:
 *   fileKey (required) - Figma file key
 *   nodeId (optional) - Filter comments to a specific node
 */

import type { Request, Response } from 'express';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';
import { fetchCommentsForFile, groupCommentsIntoThreads } from '../providers/figma/tools/figma-review-design/figma-comment-utils.js';
import type { CommentThread } from '../providers/figma/figma-comment-types.js';

export async function handleFigmaGetComments(req: Request, res: Response): Promise<void> {
  try {
    const fileKey = req.query.fileKey as string | undefined;
    const nodeId = req.query.nodeId as string | undefined;

    if (!fileKey) {
      res.status(400).json({ success: false, error: 'fileKey query parameter is required.' });
      return;
    }

    const figmaToken = req.headers['x-figma-token'] as string | undefined;
    if (!figmaToken) {
      res.status(401).json({ success: false, error: 'Missing X-Figma-Token header.' });
      return;
    }

    const figmaClient = createFigmaClient(figmaToken);

    const allComments = await fetchCommentsForFile(figmaClient, fileKey);
    const threads = groupCommentsIntoThreads(allComments);

    res.json({
      success: true,
      fileKey,
      nodeId: nodeId || null,
      threadCount: threads.length,
      threads,
    });
  } catch (error: any) {
    console.error('REST API: figma-get-comments failed:', error.message);
    if (error.message?.includes('403') || error.message?.includes('unauthorized')) {
      res.status(401).json({ success: false, error: 'Figma authentication failed.' });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
}
