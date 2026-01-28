/**
 * Shared Scope Analysis Helpers
 * 
 * This module contains shared logic for scope analysis that is used by both
 * `write-shell-stories` and `analyze-feature-scope` tools.
 * 
 * Key exports:
 * - `ScopeAnalysisResult` - Result type from scope analysis generation
 * - `SelfHealingDecision` - Enum for workflow decisions
 * - `generateScopeAnalysis()` - Generate scope analysis from screens
 * - `countUnansweredQuestions()` - Count ❓ markers in scope analysis
 * - `extractScopeAnalysis()` - Extract scope analysis section from epic context
 * 
 * @see /specs/039-self-healing-tools/data-model.md for entity definitions
 */

import type { ToolDependencies } from '../types.js';
import type { Screen } from '../writing-shell-stories/screen-analyzer.js';
import type { ScreenAnnotation } from './screen-annotation.js';
import type { DocumentContext } from './google-docs-setup.js';

/**
 * Question threshold for self-healing decision
 * 
 * If unanswered questions > threshold, ask for clarification
 * If unanswered questions <= threshold, proceed with shell stories
 */
export const QUESTION_THRESHOLD = 5;

/**
 * Metadata about the scope analysis
 */
export interface ScopeAnalysisMetadata {
  featureAreasCount: number;
  inScopeCount: number;
  outOfScopeCount: number;
  lowPriorityCount: number;
  screensAnalyzed: number;
}

/**
 * Result from scope analysis generation
 * 
 * @see data-model.md#ScopeAnalysisResult
 */
export interface ScopeAnalysisResult {
  /** Full markdown content of the scope analysis section */
  markdown: string;
  /** Count of ❓ (unanswered) markers in the analysis */
  questionCount: number;
  /** Whether analysis was successfully generated */
  hasAnalysis: boolean;
  /** Detailed metadata about the analysis */
  metadata: ScopeAnalysisMetadata;
}

/**
 * Self-healing decision enum
 * 
 * Represents the workflow decision made based on question count
 * and whether a scope analysis section already exists.
 * 
 * @see data-model.md#SelfHealingDecision
 */
export enum SelfHealingDecision {
  /** ≤5 questions, proceed to create shell stories */
  PROCEED_WITH_STORIES = 'proceed',
  /** >5 questions, no existing section - create new Scope Analysis */
  ASK_FOR_CLARIFICATION = 'clarify',
  /** >5 questions, existing section - regenerate with 💬 markers */
  REGENERATE_ANALYSIS = 'regenerate'
}

/**
 * Parsed result from extracting scope analysis from epic context
 */
export interface ParsedScopeAnalysis {
  /** The scope analysis section content, or null if not found */
  scopeAnalysis: string | null;
  /** The epic context with scope analysis removed */
  remainingContext: string;
}

/**
 * Extract the "## Scope Analysis" section from epic context
 * 
 * @param epicContext - The full epic description markdown
 * @returns Parsed result with scope analysis and remaining context
 */
