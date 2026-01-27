/**
 * Figma Questions Prompt
 *
 * Generates prompts for AI to analyze Figma designs holistically and produce
 * questions organized by frame. Unlike scope analysis (which groups by feature area),
 * this outputs questions in a frame-first format for posting back to Figma.
 */

import type { ScreenAnnotation } from '../../../combined/tools/shared/screen-annotation.js';

/**
 * System prompt for Figma question generation
 */
export const FIGMA_QUESTIONS_SYSTEM_PROMPT = `You are an expert product analyst reviewing Figma designs to identify ambiguities, missing requirements, and clarifying questions.

FUNDAMENTAL RULE: HOLISTIC ANALYSIS
- Review ALL screens together to understand the complete user flow
- Think through how users move between screens
- Identify gaps in the flow, not just individual screen issues
- Each question should be assigned to the MOST RELEVANT screen

SCOPE AWARENESS:
- **PRIORITY**: Context description is the primary source of truth for what's in/out of scope
- If context says a feature is out-of-scope or already implemented, DO NOT ask questions about it
- If context says a feature is in-scope, focus questions on implementation details and edge cases
- When in doubt about scope, refer to context description first

QUESTION QUALITY:
- Ask about unclear behaviors, edge cases, and missing states
- Focus on what a developer would need to know to implement
- Avoid obvious questions answered by the design itself
- Avoid questions about features explicitly marked as out-of-scope or already done
- Be specific and actionable

QUESTION ASSIGNMENT:
- Assign each question to the screen where the answer would most impact implementation
- If a question spans multiple screens, assign to the screen where the issue first appears
- Use "General" only for truly cross-cutting concerns (browser support, accessibility standards, etc.)

OUTPUT REQUIREMENT:
- Output ONLY the markdown in the specified format
- Every screen with questions gets its own section
- Screens with no questions should be omitted
- Do NOT include explanations, prefaces, or process notes`;

/**
 * Maximum tokens for question generation
 */
export const FIGMA_QUESTIONS_MAX_TOKENS = 8000;

/**
 * Screen info for prompt generation
 */
export interface ScreenInfo {
  nodeId: string;
  name: string;
  url: string;
  analysisContent: string;
}

/**
 * Generate the Figma questions prompt
 *
 * @param screens - Array of screen info with analysis content
 * @param contextDescription - Optional additional context from user
 * @param commentContexts - Optional existing comments for context
 * @returns Complete prompt for question generation
 */
export function generateFigmaQuestionsPrompt(
  screens: ScreenInfo[],
  contextDescription?: string,
  commentContexts?: ScreenAnnotation[]
): string {
  // Build context section
  const contextSection = contextDescription?.trim()
    ? `## Context Description

**SCOPE GUIDANCE (Primary Source of Truth):**

<context>
${contextDescription.trim()}
</context>

**Use this context to understand:**
- What features are in-scope vs out-of-scope
- What features are already implemented (don't ask questions about these)
- What features should be ignored or deferred
- Project priorities and constraints

**Context ALWAYS WINS:**
- If context says a feature is out-of-scope or already done, skip questions about it entirely
- If context says a feature is in-scope, focus questions on unclear implementation details
- When in doubt about whether to ask a question, refer to context first

---

`
    : '';

  // Build existing comments and notes section
  const commentsSection =
    commentContexts && commentContexts.length > 0
      ? `## Existing Comments and Notes

**IMPORTANT**: The following comments, notes, and annotations already exist on these designs.
- **Notes provide scope guidance** - they may specify what's in-scope, out-of-scope, already implemented, or should be ignored. Respect these boundaries when generating questions.
- **Comments contain existing questions or clarifications** - DO NOT duplicate these
- If a topic is already covered, skip it entirely

${commentContexts.map((ctx) => `### ${ctx.screenName}\n\n${ctx.markdown}`).join('\n\n')}

---

`
      : '';

  // Build screen analyses section
  const screensSection = screens
    .map(
      (screen) => `### [${screen.name}](${screen.url})

**Node ID:** ${screen.nodeId}

${screen.analysisContent}

---`
    )
    .join('\n\n');

  return `${contextSection}${commentsSection}## Screen Analyses

${screensSection}

## Instructions

1. **Review context description** - Understand what's in-scope, out-of-scope, and already implemented
2. **Review notes for scope guidance** - Notes on screens may specify what to focus on or ignore
3. **Review all screens holistically** - Understand the complete user flow across all screens
4. **Identify gaps in scope** - What would a developer need to know for in-scope features?
5. **Check existing comments** - Skip questions already asked in comments
6. **Respect scope boundaries** - Don't ask questions about out-of-scope or already-implemented features (from context or notes)
7. **Assign questions to screens** - Each question goes under the most relevant screen
8. **Avoid duplicates** - Don't repeat yourself or existing comments/notes

## Output Format

\`\`\`markdown
## Figma Analysis Questions

### [Screen Name](figma-url-with-node-id)

- ❓ Question about this screen
- ❓ Another question

### [Another Screen](figma-url-with-node-id)

- ❓ Question about this screen

### General

- ❓ Cross-cutting question not specific to one screen
\`\`\`

**CRITICAL**: 
- Use the exact screen name and URL from the analyses above
- Only include screens that have questions
- Output ONLY the markdown, no explanations`;
}

