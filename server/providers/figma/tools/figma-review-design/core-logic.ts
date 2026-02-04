/**
 * Core Logic for analyze-figma-scope Tool
 *
 * This module contains the shared business logic for analyzing Figma designs
 * and posting clarifying questions as comments. It is used by both the MCP
 * tool wrapper and the REST API endpoint.
 *
 * Key features:
 * - Parses Figma URLs to extract file keys and node IDs
 * - Fetches screen data and existing comments from Figma
 * - Analyzes designs with AI to generate scope analysis
 * - Extracts questions (❓) from the analysis
 * - Posts questions as comments on Figma frames
 * - Handles rate limiting with consolidation fallback
 */

import type { FigmaClient } from '../../../figma/figma-api-client.js';
import type { GenerateTextFn } from '../../../../llm-client/types.js';
import type {
  AnalyzeFigmaScopeInput,
  AnalyzeFigmaScopeOutput,
  GeneratedQuestion,
  PostCommentResult,
  FigmaComment,
  CommentThread,
} from '../../../figma/figma-comment-types.js';
import { parseFigmaUrls, getUniqueFileKeys, type ParsedFigmaUrl } from './url-parser.js';
import {
  generateFigmaQuestionsPrompt,
  parseFigmaQuestions,
  flattenParsedQuestions,
  FIGMA_QUESTIONS_SYSTEM_PROMPT,
  FIGMA_QUESTIONS_MAX_TOKENS,
  type ScreenInfo,
} from './prompt-figma-questions.js';
import type { ScreenAnnotation } from '../../../combined/tools/shared/screen-annotation.js';
import {
  fetchCommentsForFile,
  groupCommentsIntoThreads,
  formatCommentsForContext,
  postQuestionsToFigma,
} from './figma-comment-utils.js';
import {
  fetchFigmaFile,
  downloadFigmaImagesBatch,
  type FigmaNodeMetadata,
  type FigmaImageDownloadResult,
} from '../../../figma/figma-helpers.js';
import {
  analyzeScreens,
  type AnalyzedFrame,
  type FrameAnalysisResult,
} from '../../../figma/screen-analyses-workflow/index.js';
import { generateScopeAnalysis } from '../../../combined/tools/shared/scope-analysis-helpers.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Dependencies required by the core logic
 */
export interface AnalyzeFigmaScopeDeps {
  /** Authenticated Figma API client */
  figmaClient: FigmaClient;

  /** LLM text generation function */
  generateText: GenerateTextFn;

  /** Optional progress notification callback */
  notify?: (message: string) => Promise<void>;
}

/**
 * Execute the analyze-figma-scope workflow
 *
 * This is the shared business logic used by both MCP and REST interfaces.
 *
 * Workflow:
 * 1. Parse and validate Figma URLs
 * 2. Fetch file data and existing comments from Figma
 * 3. Download and analyze screen images with AI
 * 4. Generate scope analysis with questions
 * 5. Post questions as comments on Figma frames
 *
 * @param input - Tool input parameters
 * @param deps - Required dependencies (figmaClient, generateText, notify)
 * @returns Analysis output with questions and posting results
 *
 * @note Per FR-019/FR-020, questions are ALWAYS returned in response,
 *       regardless of whether posting succeeded or failed.
 */
