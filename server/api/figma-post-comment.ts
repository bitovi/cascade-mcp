/**
 * REST API Handler for Figma Post Comment
 *
 * Required Headers:
 *   X-Figma-Token: figd_...
 *
 * Request body:
 * {
 *   "fileKey": "abc123",
 *   "message": "Comment text",
 *   "nodeId": "123:456"  // optional — pin to a specific node
 * }
 */

import type { Request, Response } from 'express';
import { createFigmaClient } from '../providers/figma/figma-api-client.js';

export async function handleFigmaPostComment(req: Request, res: Response): Promise<void> {
  try {
    const { fileKey, message, nodeId } = req.body;

    if (!fileKey || !message) {
      res.status(400).json({ success: false, error: 'fileKey and message are required.' });
      return;
    }

    const figmaToken = req.headers['x-figma-token'] as string | undefined;
    if (!figmaToken) {
      res.status(401).json({ success: false, error: 'Missing X-Figma-Token header.' });
      return;
    }

    const figmaClient = createFigmaClient(figmaToken);

    const commentRequest: any = { message };
    if (nodeId) {
      commentRequest.client_meta = { node_id: nodeId, node_offset: { x: 0, y: 0 } };
    }

    const result = await figmaClient.postComment(fileKey, commentRequest);

    res.json({
      success: true,
      commentId: result.id,
      fileKey,
      nodeId: nodeId || null,
    });
  } catch (error: any) {
    console.error('REST API: figma-post-comment failed:', error.message);
    if (error.message?.includes('403') || error.message?.includes('unauthorized')) {
      res.status(401).json({ success: false, error: 'Figma authentication failed.' });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
}
