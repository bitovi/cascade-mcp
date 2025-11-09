/**
 * Search Tool for ChatGPT MCP Client
 * 
 * This tool provides a search capability specifically designed for ChatGPT
 * to search Jira issues using JQL (Jira Query Language). Follows OpenAI MCP  
 * search tool specification patterns.
 */

import { z } from 'zod';
import { logger } from '../../../observability/logger.ts';
import { getAuthInfoSafe, handleJiraAuthError } from '../../../mcp-core/auth-helpers.ts';
import { resolveCloudId, getAuthHeader } from '../atlassian-helpers.ts';
import { sanitizeObjectWithJWTs } from '../../../tokens.ts';
import type { McpServer } from '../../../mcp-core/mcp-types.ts';
import { createAtlassianClient } from '../atlassian-api-client.ts';

// Tool parameters interface
interface SearchParams {
  jql: string;
  maxResults?: number;
  cloudId?: string;
  siteName?: string;
}

// Response interface matching OpenAI MCP search tool specification
interface SearchDocumentResponse {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata?: Record<string, any>;
}

/**
 * Register the search tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerAtlassianSearchTool(mcp: McpServer): void {
  console.log('Registering Jira issue search tool for ChatGPT MCP client');

  mcp.registerTool(
    'search',
    {
      title: 'Search Jira Issues',
      description: 'Search Jira issues using JQL (Jira Query Language). Returns a list of matching issues in a standardized document format for ChatGPT. Automatically handles Jira authentication and cloud ID resolution.',
      inputSchema: {
        jql: z.string().describe('JQL (Jira Query Language) query string. Example: "project = PLAY AND status = \'In Progress\'" or "assignee = currentUser() ORDER BY created DESC"'),
        maxResults: z.number().optional().describe('Maximum number of results to return. Defaults to 25.'),
        cloudId: z.string().optional().describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional().describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
      },
    },
    async ({ jql, maxResults = 25, cloudId, siteName }: SearchParams, context) => {
      logger.info('search tool called', {
        jql,
        maxResults,
        cloudId,
        siteName
      });

      // Get auth info with proper error handling
      const authInfo = getAuthInfoSafe(context, 'search');
      const token = authInfo?.atlassian?.access_token;

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

      logger.info('Found valid auth token for search request', sanitizeObjectWithJWTs({
        atlassianToken: token,
        hasRefreshToken: !!authInfo.atlassian?.refresh_token,
        scope: authInfo.atlassian?.scope,
        issuer: authInfo.iss,
        audience: authInfo.aud,
        operation: 'search',
        jql,
        maxResults
      }));

      try {
        // Create Atlassian API client
        const client = createAtlassianClient(token);
        
        // Resolve the target cloud ID using the utility function
        let siteInfo;
        try {
          siteInfo = await resolveCloudId(client, cloudId, siteName);
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

        // Build the Jira API URL for search
        const searchUrl = `https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/search`;

        // Determine the appropriate authentication method
        const { authType, authorization } = getAuthHeader(token);

        // Prepare request body
        const requestBody = {
          jql,
          maxResults,
          fields: ['summary', 'status', 'assignee', 'duedate', 'priority', 'issuetype', 'created', 'updated', 'reporter', 'project']
        };

        // Prepare request headers
        const requestHeaders: Record<string, string> = {
          Authorization: authorization,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        };

        logger.info('Making HTTP request', sanitizeObjectWithJWTs({
          url: searchUrl,
          method: 'POST',
          authType,
          requestToken: token,
          jql,
          maxResults
        }));

        // Make the HTTP request
        const response = await fetch(searchUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(requestBody),
        });

        logger.info('HTTP request completed', {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          url: searchUrl
        });

        // Handle Jira authentication errors
        handleJiraAuthError(response, `Search with JQL: ${jql}`);

        if (!response.ok) {
          logger.error('Search request failed', {
            status: response.status,
            statusText: response.statusText,
            jql
          });
          return {
            content: [{
              type: 'text',
              text: `Error: Search failed with status ${response.status}. ${response.statusText}`
            }]
          };
        }

        // Get response body
        const responseText = await response.text();
        let searchData;

        try {
          searchData = JSON.parse(responseText);
        } catch (parseError) {
          logger.error('Failed to parse Jira search response as JSON:', parseError);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to parse Jira search response.`
            }]
          };
        }

        // Check if we have issues
        if (!searchData.issues || !Array.isArray(searchData.issues)) {
          logger.warn('No issues array in search response', { searchData });
          return {
            content: [{
              type: 'text',
              text: 'No issues found matching the search criteria.'
            }]
          };
        }

        // Convert each issue to search document format
        const searchDocuments: SearchDocumentResponse[] = searchData.issues.map((issue: any) => {
          const issueKey = issue.key;
          const summary = issue.fields?.summary || 'No summary';
          const title = `${issueKey}: ${summary}`;
          
          // Build text summary with key metadata
          const textParts: string[] = [
            `**Summary:** ${summary}`,
            `**Status:** ${issue.fields?.status?.name || 'Unknown'}`,
            `**Assignee:** ${issue.fields?.assignee?.displayName || 'Unassigned'}`,
          ];

          if (issue.fields?.duedate) {
            textParts.push(`**Due Date:** ${issue.fields.duedate}`);
          }

          if (issue.fields?.priority?.name) {
            textParts.push(`**Priority:** ${issue.fields.priority.name}`);
          }

          const text = textParts.join('\n');
          const url = `${siteInfo.siteUrl}/browse/${issueKey}`;

          // Metadata with additional fields
          const metadata: Record<string, any> = {
            status: issue.fields?.status?.name,
            assignee: issue.fields?.assignee?.displayName || 'Unassigned',
            duedate: issue.fields?.duedate,
            priority: issue.fields?.priority?.name,
            issueType: issue.fields?.issuetype?.name,
            created: issue.fields?.created,
            updated: issue.fields?.updated,
            reporter: issue.fields?.reporter?.displayName,
            project: issue.fields?.project?.name,
            cloudId: targetCloudId,
            siteName: siteInfo.siteName
          };

          return {
            id: issueKey,
            title,
            text,
            url,
            metadata
          };
        });

        logger.info('Search request successful', {
          jql,
          resultCount: searchDocuments.length,
          total: searchData.total,
          maxResults
        });

        // Return array of documents as JSON string
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                total: searchData.total,
                maxResults,
                results: searchDocuments
              }, null, 2),
            },
          ],
        };

      } catch (err: any) {
        logger.error('Error in search request:', err);
        return {
          content: [{
            type: 'text',
            text: `Error making search request: ${err.message}`
          }]
        };
      }
    },
  );

  logger.info('✅ Jira issue search tool registered successfully');
}
