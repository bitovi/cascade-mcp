/**
 * Core business logic for write-story tool
 * 
 * This module contains the pure business logic for writing/refining Jira stories.
 * It is independent of MCP-specific concerns and can be used from both MCP handlers
 * and REST API endpoints.
 * 
 * The logic orchestrates:
 * 1. Fetching story and parsing timestamp marker
 * 2. Fetching hierarchy + comments (with pagination)
 * 3. Filtering to changed context (if timestamp exists)
 * 4. Parsing existing description for ❓ markers and detecting inline answers
 * 5. Generating/updating story content with LLM
 * 6. Writing description with timestamp marker
 */

import type { ToolDependenciesWithOptionalFigma } from '../types.js';
import type { AtlassianClient } from '../../../atlassian/atlassian-api-client.js';
import { 
  fetchJiraIssueHierarchy, 
  type JiraIssueHierarchy,
  type IssueComment 
} from '../review-work-item/jira-hierarchy-fetcher.js';
import { extractLinksFromHierarchy } from '../review-work-item/link-extractor.js';
import { loadLinkedResources, type LoadedContext, type LoadContextOptions } from '../review-work-item/context-loader.js';
import { 
  convertMarkdownToAdf, 
  convertAdfToMarkdown,
  type ADFDocument 
} from '../../../atlassian/markdown-converter.js';
import { handleJiraAuthError, resolveCloudId, fetchAllComments } from '../../../atlassian/atlassian-helpers.js';
import { 
  generateStoryContentPrompt, 
  STORY_CONTENT_SYSTEM_PROMPT, 
  STORY_CONTENT_MAX_TOKENS 
} from './prompt-story-content.js';
import {
  parseTimestampMarkerFromAdf,
  appendTimestampMarkerToAdf,
  filterChangedComments,
  filterChangedIssues,
  detectInlineAnswersFromAdf,
  countUnansweredQuestionsInAdf,
  countAnsweredQuestionsInAdf,
  type InlineAnswer,
  type ChangeDetectionResult,
} from './change-detection.js';
import {
  generateScopeAnalysis,
  collapseDoneSections,
  type ScreenAnalysisData,
} from '../shared/scope-analysis-helpers.js';
import { formatServiceAvailabilityMessage } from '../shared/service-availability.js';
import { extractGoogleDocsUrlsFromADF } from '../../../google/google-docs-helpers.js';

/**
 * Parameters for executing the write-story workflow
 */
export interface ExecuteWriteStoryParams {
  issueKey: string;
  cloudId?: string;
  siteName?: string;
  maxDepth?: number;
}

/**
 * Result from executing the write-story workflow
 */
export interface ExecuteWriteStoryResult {
  success: boolean;
  /** 
   * Action taken:
   * - "wrote": Story was written/updated
   * - "no-changes": No context changes detected, story not updated
   */
  action: 'wrote' | 'no-changes';
  /** Issue key */
  issueKey: string;
  /** Number of unanswered questions (❓) in the story */
  questionCount: number;
  /** Number of answered questions (💬) in the story */
  answeredCount: number;
  /** Whether this was the first run (no existing timestamp) */
  isFirstRun?: boolean;
  /** Summary of changes incorporated */
  changesIncorporated?: string[];
  /** Message (for no-changes case) */
  message?: string;
  /** Error message if success=false */
  error?: string;
}

/**
 * Execute the write-story workflow
 * 
 * @param params - Workflow parameters
 * @param deps - Injected dependencies (clients, LLM, notifier)
 * @returns Result with story details
 */
