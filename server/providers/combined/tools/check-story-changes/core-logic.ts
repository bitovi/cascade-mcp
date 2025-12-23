/**
 * Core business logic for check-story-changes tool
 * 
 * This module contains the pure business logic for analyzing divergences between
 * a child story and its parent epic's shell story. It is independent of MCP-specific concerns
 * (authentication, context, etc.) and can be used from both MCP handlers and REST API endpoints.
 */

import type { ToolDependencies } from '../types.js';
import { getJiraIssue, resolveCloudId } from '../../../atlassian/atlassian-helpers.js';
import { convertAdfToMarkdown, extractADFSection } from '../../../atlassian/markdown-converter.js';
import type { JiraIssue } from '../../../atlassian/types.js';
import { CHECK_STORY_CHANGES_SYSTEM_PROMPT, generateCheckWhatChangedPrompt } from './strategies/prompt-check-story-changes.js';
import { CHECK_STORY_CHANGES_MAX_TOKENS } from './strategies/prompt-check-story-changes.js';
import { parseShellStoriesFromAdf } from '../write-next-story/shell-story-parser.js';

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
  
  const childResponse = await getJiraIssue(atlassianClient, resolvedCloudId, storyKey, undefined);
  if (!childResponse.ok) {
    throw new Error(`Error fetching issue ${storyKey}: ${childResponse.status} ${childResponse.statusText}`);
  }

  const childData = (await childResponse.json()) as JiraIssue;
  const childDescription = childData.fields.description 
    ? convertAdfToMarkdown(childData.fields.description) 
    : '';
  const parentKey = childData.fields.parent?.key || '';

  if (!parentKey) {
    throw new Error(`Story ${storyKey} has no parent epic`);
  }

  console.log(`  Child story: ${storyKey}, Parent epic: ${parentKey}`);

  // ==========================================
  // PHASE 3: Fetch parent epic
  // ==========================================
  const parentResponse = await getJiraIssue(atlassianClient, resolvedCloudId, parentKey, undefined);
  if (!parentResponse.ok) {
    throw new Error(`Error fetching issue ${parentKey}: ${parentResponse.status} ${parentResponse.statusText}`);
  }

  const parentData = (await parentResponse.json()) as JiraIssue;

  console.log('  Fetched parent and child descriptions');

  // ==========================================
  // PHASE 4: Extract focused sections
  // ==========================================
  const childContext = childDescription; // Always use full child description

  // Extract Shell Stories from parent (if ADF)
  if (!parentData.fields.description || typeof parentData.fields.description !== 'object') {
    throw new Error(`Parent epic ${parentKey} does not have ADF description format`);
  }

  const { section: parentShellStories } = extractADFSection(
    parentData.fields.description.content || [],
    'Shell Stories'
  );
  
  if (parentShellStories.length === 0) {
    throw new Error(`Parent epic ${parentKey} does not contain a "Shell Stories" section`);
  }

  // Parse shell stories to find the one matching this child story
  const allShellStories = parseShellStoriesFromAdf(parentShellStories);
  console.log(`  Found ${allShellStories.length} shell stories in epic`);
  
  // Find the shell story that matches this child story's key
  const matchingShellStory = allShellStories.find(story => {
    if (!story.jiraUrl) return false;
    // jiraUrl format: https://site.atlassian.net/browse/PROJ-123
    return story.jiraUrl.includes(`/${storyKey}`);
  });

  if (!matchingShellStory) {
    throw new Error(
      `Could not find shell story in epic ${parentKey} that corresponds to child story ${storyKey}. ` +
      `This may indicate the story was not created from a shell story, or the epic's shell stories section is out of sync.`
    );
  }

  console.log(`matchingShellStory: ${JSON.stringify(matchingShellStory, null, 2)}`); // TODO: remove

  console.log(`  ✅ Found matching shell story: ${matchingShellStory.id} - ${matchingShellStory.title}`);

  // Use only the matching shell story's markdown for comparison
  const parentShellStory = matchingShellStory.rawShellStoryMarkdown;
  
  console.log('  ✅ Using specific shell story ↔ Full child description comparison');

  // ==========================================
  // PHASE 5: Compare descriptions with LLM
  // ==========================================
  await notify('Analyzing divergences with AI...');

  console.log('  Requesting LLM analysis...');
  const llmResponse = await generateText({
    messages: [
      {
        role: 'system',
        content: CHECK_STORY_CHANGES_SYSTEM_PROMPT,
      },
      { role: 'user', content: generateCheckWhatChangedPrompt(parentKey, storyKey, parentShellStory, childContext) },
    ],
    maxTokens: CHECK_STORY_CHANGES_MAX_TOKENS,
  });

  const markdownAnalysis = llmResponse.text.trim();

  console.log('  ✅ Analysis complete');

  // ==========================================
  // PHASE 6: Notify success
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