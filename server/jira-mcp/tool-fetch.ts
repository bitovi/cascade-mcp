/**
 * Fetch Tool for ChatGPT MCP Client
 * 
 * This tool provides a fetch capability specifically designed for ChatGPT
 * to retrieve Jira issue details by issue key/ID. Follows OpenAI MCP 
 * fetch tool specification patterns.
 */

import { z } from 'zod';
import { logger } from '../observability/logger.ts';
import { getAuthInfoSafe, handleJiraAuthError } from './auth-helpers.ts';
import { resolveCloudId } from './atlassian-helpers.ts';
import { sanitizeObjectWithJWTs } from '../tokens.ts';
import type { McpServer } from './mcp-types.ts';

/**
 * Determine if we should use PAT (Personal Access Token) authentication
 * and format the appropriate Authorization header
 * @param token - The token to analyze
 * @returns Object with authType and Authorization header value
 */
function getAuthHeader(token: string): { authType: 'PAT' | 'Bearer', authorization: string } {
  // Use PAT format when TEST_USE_MOCK_ATLASSIAN is true (indicates test mode with PATs)
  const usePAT = process.env.TEST_USE_MOCK_ATLASSIAN === 'true';
  
  if (usePAT) {
    // Token is already base64-encoded for Basic auth
    return {
      authType: 'PAT',
      authorization: `Basic ${token}`
    };
  }
  
  // Default to Bearer token (OAuth)
  return {
    authType: 'Bearer',
    authorization: `Bearer ${token}`
  };
}

// Tool parameters interface
interface FetchParams {
  issueKey: string;
}

// Response interface matching OpenAI MCP fetch tool specification
interface FetchDocumentResponse {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata?: Record<string, any>;
}

/**
 * Register the fetch tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerFetchTool(mcp: McpServer): void {
console.log('Registering Jira issue fetch tool for ChatGPT MCP client');

  mcp.registerTool(
    'fetch',
    {
      title: 'Fetch Jira Issue',
      description: 'Fetch details of a Jira issue by its issue key or ID. Automatically handles Jira authentication and cloud ID resolution.',
      inputSchema: {
        issueKey: z.string().describe('The Jira issue key or ID (e.g., "USER-10", "PROJ-123") to fetch details for.'),
      },
    },
    async ({ issueKey }: FetchParams, context) => {
      logger.info('fetch tool called', {
        issueKey
      });

      // Get auth info with proper error handling
      const authInfo = getAuthInfoSafe(context, 'fetch');
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

      logger.info('Found valid auth token for fetch request', sanitizeObjectWithJWTs({
        atlassianToken: token,
        hasRefreshToken: !!authInfo.refresh_token,
        scope: authInfo.scope,
        issuer: authInfo.iss,
        audience: authInfo.aud,
        operation: 'fetch',
        issueKey,
      }));

      try {
        // Resolve the target cloud ID using the utility function
        let siteInfo;
        try {
          siteInfo = await resolveCloudId(token);
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

        // Build the Jira API URL for the issue
        const finalUrl = `https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/issue/${issueKey}`;

        // Determine the appropriate authentication method
        const { authType, authorization } = getAuthHeader(token);

        // Prepare request headers
        const requestHeaders: Record<string, string> = {
          Authorization: authorization,
          'Accept': 'application/json',
        };

        logger.info('Making HTTP request', sanitizeObjectWithJWTs({ 
          url: finalUrl,
          method: 'GET',
          authType,
          requestToken: token,
          issueKey
        }));

        // Make the HTTP request
        const response = await fetch(finalUrl, {
          method: 'GET',
          headers: requestHeaders,
        });

        logger.info('HTTP request completed', {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          url: finalUrl
        });

        // Handle Jira authentication errors
        handleJiraAuthError(response, `Fetch issue ${issueKey}`);

        if (response.status === 404) {
          logger.warn('Issue not found', { issueKey });
          return {
            content: [{
              type: 'text',
              text: `Issue ${issueKey} not found.`
            }]
          };
        }

        // Get response body
        const responseText = await response.text();
        let issueData;
        
        try {
          issueData = JSON.parse(responseText);
        } catch (parseError) {
          logger.error('Failed to parse Jira response as JSON:', parseError);
          return { 
            content: [{ 
              type: 'text', 
              text: `Error: Failed to parse Jira response for issue ${issueKey}.` 
            }] 
          };
        }

        // Extract key information from the Jira issue
        const issueTitle = `${issueData.key}: ${issueData.fields?.summary || 'No summary'}`;
        const issueText = issueData.fields?.description ? 
          (typeof issueData.fields.description === 'string' ? 
            issueData.fields.description : 
            JSON.stringify(issueData.fields.description)) : 
          'No description available';
        
        const issueUrl = `${siteInfo.siteUrl}/browse/${issueData.key}`;
        
        // Create metadata with additional issue information
        const metadata = {
          status: issueData.fields?.status?.name,
          assignee: issueData.fields?.assignee?.displayName || 'Unassigned',
          reporter: issueData.fields?.reporter?.displayName,
          priority: issueData.fields?.priority?.name,
          issueType: issueData.fields?.issuetype?.name,
          created: issueData.fields?.created,
          updated: issueData.fields?.updated,
          project: issueData.fields?.project?.name,
          cloudId: targetCloudId,
          siteName: siteInfo.siteName
        };

        const fetchDocumentResponse: FetchDocumentResponse = {
          id: issueData.key,
          title: issueTitle,
          text: issueText,
          url: issueUrl,
          metadata: metadata
        };

        logger.info('Fetch request successful', {
          issueKey: issueData.key,
          status: response.status,
          title: issueTitle
        });

        // Return the document object as JSON string in content array
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(fetchDocumentResponse, null, 2),
            },
          ],
        };

      } catch (err: any) {
        logger.error('Error in fetch request:', err);
        return { 
          content: [{ 
            type: 'text', 
            text: `Error making HTTP request: ${err.message}` 
          }] 
        };
      }
    },
  );

  logger.info('  Jira issue fetch tool registered successfully');
}