export async function executeWriteStory(
  params: ExecuteWriteStoryParams,
  deps: ToolDependenciesWithOptionalFigma
): Promise<ExecuteWriteStoryResult> {
  const { issueKey, cloudId, siteName, maxDepth = 5 } = params;
  const { atlassianClient, figmaClient, googleClient, generateText, notify } = deps;
  
  console.log('executeWriteStory called', { issueKey, cloudId, siteName, maxDepth });
  console.log('  Starting story generation for:', issueKey);
  
  // ==========================================================================
  // PHASE 1: Resolve cloud ID and fetch target issue
  // ==========================================================================
  
  // Build service availability message based on available clients
  const serviceAvailabilityMessage = formatServiceAvailabilityMessage({
    atlassian: true,
    figma: !!figmaClient,
    google: !!googleClient,
  });
  await notify(`${serviceAvailabilityMessage}. Fetching ${issueKey}...`);
  
  const { cloudId: resolvedCloudId, siteName: resolvedSiteName } = await resolveCloudId(
    atlassianClient, 
    cloudId, 
    siteName
  );
  
  console.log(`  Resolved: cloudId=${resolvedCloudId}, siteName=${resolvedSiteName}`);
  
  // ==========================================================================
  // PHASE 2: Fetch hierarchy and parse timestamp
  // ==========================================================================
  // Note: Initial notify already sent above - hierarchy fetch is part of that
  
  const hierarchy = await fetchJiraIssueHierarchy(issueKey, atlassianClient, {
    maxDepth,
    cloudId: resolvedCloudId,
    siteName: resolvedSiteName,
    notify,
  });
  
  // Get existing description ADF (keep as ADF for parsing)
  const existingDescriptionAdf = hierarchy.target.fields.description || null;
  
  // Parse timestamp marker directly from ADF (no lossy markdown conversion)
  const lastUpdated = parseTimestampMarkerFromAdf(existingDescriptionAdf);
  const isFirstRun = !lastUpdated;
  
  console.log(`  Timestamp marker: ${lastUpdated ? lastUpdated.toISOString() : 'none (first run)'}`);
  
  // Convert to markdown only for prompt context (lossy but OK for AI prompts)
  const existingDescriptionMarkdown = existingDescriptionAdf 
    ? await convertAdfToMarkdown(existingDescriptionAdf)
    : '';  
  // ==========================================================================
  // PHASE 2b: Fetch ALL comments with pagination
  // ==========================================================================
  // Note: Part of the initial fetch phase - no separate notification needed
  
  const allComments = await fetchAllComments(atlassianClient, resolvedCloudId, issueKey);
  console.log(`  Fetched ${allComments.length} total comments`);
  
  // ==========================================================================
  // PHASE 3: Change detection (if not first run)
  // ==========================================================================
  let changedContext: ChangeDetectionResult | null = null;
  const changesIncorporated: string[] = [];
  
  if (!isFirstRun && lastUpdated) {
    await notify('Detecting changes since last update...');
    
    // Filter changed comments
    const changedComments = filterChangedComments(allComments, lastUpdated);
    changesIncorporated.push(`${changedComments.length} new/updated comments`);
    
    // Filter changed issues (parents, blockers)
    const allLinkedIssues = [...hierarchy.parents, ...hierarchy.blockers, ...hierarchy.blocking];
    const changedIssues = filterChangedIssues(allLinkedIssues, lastUpdated);
    if (changedIssues.length > 0) {
      changesIncorporated.push(`${changedIssues.length} updated linked issues`);
    }
    
    // Detect inline answers directly from ADF
    const inlineAnswers = detectInlineAnswersFromAdf(existingDescriptionAdf);
    if (inlineAnswers.length > 0) {
      changesIncorporated.push(`${inlineAnswers.length} inline answers detected`);
    }
    
    // Check for any changes
    const hasChanges = changedComments.length > 0 || changedIssues.length > 0 || inlineAnswers.length > 0;
    
    if (!hasChanges) {
      console.log('  No changes detected since last update');
      return {
        success: true,
        action: 'no-changes',
        issueKey,
        questionCount: countUnansweredQuestionsInAdf(existingDescriptionAdf),
        answeredCount: countAnsweredQuestionsInAdf(existingDescriptionAdf),
        message: 'Story is up to date. No changes detected since last update.',
      };
    }
    
    changedContext = {
      changedComments,
      changedIssues,
      inlineAnswers,
      lastUpdated,
    };
    
    console.log(`  Changes detected: ${changesIncorporated.join(', ')}`);
  }
  
  // ==========================================================================
  // PHASE 4: Extract links and load linked resources
  // ==========================================================================
  const links = extractLinksFromHierarchy(hierarchy);
  
  // Also extract Google Docs URLs from target issue description
  const targetDescriptionAdf = hierarchy.target.fields.description;
  const googleDocsUrls = targetDescriptionAdf ? extractGoogleDocsUrlsFromADF(targetDescriptionAdf) : [];
  
  console.log(`  Found links: ${links.figma.length} Figma, ${links.confluence.length} Confluence, ${googleDocsUrls.length} Google Docs`);
  
  // Report link counts (similar to write-shell-stories pattern)
  const linkParts: string[] = [];
  if (links.figma.length > 0) linkParts.push(`${links.figma.length} Figma`);
  if (links.confluence.length > 0) linkParts.push(`${links.confluence.length} Confluence`);
  if (googleDocsUrls.length > 0) linkParts.push(`${googleDocsUrls.length} Google Doc(s)`);
  if (linkParts.length > 0) {
    await notify(`Found ${linkParts.join(', ')}`);
  }
  
  // Load linked resources (Figma, Confluence)
  // Note: This may be expensive, but spec says to always fetch metadata for change detection
  let loadedContext: LoadedContext | undefined;
  
  const hasFigmaToLoad = figmaClient && links.figma.length > 0;
  const hasConfluenceToLoad = links.confluence.length > 0;
  const hasGoogleDocsToLoad = googleClient && googleDocsUrls.length > 0;
  
  if (hasFigmaToLoad || hasConfluenceToLoad || hasGoogleDocsToLoad) {
    
    const loadOptions: LoadContextOptions = {
      atlassianClient,
      figmaClient,
      googleClient,
      generateText,
      cloudId: resolvedCloudId,
      siteName: resolvedSiteName,
      sourceAdf: targetDescriptionAdf || undefined,
      notify,
    };
    
    loadedContext = await loadLinkedResources(
      hierarchy,
      links,
      loadOptions
    );
    
    // Add to changes incorporated if this is not the first run
    if (!isFirstRun && loadedContext) {
      if (loadedContext.analyzedScreens.length > 0) {
        changesIncorporated.push(`${loadedContext.analyzedScreens.length} Figma screens loaded`);
      }
      if (loadedContext.confluenceDocs.length > 0) {
        changesIncorporated.push(`${loadedContext.confluenceDocs.length} Confluence pages loaded`);
      }
      if (loadedContext.googleDocs.length > 0) {
        changesIncorporated.push(`${loadedContext.googleDocs.length} Google Docs loaded`);
      }
    }
  }
  
  // ==========================================================================
  // PHASE 4.5: Generate scope analysis from Figma screens (two-phase approach)
  // ==========================================================================
  let scopeAnalysisContent: string | undefined;
  
  if (loadedContext?.analyzedScreens && loadedContext.analyzedScreens.length > 0) {
    await notify('Generating scope analysis from Figma screens...');
    
    // Convert AnalyzedScreen[] to ScreenAnalysisData[] format
    const analysisData: ScreenAnalysisData[] = loadedContext.analyzedScreens.map(screen => ({
      screenName: screen.name,
      url: screen.url,
      content: screen.analysis,
    }));
    
    // Build epic context from parent hierarchy
    const epicContext = hierarchy.parents.length > 0
      ? hierarchy.parents.map(p => `**${p.key}** (${p.fields.issuetype?.name}): ${p.fields.summary}`).join('\n')
      : undefined;
    
    // Convert Confluence docs to DocumentContext format
    const referenceDocs = loadedContext.confluenceDocs.map(doc => ({
      title: doc.title,
      url: doc.url,
      markdown: doc.markdown,
      source: 'confluence' as const,
    }));
    
    try {
      const scopeResult = await generateScopeAnalysis({
        generateText,
        analysisData,
        epicContext,
        referenceDocs,
      });
      
      // Collapse sections with only ✅ markers to reduce verbosity
      scopeAnalysisContent = collapseDoneSections(scopeResult.scopeAnalysisContent);
      console.log(`  ✅ Scope analysis: ${scopeResult.featureAreasCount} areas, ${scopeResult.questionsCount} questions`);
    } catch (error: any) {
      console.log(`  ⚠️ Scope analysis generation failed: ${error.message}`);
      // Continue without scope analysis - the story can still be written
    }
  }
  
  // ==========================================================================
  // PHASE 5: Generate story content with LLM
  // ==========================================================================
  await notify('Generating story content...');
  
  const prompt = generateStoryContentPrompt({
    issueSummary: hierarchy.target.fields.summary,
    existingDescription: isFirstRun ? undefined : existingDescriptionMarkdown,
    hierarchy,
    allComments: isFirstRun ? allComments : (changedContext?.changedComments || []),
    loadedContext,
    changedContext,
    isFirstRun,
    scopeAnalysis: scopeAnalysisContent,
  });
  
  console.log(`  Prompt size: ${prompt.length} chars`);
  
  const llmResponse = await generateText({
    messages: [
      { role: 'system', content: STORY_CONTENT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    maxTokens: STORY_CONTENT_MAX_TOKENS,
  });
  
  const generatedContent = llmResponse.text;
  console.log(`  Generated content: ${generatedContent.length} chars`);
  
  // ==========================================================================
  // PHASE 6: Convert to ADF, append timestamp, and update Jira
  // ==========================================================================
  await notify('Updating Jira story...');
  
  // Convert LLM-generated markdown to ADF
  const generatedAdf = await convertMarkdownToAdf(generatedContent);
  
  // Append timestamp marker directly to ADF (avoids lossy round-trip)
  const adfWithTimestamp = appendTimestampMarkerToAdf(generatedAdf, new Date());
  
  // Update Jira issue description
  const updateUrl = `${atlassianClient.getJiraBaseUrl(resolvedCloudId)}/issue/${issueKey}`;
  const updateResponse = await atlassianClient.fetch(updateUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        description: adfWithTimestamp,
      },
    }),
  });
  
  await handleJiraAuthError(updateResponse, `Update issue ${issueKey}`);
  
  console.log(`  ✅ Jira issue ${issueKey} updated`);
  
  // Count questions in the final ADF
  const questionCount = countUnansweredQuestionsInAdf(adfWithTimestamp);
  const answeredCount = countAnsweredQuestionsInAdf(adfWithTimestamp);
  
  await notify(`Story updated with ${questionCount} questions remaining.`);
  
  return {
    success: true,
    action: 'wrote',
    issueKey,
    questionCount,
    answeredCount,
    isFirstRun,
    changesIncorporated: changesIncorporated.length > 0 ? changesIncorporated : undefined,
  };
}
