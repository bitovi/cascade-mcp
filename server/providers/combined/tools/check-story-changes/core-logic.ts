/**
 * Core business logic for check-story-changes tool
 * 
 * This module contains the pure business logic for analyzing divergences between
 * a child story and its parent epic. It is independent of MCP-specific concerns
 * (authentication, context, etc.) and can be used from both MCP handlers and REST API endpoints.
 */

import type { ToolDependencies } from '../types.js';
import { getJiraIssue, resolveCloudId, addIssueComment } from '../../../atlassian/atlassian-helpers.js';
import { convertAdfToMarkdown } from '../../../atlassian/markdown-converter.js';
import { CHECK_STORY_CHANGES_SYSTEM_PROMPT, generateCheckWhatChangedPrompt } from './strategies/prompt-check-story-changes.js';
import { CHECK_STORY_CHANGES_MAX_TOKENS } from './strategies/prompt-check-story-changes.js';

/**
 * Parameters for executing the check-story-changes workflow
 */
export interface ExecuteCheckStoryChangesParams {
  storyKey: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Result from executing the check-story-changes workflow
 */
export interface ExecuteCheckStoryChangesResult {
  success: true;
  analysis: string;
  metadata: {
    parentKey: string;
    childKey: string;
    tokensUsed?: number;
  };
}

interface JiraIssueResponse { // TODO: DO WE HAVE A TYPE FOR THE TICKET?
  fields?: {
    parent?: { key?: string };
    description?: string | any;
  };
}

/**  
 * TODO: IS convertDescriptionToText NECESSARY?
 * Convert Jira description (ADF or string) to plain text
 */
function convertDescriptionToText(description: any): string {
  if (!description) return '';

  if (typeof description === 'string') {
    return description;
  }

  if (typeof description === 'object') {
    try {
      return convertAdfToMarkdown(description);
    } catch (error) {
      console.error('Failed to convert ADF:', error);
      return JSON.stringify(description);
    }
  }

  return '';
}

/**
 * Execute the check-story-changes workflow
 * 
 * This is the core business logic that can be called from both MCP handlers and REST API endpoints.
 * It uses dependency injection to abstract away authentication and LLM provider concerns.
 * 
 * @param params - Workflow parameters
 * @param deps - Injected dependencies (clients, LLM, notifier)
 * @returns Result with divergence analysis and metadata
 */
export async function executeCheckStoryChanges(
  params: ExecuteCheckStoryChangesParams,
  deps: ToolDependencies
): Promise<ExecuteCheckStoryChangesResult> {
  const { storyKey, cloudId, siteName } = params;
  const { atlassianClient, generateText, notify } = deps;

  console.log('check-story-changes: Analyzing story', { storyKey, cloudId, siteName });

  await notify('📝 Checking story changes...');

  // ==========================================
  // PHASE 1: Resolve site identifier
  // ==========================================
  const resolvedSite = await resolveCloudId(atlassianClient, cloudId, siteName);
  const resolvedCloudId = resolvedSite.cloudId;
  console.log(`  Resolved cloudId: ${resolvedCloudId}`);

  // ==========================================
  // PHASE 2: Fetch child story
  // ==========================================
  await notify('Fetching child story and parent epic...');
  
  // TODO: MAKE SURE IT IS CONVERTING ADL TO MARKDOWN / TEXT 
  const childResponse = await getJiraIssue(atlassianClient, resolvedCloudId, storyKey, undefined);
  if (!childResponse.ok) {
    throw new Error(`Error fetching issue ${storyKey}: ${childResponse.status} ${childResponse.statusText}`);
  }

  const childData = (await childResponse.json()) as JiraIssueResponse;
  const childDescription = convertDescriptionToText(childData.fields?.description);
  const parentKey = childData.fields?.parent?.key || '';

  if (!parentKey) {
    throw new Error(`Story ${storyKey} has no parent epic`);
  }

  console.log(`  Child story: ${storyKey}, Parent epic: ${parentKey}`);

  // ==========================================
  // PHASE 3: Fetch parent epic
  // ==========================================
  // TODO: MAKE SURE IT IS CONVERTING ADL TO MARKDOWN / TEXT 
  const parentResponse = await getJiraIssue(atlassianClient, resolvedCloudId, parentKey, undefined);
  if (!parentResponse.ok) {
    throw new Error(`Error fetching issue ${parentKey}: ${parentResponse.status} ${parentResponse.statusText}`);
  }

  const parentData = (await parentResponse.json()) as JiraIssueResponse; // TODO: IS TYPE CASTING NECESSARY?
  const parentDescription = convertDescriptionToText(parentData.fields?.description);

  console.log('  Fetched parent and child descriptions');

  // ==========================================
  // PHASE 4: Compare descriptions with LLM
  // ==========================================
  await notify('Analyzing divergences with AI...');

  console.log('  Requesting LLM analysis...');
  const llmResponse = await generateText({
    messages: [
      {
        role: 'system',
        content: CHECK_STORY_CHANGES_SYSTEM_PROMPT,
      },
      { role: 'user', content: generateCheckWhatChangedPrompt(parentKey, storyKey, parentDescription, childDescription) },
    ],
    maxTokens: CHECK_STORY_CHANGES_MAX_TOKENS,
  });

  const markdownAnalysis = llmResponse.text.trim();

  console.log('  ✅ Analysis complete');

  // ==========================================
  // PHASE 5: Notify success
  // ==========================================
  await notify('✅ Analysis complete');

  return {
    success: true,
    analysis: markdownAnalysis,
    metadata: {
      parentKey,
      childKey: storyKey,
      tokensUsed: llmResponse.metadata?.usage?.totalTokens,
    },
  };
}