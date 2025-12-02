/**
 * AI Prompt Context Utilities
 * 
 * Converts ADF to Markdown for AI prompt generation only.
 * 
 * CRITICAL: ONE-WAY conversion only. Never convert back to ADF for Jira updates.
 * Prevents data loss from Markdown round-trips (e.g., hardBreak nodes from Shift+Enter).
 */

import type { FigmaScreenSetupResult } from '../writing-shell-stories/figma-screen-setup.js';
import { convertAdfToMarkdown } from '../../../atlassian/markdown-converter.js';

/**
 * Markdown context for AI prompts only
 * 
 * Never use for Jira updates - use ADF from FigmaScreenSetupResult instead.
 */
export interface AIPromptContext {
  /** READ-ONLY: For AI prompts only */
  epicMarkdown_AIPromptOnly: string;
  
  /** READ-ONLY: For AI prompts only */
  shellStoriesMarkdown_AIPromptOnly?: string;
}

/**
 * Convert ADF to Markdown for AI prompt generation (one-way only)
 * 
 * @param setupResult - Setup result with ADF data
 * @returns Markdown context for AI prompts
 * 
 * @example
 * // ✅ CORRECT
 * const setupResult = await setupFigmaScreens(...);
 * const aiContext = prepareAIPromptContext(setupResult);
 * const prompt = `Context: ${aiContext.epicMarkdown_AIPromptOnly}\n\nGenerate...`;
 * 
 * @example
 * // ❌ WRONG: Never convert back to ADF
 * const modified = aiContext.epicMarkdown_AIPromptOnly.replace(...);
 * const adf = await convertMarkdownToAdf(modified); // Data loss!
 */
export function prepareAIPromptContext(
  setupResult: FigmaScreenSetupResult
): AIPromptContext {
  return {
    epicMarkdown_AIPromptOnly: convertAdfToMarkdown({
      version: 1,
      type: 'doc',
      content: setupResult.epicSansShellStoriesAdf
    }),
    shellStoriesMarkdown_AIPromptOnly: setupResult.shellStoriesAdf.length > 0
      ? convertAdfToMarkdown({
          version: 1,
          type: 'doc',
          content: setupResult.shellStoriesAdf
        })
      : undefined
  };
}
