/**
 * AI Prompt Context Utilities
 * 
 * This module provides utilities for converting ADF data to Markdown for AI prompt generation.
 * 
 * CRITICAL: This is the ONLY approved way to convert ADF to Markdown in the codebase.
 * These conversions are ONE-WAY and should NEVER be reversed for Jira updates.
 * All Jira data manipulation must use ADF operations directly.
 * 
 * Rationale: This pattern is strictly enforced to prevent lossy round-trip conversions.
 * Converting Markdown back to ADF can result in data loss or corruption, like when a user uses "shift+enter" for line breaks.
 */

import type { FigmaScreenSetupResult } from '../writing-shell-stories/figma-screen-setup.js';
import { convertAdfToMarkdown } from '../../../atlassian/markdown-converter.js';

/**
 * AI prompt context with Markdown conversion
 * 
 * IMPORTANT: This interface is ONLY for AI prompt generation.
 * Never use these Markdown fields for Jira data manipulation.
 * All Jira updates must use ADF from FigmaScreenSetupResult.
 */
export interface AIPromptContext {
  /** READ-ONLY: For AI prompts only. Never write back to Jira. */
  epicMarkdown_AIPromptOnly: string;
  
  /** READ-ONLY: For AI prompts only. Never write back to Jira. */
  shellStoriesMarkdown_AIPromptOnly?: string;
}

/**
 * Convert ADF data to Markdown for AI prompt generation
 * 
 * This is the ONLY approved way to get Markdown from ADF.
 * The conversion is one-way and should never be reversed.
 * 
 * @param setupResult - Setup result with ADF data
 * @returns Markdown context for AI prompts only
 * 
 * @remarks
 * Edge cases:
 * - If `setupResult.epicContextAdf` is empty, `epicMarkdown_AIPromptOnly` will be an empty string (or whatever the Markdown converter returns for an empty doc).
 * - If `setupResult.shellStoriesAdf` is empty, `shellStoriesMarkdown_AIPromptOnly` will be `undefined`.
 * 
 * @example
 * // ✅ CORRECT: Get setup result with ADF, then convert for AI prompts
 * const setupResult = await setupFigmaScreens(...);
 * const aiContext = prepareAIPromptContext(setupResult);
 * const prompt = `Context: ${aiContext.epicMarkdown_AIPromptOnly}\n\nGenerate...`;
 * 
 * @example
 * // ❌ WRONG: Never convert Markdown back to ADF for Jira updates
 * const modified = aiContext.epicMarkdown_AIPromptOnly.replace(...);
 * const adf = await convertMarkdownToAdf(modified); // This loses data!
 */
export function prepareAIPromptContext(
  setupResult: FigmaScreenSetupResult
): AIPromptContext {
  return {
    epicMarkdown_AIPromptOnly: convertAdfToMarkdown({
      version: 1,
      type: 'doc',
      content: setupResult.epicContextAdf
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
