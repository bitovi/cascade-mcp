/**
 * Create Jira Issue Tool with Figma Integration
 */

import { z } from 'zod';
import { logger } from '../observability/logger.ts';
import { getAuthInfoSafe, handleJiraAuthError } from './auth-helpers.ts';
import { resolveCloudId } from './atlassian-helpers.ts';
import { convertMarkdownToAdf, validateAdf } from './markdown-converter.ts';
import { sanitizeObjectWithJWTs } from '../tokens.ts';
import type { McpServer } from './mcp-types.ts';
import {
  CreateMessageResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createJiraIssue, getJiraIssue, JiraIssuePayload } from './atlassian-helpers.ts';

/**
 * Determine if we should use PAT (Personal Access Token) authentication
 * and format the appropriate Authorization header
 * @param token - The token to analyze
 * @returns Object with authType and Authorization header value
 */
export function getAuthHeader(token: string): { authType: 'PAT' | 'Bearer', authorization: string } {
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
interface CreateJiraIssueParams {
  jiraEpicId: string;
  cloudId?: string;
  siteName?: string;
}

// Jira API response interface
interface JiraIssueCreationResponse {
  id: string;
  key: string;
  self: string;
}

/**
 * Constructs a comprehensive description by combining user input with Figma element details
 * @param userDescription - User-provided description
 * @param figmaDescription - Optional Figma element description
 * @returns Combined description in markdown format
 */
function buildIssueDescription(userDescription: string, figmaDescription?: string): string {
  let combinedDescription = userDescription;

  if (figmaDescription) {
    combinedDescription = `${userDescription}

## Figma Element Details

${figmaDescription}

---
*Issue created with Figma element context via MCP Jira tool*`;
  }

  return combinedDescription;
}

/**
 * Register the create-jira-issue tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerCreateShellStoriesTool(mcp: McpServer): void {
  mcp.registerTool(
    'create-shell-stories',
    {
      title: 'Create Shell Stories',
      description: `Create shell stories from an Epic, using [required] Figma integration to find and analyze Figma screens.`,
      inputSchema: {
        jiraEpicId: z.string()
          .describe('The Jira Epic containing a link to a Figma file in the description. This Epic will be used to determine the target Jira project and site.'),
                        
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        
        siteName: z.string().optional()
          .describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
      },
    },
    async ({ 
      jiraEpicId, 
      cloudId, 
      siteName, 
    }: CreateJiraIssueParams, context) => {
      console.log('create-shell-stories called', { 
        jiraEpicId, 
        cloudId, 
        siteName
      });

      const projectKey = jiraEpicId.split('-')[0];

      // Get auth info with proper error handling
      const authInfo = getAuthInfoSafe(context, 'create-shell-stories');
      const token = authInfo?.atlassian_access_token;

      if (!token) {
        console.log('No Atlassian access token found in auth context');
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No valid Atlassian access token found in session context.',
            },
          ],
        };
      }

      console.log('Found valid auth token for issue creation', sanitizeObjectWithJWTs({
        atlassianToken: token,
        hasRefreshToken: !!authInfo.refresh_token,
        scope: authInfo.scope,
        issuer: authInfo.iss,
        audience: authInfo.aud,
        operation: 'create-jira-issue',
        projectKey,
      }));

      try {
        // Input validation
        if (!jiraEpicId || !jiraEpicId.trim()) {
          return {
            content: [{
              type: 'text',
              text: 'Error: Jira Epic ID is required.'
            }]
          };
        }

        const { cloudId: resolvedCloudId } = await resolveCloudId(token, cloudId, siteName);

        // Get the Epic issue to extract Figma file link
        const epicIssueRes = await getJiraIssue(resolvedCloudId, jiraEpicId, 'description', token);

        if (epicIssueRes.status === 404) {
          console.log('Epic issue not found', { jiraEpicId });
          return {
            content: [{
              type: 'text',
              text: `Error: Epic issue ${jiraEpicId} not found. Please check the Epic ID and try again.`
            }]
          };
        }

        const epicData = await epicIssueRes.json() as JiraIssuePayload;
        
        // Extract Figma link from ADF (Atlassian Document Format) structure
        let figmaLink: string | undefined;
        
        function extractFigmaLinksFromAdf(content: any[]): string | undefined {
          for (const block of content || []) {
            if (block.type === 'paragraph' && block.content) {
              for (const item of block.content) {
                // Check for inlineCard with Figma URL
                if (item.type === 'inlineCard' && item.attrs?.url) {
                  const url = item.attrs.url;
                  if (url.includes('figma.com')) {
                    return url;
                  }
                }
                // Check for text with Figma URL
                if (item.type === 'text' && item.text) {
                  const match = item.text.match(/https:\/\/(?:www\.)?figma\.com\/[^\s)]+/i);
                  if (match) {
                    return match[0];
                  }
                }
                // Check for links
                if (item.type === 'link' && item.attrs?.href) {
                  const url = item.attrs.href;
                  if (url.includes('figma.com')) {
                    return url;
                  }
                }
              }
            }
          }
          return undefined;
        }
        
        figmaLink = extractFigmaLinksFromAdf(epicData.fields.description?.content);
        if (!figmaLink) {
          console.log('No Figma link found in Epic description', { jiraEpicId });
          return {
            content: [{
              type: 'text',
              text: `Error: No Figma file link found in the description of Epic ${jiraEpicId}. Please add a valid Figma link and try again.`
            }]
          };
        }

        const figmaURL = new URL(figmaLink);

        const [_, fileKey, fileName] = figmaURL.pathname.split('/');
        const nodeId = new URLSearchParams(figmaURL.search).get('node-id');

        console.log("About to query Figma with", { fileKey, fileName, nodeId });

        //  ===== Figma Integration =====
        const figmaResponse = await mcp.server.request({
            "method": "sampling/createMessage",
            "params": {
                "messages": [
                    {
                        "role": "assistant",
                        "content": {
                            "type": "text",
                            "text": /*"Please list for me the MCP servers that your agent in VS Code has access to, including their names and URLs"*/ `
                            Follow the sequence of steps from the repository folder https://github.com/bitovi/ai-enablement-prompts/tree/main/writing-stories/from-figma to create shell stories for the Figma file I am curently passing you:
                            File Key is "${fileKey}"
                            File Name is "${fileName}"
                            Node ID is "${nodeId}"
                            Please use the configured Figma MCP server to fetch the file details and analyze the content.
                            Provide a detailed description of the Figma elements that can be used to create shell stories in Jira.
                            Send me back the shell stories as a JSON object array with the following structure:
                            [
                              {
                                "nodeId": "The ID of the Figma element that this story is based on",
                                "summary": "Short summary of the story",
                                "description": "Detailed description of the story, including acceptance criteria and any relevant details.",
                                "screenshot": "The Base64-encoded screenshot of the Figma element associated with this story, if available. Use get_screenshot from the Figma MCP server to retrieve this.  Pass the nodeId of the Figma element that this story is based on to get_screenshot, instead of passing ${nodeId}."
                              },
                            ]
                            If you get a timeout error, try again to call the Figma MCP server before giving up.
                            If you have any questions before returning the JSON, prompt the user for more information.  Do not return the questions to me.  I can't answer them.
                            `
                        }
                    }
                ],
                "speedPriority": 0.5,
                "systemPrompt": "You are a helpful designer who provides detailed descriptions of Figma elements.",
                "maxTokens": 10000
            }
        }, CreateMessageResultSchema);

        console.log('Figma response received:', JSON.stringify(figmaResponse, null, 2));

        const figmaFullText = figmaResponse.content?.text as string;
        const figmaContentStringified = figmaFullText.substring(figmaFullText.indexOf('```json') + 7, figmaFullText.lastIndexOf('```'));

        const figmaContentJson = JSON.parse(figmaContentStringified);
        console.log("Screenshot?");
        const figmaWithScreenshot = figmaContentJson.find((shell: any) => shell.screenshot);
        console.log(figmaWithScreenshot?.screenshot || "no screenshot found");

                //  ===== Figma Integration =====
        const figmaResponse2 = await mcp.server.request({
            "method": "sampling/createMessage",
            "params": {
                "messages": [
                    {
                        "role": "user",
                        "content": {
                            "type": "text",
                            "text": /*"Please list for me the MCP servers that your agent in VS Code has access to, including their names and URLs"*/ `
                              Please get the screenshot for the node with id ${figmaContentJson[0].nodeId} in the Figma file with key "${fileKey}".
                            `
                        }
                    }
                ],
                "speedPriority": 0.5,
                "systemPrompt": "You are a helpful designer who provides detailed descriptions of Figma elements.",
                "maxTokens": 10000
            }
        }, CreateMessageResultSchema);

        console.log('Figma screenshots response received:', JSON.stringify(figmaResponse2, null, 2));

        // Extract the shell stories from the Figma response
        const figmaText = figmaResponse.content?.text as string;
        if (!figmaText) {
          return {
            content: [{
              type: 'text',
              text: 'Error: No content received from Figma analysis.'
            }]
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: 'Figma response received. Currently, the implementation to parse the response and create Jira issues is incomplete. Please check back later for full functionality.',
            },
          ],
        };
