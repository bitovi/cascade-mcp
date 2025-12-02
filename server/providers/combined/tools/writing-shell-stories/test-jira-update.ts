/**
 * Test tool for quickly testing Jira epic updates with shell stories
 * This bypasses all the Figma fetching and analysis to test just the update
 */

import { z } from 'zod';
import type { McpServer } from '../../../../mcp-core/mcp-types.js';
import { getAuthInfoSafe } from '../../../../mcp-core/auth-helpers.js';
import { resolveCloudId, getJiraIssue, handleJiraAuthError } from '../../../atlassian/atlassian-helpers.js';
import { convertMarkdownToAdf, validateAdf } from '../../../atlassian/markdown-converter.js';
import { createAtlassianClient } from '../../../atlassian/atlassian-api-client.js';

/**
 * Sample shell stories markdown for testing
 */
const SAMPLE_SHELL_STORIES = `- st001 Display Basic Applicant List (New Status) – Show a list of applicants with core data for the "New" status
  * ANALYSIS: applicants-new.analysis.md
  * DEPENDENCIES: none
  * \\+ Display header/navigation bar with branding, search bar (UI element only), contact info, and user controls
  * \\+ Show main heading "Applications"
  * \\+ Display status filter buttons as tabs (visual only)
  * \\+ Show applicant table with columns: Applicant name, Type, Submitted, Affiliate, and right-arrow icon
  * \\+ Populate table rows with sample data as shown
  * \\+ Right-arrow icon at end of each row (visual indicator only)
  * \\+ Footer with copyright and links
  * \\- Status filter button interactivity (defer to st002)
  * \\- Table row click navigation (defer to st003)
  * \\- Sorting functionality on "Submitted" column (defer to st004)
  * ¿ What should happen when the search bar is used?
  * ¿ What is the behavior when the right-arrow icon is clicked?

- st002 Filter Applicants by Status – Allow users to switch between New, In Progress, and Completed applicant lists
  * ANALYSIS: applicants-new.analysis.md, applicants-in-progress.analysis.md
  * DEPENDENCIES: st001
  * \\+ Status filter buttons become interactive
  * \\+ Clicking a status button loads the corresponding applicant list
  * \\+ Active status button shows visual indicator (underline or highlight)
  * \\- Preserving filters across page navigation (defer)
  * ¿ Should there be a loading state when switching between statuses?`;

interface ADFNode {
  type: string;
  attrs?: any;
  marks?: Array<{ type: string; attrs?: any }>;
  text?: string;
  content?: ADFNode[];
}

interface ADFDocument {
  version: number;
  type: 'doc';
  content: ADFNode[];
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: ADFDocument;
    [key: string]: any;
  };
}

/**
 * Register test tool for Jira update
 */
export function registerTestJiraUpdateTool(mcp: McpServer): void {
  mcp.registerTool(
    'test-jira-update',
    {
      title: 'Test Jira Epic Update',
      description: 'Quick test tool to update a Jira epic with sample shell stories (bypasses Figma analysis)',
      inputSchema: {
        epicKey: z.string().describe('The Jira epic key (e.g., "PLAY-38")'),
        cloudId: z.string().optional().describe('The cloud ID to specify the Jira site'),
        siteName: z.string().optional().describe('The name of the Jira site to use'),
      },
    },
    async ({ epicKey, cloudId, siteName }, context) => {
      console.log('🧪 TEST: Quick Jira update test starting...');
      
      // Get auth info
      const authInfo = getAuthInfoSafe(context, 'test-jira-update');
      const token = authInfo?.atlassian?.access_token;
      
      if (!token) {
        return {
          content: [{
            type: 'text',
            text: 'Error: No valid Atlassian access token found.'
          }]
        };
      }
      
      try {
        // Create Atlassian API client
        const client = createAtlassianClient(token);
        
        // Resolve cloud ID
        console.log('  Resolving cloud ID...');
        const siteInfo = await resolveCloudId(client, cloudId, siteName);
        console.log('  ✅ Cloud ID resolved:', siteInfo.cloudId);
        
        // Fetch current epic
        console.log('  Fetching current epic description...');
        const issueResponse = await getJiraIssue(client, siteInfo.cloudId, epicKey, undefined);
        
        if (issueResponse.status === 404) {
          return {
            content: [{
              type: 'text',
              text: `Epic ${epicKey} not found.`
            }]
          };
        }
        
        await handleJiraAuthError(issueResponse, `Fetch epic ${epicKey}`);
        
        const issue = await issueResponse.json() as JiraIssue;
        const currentDescription = issue.fields?.description;
        console.log('  ✅ Current epic fetched');
        
        // Convert sample shell stories to ADF
        const shellStoriesSection = `## Shell Stories\n\n${SAMPLE_SHELL_STORIES}`;
        console.log('  Converting shell stories to ADF...');
        console.log('  Markdown length:', shellStoriesSection.length);
        
        const shellStoriesAdf = await convertMarkdownToAdf(shellStoriesSection);
        
        if (!validateAdf(shellStoriesAdf)) {
          return {
            content: [{
              type: 'text',
              text: 'Error: Failed to convert shell stories to valid ADF.'
            }]
          };
        }
        
        console.log('  ✅ Shell stories converted to ADF');
        console.log('  ADF content blocks:', shellStoriesAdf.content?.length);
        console.log('  ADF sample:', JSON.stringify(shellStoriesAdf.content?.slice(0, 2), null, 2));
        
        // Combine with existing description
        const updatedDescription: ADFDocument = {
          version: 1,
          type: 'doc',
          content: [
            ...(currentDescription?.content || []),
            ...shellStoriesAdf.content
          ]
        };
        
        console.log('  Combined description has', updatedDescription.content.length, 'content blocks');
        
        // Update the epic
        console.log('  Updating epic description...');
        const updateUrl = `https://api.atlassian.com/ex/jira/${siteInfo.cloudId}/rest/api/3/issue/${epicKey}`;
        
        const updateResponse = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              description: updatedDescription
            }
          }),
        });
        
        console.log('  Update response status:', updateResponse.status, updateResponse.statusText);
        
        if (updateResponse.status === 400) {
          const errorText = await updateResponse.text();
          console.log('  ⚠️ Jira rejected the update (400 Bad Request)');
          console.log('  Error response:', errorText);
          console.log('  Full ADF being sent:', JSON.stringify(updatedDescription, null, 2));
          
          return {
            content: [{
              type: 'text',
              text: `Jira rejected update (400 Bad Request):\n\n${errorText}\n\nCheck server logs for full ADF structure.`
            }]
          };
        }
        
        if (updateResponse.status === 404) {
          return {
            content: [{
              type: 'text',
              text: `Epic ${epicKey} not found.`
            }]
          };
        }
        
        if (updateResponse.status === 403) {
          return {
            content: [{
              type: 'text',
              text: `Insufficient permissions to update epic ${epicKey}.`
            }]
          };
        }
        
        await handleJiraAuthError(updateResponse, `Update epic ${epicKey}`);
        
        console.log('  ✅ Epic updated successfully!');
        
        return {
          content: [{
            type: 'text',
            text: `✅ Successfully updated epic ${epicKey} with sample shell stories!\n\nSample content:\n\n${SAMPLE_SHELL_STORIES.substring(0, 500)}...`
          }]
        };
        
      } catch (error: any) {
        console.log('  ❌ Error:', error.message);
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }]
        };
      }
    }
  );
}
