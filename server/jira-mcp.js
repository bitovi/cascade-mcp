/**
 * MCP (Model Context Protocol) Tool Endpoints
 *
 * This module provides MCP-compatible endpoints for interacting with Jira
 * through the OAuth-secured authentication server using the official MCP SDK.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
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

let testForcingAuthError = false;
/*
setTimeout(() => {
  testForcingAuthError = true;
  logger.info('Test forcing auth error enabled');
}, 10000); // Enable after 10 seconds for testing purposes
*/


// Helper function to handle 401 responses from Jira API
function handleJiraAuthError(response, operation = 'Jira API request') {
  if (testForcingAuthError || response.status === 401) {
    // Token has expired or is invalid, throw the proper MCP OAuth error
    throw new InvalidTokenError(`Authentication required: ${operation} returned 401. The access token expired and re-authentication is needed.`);
  }
  if (!response.ok) {
    throw new Error(`${operation} failed: ${response.status} ${response.statusText}`);
  }
}

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


// Wrapper function to handle authentication for MCP tools
function withAuthHandling(toolCallback) {
  return async (params, context) => {
    try {
      return await toolCallback(params, context);
    } catch (err) {
      logger.error('Tool execution error:', err);
      
      // Check if this is an MCP OAuth authentication error
      if (err instanceof InvalidTokenError) {
        logger.info('Authentication expired (MCP OAuth error), propagating to trigger re-authentication');
        // Re-throw the MCP OAuth error as-is - the MCP framework will handle it properly
        throw err;
      }
      
      // Re-throw other errors as-is
      throw err;
    }
  };
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
  try {
    logger.debug('Converting blob to base64', { 
      blobSize: blob.size, 
      blobType: blob.type 
    });
    
    const arrayBuffer = await blob.arrayBuffer(); // Get the ArrayBuffer from the Blob
    logger.debug('ArrayBuffer created', { bufferLength: arrayBuffer.byteLength });
    
    const buffer = Buffer.from(arrayBuffer); // Create a Buffer from the ArrayBuffer
    logger.debug('Buffer created', { bufferLength: buffer.length });
    
    const base64String = buffer.toString('base64');
    logger.debug('Base64 conversion complete', { base64Length: base64String.length });
    
    return base64String;
  } catch (error) {
    logger.error('Failed to convert blob to base64:', error);
    throw new Error(`Failed to convert blob to base64: ${error.message}`);
  }
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
  withAuthHandling(async ({ attachmentIds, cloudId }, context) => {
    logger.info('get-jira-attachments called', { 
      attachmentIds, 
      cloudId, 
      attachmentCount: attachmentIds?.length 
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

    logger.info('Found valid auth token, proceeding with attachment fetch');

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

      logger.info('Starting parallel fetch of attachments', { 
        attachmentIds, 
        cloudId,
        fetchUrl: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/attachment/content/` 
      });

      const responses = await Promise.allSettled(
        attachmentIds.map(async (id) => {
          logger.info(`Fetching attachment ${id}`);
          try {
            const fetchUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/attachment/content/${id}`;
            logger.debug(`Making request to: ${fetchUrl}`);
            
            const response = await fetch(fetchUrl, {
              headers: {
                Authorization: `Bearer ${token}`,
                // Don't specify Accept header for binary content
              },
            });

            logger.info(`Response for attachment ${id}:`, {
              status: response.status,
              statusText: response.statusText,
              contentType: response.headers.get('content-type'),
              contentLength: response.headers.get('content-length')
            });

            handleJiraAuthError(response, `Fetch attachment ${id}`);

            logger.info(`Converting response to blob for attachment ${id}`);
            const blob = await response.blob();
            
            logger.info(`Blob created for attachment ${id}:`, {
              size: blob.size,
              type: blob.type
            });
            
            // Check blob size to prevent memory issues
            if (blob.size > 10 * 1024 * 1024) { // 10MB limit
              throw new Error(`Attachment ${id} is too large (${Math.round(blob.size / 1024 / 1024)}MB)`);
            }

            logger.info(`Converting blob to base64 for attachment ${id}`);
            const base64Data = await blobToBase64(blob);
            logger.info(`Base64 conversion complete for attachment ${id}`, {
              base64Length: base64Data.length
            });
            
            return {
              id,
              mimeType: blob.type || 'application/octet-stream',
              encoded: base64Data,
              size: blob.size,
            };
          } catch (error) {
            logger.error(`Error fetching attachment ${id}:`, error);
            throw error;
          }
        }),
      );

      // Filter successful responses and handle failures
      logger.info('Processing attachment fetch results', {
        totalResponses: responses.length,
        fulfilled: responses.filter(r => r.status === 'fulfilled').length,
        rejected: responses.filter(r => r.status === 'rejected').length
      });

      const successfulResponses = [];
      const errors = [];

      responses.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          logger.info(`Attachment ${attachmentIds[index]} fetched successfully`, {
            size: result.value.size,
            mimeType: result.value.mimeType
          });
          successfulResponses.push(result.value);
        } else {
          logger.error(`Attachment ${attachmentIds[index]} failed:`, result.reason);
          errors.push(`Attachment ${attachmentIds[index]}: ${result.reason.message}`);
        }
      });

      if (successfulResponses.length === 0) {
        logger.warn('No attachments could be fetched', { errors });
        return { 
          content: [{ 
            type: 'text', 
            text: `No attachments could be fetched. Errors:\n${errors.join('\n')}` 
          }] 
        };
      }

      logger.info('Building response content', {
        successfulCount: successfulResponses.length,
        errorCount: errors.length
      });

      const content = [];
      
      // Add any errors as text content first
      if (errors.length > 0) {
        content.push({
          type: 'text',
          text: `Some attachments failed to load:\n${errors.join('\n')}\n\nSuccessfully loaded ${successfulResponses.length} attachment(s):`,
        });
      }

      // Add successful images
      successfulResponses.forEach(({ id, encoded, mimeType, size }) => {
        logger.info(`Adding content for attachment ${id}`, {
          mimeType,
          size,
          isImage: mimeType.startsWith('image/'),
          base64Length: encoded.length
        });

        if (mimeType.startsWith('image/')) {
          content.push({
            type: 'image',
            mimeType: mimeType,
            data: encoded,
          });
        } else {
          // For non-image attachments, provide info instead of binary data
          content.push({
            type: 'text',
            text: `Attachment ${id}: ${mimeType} (${Math.round(size / 1024)}KB) - Binary file content not displayed`,
          });
        }
      });

      logger.info('Returning response content', {
        contentItems: content.length,
        imageItems: content.filter(c => c.type === 'image').length,
        textItems: content.filter(c => c.type === 'text').length
      });

      return { content };
    } catch (err) {
      logger.error('Error fetching attachments from Jira:', err);
      return { content: [{ type: 'text', text: `Error fetching attachments from Jira: ${err.message}` }] };
    }
  }),
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
