/**
 * Update Jira Issue Description Tool
 * Focused tool for updating issue descriptions with markdown content
 */

import { z } from 'zod';
import { logger } from '../logger.js';
import { getAuthInfo, handleJiraAuthError, resolveCloudId } from './auth-helpers.js';
import { convertMarkdownToAdf, validateAdf } from './markdown-converter.js';

/**
 * Register the update-issue-description tool with the MCP server
 * @param {McpServer} mcp - MCP server instance
 */
export function registerUpdateIssueDescriptionTool(mcp) {
  mcp.registerTool(
    'update-issue-description',
    {
      title: 'Update Jira Issue Description',
      description: 'Updates a Jira issue description with markdown content that will be converted to Atlassian Document Format (ADF)',
      inputSchema: {
        issueKey: z.string().describe('The Jira issue key or ID (e.g., "PROJ-123", "USER-10")'),
        description: z.string().describe('Issue description in markdown format (will be converted to ADF)'),
        cloudId: z.string().optional().describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional().describe('The name of the Jira site to use (alternative to cloudId). Will search for a site with this name.'),
        notifyUsers: z.boolean().optional().default(true).describe('Whether to send notifications to users (default: true)'),
      },
    },
    async ({ issueKey, description, cloudId, siteName, notifyUsers = true }, context) => {
      logger.info('update-issue-description called', { 
        issueKey, 
        cloudId, 
        siteName,
        descriptionLength: description?.length || 0,
        notifyUsers
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

      logger.info('Found valid auth token, proceeding with description update');

      try {
        // Input validation
        if (!issueKey || !issueKey.trim()) {
          return {
            content: [{
              type: 'text',
              text: 'Error: Issue key is required.'
            }]
          };
        }

        if (!description || typeof description !== 'string') {
          return {
            content: [{
              type: 'text',
              text: 'Error: Description is required and must be a string.'
            }]
          };
        }

        // Resolve the target cloud ID
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

        // Convert markdown to ADF
        logger.info('Converting markdown description to ADF', { 
          issueKey,
          descriptionLength: description.length 
        });

        const adfDescription = await convertMarkdownToAdf(description);

        // Validate ADF structure
        if (!validateAdf(adfDescription)) {
          logger.error('Generated ADF is invalid', { adf: adfDescription });
          return {
            content: [{
              type: 'text',
              text: 'Error: Failed to convert markdown to valid ADF format.'
            }]
          };
        }

        // Build the API URL with query parameters
        const updateUrl = new URL(`https://api.atlassian.com/ex/jira/${targetCloudId}/rest/api/3/issue/${issueKey}`);
        if (notifyUsers !== undefined) {
          updateUrl.searchParams.set('notifyUsers', notifyUsers.toString());
        }

        // Prepare the update payload
        const updatePayload = {
          fields: {
            description: adfDescription
          }
        };

        logger.info('Updating issue description', { 
          issueKey,
          cloudId: targetCloudId,
          updateUrl: updateUrl.toString(),
          adfContentBlocks: adfDescription.content?.length || 0,
          notifyUsers
        });

        // Make the API request
        const updateResponse = await fetch(updateUrl.toString(), {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        });

        logger.info('Update API response', {
          status: updateResponse.status,
          statusText: updateResponse.statusText,
          contentType: updateResponse.headers.get('content-type')
        });

        // Handle specific error cases
        if (updateResponse.status === 404) {
          logger.warn('Issue not found', { issueKey });
          return { 
            content: [{ 
              type: 'text', 
              text: `Issue ${issueKey} not found.` 
            }] 
          };
        }

        if (updateResponse.status === 403) {
          logger.warn('Insufficient permissions', { issueKey });
          return { 
            content: [{ 
              type: 'text', 
              text: `Insufficient permissions to update issue ${issueKey}. Please ensure you have 'Edit Issues' permission for this project.` 
            }] 
          };
        }

        handleJiraAuthError(updateResponse, `Update issue ${issueKey} description`);

        // Success response (usually 204 No Content)
        logger.info('Issue description updated successfully', {
          issueKey,
          status: updateResponse.status,
          descriptionLength: description.length
        });

        const successMessage = `Successfully updated description for issue ${issueKey}.`;
        
        return {
          content: [
            {
              type: 'text',
              text: successMessage,
            },
          ],
        };

      } catch (err) {
        logger.error('Error updating Jira issue description:', err);
        
        // Provide helpful error messages for common scenarios
        let errorMessage = `Error updating issue ${issueKey}: ${err.message}`;
        
        if (err.message.includes('Authentication required')) {
          errorMessage = `Authentication expired. Please re-authenticate with Jira to update issue ${issueKey}.`;
        } else if (err.message.includes('404')) {
          errorMessage = `Issue ${issueKey} not found or you don't have access to it.`;
        } else if (err.message.includes('403')) {
          errorMessage = `Insufficient permissions to update issue ${issueKey}.`;
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
