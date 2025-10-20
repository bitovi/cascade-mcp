/**
 * Get Accessible Atlassian Sites Tool
 */

import { logger } from '../../../observability/logger.ts';
import { getAuthInfoSafe, handleJiraAuthError } from '../../../mcp-core/auth-helpers.ts';
import type { AtlassianSite } from '../atlassian-helpers.ts';
import type { McpServer } from '../../../mcp-core/mcp-types.ts';

/**
 * Register the atlassian-get-sites tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerAtlassianGetSitesTool(mcp: McpServer): void {
  mcp.registerTool(
    'atlassian-get-sites',
    {
      title: 'Get Accessible Atlassian Sites',
      description: 'Get list of accessible Atlassian sites for the authenticated user',
      inputSchema: {},
    },
    async (_, context) => {
      // Get auth info with proper error handling
      const authInfo = getAuthInfoSafe(context, 'atlassian-get-sites');
      const token = authInfo?.atlassian?.access_token;

      if (!token) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Atlassian access token found in session context.',
            },
          ],
        };
      }

      try {
        const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        handleJiraAuthError(response, 'Fetch accessible sites');

        const sites = await response.json() as AtlassianSite[];

        if (!sites.length) {
          return { content: [{ type: 'text', text: 'No accessible Jira sites found.' }] };
        }

        const sitesList = sites.map((site) => `- ${site.name} (${site.url}) - Cloud ID: ${site.id}`).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Accessible Jira Sites (${sites.length}):\n\n${sitesList}`,
            },
          ],
        };
      } catch (err: any) {
        logger.error('Error fetching accessible sites:', err);
        return { content: [{ type: 'text', text: `Error fetching accessible sites: ${err.message}` }] };
      }
    },
  );
}