export async function executeAnalyzeFigmaScope(
  input: AnalyzeFigmaScopeInput,
  deps: AnalyzeFigmaScopeDeps
): Promise<AnalyzeFigmaScopeOutput> {
  const { figmaUrls, contextDescription } = input;
  const { figmaClient, generateText, notify = async () => {} } = deps;

  const errors: string[] = [];

  // ==========================================
  // STEP 1: Parse and validate Figma URLs
  // ==========================================
  await notify('🔗 Parsing Figma URLs...');

  let parsedUrls: ParsedFigmaUrl[];
  try {
    parsedUrls = parseFigmaUrls(figmaUrls);
    console.log(`📍 Parsed ${parsedUrls.length} Figma URL(s)`);
  } catch (error: any) {
    return {
      analysis: '',
      questions: [],
      errors: [error.message],
    };
  }

  const fileKeys = getUniqueFileKeys(parsedUrls);
  console.log(`  📁 Unique file keys: ${fileKeys.join(', ')}`);

  // ==========================================
  // STEP 2: Fetch file data and comments
  // ==========================================
  await notify('📥 Fetching Figma file data and comments...');

  const fileDataMap = new Map<string, any>();
  const commentsMap = new Map<string, FigmaComment[]>();

  for (const fileKey of fileKeys) {
    try {
      // Fetch file structure
      const fileData = await fetchFigmaFile(figmaClient, fileKey);
      fileDataMap.set(fileKey, fileData);
      console.log(`  ✅ Fetched file: ${fileData.name}`);

      // Fetch comments (fresh - no caching per FR-007)
      try {
        const comments = await figmaClient.fetchComments(fileKey);
        commentsMap.set(fileKey, comments);
        console.log(`  💬 Fetched ${comments.length} comments`);
      } catch (commentError: any) {
        // Graceful degradation - continue without comments if scope missing
        console.warn(`  ⚠️ Could not fetch comments: ${commentError.message}`);
        commentsMap.set(fileKey, []);
      }
    } catch (error: any) {
      errors.push(`Failed to fetch Figma file ${fileKey}: ${error.message}`);
      console.error(`  ❌ Failed to fetch file ${fileKey}:`, error.message);
    }
  }

  if (fileDataMap.size === 0) {
    return {
      analysis: '',
      questions: [],
      errors,
    };
  }

  // ==========================================
  // STEP 3: Analyze screens using consolidated workflow
  // ==========================================
  await notify('🖼️ Analyzing Figma screens...');

  let analysisResult: FrameAnalysisResult;
  try {
    // Use consolidated screen-analyses-workflow
    analysisResult = await analyzeScreens(
      figmaUrls,
      figmaClient,
      generateText,
      {
        analysisOptions: {
          contextMarkdown: contextDescription,
        },
        notify,
      }
    );

    console.log(`  ✅ Analyzed ${analysisResult.frames.length} screens`);
  } catch (error: any) {
    errors.push(`Failed to analyze screens: ${error.message}`);
    console.error(`  ❌ Screen analysis failed:`, error.message);
    return {
      analysis: 'Failed to analyze any screens.',
      questions: [],
      errors,
    };
  }

  if (analysisResult.frames.length === 0) {
    return {
      analysis: 'No frames found in the provided Figma URLs.',
      questions: [],
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ==========================================
  // STEP 4: Prepare data for analysis
  // ==========================================
  
  // Build framesToAnalyze array for comment posting (extract from AnalyzedFrame[])
  const framesToAnalyze: Array<{
    fileKey: string;
    nodeId: string;
    name: string;
    url: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }> = analysisResult.frames.map(frame => ({
    fileKey: fileKeys[0], // Use primary file key
    nodeId: frame.nodeId,
    name: frame.frameName || frame.name,
    url: frame.url,
    x: frame.position?.x,
    y: frame.position?.y,
    width: frame.position?.width,
    height: frame.position?.height,
  }));

  // Convert AnalyzedFrame[] to screenAnalyses format for questions generation
  const screenAnalyses: Array<{ name: string; content: string; url: string; nodeId: string }> = 
    analysisResult.frames.map(frame => ({
      name: frame.frameName || frame.name,
      content: frame.analysis || '',
      url: frame.url,
      nodeId: frame.nodeId,
    }));

  // Extract comment contexts from annotations (already associated by workflow)
  const commentContexts: ScreenAnnotation[] = analysisResult.frames.flatMap(frame =>
    frame.annotations
      .filter(a => a.type === 'comment')
      .map(a => ({
        screenName: frame.frameName || frame.name,
        screenUrl: frame.url,
        screenId: frame.nodeId,
        annotation: a.content,
        author: a.author,
        source: 'comments' as const,
        markdown: a.author ? `**${a.author}:** ${a.content}` : a.content,
      }))
  );

  // Add notes from annotations
  const noteContexts: ScreenAnnotation[] = analysisResult.frames.flatMap(frame =>
    frame.annotations
      .filter(a => a.type === 'note')
      .map(a => ({
        screenName: frame.frameName || frame.name,
        screenUrl: frame.url,
        screenId: frame.nodeId,
        annotation: a.content,
        author: a.author,
        source: 'notes' as const,
        markdown: a.author ? `**${a.author}:** ${a.content}` : a.content,
      }))
  );

  commentContexts.push(...noteContexts);
  console.log(`  📝 Total contexts (${commentContexts.length}): ${commentContexts.filter(c => c.source === 'comments').length} comments + ${commentContexts.filter(c => c.source === 'notes').length} notes`);
  
  // Log details of each context
  if (commentContexts.length > 0) {
    console.log(`  📋 Context details:`);
    for (const ctx of commentContexts) {
      const contentPreview = ctx.markdown.length > 100 
        ? `${ctx.markdown.substring(0, 100)}...` 
        : ctx.markdown;
      console.log(`    ${ctx.source === 'comments' ? '💬' : '📝'} [${ctx.screenName}]: ${contentPreview}`);
    }
  }

  // ==========================================
  // STEP 5: Generate scope analysis (cross-screen synthesis)
  // ==========================================
  await notify('🔍 Generating scope analysis...');

  let scopeAnalysisContent: string;
  try {
    const scopeResult = await generateScopeAnalysis({
      generateText,
      analysisData: screenAnalyses.map(s => ({
        screenName: s.name,
        content: s.content,
        url: s.url,
      })),
      epicContext: contextDescription,
      commentContexts,
      notify,
    });
    scopeAnalysisContent = scopeResult.scopeAnalysisContent;
    console.log(`  ✅ Generated scope analysis (${scopeResult.featureAreasCount} areas, ${scopeResult.questionsCount} questions)`);
  } catch (error: any) {
    errors.push(`Scope analysis failed: ${error.message}`);
    console.error(`  ❌ Scope analysis failed:`, error.message);
    // Fall back to using raw screen analyses
    scopeAnalysisContent = '';
  }

  // ==========================================
  // STEP 6: Generate questions with AI
  // ==========================================
  await notify('📊 Generating questions...');

  // Convert screenAnalyses to ScreenInfo format
  const screenInfos: ScreenInfo[] = screenAnalyses.map((s) => ({
    nodeId: s.nodeId!,
    name: s.name,
    url: s.url,
    analysisContent: s.content,
  }));

  const questionsPrompt = generateFigmaQuestionsPrompt(
    screenInfos,
    contextDescription,
    commentContexts,
    scopeAnalysisContent
  );

  let analysisMarkdown: string;
  try {
    const result = await generateText({
      messages: [
        { role: 'system', content: FIGMA_QUESTIONS_SYSTEM_PROMPT },
        { role: 'user', content: questionsPrompt },
      ],
      maxTokens: FIGMA_QUESTIONS_MAX_TOKENS,
    });
    analysisMarkdown = result.text;
    console.log(`  ✅ Generated questions output (${analysisMarkdown.length} chars)`);
  } catch (error: any) {
    errors.push(`LLM analysis failed: ${error.message}`);
    return {
      analysis: '',
      questions: [],
      errors,
    };
  }

  // ==========================================
  // STEP 7: Parse questions from output
  // ==========================================
  await notify('❓ Parsing questions...');

  const parsedQuestions = parseFigmaQuestions(analysisMarkdown);
  const questions = flattenParsedQuestions(parsedQuestions);
  console.log(`  ❓ Parsed ${questions.length} questions (${parsedQuestions.byFrame.size} frames + ${parsedQuestions.general.length} general)`);

  // ==========================================
  // STEP 8: Post questions to Figma (FR-019/FR-020)
  // ==========================================
  let postingResults: PostCommentResult[] | undefined;
  let postingSummary: string | undefined;

  // Only post if we have questions and at least one file key
  if (questions.length > 0 && fileKeys.length > 0) {
    await notify('📤 Posting questions to Figma...');

    try {
      const primaryFileKey = fileKeys[0]; // Use first file for posting
      const results = await postQuestionsToFigma(
        questions,
        primaryFileKey,
        figmaClient,
        framesToAnalyze
      );

      postingResults = results;

      const successCount = results.filter((r: PostCommentResult) => r.success).length;
      const failCount = results.filter((r: PostCommentResult) => !r.success).length;

      if (failCount === 0) {
        postingSummary = `Posted ${successCount}/${results.length} questions to Figma`;
      } else {
        postingSummary = `Posted ${successCount}/${results.length} questions (${failCount} failed)`;
        // Add posting errors to error list
        for (const result of results) {
          if (!result.success && result.error) {
            errors.push(`Failed to post question: ${result.error}`);
          }
        }
      }

      console.log(`  ${postingSummary}`);
    } catch (error: any) {
      errors.push(`Comment posting failed: ${error.message}`);
      postingSummary = `Failed to post questions: ${error.message}`;
      console.error(`  ❌ Comment posting failed:`, error.message);
    }
  }

  // ==========================================
  // RETURN: Always include questions per FR-019
  // ==========================================
  await notify('✅ Analysis complete!');

  return {
    analysis: analysisMarkdown,
    questions, // Always returned per FR-019
    postingResults,
    postingSummary,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

