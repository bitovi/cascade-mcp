/**
 * MCP (Model Context Protocol) Tool Endpoints
 *
 * This module provides MCP-compatible endpoints for interacting with Jira
 * through the OAuth-secured authentication server using the official MCP SDK.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from './logger.js';
import { jwtVerify } from './tokens.js';

// Global auth context store (keyed by transport/session)
const authContextStore = new Map();

// Create MCP server instance
const mcp = new McpServer(
  {
    name: 'jira-tool-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Helper function to get auth info from context
function getAuthInfo(context) {
  // First try to get from context if it's directly available
  if (context?.authInfo?.atlassian_access_token) {
    return context.authInfo;
  }

  // Try to get from the stored auth context using any available session identifier
  for (const [sessionId, authInfo] of authContextStore.entries()) {
    if (authInfo?.atlassian_access_token) {
      return authInfo;
    }
  }

  return null;
}

// Function to store auth info for a transport
export function setAuthContext(transportId, authInfo) {
  authContextStore.set(transportId, authInfo);
}

// Function to clear auth context
export function clearAuthContext(transportId) {
  authContextStore.delete(transportId);
}

// // Register tool to list Jira issues
// mcp.registerTool(
//   'list-jira-issues',
//   {
//     title: 'List Jira Issues',
//     description: 'Fetch Jira issues from the first accessible site using JQL queries',
//     inputSchema: {
//       jql: z.string().optional().describe('JQL (Jira Query Language) query to filter issues'),
//       maxResults: z.number().optional().default(50).describe('Maximum number of results to return'),
//       fields: z
//         .string()
//         .optional()
//         .default('summary,status,assignee,created,updated')
//         .describe('Comma-separated list of fields to return'),
//     },
//   },
//   async ({ jql, maxResults = 50, fields = 'summary,status,assignee,created,updated' }, context) => {
//     const authInfo = getAuthInfo(context);
//     const token = authInfo?.atlassian_access_token;

//     if (!token) {
//       return {
//         content: [
//           {
//             type: 'text',
//             text: 'Error: No valid Atlassian access token found in session context.',
//           },
//         ],
//       };
//     }

//     try {
//       // Get accessible sites
//       const siteRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           Accept: 'application/json',
//         },
//       });

//       if (!siteRes.ok) {
//         throw new Error(`Failed to fetch sites: ${siteRes.status} ${siteRes.statusText}`);
//       }

//       const sites = await siteRes.json();
//       if (!sites.length) {
//         return { content: [{ type: 'text', text: 'No accessible Jira sites.' }] };
//       }

//       const cloudId = sites[0].id;

//       // Build search parameters
//       const searchParams = new URLSearchParams({
//         maxResults: maxResults.toString(),
//         fields: fields,
//       });

//       if (jql) {
//         searchParams.append('jql', jql);
//       }

//       // Fetch issues
//       const issuesRes = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search?${searchParams}`, {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           Accept: 'application/json',
//         },
//       });

//       if (!issuesRes.ok) {
//         throw new Error(`Failed to fetch issues: ${issuesRes.status} ${issuesRes.statusText}`);
//       }

//       const data = await issuesRes.json();

//       if (!data.issues || data.issues.length === 0) {
//         return { content: [{ type: 'text', text: 'No issues found.' }] };
//       }

//       const issuesSummary = data.issues
//         .map((issue) => {
//           const summary = issue.fields.summary || 'No summary';
//           const status = issue.fields.status?.name || 'No status';
//           const assignee = issue.fields.assignee?.displayName || 'Unassigned';
//           return `- ${issue.key}: ${summary} [${status}] (${assignee})`;
//         })
//         .join('\n');

//       return {
//         content: [
//           {
//             type: 'text',
//             text: `Found ${data.issues.length} issues:\n\n${issuesSummary}`,
//           },
//         ],
//       };
//     } catch (err) {
//       logger.error('Error fetching issues from Jira:', err);
//       return { content: [{ type: 'text', text: `Error fetching issues from Jira: ${err.message}` }] };
//     }
//   },
// );

// Register tool to get accessible sites
// mcp.registerTool(
//   'get-accessible-sites',
//   {
//     title: 'Get Accessible Jira Sites',
//     description: 'Get list of accessible Jira sites for the authenticated user',
//     inputSchema: {},
//   },
//   async (_, context) => {
//     const authInfo = getAuthInfo(context);
//     const token = authInfo?.atlassian_access_token;

//     if (!token) {
//       return {
//         content: [
//           {
//             type: 'text',
//             text: 'Error: No valid Atlassian access token found in session context.',
//           },
//         ],
//       };
//     }

//     try {
//       const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           Accept: 'application/json',
//         },
//       });

//       if (!response.ok) {
//         throw new Error(`HTTP ${response.status}: ${response.statusText}`);
//       }

//       const sites = await response.json();

//       if (!sites.length) {
//         return { content: [{ type: 'text', text: 'No accessible Jira sites found.' }] };
//       }

//       const sitesList = sites.map((site) => `- ${site.name} (${site.url}) - ID: ${site.id}`).join('\n');

//       return {
//         content: [
//           {
//             type: 'text',
//             text: `Accessible Jira Sites (${sites.length}):\n\n${sitesList}`,
//           },
//         ],
//       };
//     } catch (err) {
//       logger.error('Error fetching accessible sites:', err);
//       return { content: [{ type: 'text', text: `Error fetching accessible sites: ${err.message}` }] };
//     }
//   },
// );
/*
// Register search tool per OpenAI MCP specification
mcp.registerTool(
  'search',
  {
    title: 'Search Jira Issues',
    description: 'Search for Jira issues using JQL or text query',
    inputSchema: {
      query: z.string().describe('A single query string to search for issues'),
    },
  },
  async ({ query }, context) => {
    console.log('Received search query:', query);
    const authInfo = getAuthInfo(context);
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
      // Get accessible sites
      const siteRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!siteRes.ok) {
        throw new Error(`Failed to fetch sites: ${siteRes.status} ${siteRes.statusText}`);
      }

      const sites = await siteRes.json();
      if (!sites.length) {
        return { content: [{ type: 'text', text: 'No accessible Jira sites found.' }] };
      }
      const targetCloudId = sites[0].id;

      // Search for issues
      const searchUrl = `https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/search`;
      const searchParams = new URLSearchParams({
        jql: query.includes(':') || query.includes('=') ? query : `text ~ "${query}"`,
        maxResults: '50',
        fields: 'key,summary,status,assignee,priority,created,updated,description',
      });

      const issuesRes = await fetch(`${searchUrl}?${searchParams}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!issuesRes.ok) {
        throw new Error(`Failed to search issues: ${issuesRes.status} ${issuesRes.statusText}`);
      }

      const issuesData = await issuesRes.json();
      
      if (!issuesData.issues || issuesData.issues.length === 0) {
        return [];
      }

      // Return array of search results per OpenAI specification
      const searchResults = issuesData.issues.map(issue => {
        const status = issue.fields.status?.name || 'Unknown';
        const assignee = issue.fields.assignee?.displayName || 'Unassigned';
        const priority = issue.fields.priority?.name || 'Unknown';
        const created = new Date(issue.fields.created).toLocaleDateString();
        
        // Create snippet text
        const snippet = `Status: ${status} | Assignee: ${assignee} | Priority: ${priority} | Created: ${created}`;
        
        return {
          id: issue.key,
          title: `${issue.key}: ${issue.fields.summary}`,
          text: snippet,
          url: `https://atlassian.net/browse/${issue.key}` // Generic URL format
        };
      });

      return searchResults;
    } catch (err) {
      logger.error('Error searching Jira issues:', err);
      return { content: [{ type: 'text', text: `Error searching Jira issues: ${err.message}` }] };
    }
  },
);

// Register fetch tool per OpenAI MCP specification
mcp.registerTool(
  'fetch',
  {
    title: 'Fetch Jira Issue Details',
    description: 'Retrieve the full contents of a Jira issue by ID',
    inputSchema: {
      id: z.string().describe('A unique identifier for the Jira issue (issue key)'),
    },
  },
  async ({ id }, context) => {
    const authInfo = getAuthInfo(context);
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
      // Get accessible sites
      const siteRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!siteRes.ok) {
        throw new Error(`Failed to fetch sites: ${siteRes.status} ${siteRes.statusText}`);
      }

      const sites = await siteRes.json();
      if (!sites.length) {
        return { content: [{ type: 'text', text: 'No accessible Jira sites found.' }] };
      }
      const targetCloudId = sites[0].id;

      // Get issue details
      const issueRes = await fetch(`https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/issue/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!issueRes.ok) {
        if (issueRes.status === 404) {
          return { content: [{ type: 'text', text: `Issue ${id} not found.` }] };
        }
        throw new Error(`Failed to fetch issue: ${issueRes.status} ${issueRes.statusText}`);
      }

      const issue = await issueRes.json();
      
      const status = issue.fields.status?.name || 'Unknown';
      const assignee = issue.fields.assignee?.displayName || 'Unassigned';
      const priority = issue.fields.priority?.name || 'Unknown';
      const created = new Date(issue.fields.created).toLocaleDateString();
      const updated = new Date(issue.fields.updated).toLocaleDateString();
      const description = issue.fields.description?.content?.[0]?.content?.[0]?.text || 'No description';
      
      // Create full text content
      const fullText = `Summary: ${issue.fields.summary}\n\n` +
                      `Status: ${status}\n` +
                      `Assignee: ${assignee}\n` +
                      `Priority: ${priority}\n` +
                      `Created: ${created}\n` +
                      `Updated: ${updated}\n\n` +
                      `Description:\n${description}`;

      // Return single object per OpenAI specification
      return {
        id: issue.key,
        title: `${issue.key}: ${issue.fields.summary}`,
        text: fullText,
        url: `https://atlassian.net/browse/${issue.key}`, // Generic URL format
        metadata: {
          status: status,
          assignee: assignee,
          priority: priority,
          created: created,
          updated: updated,
          issueType: issue.fields.issuetype?.name || 'Unknown'
        }
      };
    } catch (err) {
      logger.error('Error fetching Jira issue:', err);
      return { content: [{ type: 'text', text: `Error fetching Jira issue: ${err.message}` }] };
    }
  },
);*/

