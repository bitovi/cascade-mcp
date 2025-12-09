/**
 * Core business logic for check-story-changes tool
 * 
 * This module contains the pure business logic for analyzing divergences between
 * a child story and its parent epic. It is independent of MCP-specific concerns
 * (authentication, context, etc.) and can be used from both MCP handlers and REST API endpoints.
 */

import type { ToolDependencies } from '../types.js';
import { getJiraIssue, resolveCloudId } from '../../../atlassian/atlassian-helpers.js';
import { convertAdfToMarkdown } from '../../../atlassian/markdown-converter.js';

/**
 * Parameters for executing the check-story-changes workflow
 */
export interface ExecuteCheckStoryChangesParams {
  storyKey: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Divergence analysis result from LLM
 */
export interface DivergenceItem {
  category: 'conflict' | 'addition' | 'missing' | 'interpretation';
  description: string;
  childContext: string;
  parentContext: string | null;
}

export interface DivergenceAnalysis {
  hasDivergences: boolean;
  divergences: DivergenceItem[];
  summary: string;
}

/**
 * Result from executing the check-story-changes workflow
 */
export interface ExecuteCheckStoryChangesResult {
  success: true;
  analysis: DivergenceAnalysis;
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
  const { atlassianClient, generateText } = deps;

  console.log('check-story-changes: Analyzing story', { storyKey, cloudId, siteName });

  // ==========================================
  // PHASE 1: Resolve site identifier
  // ==========================================
  const resolvedSite = await resolveCloudId(atlassianClient, cloudId, siteName);
  const resolvedCloudId = resolvedSite.cloudId;
  console.log(`  Resolved cloudId: ${resolvedCloudId}`);

  // ==========================================
  // PHASE 2: Fetch child story
  // ==========================================
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
  const comparisonRequest = {
    parentKey,
    parentDescription,
    childKey: storyKey,
    childDescription,
    instructions: `Analyze these two Jira issue descriptions and identify any diverging points where the child story deviates from or adds information not present in the parent epic. Focus on:
1. Conflicting requirements or specifications
2. Additional features or details in the child not mentioned in the parent
3. Different interpretations or implementations
4. Missing context that should be aligned

Return your analysis in a structured JSON format:
{
  "hasDivergences": boolean,
  "divergences": [
    {
      "category": "conflict" | "addition" | "missing" | "interpretation",
      "description": "Clear description of the divergence",
      "childContext": "Relevant excerpt from child story",
      "parentContext": "Relevant excerpt from parent epic (or null if not applicable)"
    }
  ],
  "summary": "Brief summary of alignment status"
}`,
  };

  console.log('  Requesting LLM analysis...');
  const llmResponse = await generateText({
    messages: [
      {
        role: 'system',
        content:
          'You are a technical project analyst specializing in software requirements analysis. You will receive a JSON object with parent and child descriptions. Provide precise, actionable insights about requirement divergences. Return ONLY valid JSON without markdown code blocks.',
      },
      { role: 'user', content: JSON.stringify(comparisonRequest, null, 2) },
    ],
    maxTokens: 4000,
  });

  // Strip markdown code blocks if present
  let responseText = llmResponse.text.trim();
  if (responseText.startsWith('```json')) {
    responseText = responseText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
  } else if (responseText.startsWith('```')) {
    responseText = responseText.replace(/^```\s*/, '').replace(/```\s*$/, '');
  }

  const divergenceAnalysis: DivergenceAnalysis = JSON.parse(responseText);

  console.log('  ✅ Analysis complete');
  console.log(`    Divergences found: ${divergenceAnalysis.hasDivergences}`);
  console.log(`    Number of divergences: ${divergenceAnalysis.divergences.length}`);

  return {
    success: true,
    analysis: divergenceAnalysis,
    metadata: {
      parentKey,
      childKey: storyKey,
      tokensUsed: llmResponse.metadata?.usage?.totalTokens,
    },
  };

  // TODO: ERROR HANDLING
}