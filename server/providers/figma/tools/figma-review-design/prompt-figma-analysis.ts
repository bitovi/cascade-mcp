/**
 * Figma Scope Analysis Prompt
 *
 * Generates prompts for AI to analyze Figma designs and identify scope,
 * features, and clarifying questions.
 */

import type { ScreenAnnotation } from '../../../combined/tools/shared/screen-annotation.js';

/**
 * System prompt for Figma scope analysis
 * Sets the role and fundamental constraints for the AI
 */
export const FIGMA_SCOPE_ANALYSIS_SYSTEM_PROMPT = `You are an expert product analyst analyzing Figma design screens to identify features, scope, and clarifying questions.

FUNDAMENTAL RULE: EVIDENCE-BASED ONLY
- Every feature and question MUST reference actual UI elements visible in the provided screen analyses
- Do NOT infer, assume, or speculate about features not shown in the screens
- If a UI element is visible but its purpose/behavior is unclear, generate a ❓ question

CATEGORIZATION:
- ✅ In-Scope: Features with complete UI and clear implementation path
- ❌ Out-of-Scope: Features that appear incomplete, marked as future, or clearly outside primary flow
- ❓ Questions: Ambiguous behaviors, unclear requirements, missing information, edge cases, accessibility concerns

QUESTION GENERATION GUIDELINES:
- Generate questions for:
  - Unclear interaction patterns (What happens when user clicks X?)
  - Missing states (What's the error state? Empty state? Loading state?)
  - Edge cases (What if input exceeds maximum? What if user cancels?)
  - Accessibility concerns (How does screen reader announce this?)
  - Business logic (What validation rules apply?)
- Format each question with ❓ prefix for easy extraction
- Associate questions with specific screens/frames when possible

OUTPUT FORMAT:
Your response must be valid markdown with the following structure:

# Scope Analysis

## Overview
[Brief summary of what the designs cover]

## Screens Analyzed
[List each screen with a brief description]

## Feature Areas

### [Feature Area 1]
**Screens:** [List relevant screens]

**In-Scope (✅):**
- Feature description

**Out-of-Scope (❌):**
- Feature description

**Questions (❓):**
- ❓ Question about this area

### [Feature Area 2]
...

## Remaining Questions
[Cross-cutting questions that don't fit a specific feature area]
- ❓ General question 1
- ❓ General question 2

OUTPUT REQUIREMENT:
- Output ONLY the markdown scope analysis in the specified format
- Do NOT include explanations, prefaces, or process notes`;

/**
 * Maximum tokens for Figma scope analysis response
 */
export const FIGMA_SCOPE_ANALYSIS_MAX_TOKENS = 8000;

/**
 * Screen analysis info for prompt generation
 */
export interface ScreenAnalysisInfo {
  /** Screen/frame name */
  name: string;
  /** Screen analysis content (markdown) */
  content: string;
  /** Original Figma URL */
  url: string;
  /** Frame node ID */
  nodeId?: string;
}

/**
 * Generate the user prompt for Figma scope analysis
 *
 * @param screenAnalyses - Array of screen analyses with content
 * @param commentContexts - Optional array of comment contexts per screen
 * @param contextDescription - Optional additional context from user
 * @returns User prompt string
 */
export function generateFigmaScopeAnalysisPrompt(
  screenAnalyses: ScreenAnalysisInfo[],
  commentContexts?: ScreenAnnotation[],
  contextDescription?: string
): string {
  let prompt = '';

  // Add context description if provided
  if (contextDescription?.trim()) {
    prompt += `## Additional Context

${contextDescription.trim()}

---

`;
  }

  // Add comment context if provided
  if (commentContexts && commentContexts.length > 0) {
    prompt += `## Existing Comments from Stakeholders

The following comments have been left on these Figma designs by designers and stakeholders.
Consider this feedback when analyzing the designs and generating questions.
Avoid asking questions that have already been answered in comments.

`;
    for (const ctx of commentContexts) {
      prompt += `### Comments on ${ctx.screenName}

${ctx.markdown}

`;
    }
    prompt += `---

`;
  }

  // Add screen analyses
  prompt += `## Screen Analyses

`;

  for (const screen of screenAnalyses) {
    prompt += `### ${screen.name}

**Figma URL:** ${screen.url}

${screen.content}

---

`;
  }

  prompt += `
Please analyze these screens and generate:
1. A comprehensive scope analysis identifying in-scope and out-of-scope features
2. Clarifying questions (❓) for any ambiguous or unclear aspects
3. Each question should be on its own line starting with "❓ " for easy extraction

Focus on generating actionable questions that will help clarify requirements before implementation.`;

  return prompt;
}
