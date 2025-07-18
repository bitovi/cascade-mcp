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
  async ({ attachmentIds }, context) => {
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
              return { blob: await res.blob(), mimeType: res.headers.get('Content-Type') };
            })
            .then(async ({ blob, mimeType }) => {
              return {
                mimeType: mimeType || 'application/octet-stream',
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
