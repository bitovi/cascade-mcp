/**
 * Get Accessible Jira Sites Tool
 */

import { logger } from '../observability/logger.ts';
import { getAuthInfoSafe, handleJiraAuthError } from './auth-helpers.ts';
import type { AtlassianSite } from './atlassian-helpers.ts';

// MCP tool content interface
interface MCPToolContent {
  type: 'text';
  text: string;
}

interface MCPToolResponse {
  content: MCPToolContent[];
}

// MCP server interface (simplified)
interface MCPServer {
  registerTool(
    name: string,
    definition: {
      title: string;
      description: string;
      inputSchema: Record<string, any>;
    },
    handler: (args: any, context: any) => Promise<MCPToolResponse>
  ): void;
}

/**
 * Register the get-accessible-sites tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerGetAccessibleSitesTool(mcp: MCPServer): void {
  mcp.registerTool(
    'get-accessible-sites',
    {
      title: 'Get Accessible Jira Sites',
      description: 'Get list of accessible Jira sites for the authenticated user',
      inputSchema: {},
    },
    async (_, context): Promise<MCPToolResponse> => {
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