/*
        // Parse JSON array of shell stories from the response
        let shellStories: Array<{summary: string, description: string, screenshot?: string}>;
        try {
          // Extract JSON from the response text
          const jsonMatch = figmaText.match(/\[[\s\S]*\]/);
          if (!jsonMatch) {
            throw new Error('No JSON array found in Figma response');
          }
          shellStories = JSON.parse(jsonMatch?.[0] ?? '[]');
        } catch (parseError: any) {
          console.log('Failed to parse shell stories from Figma response:', parseError);
          return {
            content: [{
              type: 'text',
              text: `Error: Failed to parse shell stories from Figma response. Response was: ${figmaText.substring(0, 500)}...`
            }]
          };
        }

        if (!Array.isArray(shellStories) || shellStories.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'Error: No shell stories found in Figma analysis.'
            }]
          };
        }

        // Create shell stories in Jira
        const createdIssues: Array<{key: string, id: string, summary: string}> = [];
        for (const story of shellStories) {
          try {
            console.log(`Creating shell story: ${story.summary}`);
            
            // Convert story description to ADF
            const adfDescription = await convertMarkdownToAdf(story.description);
            
            if (!validateAdf(adfDescription)) {
              console.log('Generated ADF is invalid for story:', story.summary);
              continue;
            }

            // Create the Jira issue
            const createResponse = await createJiraIssue({
              summary: story.summary,
              targetCloudId: resolvedCloudId,
              projectKey,
              adfDescription,
              token,
              figmaElementDescription: story.description,
              issueTypeName: 'Story', // Shell stories are typically Story issue type
              epicId: jiraEpicId // Link to the parent Epic
            });

            if (createResponse.ok) {
              const createdIssue = await createResponse.json() as JiraIssueCreationResponse;
              createdIssues.push({
                key: createdIssue.key,
                id: createdIssue.id,
                summary: story.summary
              });
              console.log(`Successfully created shell story: ${createdIssue.key}`);
            } else {
              console.log(`Failed to create shell story "${story.summary}":`, createResponse.status, await createResponse.text());
            }
          } catch (storyError: any) {
            console.log(`Error creating shell story "${story.summary}":`, storyError.message);
          }
        }

        if (createdIssues.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'Error: Failed to create any shell stories. Please check the logs for details.'
            }]
          };
        }

        const successMessage = `Successfully created ${createdIssues.length} shell stories for Epic ${jiraEpicId}:

${createdIssues.map(issue => `• **${issue.key}**: ${issue.summary}`).join('\n')}

**Epic**: ${jiraEpicId}
**Project**: ${projectKey}
**Figma Source**: ${figmaLink}`;

        return {
          content: [{
            type: 'text',
            text: successMessage
          }]
        };

        // Resolve the target cloud ID
        let siteInfo;
        try {
          siteInfo = await resolveCloudId(token, cloudId, siteName);
        } catch (error: any) {
          console.log('Failed to resolve cloud ID:', error);
          return { 
            content: [{ 
              type: 'text', 
              text: `Error: ${error.message}` 
            }] 
          };
        }
        
        const targetCloudId = siteInfo.cloudId;

        // Build comprehensive description including Figma details if provided
        // const combinedDescription = buildIssueDescription(description, figmaElementDescription);

        // Convert markdown to ADF
        console.log('Converting markdown description to ADF', { 
          projectKey,
          descriptionLength: figmaElementDescription.length,
          hasFigmaContent: !!figmaElementDescription
        });

        const adfDescription = await convertMarkdownToAdf(figmaElementDescription);

        // Validate ADF structure
        if (!validateAdf(adfDescription)) {
          console.log('Generated ADF is invalid', { adf: adfDescription });
          return {
            content: [{
              type: 'text',
              text: 'Error: Failed to convert description to valid ADF format.'
            }]
          };
        }

        // Build the API URL
        const createResponse = await createJiraIssue({ summary: "", targetCloudId, projectKey, adfDescription, token, figmaElementDescription });

        // Handle specific error cases
        if (createResponse.status === 400) {
          const errorBody = await createResponse.text();
          console.log('Bad request error:', errorBody);
          return { 
            content: [{ 
              type: 'text', 
              text: `Bad request: ${errorBody}. Please check project key, issue type, and other field values.` 
            }] 
          };
        }

        if (createResponse.status === 403) {
          console.log('Insufficient permissions', { projectKey });
          return { 
            content: [{ 
              type: 'text', 
              text: `Insufficient permissions to create issues in project ${projectKey}. Please ensure you have 'Create Issues' permission for this project.` 
            }] 
          };
        }

        handleJiraAuthError(createResponse, `Create issue in project ${projectKey}`);

        // Parse the response
        const createdIssue = await createResponse.json() as JiraIssueCreationResponse;

        console.log('Issue created successfully', {
          issueKey: createdIssue.key,
          issueId: createdIssue.id,
          projectKey,
          summary: "",
          hasFigmaContent: !!figmaElementDescription
        });

        const successMessage = `Successfully created Jira issue ${createdIssue.key} in project ${projectKey}.

**Issue Details:**
- Key: ${createdIssue.key}
- ID: ${createdIssue.id}
- Summary: ""
- URL: ${createdIssue.self}${figmaElementDescription ? '\n- Includes Figma element context' : ''}`;
        
        return {
          content: [
            {
              type: 'text',
              text: successMessage,
            },
          ],
        };
*/
      } catch (err: any) {
        console.log('Error creating Jira issue:', err);
        
        // Provide helpful error messages for common scenarios
        let errorMessage = `Error creating issue in project ${projectKey}: ${err.message}`;
        
        if (err.message.includes('Authentication required')) {
          errorMessage = `Authentication expired. Please re-authenticate with Jira to create issue in project ${projectKey}.`;
        } else if (err.message.includes('404')) {
          errorMessage = `Project ${projectKey} not found or you don't have access to it.`;
        } else if (err.message.includes('403')) {
          errorMessage = `Insufficient permissions to create issues in project ${projectKey}.`;
        }
        
        return { 
          content: [{ 
            type: 'text', 
            text: errorMessage
          }] 
        };
      }
    },
  );
}


