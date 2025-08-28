/**
 * Get Jira Issue Tool
 */

import { z } from 'zod';
import { logger } from '../logger.js';
import { getAuthInfo, handleJiraAuthError, resolveCloudId } from './auth-helpers.js';

/**
 * Register the get-jira-issue tool with the MCP server
 * @param {McpServer} mcp - MCP server instance
 */
export function registerGetJiraIssueTool(mcp) {
  mcp.registerTool(
    'get-jira-issue',
    {
      title: 'Get Jira Issue',
      description: 'Retrieve complete details of a Jira issue by ID or key, including description, attachments, comments, and full field data',
      inputSchema: {
        issueKey: z.string().describe('The Jira issue key or ID (e.g., "USER-10", "PROJ-123")'),
        cloudId: z.string().optional().describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional().describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
        fields: z.string().optional().describe('Comma-separated list of fields to return. If not specified, returns all fields.'),
      },
    },
    async ({ issueKey, cloudId, siteName, fields }, context) => {
      logger.info('get-jira-issue called', { 
        issueKey, 
        cloudId, 
        siteName,
        fields 
      });

      const authInfo = getAuthInfo(context);
      const token = authInfo?.atlassian_access_token;

      if (!token) {
        logger.error('No Atlassian access token found in auth context');
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Atlassian access token found in session context.',
            },
          ],
        };
      }

      logger.info('Found valid auth token, proceeding with issue fetch');

      try {
        // Resolve the target cloud ID using the utility function
        let siteInfo;
        try {
          siteInfo = await resolveCloudId(token, cloudId, siteName);
        } catch (error) {
          logger.error('Failed to resolve cloud ID:', error);
          return { 
            content: [{ 
              type: 'text', 
              text: `Error: ${error.message}` 
            }] 
          };
        }
        
        const targetCloudId = siteInfo.cloudId;

        // Build the API URL
        let issueUrl = `https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/issue/${issueKey}`;
        
        // Add fields parameter if specified
        if (fields) {
          const params = new URLSearchParams({ fields });
          issueUrl += `?${params.toString()}`;
        }

        logger.info('Fetching issue details', { 
          issueKey, 
          cloudId: targetCloudId,
          fetchUrl: issueUrl 
        });

        // Get issue details using direct fetch API
        const issueRes = await fetch(issueUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        logger.info('Issue fetch response', {
          status: issueRes.status,
          statusText: issueRes.statusText,
          contentType: issueRes.headers.get('content-type')
        });

        if (issueRes.status === 404) {
          logger.warn('Issue not found', { issueKey });
          return { 
            content: [{ 
              type: 'text', 
              text: `Issue ${issueKey} not found.` 
            }] 
          };
        }

        handleJiraAuthError(issueRes, `Fetch issue ${issueKey}`);

        const issue = await issueRes.json();

        logger.info('Issue fetched successfully', {
          issueKey: issue.key,
          issueId: issue.id,
          summary: issue.fields?.summary,
          status: issue.fields?.status?.name,
          hasDescription: !!issue.fields?.description,
          attachmentCount: issue.fields?.attachment?.length || 0,
          commentCount: issue.fields?.comment?.total || 0
        });

        // Return the complete raw issue data as JSON
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(issue, null, 2),
            },
          ],
        };

      } catch (err) {
        logger.error('Error fetching Jira issue:', err);
        return { 
          content: [{ 
            type: 'text', 
            text: `Error fetching Jira issue: ${err.message}` 
          }] 
        };
      }
    },
  );
}