export function extractScopeAnalysis(epicContext: string): ParsedScopeAnalysis {
  const scopeAnalysisMatch = epicContext.match(/## Scope Analysis\s+([\s\S]*?)(?=\n## |$)/i);
  const scopeAnalysis = scopeAnalysisMatch ? scopeAnalysisMatch[1].trim() : null;
  
  const remainingContext = scopeAnalysis 
    ? epicContext.replace(/## Scope Analysis\s+[\s\S]*?(?=\n## |$)/i, '').trim()
    : epicContext;

  return {
    scopeAnalysis,
    remainingContext
  };
}

/**
 * Count unanswered questions (❓ markers) in scope analysis markdown
 * 
 * Uses regex to match question markers at the start of bullet points.
 * Only counts ❓ (unanswered), not 💬 (answered).
 * 
 * @param scopeAnalysisMarkdown - The scope analysis markdown content
 * @returns Number of unanswered questions
 */
export function countUnansweredQuestions(scopeAnalysisMarkdown: string): number {
  // Match bullet points starting with ❓
  // Pattern: optional whitespace, dash, whitespace, ❓
  const questionMatches = scopeAnalysisMarkdown.match(/^\s*-\s*❓/gm);
  return questionMatches ? questionMatches.length : 0;
}

/**
 * Count answered questions (💬 markers) in scope analysis markdown
 * 
 * @param scopeAnalysisMarkdown - The scope analysis markdown content
 * @returns Number of answered questions
 */
export function countAnsweredQuestions(scopeAnalysisMarkdown: string): number {
  const answeredMatches = scopeAnalysisMarkdown.match(/^\s*-\s*💬/gm);
  return answeredMatches ? answeredMatches.length : 0;
}

/**
 * Count feature markers in scope analysis markdown
 * 
 * @param scopeAnalysisMarkdown - The scope analysis markdown content
 * @returns Counts of each feature type
 */
export function countFeatureMarkers(scopeAnalysisMarkdown: string): {
  inScope: number;
  outOfScope: number;
  lowPriority: number;
  alreadyDone: number;
  needsClarification: number;
} {
  return {
    inScope: (scopeAnalysisMarkdown.match(/^\s*-\s*☐/gm) || []).length,
    outOfScope: (scopeAnalysisMarkdown.match(/^\s*-\s*❌/gm) || []).length,
    lowPriority: (scopeAnalysisMarkdown.match(/^\s*-\s*⏬/gm) || []).length,
    alreadyDone: (scopeAnalysisMarkdown.match(/^\s*-\s*✅/gm) || []).length,
    needsClarification: (scopeAnalysisMarkdown.match(/^\s*-\s*❓/gm) || []).length,
  };
}

/**
 * Decide the self-healing action based on scope analysis state
 * 
 * @param scopeAnalysisExists - Whether a scope analysis section already exists
 * @param questionCount - Number of unanswered questions (❓)
 * @returns The decision for what action to take
 */
export function decideSelfHealingAction(
  scopeAnalysisExists: boolean,
  questionCount: number
): SelfHealingDecision {
  if (questionCount > QUESTION_THRESHOLD) {
    // Too many questions - need clarification
    if (scopeAnalysisExists) {
      return SelfHealingDecision.REGENERATE_ANALYSIS;
    }
    return SelfHealingDecision.ASK_FOR_CLARIFICATION;
  }
  // Few enough questions - proceed with stories
  return SelfHealingDecision.PROCEED_WITH_STORIES;
}

/**
 * Document context for scope analysis generation
 * Re-exported from google-docs-setup for convenience
 */
export type { DocumentContext } from './google-docs-setup.js';

/**
 * Parameters for generating scope analysis
 */
export interface GenerateScopeAnalysisParams {
  /** LLM text generation function */
  generateText: ToolDependencies['generateText'];
  /** Analyzed screens from Figma */
  screens: Screen[];
  /** Debug directory for saving artifacts (optional) */
  debugDir: string | null;
  /** Figma file key for caching */
  figmaFileKey: string;
  /** YAML content with screen analysis */
  yamlContent: string;
  /** Notification callback */
  notify: ToolDependencies['notify'];
  /** Epic context markdown (without scope analysis section) */
  epicContext?: string;
  /** Reference documents (Confluence, Google Docs) */
  referenceDocs?: DocumentContext[];
  /** Figma comments and notes as context */
  commentContexts?: ScreenAnnotation[];
  /** Previous scope analysis section for regeneration (optional) */
  previousScopeAnalysis?: string;
}

/**
 * Result from generating scope analysis
 */
export interface GenerateScopeAnalysisOutput {
  /** Full markdown content of the scope analysis */
  scopeAnalysisContent: string;
  /** Number of feature areas identified */
  featureAreasCount: number;
  /** Number of unanswered questions (❓) */
  questionsCount: number;
  /** Path where scope analysis was saved (if debugDir provided) */
  scopeAnalysisPath: string;
}

/**
 * Generate scope analysis from screen analyses
 * 
 * Reads all screen analysis files and uses AI to identify and categorize features
 * into in-scope (☐), already done (✅), low priority (⏬), out-of-scope (❌), and questions (❓),
 * grouped by workflow areas.
 * 
 * @param params - Generation parameters including screens, context, and LLM function
 * @returns Scope analysis content with metadata
 * @throws Error if AI response is empty or malformed
 */
export async function generateScopeAnalysis(
  params: GenerateScopeAnalysisParams
): Promise<GenerateScopeAnalysisOutput> {
  const {
    generateText,
    screens,
    debugDir,
    figmaFileKey,
    yamlContent,
    notify,
    epicContext,
    referenceDocs,
    commentContexts,
    previousScopeAnalysis,
  } = params;
  
  // Dynamic imports to avoid circular dependencies
  const { getFigmaFileCachePath } = await import('../../../figma/figma-cache.js');
  const {
    generateFeatureIdentificationPrompt,
    FEATURE_IDENTIFICATION_SYSTEM_PROMPT,
    FEATURE_IDENTIFICATION_MAX_TOKENS,
  } = await import('../analyze-feature-scope/strategies/prompt-scope-analysis-2.js');
  const path = await import('path');
  const fs = await import('fs/promises');

  // Note: No progress notification here - caller handles progress messaging (per spec 040)
  
  // Construct file cache path for analysis files
  const fileCachePath = getFigmaFileCachePath(figmaFileKey);
  
  // Read all analysis files with URLs from file cache
  const analysisFiles: Array<{ screenName: string; content: string; url: string }> = [];
  for (const screen of screens) {
    const filename = screen.filename || screen.name;
    const analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);
    try {
      const content = await fs.readFile(analysisPath, 'utf-8');
      analysisFiles.push({
        screenName: screen.name,
        content,
        url: screen.url
      });
    } catch (error: any) {
      throw new Error(`Failed to read analysis file for screen ${screen.name} at ${analysisPath}. This indicates a filesystem error or race condition. Original error: ${error.message}`);
    }
  }
  
  // Build context with previous analysis if provided (for regeneration)
  let effectiveEpicContext = epicContext || '';
  if (previousScopeAnalysis) {
    effectiveEpicContext = `${effectiveEpicContext}\n\n**Previous Scope Analysis (for reference - update markers as questions are answered):**\n${previousScopeAnalysis}`;
  }
  
  // Generate feature identification prompt
  const prompt = generateFeatureIdentificationPrompt(
    yamlContent,
    analysisFiles,
    effectiveEpicContext,
    referenceDocs,
    commentContexts
  );
  
  // Save prompt to debug directory for debugging (if enabled)
  if (debugDir) {
    const promptPath = path.join(debugDir, 'scope-analysis-prompt.md');
    await fs.writeFile(promptPath, prompt, 'utf-8');
  }
  
  console.log(`    🤖 Scope analysis (${prompt.length} chars / ${FEATURE_IDENTIFICATION_MAX_TOKENS} max tokens)`);
  
  // Request scope analysis generation via injected LLM client
  const response = await generateText({
    messages: [
      { role: 'system', content: FEATURE_IDENTIFICATION_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    maxTokens: FEATURE_IDENTIFICATION_MAX_TOKENS
  });
  
  const scopeAnalysisText = response.text;
  
  if (!scopeAnalysisText) {
    throw new Error(`No scope analysis content received from AI.
Possible causes:
- AI service timeout or rate limit
- Invalid prompt or context
- Epic description may not contain valid Figma links
- Network connectivity issues

Technical details:
- AI response was empty or malformed
- Screens analyzed: ${screens.length}
- Analysis files loaded: ${analysisFiles.length}`);
  }
  
  // Save scope analysis to debug directory (if enabled)
  let scopeAnalysisPath = '';
  if (debugDir) {
    scopeAnalysisPath = path.join(debugDir, 'scope-analysis.md');
    await fs.writeFile(scopeAnalysisPath, scopeAnalysisText, 'utf-8');
  }
  
  // Count feature areas and questions
  const featureAreaMatches = scopeAnalysisText.match(/^### .+$/gm);
  const featureAreasCount = featureAreaMatches
    ? featureAreaMatches.filter(m => !m.includes('Remaining Questions')).length
    : 0;
  
  const questionsCount = countUnansweredQuestions(scopeAnalysisText);
  
  console.log(`    ✅ Generated: ${featureAreasCount} areas, ${questionsCount} questions`);

  // Note: No progress notification here - caller handles final messaging (per spec 040)
  return {
    scopeAnalysisContent: scopeAnalysisText,
    featureAreasCount,
    questionsCount,
    scopeAnalysisPath
  };
}
