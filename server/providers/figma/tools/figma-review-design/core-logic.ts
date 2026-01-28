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
import { processFigmaUrls } from '../../../combined/tools/writing-shell-stories/figma-screen-setup.js';
import { getFigmaFileCachePath, ensureValidCacheForFigmaFile } from '../../../figma/figma-cache.js';
import { regenerateScreenAnalyses } from '../../../combined/tools/shared/screen-analysis-regenerator.js';
import { notesToScreenAnnotations } from '../../../combined/tools/writing-shell-stories/note-text-extractor.js';
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
  // STEP 3: Process Figma URLs (extract frames, notes, spatial associations)
  // ==========================================
  await notify('🖼️ Processing Figma screens and notes...');

  const {
    allFrames,
    allNotes,
    screens,
    figmaFileKey: primaryFileKey,
    nodesDataMap,
  } = await processFigmaUrls(figmaUrls, figmaClient);

  // Build framesToAnalyze array with file key context
  const framesToAnalyze: Array<{
    fileKey: string;
    nodeId: string;
    name: string;
    url: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }> = [];

  const screenFrameMap = new Map<string, { nodeId: string; name: string }>();

  // Convert allFrames to framesToAnalyze format
  for (const frame of allFrames) {
    const bbox = frame.absoluteBoundingBox;
    const fileKey = fileKeys[0]; // Use primary file key from parsed URLs
    
    framesToAnalyze.push({
      fileKey,
      nodeId: frame.id,
      name: frame.name,
      url: `${figmaUrls[0].split('?')[0]}?node-id=${frame.id.replace(/:/g, '-')}`,
      x: bbox?.x,
      y: bbox?.y,
      width: bbox?.width,
      height: bbox?.height,
    });
    screenFrameMap.set(frame.name, { nodeId: frame.id, name: frame.name });
  }

  console.log(`  📐 Found ${framesToAnalyze.length} frames to analyze`);
  console.log(`  📝 Found ${allNotes.length} notes (spatially associated with ${screens.length} screens)`);

  if (framesToAnalyze.length === 0) {
    return {
      analysis: 'No frames found in the provided Figma URLs.',
      questions: [],
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ==========================================
  // STEP 4: Format existing comments as context
  // ==========================================
  const commentContexts: ScreenAnnotation[] = [];

  for (const [fileKey, comments] of commentsMap) {
    if (comments.length === 0) continue;

    // Get document tree for spatial containment checks on child node comments
    const fileData = fileDataMap.get(fileKey);
    const documentTree = fileData?.document;

    const threads = groupCommentsIntoThreads(comments);
    const result = formatCommentsForContext(threads, framesToAnalyze, documentTree);

    for (const ctx of result.contexts) {
      commentContexts.push(ctx);
    }
  }

  console.log(`  📝 Prepared ${commentContexts.length} comment contexts`);

  // Add notes as context (using shared notesToScreenAnnotations)
  const noteAnnotations = notesToScreenAnnotations(screens, allNotes);
  commentContexts.push(...noteAnnotations);

  console.log(`  📝 Total contexts (comments + notes): ${commentContexts.length}`);

  // ==========================================
  // STEP 5: Download images and analyze screens (using shared regenerator)
  // ==========================================
  await notify(`🎨 Analyzing ${framesToAnalyze.length} screens with AI...`);

  const screenAnalyses: Array<{ name: string; content: string; url: string; nodeId: string }> = [];

  try {
    // Use shared screen analysis pipeline (includes semantic XML support)
    const { analyzedScreens } = await regenerateScreenAnalyses({
      generateText,
      figmaClient,
      screens,
      allFrames,
      allNotes,
      figmaFileKey: primaryFileKey,
      nodesDataMap,
      epicContext: contextDescription,
      notify: async (msg) => await notify(msg),
    });

    console.log(`  ✅ Analyzed ${analyzedScreens} screens`);

    // Load analysis files from cache
    const cachePath = getFigmaFileCachePath(primaryFileKey);
    for (const screen of screens) {
      const filename = screen.filename || screen.name;
      const analysisPath = path.join(cachePath, `${filename}.analysis.md`);
      
      try {
        const analysisContent = await fs.readFile(analysisPath, 'utf-8');
        screenAnalyses.push({
          name: screen.name,
          content: analysisContent,
          url: screen.url,
          nodeId: screen.nodeId,
        });
      } catch (readError: any) {
        console.warn(`  ⚠️ Could not read analysis for ${screen.name}: ${readError.message}`);
      }
    }
  } catch (error: any) {
    errors.push(`Failed to analyze screens: ${error.message}`);
    console.error(`  ❌ Screen analysis failed:`, error.message);
  }

  if (screenAnalyses.length === 0) {
    return {
      analysis: 'Failed to analyze any screens.',
      questions: [],
      errors,
    };
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
    commentContexts
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

