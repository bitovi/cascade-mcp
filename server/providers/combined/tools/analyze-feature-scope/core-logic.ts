/**
 * Core business logic for analyze-feature-scope tool
 * 
 * This module contains the pure business logic for generating scope analysis from Figma designs.
 * It is independent of MCP-specific concerns (authentication, context, etc.) and can be used
 * from both MCP handlers and REST API endpoints.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { ToolDependencies } from '../types.js';
import type { Screen } from '../writing-shell-stories/screen-analyzer.js';
import { getBaseCacheDir } from '../writing-shell-stories/temp-directory-manager.js';
import { getFigmaFileCachePath } from '../../../figma/screen-analyses-workflow/figma-cache.js';
import { executeScreenAnalysisPipeline } from '../shared/screen-analysis-pipeline.js';
import { setupConfluenceContext, type ConfluenceDocument } from '../shared/confluence-setup.js';
import { setupGoogleDocsContext, type GoogleDocDocument, type DocumentContext } from '../shared/google-docs-setup.js';
import { generateScopeAnalysis } from '../shared/scope-analysis-helpers.js';
import {
  convertMarkdownToAdf,
  validateAdf,
  type ADFNode,
  type ADFDocument
} from '../../../atlassian/markdown-converter.js';
import { handleJiraAuthError } from '../../../atlassian/atlassian-helpers.js';
import {
  fetchCommentsForFile,
  groupCommentsIntoThreads,
  formatCommentsForContext,
} from '../../../figma/tools/figma-review-design/figma-comment-utils.js';
import type { ScreenAnnotation } from '../shared/screen-annotation.js';
import { notesToScreenAnnotations } from '../writing-shell-stories/note-text-extractor.js';

/**
 * Parameters for executing the analyze-feature-scope workflow
 */
export interface ExecuteAnalyzeFeatureScopeParams {
  epicKey: string;
  cloudId?: string;
  siteName?: string;
}

/**
 * Result from executing the analyze-feature-scope workflow
 */
export interface ExecuteAnalyzeFeatureScopeResult {
  success: boolean;
  scopeAnalysisContent: string;
  featureAreasCount: number;
  questionsCount: number;
  screensAnalyzed: number;
}

/**
 * Execute the analyze-feature-scope workflow
 * 
 * This is the core business logic that can be called from both MCP handlers and REST API endpoints.
 * It uses dependency injection to abstract away authentication and LLM provider concerns.
 * 
 * @param params - Workflow parameters
 * @param deps - Injected dependencies (clients, LLM, notifier)
 * @returns Result with scope analysis content and metadata
 */
