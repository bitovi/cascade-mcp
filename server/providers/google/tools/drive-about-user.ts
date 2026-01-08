/**
 * Get Google Drive User Info Tool
 * Retrieves authenticated user's profile information from Google Drive API
 */

import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createGoogleClient } from '../google-api-client.js';

/**
 * Register the drive-about-user tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerDriveAboutUserTool(mcp: McpServer): void {
  mcp.registerTool(
    'drive-about-user',
    {
      title: 'Get Google Drive User Info',
      description: 'Retrieve information about the authenticated Google Drive user',
      inputSchema: {},
    },
    async (_, context) => {
      console.log('drive-about-user called');
      
      try {
        // Get auth info with proper error handling - uses nested access pattern
        const authInfo = getAuthInfoSafe(context, 'drive-about-user');
        const token = authInfo?.google?.access_token;

        if (!token) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: No Google Drive access token found in authentication context',
              },
            ],
          };
        }

        console.log('  Calling Google Drive API /about endpoint...');

        // Create Google client and fetch user info
        const googleClient = createGoogleClient(token);
        const userData = await googleClient.fetchAboutUser();
        const user = userData.user;
        
        console.log(`  Google Drive user info retrieved successfully: ${user.emailAddress}`);
        logger.info('drive-about-user completed', {
          email: user.emailAddress,
          displayName: user.displayName,
          permissionId: user.permissionId,
          authType: googleClient.authType,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                kind: user.kind,
                displayName: user.displayName,
                emailAddress: user.emailAddress,
                permissionId: user.permissionId,
                photoLink: user.photoLink,
                me: user.me,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error('drive-about-user error', { error: error.message });
        console.error('  Error in drive-about-user:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    }
  );
}