async function blobToBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer(); // Get the ArrayBuffer from the Blob
  const buffer = Buffer.from(arrayBuffer); // Create a Buffer from the ArrayBuffer
  return buffer.toString('base64');
}

// Register tool to list Jira issues
mcp.registerTool(
  'get-jira-attachments',
  {
    title: 'Get Jira Issues Attachments',
    description: 'Fetch Jira attachments by attachment ID',
    inputSchema: {
      attachmentIds: z.array(z.string()).describe('Array of attachment IDs to fetch'),
      cloudId: z.string().describe('The cloud ID to specify the Jira site'),
    },
  },
  async ({ attachmentIds, cloudId }, context) => {
    const authInfo = getAuthInfo(context);
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
      // Get accessible sites
      // const siteRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      //   headers: {
      //     Authorization: `Bearer ${token}`,
      //     Accept: 'application/json',
      //   },
      // });

      // if (!siteRes.ok) {
      //   throw new Error(`Failed to fetch sites: ${siteRes.status} ${siteRes.statusText}`);
      // }

      // const sites = await siteRes.json();
      // if (!sites.length) {
      //   return { content: [{ type: 'text', text: 'No accessible Jira sites.' }] };
      // }

      // const cloudId = sites[0].id;

      const responses = await Promise.all(
        attachmentIds.map((id) =>
          fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/attachment/content/${id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          })
            .then(async (res) => {
              return res.blob(); // Get the response as a Blob
            })
            .then(async (blob) => {
              return {
                mimeType: blob.type,
                encoded: await blobToBase64(blob),
              };
            }),
        ),
      );

      if (!responses || responses.length === 0) {
        return { content: [{ type: 'text', text: 'No attachments found.' }] };
      }

      return {
        content: responses.map(({ encoded, mimeType }) => {
          return {
            type: 'image',
            mimeType: mimeType,
            data: encoded,
          };
        }),
      };
    } catch (err) {
      logger.error('Error fetching issues from Jira:', err);
      return { content: [{ type: 'text', text: `Error fetching attachments from Jira: ${err.message}` }] };
    }
  },
);

/**
 * JWT-Protected Jira Issues Endpoint
 * Fetches Jira issues using the JWT token containing Atlassian access token
 */
export async function jiraIssues(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = auth.slice('Bearer '.length);
  try {
    // Decode JWT to get Atlassian token
    const payload = await jwtVerify(token);
    const atlassianToken = payload.atlassian_access_token;

    if (!atlassianToken) {
      return res.status(401).json({ error: 'No Atlassian token in JWT' });
    }

    // Get accessible sites
    const siteResponse = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${atlassianToken}` },
    });
    const sites = await siteResponse.json();

    if (!sites.length) {
      return res.status(400).json({ error: 'No accessible Jira sites' });
    }

    const cloudId = sites[0].id;

    // Fetch issues
    const issuesResponse = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`, {
      headers: {
        Authorization: `Bearer ${atlassianToken}`,
        Accept: 'application/json',
      },
    });

    const issues = await issuesResponse.json();
    res.json(issues);
  } catch (err) {
    logger.error('JWT verification or Jira API error:', err);
    res.status(500).json({ error: 'Failed to fetch Jira issues' });
  }
}

// Export the MCP server instance for use in server.js
export { mcp };
