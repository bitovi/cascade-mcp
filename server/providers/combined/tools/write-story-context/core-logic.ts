/**
 * Core Logic for write-story-context
 * 
 * Fetches all data needed for writing a Jira story and builds a multi-part
 * MCP response with the data + story writing prompt as embedded resource.
 * 
 * Data flow:
 * 1. Resolve cloudId from siteName
 * 2. Fetch issue hierarchy + all comments in parallel
 * 3. Extract linked URLs (Figma, Confluence, Google Docs)
 * 4. Convert description from ADF to markdown
 * 5. Build response: issue data + linked URLs + embedded story writing prompt
 * 
 * NOTE: This tool does NOT call LLMs or update Jira. It only fetches data
 * and returns it with prompts for the agent's LLM to process.
 */

import type { AtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { resolveCloudId, fetchAllComments } from '../../../atlassian/atlassian-helpers.js';
import { convertAdfToMarkdown } from '../../../atlassian/markdown-converter.js';
import {
  fetchJiraIssueHierarchy,
  type JiraIssueHierarchy,
  type IssueComment,
} from '../review-work-item/jira-hierarchy-fetcher.js';
import {
  extractLinksFromHierarchy,
  buildHierarchyContextMarkdown,
} from '../review-work-item/link-extractor.js';
import {
  mapJiraHierarchyToContext,
  STORY_CONTENT_SYSTEM_PROMPT,
} from '../write-story/prompt-story-content.js';
import type { ContentBlock, TextContent, EmbeddedResource } from '../../../../utils/embedded-prompt-builder.js';

// ============================================================================
// Types
// ============================================================================

export interface WriteStoryContextParams {
  issueKey: string;
  siteName: string;
}

export interface WriteStoryContextResult {
  [key: string]: unknown;
  content: ContentBlock[];
  isError?: boolean;
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Execute the write-story-context workflow
 * 
 * Fetches all data needed for story writing and returns it with the
 * story writing prompt as an embedded resource.
 * 
 * @param params - Tool parameters (issueKey, siteName)
 * @param atlassianClient - Authenticated Atlassian API client
 * @returns Multi-part MCP response with data + embedded prompt
 */
export async function executeWriteStoryContext(
  params: WriteStoryContextParams,
  atlassianClient: AtlassianClient
): Promise<WriteStoryContextResult> {
  const { issueKey, siteName } = params;

  // Step 1: Resolve cloud ID
  const { cloudId, siteName: resolvedSiteName } = await resolveCloudId(
    atlassianClient,
    undefined,
    siteName
  );

  // Step 2: Fetch hierarchy + comments in parallel
  const [hierarchy, allComments] = await Promise.all([
    fetchJiraIssueHierarchy(issueKey, atlassianClient, {
      cloudId,
      siteName: resolvedSiteName,
    }),
    fetchAllComments(atlassianClient, cloudId, issueKey),
  ]);

  // Step 3: Extract linked URLs
  const links = extractLinksFromHierarchy(hierarchy);

  // Step 4: Convert description to markdown
  const existingDescriptionAdf = hierarchy.target.fields.description || null;
  const existingDescriptionMarkdown = existingDescriptionAdf
    ? await convertAdfToMarkdown(existingDescriptionAdf)
    : '';

  const isFirstRun =
    !existingDescriptionMarkdown || existingDescriptionMarkdown.trim().length < 50;

  // Step 5: Build simplified context
  const hierarchyContext = mapJiraHierarchyToContext(hierarchy);
  const hierarchyMarkdown = buildHierarchyContextMarkdown(hierarchy);

  // Step 6: Format comments as markdown
  const commentsSummary = allComments.map(c => ({
    author: c.author,
    created: c.created,
    text: convertAdfToMarkdown(c.body),
  }));

  // Step 7: Build the response
  const content = buildResponseContent({
    issueKey,
    siteName: resolvedSiteName,
    cloudId,
    isFirstRun,
    hierarchy: hierarchyContext,
    hierarchyMarkdown,
    existingDescription: existingDescriptionMarkdown || null,
    comments: commentsSummary,
    linkedUrls: {
      figma: links.figma,
      confluence: links.confluence,
    },
    target: {
      key: hierarchy.target.key,
      summary: hierarchy.target.fields.summary,
      issueType: hierarchy.target.fields.issuetype?.name,
      status: hierarchy.target.fields.status?.name,
    },
  });

  return { content };
}

// ============================================================================
// Response Builder
// ============================================================================

interface ResponseData {
  issueKey: string;
  siteName: string;
  cloudId: string;
  isFirstRun: boolean;
  hierarchy: ReturnType<typeof mapJiraHierarchyToContext>;
  hierarchyMarkdown: string;
  existingDescription: string | null;
  comments: Array<{ author: string; created: string; text: string }>;
  linkedUrls: { figma: string[]; confluence: string[] };
  target: {
    key: string;
    summary: string;
    issueType?: string;
    status?: string;
  };
}

function buildResponseContent(data: ResponseData): ContentBlock[] {
  const content: ContentBlock[] = [];

  // 1. ISSUE DATA — JSON manifest
  const issueData = {
    issueKey: data.issueKey,
    siteName: data.siteName,
    cloudId: data.cloudId,
    isFirstRun: data.isFirstRun,
    target: data.target,
    hierarchy: data.hierarchy,
    commentCount: data.comments.length,
    linkedUrls: data.linkedUrls,
    workflow: {
      step1: 'Review the issue context and linked resources below',
      step2: 'If Figma URLs are linked, analyze them using figma-ask-scope-questions-for-page',
      step3: 'If Confluence URLs are linked, fetch them using confluence-analyze-page',
      step4: 'Follow prompt://write-story-content to generate the story',
      step5: 'Update the Jira issue using atlassian-update-issue-description',
    },
  };

  content.push({
    type: 'text',
    text: JSON.stringify(issueData, null, 2),
  } as TextContent);

  // 2. HIERARCHY CONTEXT — markdown summary of the issue hierarchy
  content.push({
    type: 'resource',
    resource: {
      uri: 'context://hierarchy',
      mimeType: 'text/markdown',
      text: data.hierarchyMarkdown,
    },
  } as EmbeddedResource);

  // 3. EXISTING DESCRIPTION — if this is a re-run
  if (data.existingDescription) {
    content.push({
      type: 'resource',
      resource: {
        uri: 'context://existing-description',
        mimeType: 'text/markdown',
        text: data.existingDescription,
      },
    } as EmbeddedResource);
  }

  // 4. COMMENTS — formatted as markdown
  if (data.comments.length > 0) {
    const commentsMd = data.comments
      .map(c => `### ${c.author} (${c.created})\n\n${c.text}`)
      .join('\n\n---\n\n');

    content.push({
      type: 'resource',
      resource: {
        uri: 'context://comments',
        mimeType: 'text/markdown',
        text: `# Issue Comments\n\n${commentsMd}`,
      },
    } as EmbeddedResource);
  }

  // 5. STORY WRITING PROMPT — embedded resource
  content.push(buildStoryWritingPromptResource(data));

  return content;
}

// ============================================================================
// Embedded Prompt Builder
// ============================================================================

function buildStoryWritingPromptResource(data: ResponseData): EmbeddedResource {
  const issueSummary = data.target.summary;
  const runType = data.isFirstRun
    ? 'Generate a complete story from scratch'
    : 'Refine the existing story incorporating new context';

  return {
    type: 'resource',
    resource: {
      uri: 'prompt://write-story-content',
      mimeType: 'text/markdown',
      text: `# Story Writing Instructions

**System Prompt:** ${STORY_CONTENT_SYSTEM_PROMPT}

## Your Task

${runType} for: **${data.target.key}: ${issueSummary}**

## Story Format

Write the story description in this format:

### 1. User Story Statement
Brief "As a [user], I want [capability], so that [benefit]" statement.

### 2. Supporting Artifacts
List all linked resources (Figma, Confluence, Google Docs). **Preserve all original URLs.**

### 3. Scope Analysis
Feature inventory with scope markers:
- ☐ In-Scope: New work to implement
- ✅ Already Done: Existing functionality
- ❌ Out-of-Scope: Excluded features  
- ❓ Open Questions: Ambiguous requirements (ONLY in this section)
- 💬 Answered: Questions clarified by comments

### 4. Non-Functional Requirements
Only if explicitly mentioned in context (performance, security, accessibility).

### 5. Developer Notes
Only if explicitly mentioned in context (architecture, dependencies).

### 6. Acceptance Criteria
Group by feature area. Include Figma links in each group.
- **NO ❓ in Acceptance Criteria** — questions only in Scope Analysis
- Be specific using concrete details from Figma/docs
- Flip ❓ → 💬 if questions have been answered inline

## Linked Resources

${data.linkedUrls.figma.length > 0 ? `**Figma Designs (${data.linkedUrls.figma.length}):**\n${data.linkedUrls.figma.map(u => `- ${u}`).join('\n')}\n\nTo analyze these designs, call \`figma-ask-scope-questions-for-page\` with each URL.\n` : 'No Figma designs linked.'}

${data.linkedUrls.confluence.length > 0 ? `**Confluence Pages (${data.linkedUrls.confluence.length}):**\n${data.linkedUrls.confluence.map(u => `- ${u}`).join('\n')}\n\nTo fetch these pages, call \`confluence-analyze-page\` with each URL.\n` : 'No Confluence pages linked.'}

## Settings
- **Max Tokens:** 8000
- **Temperature:** 0.3 (analytical)

## After Writing

Use \`atlassian-update-issue-description\` to update the Jira issue with the generated content.
`,
    },
    annotations: {
      audience: ['assistant'],
      priority: 1,
    },
  };
}
