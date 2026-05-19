/**
 * Share Spreadsheet Tool
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';
import { shareSpreadsheet } from '../sheets-helpers.js';

export function registerSheetsShareTool(mcp: McpServer): void {
  mcp.registerTool(
    'sheets-share',
    {
      title: 'Share Spreadsheet',
      description: 'Share a spreadsheet with an email and role (reader, commenter, writer).',
      inputSchema: {
        spreadsheetId: z.string().describe('Spreadsheet ID'),
        email: z.string().email().describe('Recipient email'),
        role: z.enum(['reader', 'commenter', 'writer']).describe('Permission role'),
        sendNotification: z.boolean().optional().default(true).describe('Send notification email'),
      },
    },
    async ({ spreadsheetId, email, role, sendNotification }, context) => {
      try {
        const authInfo = getAuthInfoSafe(context, 'sheets-share');
        const token = authInfo?.google?.access_token;
        if (!token) {
          return { content: [{ type: 'text', text: 'Error: No Google access token found in authentication context' }] };
        }

        const client = createGoogleClient(token);
        const result = await shareSpreadsheet(client, spreadsheetId, email, role, sendNotification);

        logger.info('sheets-share completed', { spreadsheetId, email, role });
        return { content: [{ type: 'text', text: `Shared spreadsheet with ${email} as ${role}. Permission ID: ${(result as any).id || 'unknown'}` }] };
      } catch (error: any) {
        logger.error('sheets-share error', { error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
      }
    },
  );
}
