/**
 * Get Accessible Jira Sites Tool
 */

import { logger } from '../logger.js';
import { getAuthInfoSafe, handleJiraAuthError } from './auth-helpers.js';

/**
 * Register the get-accessible-sites tool with the MCP server
 * @param {McpServer} mcp - MCP server instance
 */
export function registerGetAccessibleSitesTool(mcp) {
  mcp.registerTool(
    'get-accessible-sites',
    {
      title: 'Get Accessible Jira Sites',
      description: 'Get list of accessible Jira sites for the authenticated user',
      inputSchema: {},
    },
    async (_, context) => {
      // Get auth info with proper error handling
      const authInfo = getAuthInfoSafe(context, 'get-accessible-sites');
      const token = authInfo?.atlassian_access_token;

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

        const sites = await response.json();

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
      } catch (err) {
        logger.error('Error fetching accessible sites:', err);
        return { content: [{ type: 'text', text: `Error fetching accessible sites: ${err.message}` }] };
      }
    },
  );
}
