/**
 * Core business logic for write-shell-stories tool
 * 
 * This module contains the pure business logic for generating shell stories from Figma designs.
 * It is independent of MCP-specific concerns (authentication, context, etc.) and can be used
 * from both MCP handlers and REST API endpoints.
 * 
 * The logic orchestrates:
 * 1-3. Fetching epic, extracting context, setting up Figma screens
 * 3.5-3.9. Setting up Confluence, Google Docs, Figma comments, and notes context
 * 4. Downloading images and analyzing screens with AI (creates cached *.analysis.md files)
 * 5. Automatic scope analysis: Check for existing analysis, generate if needed, count questions
 * 6. Generating prioritized shell stories (if ≤5 questions)
 * 7. Updating the Jira epic with generated stories
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { ToolDependencies } from '../types.js';
import type { Screen } from './screen-analyzer.js';
import { getDebugDir, getBaseCacheDir } from './temp-directory-manager.js';
import { getFigmaFileCachePath } from '../../../figma/screen-analyses-workflow/figma-cache.js';
import { setupFigmaScreens } from './figma-screen-setup.js';
import { setupConfluenceContext, type ConfluenceDocument } from '../shared/confluence-setup.js';
import { setupGoogleDocsContext, type GoogleDocDocument } from '../shared/google-docs-setup.js';
import { analyzeScreens, type AnalyzedFrame } from '../../../figma/screen-analyses-workflow/index.js';
import {
  generateShellStoryPrompt,
  SHELL_STORY_SYSTEM_PROMPT,
  SHELL_STORY_MAX_TOKENS,
  type ConfluenceDocumentContext
} from './prompt-shell-stories.js';
import { 
  convertMarkdownToAdf,
  convertAdfNodesToMarkdown,
  validateAdf,
  extractADFSection,
  type ADFNode,
  type ADFDocument
} from '../../../atlassian/markdown-converter.js';
import { handleJiraAuthError, addIssueComment } from '../../../atlassian/atlassian-helpers.js';
import { calculateAdfSize, wouldExceedLimit } from './size-helpers.js';
import {
  fetchCommentsForFile,
  groupCommentsIntoThreads,
  formatCommentsForContext,
  type FrameMetadata,
} from '../../../figma/tools/figma-review-design/figma-comment-utils.js';
import type { ScreenAnnotation } from '../shared/screen-annotation.js';
import { notesToScreenAnnotations } from './note-text-extractor.js';
import {
  extractScopeAnalysis as extractScopeAnalysisFromShared,
  countUnansweredQuestions,
  countAnsweredQuestions,
  decideSelfHealingAction,
  SelfHealingDecision,
  QUESTION_THRESHOLD,
  generateScopeAnalysis,
  type ScopeAnalysisResult,
} from '../shared/scope-analysis-helpers.js';
import {
  extractAllLinkMetadata,
  formatLinkCountsMessage,
} from './link-metadata-extractor.js';
import { formatServiceAvailabilityMessage } from '../shared/service-availability.js';

// Re-export for external use
export { SelfHealingDecision };

/**
 * Helper: Extract the "## Scope Analysis" section from epic context
 * Delegates to shared helper for consistency
 */
interface ParsedEpicContext {
  scopeAnalysis: string | null;
  remainingContext: string;
}

function extractScopeAnalysisLocal(epicContext: string): ParsedEpicContext {
  return extractScopeAnalysisFromShared(epicContext);
}

/**
 * Parameters for executing the write-shell-stories workflow
 */
export interface ExecuteWriteShellStoriesParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Action types for write-shell-stories workflow
 * 
 * @see contracts/write-shell-stories-response.schema.json
 */
export type WriteShellStoriesAction = 'proceed' | 'clarify' | 'regenerate';

/**
 * Result from executing the write-shell-stories workflow
 * 
 * Extended with automatic scope analysis fields per spec 039-self-healing-tools
 */
export interface ExecuteWriteShellStoriesResult {
  /** Whether the operation completed successfully */
  success: boolean;
  /** 
   * Action taken:
   * - "proceed": Created shell stories (≤5 questions)
   * - "clarify": Created scope analysis, needs answers (>5 questions, no existing)
   * - "regenerate": Regenerated scope analysis with answered questions (>5 questions, had existing)
   */
  action: WriteShellStoriesAction;
  /** Shell stories markdown content (when action="proceed") */
  shellStoriesContent?: string;
  /** Number of shell stories created (0 when action="clarify" or "regenerate") */
  storyCount: number;
  /** Number of screens analyzed */
  screensAnalyzed: number;
  /** Scope analysis markdown content (when action="clarify" or "regenerate") */
  scopeAnalysisContent?: string;
  /** Number of unanswered questions in scope analysis */
  questionCount?: number;
  /** Whether there was an existing scope analysis section */
  hadExistingAnalysis?: boolean;
  /** Error message if success=false */
  error?: string;
}

/**
 * Execute the write-shell-stories workflow
 * 
 * This is the core business logic that can be called from both MCP handlers and REST API endpoints.
 * It uses dependency injection to abstract away authentication and LLM provider concerns.
 * 
 * @param params - Workflow parameters
 * @param deps - Injected dependencies (clients, LLM, notifier)
 * @returns Result with shell stories content and metadata
 */
