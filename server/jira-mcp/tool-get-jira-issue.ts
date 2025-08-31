/**
 * Get Jira Issue Tool
 */

import { z } from 'zod';
import { logger } from '../observability/logger.ts';
import { getAuthInfoSafe, handleJiraAuthError } from './auth-helpers.ts';
import { resolveCloudId } from './atlassian-helpers.ts';
import { sanitizeObjectWithJWTs } from '../tokens.ts';
import type { McpServer } from './mcp-types.ts';

// Tool parameters interface
interface GetJiraIssueParams {
  issueKey: string;
  cloudId?: string;
  siteName?: string;
  fields?: string;
}

// Jira issue interfaces (basic structure)
interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: any;
    status: {
      name: string;
    };
    attachment?: any[];
    comment?: {
      total: number;
    };
    [key: string]: any;
  };
}

/**
 * Register the get-jira-issue tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerGetJiraIssueTool(mcp: McpServer): void {
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
    async ({ issueKey, cloudId, siteName, fields }: GetJiraIssueParams, context) => {
      logger.info('get-jira-issue called', { 
        issueKey, 
        cloudId, 
        siteName,
        fields 
      });

      // Get auth info with proper error handling
      const authInfo = getAuthInfoSafe(context, 'get-jira-issue');
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

      logger.info('Found valid auth token for issue fetch', sanitizeObjectWithJWTs({
        atlassianToken: token,
        hasRefreshToken: !!authInfo.refresh_token,
        scope: authInfo.scope,
        issuer: authInfo.iss,
        audience: authInfo.aud,
        operation: 'get-jira-issue',
        issueKey,
      }));

      try {
        // Resolve the target cloud ID using the utility function
        let siteInfo;
        try {
          siteInfo = await resolveCloudId(token, cloudId, siteName);
        } catch (error: any) {
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

        logger.info('Making Jira API request for issue details', sanitizeObjectWithJWTs({ 
          issueKey, 
          cloudId: targetCloudId,
          fetchUrl: issueUrl,
          requestToken: token,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }));

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

        const issue = await issueRes.json() as JiraIssue;

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

      } catch (err: any) {
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
