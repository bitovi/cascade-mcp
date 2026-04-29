/**
 * REST API Handler for Atlassian Update Comment
 *
 * Required Headers:
 *   X-Atlassian-Token: email:api-token (Basic auth)
 *
 * Request body:
 * {
 *   "issueKey": "PROJ-123",
 *   "commentId": "12345",
 *   "comment": "Markdown text (replaces full comment body)",
 *   "cloudId": "optional",
 *   "siteName": "optional — e.g., mysite (from mysite.atlassian.net)"
 * }
 */

import type { Request, Response } from 'express';
import { createAtlassianClientWithPAT } from '../providers/atlassian/atlassian-api-client.js';
import { resolveCloudId, updateIssueComment } from '../providers/atlassian/atlassian-helpers.js';

export async function handleAtlassianUpdateComment(req: Request, res: Response): Promise<void> {
  try {
    const { issueKey, commentId, comment, cloudId, siteName } = req.body;

    if (!issueKey || !commentId || !comment) {
      res.status(400).json({ success: false, error: 'issueKey, commentId, and comment are required.' });
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

    await updateIssueComment(client, siteInfo.cloudId, issueKey, commentId, comment);

    res.json({
      success: true,
      issueKey,
      commentId,
    });
  } catch (error: any) {
    console.error('REST atlassian-update-comment error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}
