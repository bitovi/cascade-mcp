/**
 * Search Tool for ChatGPT MCP Client
 * 
 * This tool provides a search capability specifically designed for ChatGPT
 * to search Jira issues by query string. Follows OpenAI MCP 
 * search tool specification patterns.
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
  
  // Use standard Bearer token for OAuth
  return {
    authType: 'Bearer',
    authorization: `Bearer ${token}`
  };
}

/**
 * Schema for search tool parameters - follows OpenAI specification
 */
const SearchParamsSchema = z.object({
  query: z.string().describe('Search query to find relevant Jira issues')
});

type SearchParams = z.infer<typeof SearchParamsSchema>;

/**
 * Schema for individual search result item
 */
const SearchResultItemSchema = z.object({
  id: z.string().describe('Unique ID for the search result (issue key)'),
  title: z.string().describe('Human-readable title of the issue'),
  url: z.string().describe('Canonical URL for citation')
});

/**
 * Schema for search results response - matches OpenAI specification
 */
const SearchResultsSchema = z.object({
  results: z.array(SearchResultItemSchema).describe('Array of search result objects')
});

type SearchResults = z.infer<typeof SearchResultsSchema>;

/**
 * Convert Jira issue data to search result format
 */
function convertToSearchResult(issue: any, siteInfo: { cloudId: string, siteName: string, siteUrl: string }): SearchResults['results'][0] {
  const issueKey = issue.key;
  const summary = issue.fields?.summary || 'No title available';
  const url = `${siteInfo.siteUrl}/browse/${issueKey}`;

  return {
    id: issueKey,
    title: summary,
    url: url
  };
}

/**
 * Register the search tool with the MCP server
 */
export function registerSearchTool(mcp: McpServer) {
  console.log('Registering Jira search tool for ChatGPT MCP client');

  mcp.registerTool(
    'search',
    {
      title: 'Search Jira Issues',
      description: 'Search for Jira issues by query string. Returns a list of relevant issues with their IDs, titles, and URLs.',
      inputSchema: {
        query: z.string().describe('Search query to find relevant Jira issues'),
      },
    },
    async (params: SearchParams, context) => {
      try {
        console.log(`🔍 Search request received for query: "${params.query}"`);

        // Get authentication info with safety check
        const authInfo = getAuthInfoSafe(context, 'search');
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

        console.log(`  Using authentication token`);

        // Resolve cloud ID from available sites
        const siteInfo = await resolveCloudId(token);
        console.log(`  Resolved cloud ID: ${siteInfo.cloudId}`);

        // Prepare auth header
        const { authorization } = getAuthHeader(token);

        // Execute Jira search using JQL
        // Using a broad search across summary, description, and comments
        const jqlQuery = encodeURIComponent(`text ~ "${params.query}" OR summary ~ "${params.query}" OR description ~ "${params.query}"`);
        const searchUrl = `https://api.atlassian.com/ex/jira/${siteInfo.cloudId}/rest/api/3/search?jql=${jqlQuery}&maxResults=10&fields=key,summary`;

        console.log(`  Executing Jira search: ${searchUrl}`);

        const response = await fetch(searchUrl, {
          method: 'GET',
          headers: {
            'Authorization': authorization,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          // Use the helper function for handling Jira auth errors
          handleJiraAuthError(response, 'search');
          const errorText = await response.text();
          console.error(`  ❌ Jira API error: ${response.status} ${response.statusText}`);
          console.error(`  Error details: ${errorText}`);
          throw new Error(`Jira API request failed: ${response.status} ${response.statusText}`);
        }

        const searchData: any = await response.json();
        console.log(`  ✅ Search completed. Found ${searchData.issues?.length || 0} results`);

        // Convert Jira issues to search results format
        const results: SearchResults['results'] = (searchData.issues || []).map((issue: any) => 
          convertToSearchResult(issue, siteInfo)
        );

        const searchResults: SearchResults = { results };

        // Return results in OpenAI MCP format (JSON-encoded string in text content)
        const responseText = JSON.stringify(searchResults);
        
        console.log(`  📤 Returning ${results.length} search results`);
        console.log(`  Results preview:`, sanitizeObjectWithJWTs(results.slice(0, 3)));

        return {
          content: [
            {
              type: 'text' as const,
              text: responseText
            }
          ]
        };

      } catch (error: any) {
        console.error('Error in search request:', error);
        return { 
          content: [{ 
            type: 'text', 
            text: `Error making search request: ${error.message}` 
          }] 
        };
      }
    },
  );

  console.log('  Jira search tool registered successfully');
}