export async function executeAnalyzeFeatureScope(
  params: ExecuteAnalyzeFeatureScopeParams,
  deps: ToolDependencies
): Promise<ExecuteAnalyzeFeatureScopeResult> {
  const { epicKey, cloudId, siteName } = params;
  const { atlassianClient, figmaClient, generateText, notify } = deps;

  // ==========================================
  // PHASE 1-4: Reuse shared screen analysis pipeline
  // ==========================================
  const analysisResult = await executeScreenAnalysisPipeline(
    {
      epicKey,
      cloudId,
      siteName,
      sectionName: 'Scope Analysis' // Exclude this section from epic context
    },
    deps
  );
  
  const {
    screens,
    allFrames,
    debugDir,
    figmaFileKey,
    yamlContent,
    epicWithoutShellStoriesMarkdown: epicContext,
    epicWithoutShellStoriesAdf,
    epicDescriptionAdf,
    cloudId: resolvedCloudId,
    siteName: resolvedSiteName,
    analyzedScreens,
    allNotes
  } = analysisResult;

  console.log(`🔍 analyze-feature-scope: Received ${screens.length} screens from pipeline`);
  console.log(`   Analyzed screens count: ${analyzedScreens}`);

  // ==========================================
  // PHASE 4.5: Setup Confluence context (if any linked docs)
  // ==========================================
  let confluenceDocsContext: DocumentContext[] = [];
  
  if (epicDescriptionAdf) {
    try {
      const confluenceContext = await setupConfluenceContext({
        epicAdf: epicDescriptionAdf,
        atlassianClient,
        generateText,
        siteName: resolvedSiteName,
        notify,
      });
      
      // Filter to docs relevant for scope analysis
      confluenceDocsContext = confluenceContext.byRelevance.analyzeScope.map((doc: ConfluenceDocument) => ({
        title: doc.title,
        url: doc.url,
        markdown: doc.markdown,
        documentType: doc.metadata.relevance?.documentType,
        relevanceScore: doc.metadata.relevance?.toolScores.find(t => t.toolId === 'analyze-feature-scope')?.overallScore,
        summary: doc.metadata.summary?.text,
        source: 'confluence' as const,
      }));
      
      console.log(`   📚 Confluence docs for scope analysis: ${confluenceDocsContext.length}`);
    } catch (error: any) {
      console.log(`   ⚠️ Confluence context setup failed: ${error.message}`);
      // Continue without Confluence context - it's optional
    }
  }

  // ==========================================
  // PHASE 4.6: Setup Google Docs context (if any linked docs)
  // ==========================================
  const googleDocsContext = await fetchGoogleDocsContext({
    epicDescriptionAdf,
    googleClient: deps.googleClient,
    generateText,
    notify,
    toolId: 'analyze-feature-scope',
  });

  // ==========================================
  // PHASE 4.7: Merge documentation contexts
  // ==========================================
  const referenceDocs = [...confluenceDocsContext, ...googleDocsContext];
  console.log(`   📚 Total documentation context: ${referenceDocs.length} docs (${confluenceDocsContext.length} Confluence + ${googleDocsContext.length} Google Docs)`);

  // ==========================================
  // PHASE 4.8: Fetch Figma comments as context
  // ==========================================
  const figmaCommentContexts = await fetchFigmaCommentsContext({
    figmaClient,
    figmaFileKey,
    screens,
    allFrames,
    notify,
  });

  // ==========================================
  // PHASE 4.9: Add notes as context (using shared notesToScreenAnnotations)
  // ==========================================
  const noteAnnotations = notesToScreenAnnotations(screens, allNotes);
  const allContexts = [...figmaCommentContexts, ...noteAnnotations];
  console.log(`   📝 Total contexts (comments + notes): ${allContexts.length} (${figmaCommentContexts.length} comments + ${noteAnnotations.length} notes)`);

  // ==========================================
  // PHASE 5: Generate scope analysis
  // ==========================================
  const scopeAnalysisResult = await generateScopeAnalysis({
    generateText,
    screens,
    debugDir,
    figmaFileKey,
    yamlContent,
    notify,
    epicContext,
    referenceDocs,
    commentContexts: allContexts,
  });

  // ==========================================
  // PHASE 6: Update Jira epic with scope analysis
  // ==========================================
  await updateEpicWithScopeAnalysis({
    epicKey,
    cloudId: resolvedCloudId,
    atlassianClient,
    scopeAnalysisMarkdown: scopeAnalysisResult.scopeAnalysisContent,
    contentWithoutScopeAnalysis: epicWithoutShellStoriesAdf,
    notify
  });

  return {
    success: true,
    scopeAnalysisContent: scopeAnalysisResult.scopeAnalysisContent,
    featureAreasCount: scopeAnalysisResult.featureAreasCount,
    questionsCount: scopeAnalysisResult.questionsCount,
    screensAnalyzed: analyzedScreens
  };
}

/**
 * Phase 6: Update epic with scope analysis
 * 
 * @param params - Parameters for updating the epic
 */
async function updateEpicWithScopeAnalysis({
  epicKey,
  cloudId,
  atlassianClient,
  scopeAnalysisMarkdown,
  contentWithoutScopeAnalysis,
  notify
}: {
  epicKey: string;
  cloudId: string;
  atlassianClient: ToolDependencies['atlassianClient'];
  scopeAnalysisMarkdown: string;
  contentWithoutScopeAnalysis: ADFNode[];
  notify: ToolDependencies['notify'];
}): Promise<void> {

  try {
    // The scope analysis markdown already includes the "## Scope Analysis" header
    // so we don't need to add it again
    
    // Convert the scope analysis to ADF
    const scopeAnalysisAdf = await convertMarkdownToAdf(scopeAnalysisMarkdown);
    
    if (!validateAdf(scopeAnalysisAdf)) {
      console.log('    ⚠️ Failed to convert scope analysis to valid ADF');
      await notify('⚠️ Failed to convert scope analysis to ADF');
      return;
    }
    
    // Combine description (without old scope analysis) with new scope analysis section
    const updatedDescription: ADFDocument = {
      version: 1,
      type: 'doc',
      content: [
        ...contentWithoutScopeAnalysis,
        ...scopeAnalysisAdf.content
      ]
    };
    
    // Update the epic
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
    
    console.log(`    Updating epic description... (${updateResponse.status})`);
    
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
    
    console.log('    ✅ Epic updated');
    
  } catch (error: any) {
    console.log(`    ⚠️ Error updating epic: ${error.message}`);
    await notify(`⚠️ Error updating epic: ${error.message}`);
  }
}

