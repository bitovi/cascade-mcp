/**
 * Get Figma User Info Tool
 * Simple test tool to verify Figma OAuth authentication works
 */

import { logger } from '../../../observability/logger.js';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.js';
import type { McpServer } from '../../../mcp-core/mcp-types.js';
import { createRateLimitErrorMessage } from '../figma-helpers.js';

/**
 * Register the figma-get-user tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerFigmaGetUserTool(mcp: McpServer): void {
  mcp.registerTool(
    'figma-get-user',
    {
      title: 'Get Figma User Info',
      description: 'Get information about the authenticated Figma user (test tool for OAuth validation)',
      inputSchema: {},
    },
    async (_, context) => {
      console.log('figma-get-user called');
      
      try {
        // Get auth info with proper error handling - uses nested access pattern per Q22
        const authInfo = getAuthInfoSafe(context, 'figma-get-user');
        const token = authInfo?.figma?.access_token;

        if (!token) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: No Figma access token found in authentication context',
              },
            ],
          };
        }

        console.log('  Calling Figma /v1/me API...');

        // Call Figma API to get user info
        const response = await fetch('https://api.figma.com/v1/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Figma API error', {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
          });
          
          // Handle rate limiting with user-friendly message
          if (response.status === 429) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error: ${createRateLimitErrorMessage(errorText)}`,
                },
              ],
            };
          }
          
          return {
            content: [
              {
                type: 'text',
                text: `Error: Figma API request failed: ${response.status} ${response.statusText}\n${errorText}`,
              },
            ],
          };
        }

        const userData = await response.json() as any;
        
        console.log('  Figma user info retrieved successfully');
        logger.info('figma-get-user completed', {
          userId: userData.id,
          email: userData.email,
          handle: userData.handle,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: userData.id,
                email: userData.email,
                handle: userData.handle,
                img_url: userData.img_url,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('Error in figma-get-user tool', {
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