export async function executeWriteShellStories(
  params: ExecuteWriteShellStoriesParams,
  deps: ToolDependencies
): Promise<ExecuteWriteShellStoriesResult> {
  const { epicKey, cloudId, siteName } = params;
  const { atlassianClient, figmaClient, generateText, notify } = deps;
  
  console.log('executeWriteShellStories called', { epicKey, cloudId, siteName });
  console.log('  Starting shell story generation for epic:', epicKey);

  // Get debug directory for artifacts (only in DEV mode)
  const debugDir = await getDebugDir(epicKey);

  // ==========================================
  // PHASE 1-3: Fetch epic, extract context, setup Figma screens
  // ==========================================
  // Single initial message announces services and indicates we're starting (per spec 040)
  // write-shell-stories always has Figma (required) and Atlassian
  const serviceAvailabilityMessage = formatServiceAvailabilityMessage({
    atlassian: true,
    figma: true,
    google: !!deps.googleClient,
  });
  await notify(`${serviceAvailabilityMessage}. Fetching Jira epic...`);
  
  console.log('  Phase 1-3: Setting up epic and Figma screens...');
  
  const setupResult = await setupFigmaScreens({
    epicKey,
    atlassianClient,
    figmaClient,
    debugDir,
    cloudId,
    siteName,
    // Don't pass notify - we'll report after with combined link metadata
  });
  
  const {
    screens,
    allFrames,
    allNotes,
    figmaFileKey,
    nodesDataMap,
    epicWithoutShellStoriesMarkdown,
    epicWithoutShellStoriesAdf,
    epicDescriptionAdf,
    figmaUrls,
    cloudId: resolvedCloudId,
    siteName: resolvedSiteName,
    yamlContent
  } = setupResult;
  
  // Extract link metadata for comprehensive reporting
  const linkMetadata = extractAllLinkMetadata(epicDescriptionAdf);
  const linkCountsMessage = formatLinkCountsMessage(linkMetadata);
  await notify(linkCountsMessage);
  
  console.log(`  Phase 1-3 complete: ${figmaUrls.length} Figma URLs, ${screens.length} screens, ${allNotes.length} notes`);

  // ==========================================
  // PHASE 3.5: Setup Confluence context (if any linked docs)
  // ==========================================
  let confluenceDocs: ConfluenceDocumentContext[] = [];
  
  if (epicDescriptionAdf) {
    const confluenceContext = await setupConfluenceContext({
      epicAdf: epicDescriptionAdf,
      atlassianClient,
      generateText,
      siteName: resolvedSiteName,
      notify,
    });
    
    // Filter to docs relevant for shell story writing
    confluenceDocs = confluenceContext.byRelevance.writeStories.map((doc: ConfluenceDocument) => ({
      title: doc.title,
      url: doc.url,
      markdown: doc.markdown,
      documentType: doc.metadata.relevance?.documentType,
      relevanceScore: doc.metadata.relevance?.toolScores.find(t => t.toolId === 'write-shell-stories')?.overallScore,
      summary: doc.metadata.summary?.text,
      source: 'confluence' as const,
    }));
    
    console.log(`   📚 Confluence docs for shell stories: ${confluenceDocs.length}`);
  }

  // ==========================================
  // PHASE 3.6: Setup Google Docs context (if any linked docs)
  // ==========================================
  let googleDocs: ConfluenceDocumentContext[] = [];
  
  if (epicDescriptionAdf) {
    if (!deps.googleClient) {
      console.log('🔗 Skipping Google Docs context (no Google authentication)');
    } else {
      const googleDocsContext = await setupGoogleDocsContext({
        epicAdf: epicDescriptionAdf,
        googleClient: deps.googleClient,
        generateText,
        notify,
      });
      
      // Filter to docs relevant for shell story writing
      googleDocs = googleDocsContext.byRelevance.writeStories.map((doc: GoogleDocDocument) => ({
        title: doc.title,
        url: doc.url,
        markdown: doc.markdown,
        documentType: doc.metadata.relevance?.documentType,
        relevanceScore: doc.metadata.relevance?.toolScores.find(t => t.toolId === 'write-shell-stories')?.overallScore,
        summary: doc.metadata.summary?.text,
        source: 'google-docs' as const,
      }));
      
      console.log(`   📄 Google Docs for shell stories: ${googleDocs.length}`);
    }
  }

  // ==========================================
  // PHASE 3.6: Setup Google Docs context (if any linked docs)
  // ==========================================
  let googleDocs: ConfluenceDocumentContext[] = [];
  
  if (epicDescriptionAdf) {
    if (!deps.googleClient) {
      console.log('🔗 Skipping Google Docs context (no Google authentication)');
    } else {
      const googleDocsContext = await setupGoogleDocsContext({
        epicAdf: epicDescriptionAdf,
        googleClient: deps.googleClient,
        generateText,
        notify,
      });
      
      // Filter to docs relevant for shell story writing
      googleDocs = googleDocsContext.byRelevance.writeStories.map((doc: GoogleDocDocument) => ({
        title: doc.title,
        url: doc.url,
        markdown: doc.markdown,
        documentType: doc.metadata.relevance?.documentType,
        relevanceScore: doc.metadata.relevance?.toolScores.find(t => t.toolId === 'write-shell-stories')?.overallScore,
        summary: doc.metadata.summary?.text,
        source: 'google-docs' as const,
      }));
      
      console.log(`   📄 Google Docs for shell stories: ${googleDocs.length}`);
    }
  }

  // ==========================================
  // PHASE 3.7: Merge documentation contexts
  // ==========================================
  const allDocs = [...confluenceDocs, ...googleDocs];
  console.log(`   📚 Total documentation context: ${allDocs.length} docs (${confluenceDocs.length} Confluence + ${googleDocs.length} Google Docs)`);

  // ==========================================
  // PHASE 3.8: Fetch Figma comments for context
  // ==========================================
  let figmaCommentContexts: ScreenAnnotation[] = [];
  let matchedThreadCount = 0;
  if (figmaClient && figmaFileKey) {
    try {
      console.log('  Phase 3.8: Fetching Figma comments...');
      const comments = await fetchCommentsForFile(figmaClient, figmaFileKey);
      if (comments.length > 0) {
        const threads = groupCommentsIntoThreads(comments);
        // Build frame metadata from allFrames with bounding boxes for proximity matching
        const frameMetadata: FrameMetadata[] = allFrames.map((frame) => ({
          fileKey: figmaFileKey,
          nodeId: frame.id,
          name: frame.name,
          url: screens.find(s => s.nodeId === frame.id)?.url,
          x: frame.absoluteBoundingBox?.x,
          y: frame.absoluteBoundingBox?.y,
          width: frame.absoluteBoundingBox?.width,
          height: frame.absoluteBoundingBox?.height,
        }));
        
        // Build a document tree from nodesDataMap for spatial containment checks
        // This allows finding child nodes to check if comments on children belong to frames
        const documentTree = {
          id: 'root',
          children: Array.from(nodesDataMap.values())
        };
        
        const commentResult = formatCommentsForContext(threads, frameMetadata, documentTree);
        figmaCommentContexts = [...commentResult.contexts, ...commentResult.unattachedComments];
        matchedThreadCount = commentResult.matchedThreadCount;
        const unattachedCount = commentResult.unattachedComments.length;
        const unattachedNote = unattachedCount > 0 ? ` (${unattachedCount} unattached)` : '';
        console.log(`   💬 Fetched ${comments.length} Figma comments → ${commentResult.matchedThreadCount} threads across ${commentResult.contexts.length} screens${unattachedNote}`);
      } else {
        console.log('   💬 No Figma comments found');
      }
    } catch (error: any) {
      console.log(`   ⚠️ Figma comment fetching failed: ${error.message}`);
      // Continue without comments - they're optional context
    }
  }

  // ==========================================
  // PHASE 3.9: Add notes as context (using shared notesToScreenAnnotations)
  // ==========================================
  const noteAnnotations = notesToScreenAnnotations(screens, allNotes);
  const allContexts = [...figmaCommentContexts, ...noteAnnotations];
  const commentsCount = matchedThreadCount;

  // ==========================================
  // PHASE 4: Download images and analyze screens
  // ==========================================
  // Screen analysis must happen BEFORE scope analysis because generateScopeAnalysis()
  // reads the cached *.analysis.md files
  console.log('  Phase 4: Downloading images and analyzing screens...');
  
  // Improved progress message: Figma context summary (per spec 040)
  const screenNames = screens.map(s => s.name).join(', ');
  await notify(`🤖 Analyzing Figma: ${screens.length} screen(s) [${screenNames}], ${allNotes.length} note(s), ${commentsCount} comment(s)...`);
  
  // Use consolidated screen-analyses-workflow
  const figmaUrlsForAnalysis = screens.map(s => s.url);
  const analysisWorkflowResult = await analyzeScreens(
    figmaUrlsForAnalysis,
    figmaClient,
    generateText,
    {
      analysisOptions: {
        contextMarkdown: epicWithoutShellStoriesMarkdown,
      },
      notify: async (msg: string) => {}, // Don't pass notify - we'll report after with combined stats
    }
  );
  
  // Count cached vs newly analyzed
  const cachedScreens = analysisWorkflowResult.frames.filter(f => f.cached).length;
  const analyzedScreens = analysisWorkflowResult.frames.filter(f => !f.cached).length;
  
  console.log(`  Phase 4 complete: ${analyzedScreens}/${screens.length} screens analyzed`);
  
  // Improved cache status message (per spec 040)
  const cacheExplanation = cachedScreens > 0 && analyzedScreens === 0 ? ' (Figma file unchanged)' : '';
  await notify(`Screen analysis complete: ${cachedScreens} cached, ${analyzedScreens} new${cacheExplanation}`);

  // ==========================================
  // PHASE 5: Check Scope Analysis and Questions
  // ==========================================
  console.log('  Phase 5: Checking scope analysis...');
  
  // Check for existing scope analysis section
  const parsedContext = extractScopeAnalysisLocal(epicWithoutShellStoriesMarkdown);
  const hadExistingAnalysis = parsedContext.scopeAnalysis !== null;
  
  let scopeAnalysisContent: string | null = parsedContext.scopeAnalysis;
  let scopeAnalysisGeneratedThisRun = false;
  let featureAreasCount = 0;
  
  // If no scope analysis, generate it (self-healing)
  if (!scopeAnalysisContent) {
    console.log('  📝 No scope analysis found - generating automatically...');
    
    // Build context summary for progress message (per spec 040)
    const contextParts: string[] = [];
    if (screens.length > 0) contextParts.push(`${screens.length} screen(s)`);
    if (confluenceDocs.length > 0) contextParts.push(`${confluenceDocs.length} Confluence page(s)`);
    if (googleDocs.length > 0) contextParts.push(`${googleDocs.length} Google Doc(s)`);
    const existingNote = hadExistingAnalysis ? ' (existing scope analysis available)' : '';
    
    await notify(`🤖 Generating scope analysis from ${contextParts.join(', ')}${existingNote}...`);
    
    try {
      // Use the shared generateScopeAnalysis function with performance logging
      const scopeAnalysisStartTime = Date.now();
      const scopeResult = await generateScopeAnalysis({
        generateText,
        screens,
        debugDir,
        figmaFileKey,
        yamlContent,
        notify,
        epicContext: epicWithoutShellStoriesMarkdown,
        referenceDocs: allDocs.map(doc => ({
          title: doc.title,
          url: doc.url,
          markdown: doc.markdown,
          source: doc.source ?? 'confluence', // Default to confluence for backward compatibility
        })),
        commentContexts: allContexts,
      });
      const scopeAnalysisDuration = Date.now() - scopeAnalysisStartTime;
      console.log(`  ⏱️ Scope analysis generation took ${(scopeAnalysisDuration / 1000).toFixed(1)}s`);
      
      scopeAnalysisContent = scopeResult.scopeAnalysisContent;
      scopeAnalysisGeneratedThisRun = true;
      featureAreasCount = scopeResult.featureAreasCount;
      console.log(`  ✅ Scope analysis generated: ${scopeResult.questionsCount} questions, ${featureAreasCount} feature areas`);
    } catch (error: any) {
      // Error during scope analysis generation - return error immediately
      console.error('  ❌ Scope analysis generation failed:', error);
      return {
        success: false,
        action: 'clarify' as const,
        screensAnalyzed: 0,
        storyCount: 0,
        error: `Failed to generate scope analysis: ${error.message}`,
      };
    }
  } else {
    console.log('  📝 Existing scope analysis found');
    // Count feature areas from existing scope analysis
    const featureAreaMatches = scopeAnalysisContent.match(/^### .+$/gm);
    featureAreasCount = featureAreaMatches
      ? featureAreaMatches.filter(m => !m.includes('Remaining Questions')).length
      : 0;
  }
  
  // Count unanswered questions - ensure scopeAnalysisContent is not null
  const questionCount = scopeAnalysisContent ? countUnansweredQuestions(scopeAnalysisContent) : 0;
  const answeredCount = scopeAnalysisContent ? countAnsweredQuestions(scopeAnalysisContent) : 0;
  console.log(`  📊 Question count: ${questionCount} unanswered (❓), ${answeredCount} answered (💬), threshold: ${QUESTION_THRESHOLD}`);
  
  // Decide next action based on question count
  const decision = decideSelfHealingAction(hadExistingAnalysis, questionCount);
  console.log(`  🤔 Decision: ${decision}`);
  
  // Common parameters for decision handlers
  const decisionParams = {
    epicKey,
    cloudId: resolvedCloudId,
    atlassianClient,
    generateText,
    notify,
    screens,
    epicWithoutShellStoriesAdf,
    allDocs,
    allContexts,
    debugDir,
    figmaFileKey,
    yamlContent,
  };
  
  // Handle regeneration case - regenerate scope analysis with previous answers
  if (decision === SelfHealingDecision.REGENERATE_ANALYSIS) {
    const result = await handleRegenerateAnalysis({
      ...decisionParams,
      scopeAnalysisContent: scopeAnalysisContent!,
      remainingContext: parsedContext.remainingContext,
    });
    
    // If result has continueWithScopeAnalysis, update and continue to Phase 4
    if ('continueWithScopeAnalysis' in result) {
      scopeAnalysisContent = result.continueWithScopeAnalysis;
    } else {
      // Early return with clarify/regenerate result
      return result;
    }
  }
  
  // Handle clarify action - update Jira and return early
  if (decision === SelfHealingDecision.ASK_FOR_CLARIFICATION) {
    return handleAskForClarification({
      ...decisionParams,
      scopeAnalysisContent: scopeAnalysisContent!,
      questionCount,
      featureAreasCount,
      hadExistingAnalysis,
    });
  }
  
  // Decision is PROCEED_WITH_STORIES - continue with Phase 6
  console.log('  ✅ Proceeding with shell story generation');
  
  // If we generated scope analysis this run, write it to Jira before proceeding
  let epicContextWithScope = epicWithoutShellStoriesMarkdown;
  if (scopeAnalysisGeneratedThisRun && scopeAnalysisContent) {
    try {
      const scopeAnalysisSectionMarkdown = `## Scope Analysis\n\n${scopeAnalysisContent}`;
      await updateEpicWithScopeAnalysis({
        epicKey,
        cloudId: resolvedCloudId,
        atlassianClient,
        scopeAnalysisMarkdown: scopeAnalysisSectionMarkdown,
        epicWithoutShellStoriesAdf,
        notify
      });
      console.log('  ✅ Jira updated with scope analysis');
      
      // Update epic context to include the scope analysis we just wrote
      epicContextWithScope = `${epicWithoutShellStoriesMarkdown}\n\n${scopeAnalysisSectionMarkdown}`;
    } catch (error: any) {
      console.error('  ❌ Failed to update Jira with scope analysis:', error);
      // Continue anyway - Jira update is best effort, but update context for shell story generation
      epicContextWithScope = `${epicWithoutShellStoriesMarkdown}\n\n## Scope Analysis\n\n${scopeAnalysisContent}`;
    }
  }

  // ==========================================
  // PHASE 6: Generate shell stories from analyses
  // ==========================================
  const shellStoriesResult = await generateShellStoriesFromAnalyses({
    generateText, // Use injected LLM client
    screens,
    debugDir,
    figmaFileKey,
    yamlContent,
    notify,
    epicContext: epicContextWithScope,
    confluenceDocs: allDocs,
    figmaComments: allContexts
  });

  // ==========================================
  // PHASE 7: Write shell stories back to Jira epic
  // ==========================================
  let shellStoriesContent = '';
  if (shellStoriesResult.shellStoriesText) {
    shellStoriesContent = shellStoriesResult.shellStoriesText;
    
    // Update the epic description with shell stories
    await updateEpicWithShellStories({
      epicKey,
      cloudId: resolvedCloudId,
      atlassianClient,
      shellStoriesMarkdown: shellStoriesContent,
      epicWithoutShellStoriesAdf,
      notify
    });
  } else {
    shellStoriesContent = 'No shell stories were generated.';
  }

  // Action="proceed" - shell stories were created successfully
  await notify(`Updated Jira with ${shellStoriesResult.storyCount} shell stories`);
  
  return {
    success: true,
    action: 'proceed' as const,
    shellStoriesContent,
    storyCount: shellStoriesResult.storyCount,
    screensAnalyzed: shellStoriesResult.analysisCount,
    questionCount: 0, // Proceeded because questions were acceptable
    hadExistingAnalysis: false,
  };
}

/**
 * Phase 5: Generate shell stories from analyses
 * 
 * Reads all screen analysis files and uses AI to generate
 * prioritized shell stories following evidence-based incremental value principles.
 * 
 * @returns Object with storyCount, analysisCount, and shellStoriesPath
 */
async function generateShellStoriesFromAnalyses(params: {
  generateText: ToolDependencies['generateText'];
  screens: Screen[];
  debugDir: string | null;
  figmaFileKey: string;
  yamlContent: string;
  notify: ToolDependencies['notify'];
  epicContext?: string;
  confluenceDocs?: ConfluenceDocumentContext[];
  figmaComments?: ScreenAnnotation[];
}): Promise<{ storyCount: number; analysisCount: number; shellStoriesPath: string | null; shellStoriesText: string | null }> {
  const { generateText, screens, debugDir, figmaFileKey, yamlContent, notify, epicContext, confluenceDocs, figmaComments } = params;
  
  console.log('  Phase 5: Generating shell stories from analyses...');
  
  await notify('Generating shell stories from scope analysis...');
  
  // screens.yaml content is provided directly (always generated, optionally written to file)
  const screensYamlContent = yamlContent;
  
  // Construct file cache path for analysis files (always available)
  const fileCachePath = getFigmaFileCachePath(figmaFileKey);
  
  // Read all analysis files from file cache
  const analysisFiles: Array<{ screenName: string; content: string }> = [];
  for (const screen of screens) {
    const filename = screen.filename || screen.name;
    const analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);
    try {
      const content = await fs.readFile(analysisPath, 'utf-8');
      analysisFiles.push({ screenName: screen.name, content });
      console.log(`    ✅ Read analysis: ${filename}.analysis.md`);
    } catch (error: any) {
      console.log(`    ⚠️ Could not read analysis for ${filename}: ${error.message}`);
    }
  }
  
  console.log(`  Loaded ${analysisFiles.length}/${screens.length} analysis files`);
  
  // Note: Analysis files are passed to generateShellStoryPrompt for backward compatibility
  // but are not currently used. Shell stories are generated from scope analysis in epic context.
  
  if (analysisFiles.length === 0) {
    await notify('⚠️ No analysis files found - skipping shell story generation');
    return { storyCount: 0, analysisCount: 0, shellStoriesPath: null, shellStoriesText: null };
  }
  
  // Verify epic context exists (required for scope analysis)
  if (!epicContext || !epicContext.trim()) {
    throw new Error('Epic context with scope analysis is required for shell story generation. Please run the "analyze-feature-scope" tool first to generate scope analysis, then run this tool again.');
  }
  
  // Extract scope analysis from epic context
  const { scopeAnalysis, remainingContext } = extractScopeAnalysisLocal(epicContext);
  
  if (!scopeAnalysis) {
    throw new Error('Epic must contain a "## Scope Analysis" section. Please run the "analyze-feature-scope" tool first to generate scope analysis, then run this tool again.');
  }
  
  // Generate shell story prompt
  const shellStoryPrompt = generateShellStoryPrompt(
    screensYamlContent,
    analysisFiles,
    scopeAnalysis,
    remainingContext,
    confluenceDocs,
    figmaComments
  );
  
  // Save prompt to debug directory for debugging (if enabled)
  if (debugDir) {
    const promptPath = path.join(debugDir, 'shell-stories-prompt.md');
    await fs.writeFile(promptPath, shellStoryPrompt, 'utf-8');
    console.log(`    ✅ Saved prompt: shell-stories-prompt.md`);
  }
  
  console.log(`    🤖 Requesting shell story generation from AI...`);
  console.log(`       Prompt length: ${shellStoryPrompt.length} characters`);
  console.log(`       System prompt length: ${SHELL_STORY_SYSTEM_PROMPT.length} characters`);
  console.log(`       Max tokens: ${SHELL_STORY_MAX_TOKENS}`);
  if (epicContext && epicContext.length > 0) {
    console.log(`       Epic context: ${epicContext.length} characters`);
  }
  
  // Request shell story generation via injected LLM client
  console.log('    ⏳ Waiting for Anthropic API response...');
  const response = await generateText({
    messages: [
      { role: 'system', content: SHELL_STORY_SYSTEM_PROMPT },
      { role: 'user', content: shellStoryPrompt }
    ],
    maxTokens: SHELL_STORY_MAX_TOKENS
  });
  
  const shellStoriesText = response.text;
  
  if (!shellStoriesText) {
    throw new Error(`
🤖 **AI Generation Failed**

**What happened:**
No shell stories content received from AI

**Possible causes:**
- AI service timeout or rate limit
- Invalid prompt or context
- Epic description may not contain valid Figma links
- Network connectivity issues

**How to fix:**
1. Wait a few minutes and retry the operation
2. Verify your Anthropic API key is still valid
3. Check that the epic description contains accessible Figma design links
4. Ensure the Figma files are not empty or corrupted

**Technical details:**
- AI response was empty or malformed
- Screens analyzed: ${screens.length}
- Analysis files loaded: ${analysisFiles.length}
`.trim());
  }
  
  console.log(`    ✅ Shell stories generated (${shellStoriesText.length} characters)`);
  if (response.metadata) {
    console.log(`       Tokens used: ${response.metadata.usage?.totalTokens}, Finish reason: ${response.metadata.finishReason}`);
  }
  
  // Save shell stories to file (if debug directory enabled)
  let shellStoriesPath: string | null = null;
  if (debugDir) {
    shellStoriesPath = path.join(debugDir, 'shell-stories.md');
    await fs.writeFile(shellStoriesPath, shellStoriesText, 'utf-8');
    console.log(`    ✅ Saved shell stories: shell-stories.md`);
  }
  
  // Count stories (rough estimate by counting "st" prefixes with or without backticks)
  const storyMatches = shellStoriesText.match(/^- `?st\d+/gm);
  const storyCount = storyMatches ? storyMatches.length : 0;
  
  return { storyCount, analysisCount: analysisFiles.length, shellStoriesPath, shellStoriesText };
}

/**
 * Helper function for Phase 6: Update epic with shell stories
 * @param params - Parameters for updating the epic
 * @param params.epicKey - The Jira epic key
 * @param params.cloudId - The Atlassian cloud ID
 * @param params.atlassianClient - Atlassian API client with auth
 * @param params.shellStoriesMarkdown - The AI-generated shell stories markdown content
 * @param params.epicWithoutShellStoriesAdf - The epic description ADF content without Shell Stories section (from setupResult)
 * @param params.notify - Progress notification function
 */
async function updateEpicWithShellStories({
  epicKey,
  cloudId,
  atlassianClient,
  shellStoriesMarkdown,
  epicWithoutShellStoriesAdf,
  notify
}: {
  epicKey: string;
  cloudId: string;
  atlassianClient: ToolDependencies['atlassianClient'];
  shellStoriesMarkdown: string;
  epicWithoutShellStoriesAdf: ADFNode[];
  notify: ToolDependencies['notify'];
}): Promise<void> {
  console.log('  Phase 7: Updating epic with shell stories...');

  try {
    // Clean up AI-generated content and prepare section
    const shellStoriesSection = prepareShellStoriesSection(shellStoriesMarkdown);
    
    // Convert the new section to ADF
    console.log('    Converting shell stories section to ADF...');
    const shellStoriesAdf = await convertMarkdownToAdf(shellStoriesSection);
    
    if (!validateAdf(shellStoriesAdf)) {
      console.log('    ⚠️ Failed to convert shell stories to valid ADF');
      await notify('⚠️ Failed to convert shell stories to ADF');
      return;
    }
    
    console.log('    ✅ Shell stories converted to ADF');
    
    // Check if combined size would exceed Jira's limit
    const wouldExceed = wouldExceedLimit(epicWithoutShellStoriesAdf, shellStoriesAdf);

    let finalContent = epicWithoutShellStoriesAdf;

    if (wouldExceed) {
      // Extract Scope Analysis section from content
      const { section: scopeAnalysisSection, remainingContent } = extractADFSection(
        epicWithoutShellStoriesAdf,
        'Scope Analysis'
      );
      
      if (scopeAnalysisSection.length > 0) {
        console.log('  ⚠️ Moving Scope Analysis to comment (content would exceed 43KB limit)');
        await notify('⚠️ Moving Scope Analysis to comment to stay within 43KB limit...');
        
        // Convert to markdown
        const scopeAnalysisMarkdown = convertAdfNodesToMarkdown(scopeAnalysisSection);
        
        // Post as comment
        try {
          await addIssueComment(
            atlassianClient,
            cloudId,
            epicKey,
            `**Note**: The Scope Analysis section was moved to this comment due to description size limits (43KB max).\n\n---\n\n${scopeAnalysisMarkdown}`
          );
        } catch (err: any) {
          console.log(`    ⚠️ Failed to post comment: ${err.message}`);
          // Continue anyway - we'll still update the description
        }
        
        // Use remaining content (without Scope Analysis)
        finalContent = remainingContent;
      }
    }

    // After moving Scope Analysis, check size and warn if still large
    const finalDoc: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [...finalContent, ...shellStoriesAdf.content]
    };

    const JIRA_LIMIT = 43838;
    const SAFETY_MARGIN = 2000;
    const finalSize = calculateAdfSize(finalDoc);

    if (finalSize > (JIRA_LIMIT - SAFETY_MARGIN)) {
      console.log(`  ⚠️ Warning: Epic description will be ${finalSize} characters (exceeds safe limit of ${JIRA_LIMIT - SAFETY_MARGIN}). Attempting update anyway...`);
      await notify(`⚠️ Warning: Description is ${finalSize} chars (may exceed limit). Attempting update...`);
    }
    
    // Combine description (without old shell stories from Phase 1.6) with new shell stories section
    const updatedDescription: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        ...finalContent,
        ...shellStoriesAdf.content
      ]
    };
    
    // Update the epic
    console.log('    Updating epic description...');
    const updateUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${epicKey}`;
    
    const updateResponse = await atlassianClient.fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          description: updatedDescription
        }
      }),
    });
    
    if (updateResponse.status === 404) {
      console.log(`    ⚠️ Epic ${epicKey} not found`);
      await notify(`⚠️ Epic ${epicKey} not found`);
      return;
    }
    
    if (updateResponse.status === 403) {
      console.log(`    ⚠️ Insufficient permissions to update epic ${epicKey}`);
      await notify(`⚠️ Insufficient permissions to update epic`);
      return;
    }
    
    await handleJiraAuthError(updateResponse, `Update epic ${epicKey} description`);
    
    console.log('    ✅ Epic description updated successfully');
    //await notify(`✅ Jira Update Complete: Epic updated with shell stories`);
    
  } catch (error: any) {
    console.log(`    ⚠️ Error updating epic: ${error.message}`);
    await notify(`⚠️ Error updating epic: ${error.message}`);
  }
}

