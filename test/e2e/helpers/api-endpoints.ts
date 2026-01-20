/**
 * Type-safe API endpoint helpers for E2E testing
 * 
 * Each helper wraps one REST API endpoint with proper type checking
 * and error handling.
 */

import type { ApiClient } from './api-client.js';

// ===== Analyze Feature Scope =====

export interface AnalyzeFeatureScopeParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
  sessionId?: string;
}

export interface AnalyzeFeatureScopeResult {
  success: true;
  scopeAnalysisContent: string;
  featureAreasCount: number;
  questionsCount: number;
  screensAnalyzed: number;
  tempDirPath: string;
  epicKey: string;
}

/**
 * Analyze Figma screens to generate comprehensive scope analysis
 * 
 * POST /api/analyze-feature-scope
 */
export async function analyzeFeatureScope(
  client: ApiClient,
  params: AnalyzeFeatureScopeParams
): Promise<AnalyzeFeatureScopeResult> {
  console.log(`Calling analyzeFeatureScope for epic: ${params.epicKey}`);

  const response = await client.post('/api/analyze-feature-scope', params);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API call failed with status ${response.status}: ${errorText}`
    );
  }

  const result: any = await response.json();

  if (!result.success) {
    throw new Error(`API returned error: ${result.error || 'Unknown error'}`);
  }

  console.log(`  ✓ Analysis complete: ${result.featureAreasCount} feature areas, ${result.questionsCount} questions`);

  return result as AnalyzeFeatureScopeResult;
}

// ===== Write Shell Stories =====

export interface WriteShellStoriesParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
  sessionId?: string;
}

export interface WriteShellStoriesResult {
  success: true;
  shellStoriesContent: string;
  storyCount: number;
  screensAnalyzed: number;
  epicKey: string;
}

/**
 * Generate shell stories from Figma designs in a Jira epic
 * 
 * POST /api/write-shell-stories
 */
export async function writeShellStories(
  client: ApiClient,
  params: WriteShellStoriesParams
): Promise<WriteShellStoriesResult> {
  console.log(`Calling writeShellStories for epic: ${params.epicKey}`);

  const response = await client.post('/api/write-shell-stories', params);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API call failed with status ${response.status}: ${errorText}`
    );
  }

  const result: any = await response.json();

  if (!result.success) {
    throw new Error(`API returned error: ${result.error || 'Unknown error'}`);
  }

  console.log(`  ✓ Shell stories written: ${result.storyCount} stories from ${result.screensAnalyzed} screens`);

  return result as WriteShellStoriesResult;
}

// ===== Write Next Story =====

export interface WriteNextStoryParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
  sessionId?: string;
}

export interface WriteNextStoryResultSuccess {
  success: true;
  complete: false;
  issueKey: string;
  issueSelf: string;
  storyTitle: string;
  epicKey: string;
}

export interface WriteNextStoryResultComplete {
  success: true;
  complete: true;
  message: string;
}

export type WriteNextStoryResult = WriteNextStoryResultSuccess | WriteNextStoryResultComplete;

/**
 * Write the next Jira story from shell stories in an epic
 * 
 * POST /api/write-next-story
 */
export async function writeNextStory(
  client: ApiClient,
  params: WriteNextStoryParams
): Promise<WriteNextStoryResult> {
  console.log(`Calling writeNextStory for epic: ${params.epicKey}`);

  const response = await client.post('/api/write-next-story', params);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API call failed with status ${response.status}: ${errorText}`
    );
  }

  const result: any = await response.json();

  if (!result.success) {
    throw new Error(`API returned error: ${result.error || 'Unknown error'}`);
  }

  if (result.complete) {
    console.log(`  ✓ All stories complete: ${result.message}`);
  } else {
    console.log(`  ✓ Story created: ${result.issueKey} - ${result.storyTitle}`);
  }

  return result as WriteNextStoryResult;
}

// ===== Review Work Item =====

export interface ReviewWorkItemParams {
  issueKey: string;
  cloudId?: string;
  siteName?: string;
  maxDepth?: number;
}

export interface ReviewWorkItemResult {
  success: true;
  issueKey: string;
  reviewContent: string;
  questionCount: number;
  wellDefined: boolean;
  commentId: string;
}

/**
 * Review a Jira work item and post questions as a comment
 * 
 * POST /api/review-work-item
 */
export async function reviewWorkItem(
  client: ApiClient,
  params: ReviewWorkItemParams
): Promise<ReviewWorkItemResult> {
  console.log(`Calling reviewWorkItem for issue: ${params.issueKey}`);

  const response = await client.post('/api/review-work-item', params);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API call failed with status ${response.status}: ${errorText}`
    );
  }

  const result: any = await response.json();

  if (!result.success) {
    throw new Error(`API returned error: ${result.error || 'Unknown error'}`);
  }

  const statusEmoji = result.wellDefined ? '✨' : '❓';
  console.log(`  ${statusEmoji} Review complete: ${result.questionCount} questions identified`);

  return result as ReviewWorkItemResult;
}
