/**
 * MCP Prompt: prompt-write-story
 * 
 * Entry point for the story writing workflow.
 * Instructs the agent to call `write-story-context` and follow its embedded prompts.
 * 
 * Pattern: Prompt + Context Tool Pair (see spec 061)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Registers the prompt-write-story prompt
 * 
 * This is the agent entry point for writing Jira story descriptions.
 * It tells the agent to call the context tool, which returns all data + the story writing prompt.
 */
export function registerWriteStoryPrompt(mcp: McpServer): void {
  console.log('    - prompt-write-story');
  
  mcp.registerPrompt(
    'prompt-write-story',
    {
      description: 'Write or update a Jira story description from linked Figma designs, Confluence docs, and issue context. Start here for story writing workflows.',
      argsSchema: {
        issueKey: z.string().describe('Jira issue key (e.g., "PROJ-123")'),
        siteName: z.string().describe('Atlassian site name (e.g., "mycompany" from mycompany.atlassian.net)'),
      },
    },
    async (args) => {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `# Story Writing Workflow

## Input
- **Issue Key:** ${args.issueKey}
- **Site Name:** ${args.siteName}

## Step 1: Get story context

Call the \`write-story-context\` tool with:
- \`issueKey\`: "${args.issueKey}"
- \`siteName\`: "${args.siteName}"

This returns the issue hierarchy, comments, linked resources (Figma screens, Confluence docs), and the story writing prompt.

## Step 2: Follow embedded prompt

The tool response contains an embedded prompt resource at \`prompt://write-story-content\`. Follow its instructions to generate the story content.

Key points from the prompt:
- Use the story format: User Story Statement → Supporting Artifacts → Scope Analysis → NFRs → Dev Notes → Acceptance Criteria
- Include all Figma links in acceptance criteria groups
- Use ❓ markers ONLY in Scope Analysis for open questions
- Preserve all original links from context

## Step 3: Update the story

After generating the story content, use the \`atlassian-update-issue-description\` tool to write the content to the Jira issue.

## Important Notes

- The context tool fetches all linked resources (Figma, Confluence, Google Docs) in parallel
- If this is a re-run (story already has content), the prompt will focus on incorporating new changes
- The generated content should be in markdown format — the update tool handles ADF conversion
`,
            },
          },
        ],
      };
    }
  );
}