/**
 * Phase 4.6: Fetch Google Docs context
 * 
 * Fetches and processes Google Docs linked in the epic description.
 * Returns documents filtered for the specified tool's relevance.
 * 
 * @returns Array of DocumentContext objects (empty if no docs or error)
 */
async function fetchGoogleDocsContext(params: {
  epicDescriptionAdf: any;
  googleClient: ToolDependencies['googleClient'];
  generateText: ToolDependencies['generateText'];
  notify: ToolDependencies['notify'];
  toolId: string;
}): Promise<DocumentContext[]> {
  const { epicDescriptionAdf, googleClient, generateText, notify, toolId } = params;

  if (!epicDescriptionAdf) {
    return [];
  }

  if (!googleClient) {
    console.log('🔗 Skipping Google Docs context (no Google authentication)');
    return [];
  }

  try {
    const googleDocsResult = await setupGoogleDocsContext({
      epicAdf: epicDescriptionAdf,
      googleClient,
      generateText,
      notify,
    });

    // Filter to docs relevant for the specified tool
    const docs = googleDocsResult.byRelevance.analyzeScope.map((doc: GoogleDocDocument) => ({
      title: doc.title,
      url: doc.url,
      markdown: doc.markdown,
      documentType: doc.metadata.relevance?.documentType,
      relevanceScore: doc.metadata.relevance?.toolScores.find(t => t.toolId === toolId)?.overallScore,
      summary: doc.metadata.summary?.text,
      source: 'google-docs' as const,
    }));

    console.log(`   📄 Google Docs for ${toolId}: ${docs.length}`);
    return docs;
  } catch (error: any) {
    console.log(`   ⚠️ Google Docs context setup failed: ${error.message}`);
    return [];
  }
}

/**
 * Phase 4.8: Fetch Figma comments context
 * 
 * Fetches comments from a Figma file and formats them as ScreenAnnotation
 * objects for inclusion in AI prompts.
 * 
 * @returns Array of ScreenAnnotation objects (empty if no comments or error)
 */
async function fetchFigmaCommentsContext(params: {
  figmaClient: ToolDependencies['figmaClient'];
  figmaFileKey: string;
  screens: Screen[];
  allFrames: any[];
  notify: ToolDependencies['notify'];
}): Promise<ScreenAnnotation[]> {
  const { figmaClient, figmaFileKey, screens, allFrames, notify } = params;

  if (!figmaClient || !figmaFileKey) {
    return [];
  }

  try {
    await notify('💬 Fetching Figma comments...');

    const comments = await fetchCommentsForFile(figmaClient, figmaFileKey);

    if (comments.length === 0) {
      console.log('   💬 No Figma comments found on file');
      return [];
    }

    // Group comments into threads and format for context
    const threads = groupCommentsIntoThreads(comments);

    // Build frame metadata from allFrames with bounding boxes for proximity matching
    const frameMetadata = allFrames.map((frame) => ({
      fileKey: figmaFileKey,
      nodeId: frame.id,
      name: frame.name,
      url: screens.find(s => s.nodeId === frame.id)?.url,
      x: frame.absoluteBoundingBox?.x,
      y: frame.absoluteBoundingBox?.y,
      width: frame.absoluteBoundingBox?.width,
      height: frame.absoluteBoundingBox?.height,
    }));

    const result = formatCommentsForContext(threads, frameMetadata);
    console.log(`   💬 Figma comments: ${comments.length} comments → ${result.matchedThreadCount} threads across ${result.contexts.length} screens`);
    return result.contexts;
  } catch (error: any) {
    console.log(`   ⚠️ Figma comment fetching failed: ${error.message}`);
    return [];
  }
}
