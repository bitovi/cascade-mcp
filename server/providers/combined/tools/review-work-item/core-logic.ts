/**
 * Core business logic for review-work-item tool
 * 
 * This module contains the pure business logic for generating work item reviews.
 * It is independent of MCP-specific concerns and can be used from both MCP handlers
 * and REST API endpoints.
 */

import type { ToolDependencies } from '../types.js';
import type { AtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { resolveCloudId, addIssueComment } from '../../../atlassian/atlassian-helpers.js';
import { 
  fetchJiraIssueHierarchy, 
  type JiraIssueHierarchy 
} from './jira-hierarchy-fetcher.js';
import { 
  extractLinksFromHierarchy, 
  buildHierarchyContextMarkdown 
} from './link-extractor.js';
import { 
  loadLinkedResources, 
  type LoadedContext 
} from './context-loader.js';
import {
  generateWorkItemReviewPrompt,
  WORK_ITEM_REVIEW_SYSTEM_PROMPT,
  WORK_ITEM_REVIEW_MAX_TOKENS
} from './prompt-work-item-review.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for executing the review-work-item workflow
 */
export interface ExecuteReviewWorkItemParams {
  /** Issue key to review (e.g., "PROJ-123") */
  issueKey: string;
  /** Cloud ID for the Jira site (optional - resolved from siteName if not provided) */
  cloudId?: string;
  /** Site name (e.g., "bitovi" from bitovi.atlassian.net) */
  siteName?: string;
  /** Maximum depth for parent hierarchy traversal (default: 5) */
  maxDepth?: number;
}

/**
 * Result from executing the review-work-item workflow
 */
export interface ExecuteReviewWorkItemResult {
  success: boolean;
  /** Generated review content in markdown */
  reviewContent: string;
  /** Number of questions identified */
  questionCount: number;
  /** Jira comment ID (after posting) */
  commentId?: string;
  /** Whether the story was well-defined (no questions) */
  wellDefined: boolean;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Execute the review-work-item workflow
 * 
 * This is the core business logic that can be called from both MCP handlers 
 * and REST API endpoints. It uses dependency injection to abstract away 
 * authentication and LLM provider concerns.
 * 
 * Workflow:
 * 1. Resolve cloud ID and fetch work item hierarchy
 * 2. Extract links from hierarchy (Confluence, Figma, Jira)
 * 3. Load all linked resources in parallel
 * 4. Generate review prompt with all context
 * 5. Call LLM to generate review questions
 * 6. Post review as Jira comment
 * 
 * @param params - Workflow parameters
 * @param deps - Injected dependencies (clients, LLM, notifier)
 * @returns Result with review content and metadata
 */
export async function executeReviewWorkItem(
  params: ExecuteReviewWorkItemParams,
  deps: ToolDependencies
): Promise<ExecuteReviewWorkItemResult> {
  const { issueKey, cloudId, siteName, maxDepth = 5 } = params;
  const { atlassianClient, generateText, notify } = deps;
  
  console.log(`🔍 Starting work item review for ${issueKey}`);
  
  // ==========================================
  // PHASE 1: Resolve cloud ID
  // ==========================================
  await notify('Resolving Jira site...');
  
  const siteInfo = await resolveCloudId(atlassianClient, cloudId, siteName);
  console.log(`  Site resolved: ${siteInfo.siteName} (${siteInfo.cloudId})`);
  
  // ==========================================
  // PHASE 2: Fetch issue hierarchy
  // ==========================================
  await notify(`Fetching ${issueKey} and related items...`);
  
  const hierarchy = await fetchJiraIssueHierarchy(issueKey, atlassianClient, {
    maxDepth,
    cloudId: siteInfo.cloudId,
    siteName: siteInfo.siteName,
    notify
  });
  
  // ==========================================
  // PHASE 3: Extract links from hierarchy
  // ==========================================
  await notify('Extracting linked resources...');
  
  const links = extractLinksFromHierarchy(hierarchy);
  
  // ==========================================
  // PHASE 4: Load all linked resources
  // ==========================================
  await notify('Loading Confluence documents and related context...');
  
  const context = await loadLinkedResources(hierarchy, links, {
    atlassianClient,
    generateText,
    cloudId: siteInfo.cloudId,
    siteName: siteInfo.siteName,
    notify
  });
  
  // ==========================================
  // PHASE 5: Generate review with LLM
  // ==========================================
  await notify('Generating review questions...');
  
  const prompt = generateWorkItemReviewPrompt(hierarchy, context);
  
  console.log(`  Prompt length: ${prompt.length} characters`);
  
  const response = await generateText({
    messages: [
      { role: 'system', content: WORK_ITEM_REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    maxTokens: WORK_ITEM_REVIEW_MAX_TOKENS
  });
  
  const reviewContent = response.text;
  
  // Count questions
  const questionCount = (reviewContent.match(/❓/g) || []).length;
  const wellDefined = questionCount === 0 || 
    reviewContent.toLowerCase().includes('well-defined') ||
    reviewContent.toLowerCase().includes('no significant gaps');
  
  console.log(`  Generated review: ${questionCount} questions, wellDefined=${wellDefined}`);
  
  // ==========================================
  // PHASE 6: Post review as Jira comment
  // ==========================================
  await notify('Posting review to Jira...');
  
  const { commentId } = await addIssueComment(
    atlassianClient,
    siteInfo.cloudId,
    issueKey,
    reviewContent
  );
  
  console.log(`  ✅ Comment posted: ${commentId}`);
  
  return {
    success: true,
    reviewContent,
    questionCount,
    commentId,
    wellDefined
  };
}