/**
 * Prepare shell stories section for Jira epic
 * 
 * Strips any leading headers from AI-generated content to avoid double headers.
 * The AI sometimes adds headers like "# Task Search and Filter - Shell Stories"
 * even though we instruct it not to.
 * 
 * @param shellStoriesMarkdown - Raw markdown from AI generation
 * @returns Cleaned markdown with "## Shell Stories" header
 */
function prepareShellStoriesSection(shellStoriesMarkdown: string): string {
  let cleanedMarkdown = shellStoriesMarkdown.trim();
  
  // Remove any leading H1 headers (# ...)
  cleanedMarkdown = cleanedMarkdown.replace(/^#\s+.*?\n+/m, '');
  
  // Remove any leading H2 headers (## ...) that might say "Shell Stories"
  cleanedMarkdown = cleanedMarkdown.replace(/^##\s+.*?\n+/m, '');
  
  // Return with proper section header
  return `## Shell Stories\n\n${cleanedMarkdown}`;
}

/**
 * Helper function: Update epic with scope analysis section
 * 
 * Used by self-healing workflow when:
 * - action="clarify": No existing scope analysis, too many questions
 * - action="regenerate": Existing scope analysis regenerated with answered questions
 * 
 * @param params.epicKey - The Jira epic key
 * @param params.cloudId - The Atlassian cloud ID
 * @param params.atlassianClient - Atlassian API client with auth
 * @param params.scopeAnalysisMarkdown - The scope analysis markdown content
 * @param params.epicWithoutShellStoriesAdf - The epic description ADF content
 * @param params.notify - Progress notification function
 */
async function updateEpicWithScopeAnalysis({
  epicKey,
  cloudId,
  atlassianClient,
  scopeAnalysisMarkdown,
  epicWithoutShellStoriesAdf,
  notify
}: {
  epicKey: string;
  cloudId: string;
  atlassianClient: ToolDependencies['atlassianClient'];
  scopeAnalysisMarkdown: string;
  epicWithoutShellStoriesAdf: ADFNode[];
  notify: ToolDependencies['notify'];
}): Promise<void> {
  console.log('  Updating epic with scope analysis...');

  try {
    // Convert scope analysis markdown to ADF
    console.log('    Converting scope analysis to ADF...');
    const scopeAnalysisAdf = await convertMarkdownToAdf(scopeAnalysisMarkdown);
    
    if (!validateAdf(scopeAnalysisAdf)) {
      console.log('    ⚠️ Failed to convert scope analysis to valid ADF');
      await notify('⚠️ Failed to convert scope analysis to ADF');
      return;
    }
    
    console.log('    ✅ Scope analysis converted to ADF');
    
    // Remove any existing scope analysis section from the epic
    const { remainingContent } = extractADFSection(
      epicWithoutShellStoriesAdf,
      'Scope Analysis'
    );
    
    // Combine: remaining content + new scope analysis
    const updatedDescription: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        ...remainingContent,
        ...scopeAnalysisAdf.content
      ]
    };
    
    // Update the epic
    console.log('    Updating epic description...');
    const updateUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${epicKey}`;
    
    const updateResponse = await atlassianClient.fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          description: updatedDescription
        }
      }),
    });
    
    if (updateResponse.status === 404) {
      console.log(`    ⚠️ Epic ${epicKey} not found`);
      await notify(`⚠️ Epic ${epicKey} not found`);
      return;
    }
    
    if (updateResponse.status === 403) {
      console.log(`    ⚠️ Insufficient permissions to update epic ${epicKey}`);
      await notify(`⚠️ Insufficient permissions to update epic`);
      return;
    }
    
    await handleJiraAuthError(updateResponse, `Update epic ${epicKey} with scope analysis`);
    
    console.log('    ✅ Epic updated with scope analysis');
    // Note: No notification here - final message is sent by handleAskForClarification (per spec 040)
    
  } catch (error: any) {
    console.log(`    ⚠️ Error updating epic with scope analysis: ${error.message}`);
    await notify(`⚠️ Error updating epic: ${error.message}`);
    throw error; // Re-throw so caller knows the update failed
  }
}

// ==========================================
// Decision Handler Helper Functions
// ==========================================

/**
 * Parameters for decision handler functions
 */
interface DecisionHandlerParams {
  epicKey: string;
  cloudId: string;
  atlassianClient: ToolDependencies['atlassianClient'];
  generateText: ToolDependencies['generateText'];
  notify: ToolDependencies['notify'];
  screens: Screen[];
  epicWithoutShellStoriesAdf: ADFNode[];
  allDocs: ConfluenceDocumentContext[];
  allContexts: ScreenAnnotation[];
  debugDir: string | null;
  figmaFileKey: string;
  yamlContent: string;
}

/**
 * Handle REGENERATE_ANALYSIS decision
 * 
 * Regenerates scope analysis with user's previous answers as context.
 * Returns early result if still too many questions, or null to continue with shell stories.
 */
export async function handleRegenerateAnalysis(
  params: DecisionHandlerParams & {
    scopeAnalysisContent: string;
    remainingContext: string;
  }
): Promise<ExecuteWriteShellStoriesResult | { continueWithScopeAnalysis: string }> {
  const {
    epicKey,
    cloudId,
    atlassianClient,
    generateText,
    notify,
    screens,
    epicWithoutShellStoriesAdf,
    allDocs,
    allContexts,
    debugDir,
    figmaFileKey,
    yamlContent,
    scopeAnalysisContent,
    remainingContext,
  } = params;

  console.log('  🔄 Regenerating scope analysis with your answers...');
  await notify('Updating scope analysis with your answers...');

  try {
    // Regenerate with previous scope analysis as context with performance logging
    const regenStartTime = Date.now();
    const scopeResult = await generateScopeAnalysis({
      generateText,
      screens,
      debugDir,
      figmaFileKey,
      yamlContent,
      notify,
      epicContext: remainingContext,
      referenceDocs: allDocs.map(doc => ({
        title: doc.title,
        url: doc.url,
        markdown: doc.markdown,
        source: doc.source ?? 'confluence',
      })),
      commentContexts: allContexts,
      previousScopeAnalysis: scopeAnalysisContent,
    });
    const regenDuration = Date.now() - regenStartTime;
    console.log(`  ⏱️ Scope analysis regeneration took ${(regenDuration / 1000).toFixed(1)}s`);

    const newScopeAnalysisContent = scopeResult.scopeAnalysisContent;
    console.log(`  ✅ Scope analysis regenerated: ${scopeResult.questionsCount} questions, ${scopeResult.featureAreasCount} feature areas`);

    // Re-count questions after regeneration
    const newQuestionCount = countUnansweredQuestions(newScopeAnalysisContent);
    console.log(`  📊 New question count after regeneration: ${newQuestionCount}`);

    // Check if regeneration reduced questions enough to proceed
    if (newQuestionCount <= QUESTION_THRESHOLD) {
      console.log('  ✅ Regeneration reduced questions - now proceeding with shell stories');
      return { continueWithScopeAnalysis: newScopeAnalysisContent };
    }

    // Still too many questions - update Jira and return
    console.log(`  ⏸️ Still ${newQuestionCount} questions after regeneration - returning for more clarification`);

    await notify('📝 Jira Update: Updating scope analysis section...');

    try {
      const scopeAnalysisSectionMarkdown = `## Scope Analysis\n\n${newScopeAnalysisContent}`;
      await updateEpicWithScopeAnalysis({
        epicKey,
        cloudId,
        atlassianClient,
        scopeAnalysisMarkdown: scopeAnalysisSectionMarkdown,
        epicWithoutShellStoriesAdf,
        notify
      });
      console.log('  ✅ Jira updated with regenerated scope analysis');
    } catch (error: any) {
      console.error('  ❌ Failed to update Jira with scope analysis:', error);
    }

    await notify(`⚠️ After incorporating your previous answers, still found ${newQuestionCount} unanswered questions. Please answer the remaining questions marked with ❓, then run this tool again.`);

    return {
      success: true,
      action: 'regenerate' as const,
      screensAnalyzed: screens.length,
      scopeAnalysisContent: newScopeAnalysisContent,
      storyCount: 0, // No stories created - still need clarification
      questionCount: newQuestionCount,
      hadExistingAnalysis: true,
    };
  } catch (error: any) {
    console.error('  ❌ Scope analysis regeneration failed:', error);
    return {
      success: false,
      action: 'regenerate' as const,
      screensAnalyzed: 0,
      storyCount: 0,
      error: `Failed to regenerate scope analysis: ${error.message}`,
    };
  }
}

