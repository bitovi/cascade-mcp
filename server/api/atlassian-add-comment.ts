/**
 * REST API Handler for Atlassian Add Comment
 *
 * Required Headers:
 *   X-Atlassian-Token: email:api-token (Basic auth)
 *
 * Request body:
 * {
 *   "issueKey": "PROJ-123",
 *   "comment": "Markdown text",
 *   "cloudId": "optional",
 *   "siteName": "optional — e.g., mysite (from mysite.atlassian.net)"
 * }
 */

import type { Request, Response } from 'express';
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client.js';
import { resolveCloudId, addIssueComment } from '../providers/atlassian/atlassian-helpers.js';

export async function handleAtlassianAddComment(req: Request, res: Response): Promise<void> {
  try {
    const { issueKey, comment, cloudId, siteName } = req.body;

    if (!issueKey || !comment) {
      res.status(400).json({ success: false, error: 'issueKey and comment are required.' });
      return;
    }

    const atlassianToken = req.headers['x-atlassian-token'] as string | undefined;
    if (!atlassianToken) {
      res.status(401).json({ success: false, error: 'Missing X-Atlassian-Token header (format: email:api-token).' });
      return;
    }

    const [email, ...apiTokenParts] = atlassianToken.split(':');
    const apiToken = apiTokenParts.join(':');
    if (!email || !apiToken) {
      res.status(401).json({ success: false, error: 'X-Atlassian-Token must be in format email:api-token.' });
      return;
    }

    const base64Credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
    const client = createAtlassianClientWithPAT(base64Credentials);
    const siteInfo = await resolveCloudId(client, cloudId, siteName);

    const result = await addIssueComment(client, siteInfo.cloudId, issueKey, comment);

    res.json({
      success: true,
      issueKey,
      commentId: result?.commentId || null,
    });
  } catch (error: any) {
    console.error('REST API: atlassian-add-comment failed:', error.message);
    if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
      res.status(401).json({ success: false, error: 'Atlassian authentication failed.' });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
}