/**
 * Parsed question with frame association
 */
export interface ParsedQuestion {
  text: string;
  frameNodeId?: string;
  frameName?: string;
  frameUrl?: string;
}

/**
 * Parsed questions grouped by frame
 */
export interface ParsedFigmaQuestions {
  byFrame: Map<string, ParsedQuestion[]>; // nodeId -> questions
  general: ParsedQuestion[];
}

/**
 * Parse questions from Figma questions markdown output
 *
 * Extracts questions grouped by frame from the AI-generated markdown.
 * Parses node-id from the URL in each heading.
 *
 * @param markdown - The markdown output from AI
 * @returns Parsed questions grouped by frame
 */
export function parseFigmaQuestions(markdown: string): ParsedFigmaQuestions {
  const result: ParsedFigmaQuestions = {
    byFrame: new Map(),
    general: [],
  };

  const lines = markdown.split('\n');

  // Patterns
  const headingPattern = /^###\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
  const generalHeadingPattern = /^###\s+General\s*$/i;
  const questionPattern = /^[-*]?\s*❓\s*(.+)$/;
  const nodeIdPattern = /node-id=(\d+[:-]\d+)/;

  let currentFrame: { nodeId: string; name: string; url: string } | null = null;
  let isGeneralSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for General heading
    if (generalHeadingPattern.test(trimmedLine)) {
      currentFrame = null;
      isGeneralSection = true;
      continue;
    }

    // Check for frame heading with link
    const headingMatch = trimmedLine.match(headingPattern);
    if (headingMatch) {
      const [, name, url] = headingMatch;
      const nodeIdMatch = url.match(nodeIdPattern);

      if (nodeIdMatch) {
        // Convert URL format (123-456) to API format (123:456)
        const nodeId = nodeIdMatch[1].replace('-', ':');
        currentFrame = { nodeId, name, url };
        isGeneralSection = false;

        if (!result.byFrame.has(nodeId)) {
          result.byFrame.set(nodeId, []);
        }
      }
      continue;
    }

    // Check for questions
    const questionMatch = trimmedLine.match(questionPattern);
    if (questionMatch) {
      const questionText = questionMatch[1].trim();

      if (isGeneralSection) {
        result.general.push({ text: questionText });
      } else if (currentFrame) {
        const questions = result.byFrame.get(currentFrame.nodeId) || [];
        questions.push({
          text: questionText,
          frameNodeId: currentFrame.nodeId,
          frameName: currentFrame.name,
          frameUrl: currentFrame.url,
        });
        result.byFrame.set(currentFrame.nodeId, questions);
      }
    }
  }

  return result;
}

/**
 * Convert parsed questions to flat array for posting
 *
 * @param parsed - Parsed questions from parseFigmaQuestions
 * @returns Flat array of questions with frame associations
 */
export function flattenParsedQuestions(parsed: ParsedFigmaQuestions): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  // Add frame-specific questions
  for (const frameQuestions of parsed.byFrame.values()) {
    questions.push(...frameQuestions);
  }

  // Add general questions
  questions.push(...parsed.general);

  return questions;
}