/**
 * Handle ASK_FOR_CLARIFICATION decision
 * 
 * Updates Jira with the generated scope analysis and returns early,
 * asking user to answer questions before re-running.
 */
export async function handleAskForClarification(
  params: DecisionHandlerParams & {
    scopeAnalysisContent: string;
    questionCount: number;
    featureAreasCount: number;
    hadExistingAnalysis: boolean;
  }
): Promise<ExecuteWriteShellStoriesResult> {
  const {
    epicKey,
    cloudId,
    atlassianClient,
    notify,
    screens,
    epicWithoutShellStoriesAdf,
    scopeAnalysisContent,
    questionCount,
    featureAreasCount,
    hadExistingAnalysis,
  } = params;

  console.log(`  ⏸️ Cannot proceed with shell stories - need clarification`);

  // Update Jira with scope analysis (no separate progress message for this sync operation)
  try {
    const scopeAnalysisSectionMarkdown = `## Scope Analysis\n\n${scopeAnalysisContent}`;
    await updateEpicWithScopeAnalysis({
      epicKey,
      cloudId,
      atlassianClient,
      scopeAnalysisMarkdown: scopeAnalysisSectionMarkdown,
      epicWithoutShellStoriesAdf,
      notify
    });
    console.log('  ✅ Jira updated with scope analysis');
  } catch (error: any) {
    console.error('  ❌ Failed to update Jira with scope analysis:', error);
    // Continue to return the scope analysis - Jira update is best effort
  }

  // Single final message with actionable information (per spec 040)
  await notify(`Scope analysis complete: ${questionCount} question(s), ${featureAreasCount} feature area(s). Please answer ❓ questions to bring unanswered questions under ${QUESTION_THRESHOLD} and re-run.`);

  return {
    success: true,
    action: 'clarify' as const,
    screensAnalyzed: screens.length,
    scopeAnalysisContent,
    storyCount: 0, // No stories created - need clarification first
    questionCount,
    hadExistingAnalysis,
  };
}