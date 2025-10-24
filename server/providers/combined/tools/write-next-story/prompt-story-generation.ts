/**
 * Story Generation Prompt
 * 
 * Generates a comprehensive prompt for AI to create full Jira stories from shell stories.
 * Uses Bitovi's story writing guidelines to ensure proper format and quality.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ParsedShellStory } from './shell-story-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * System prompt for story generation
 * Sets the role and fundamental constraints for the AI
 */
export const STORY_GENERATION_SYSTEM_PROMPT = `You are an expert product manager and technical writer creating detailed Jira stories from shell stories.

FUNDAMENTAL RULE: EVIDENCE-BASED ONLY
- Every detail in the story MUST be based on the provided shell story, screen analysis files, and dependency context
- Do NOT add speculative features or assumed functionality
- Do NOT add generic styling criteria (spacing, fonts, colors) - developers will match the designs
- If uncertain about functionality, document as a question in Developer Notes rather than implementing assumed behavior

OUTPUT REQUIREMENT:
- Output ONLY the final story in markdown format
- Do NOT include explanations, prefaces, or process notes
- Follow the exact structure specified in the Story Writing Guidelines
- Bold all Gherkin keywords: **GIVEN**, **WHEN**, **THEN**`;

/**
 * Maximum tokens for story generation
 * Full stories with acceptance criteria can be lengthy
 */
export const STORY_GENERATION_MAX_TOKENS = 16000;

/**
 * Load story writing guidelines from file
 * @returns Content of story-writing-guidelines.md
 */
async function loadStoryWritingGuidelines(): Promise<string> {
  const guidelinesPath = path.join(__dirname, 'story-writing-guidelines.md');
  return await readFile(guidelinesPath, 'utf-8');
}

/**
 * Generate story creation prompt
 * 
 * @param shellStory - The parsed shell story to write
 * @param dependencyStories - Array of dependency shell stories for context
 * @param analysisFiles - Array of { screenName, content } for screen analyses
 * @returns Complete prompt for story generation
 */
export async function generateStoryPrompt(
  shellStory: ParsedShellStory,
  dependencyStories: ParsedShellStory[],
  analysisFiles: Array<{ screenName: string; content: string }>
): Promise<string> {
  // Load guidelines
  const guidelines = await loadStoryWritingGuidelines();
  
  // Build dependency context section
  const dependencySection = dependencyStories.length > 0
    ? `## Dependency Stories Context

The following dependency stories have already been implemented. Use them for context about prerequisite functionality:

${dependencyStories.map(dep => `### ${dep.id}: ${dep.title}

${dep.rawContent}
`).join('\n---\n\n')}
`
    : '';
  
  // Build screen analysis section
  const analysisSection = analysisFiles.length > 0
    ? `## Screen Analysis Files

${analysisFiles.map(({ screenName, content }) => 
  `### ${screenName}

${content}
`).join('\n---\n\n')}
`
    : '';
  
  // Build the complete prompt
  return `# Story Writing Guidelines

${guidelines}

---

${dependencySection}${analysisSection}
## Shell Story to Write

**Story ID**: ${shellStory.id}
**Title**: ${shellStory.title}
**Description**: ${shellStory.description}

### Shell Story Details

${shellStory.rawContent}

---

## Task

Generate a complete Jira story following the Story Writing Guidelines and Complete Story Example above.

**Content Requirements**:
- Use the shell story's ✅ bullets for included functionality
- Use the shell story's ❌ bullets for Out of Scope section
- Use the shell story's ❓ bullets to inform Developer Notes (note uncertainties)
- Reference Figma screens from the shell story's SCREENS list as regular markdown links
- Use dependency context to understand prerequisite functionality
- Base acceptance criteria ONLY on screen analysis files and shell story content
- Use nested Gherkin format with embedded Figma links (NOT images - use regular [text](url) links)
- Bold all Gherkin keywords: **GIVEN**, **WHEN**, **THEN**

**Critical**: Do NOT add speculative features. Do NOT add generic styling requirements. Focus on functional behavior based on the evidence provided.
`;
}

/**
 * Format dependency stories for inclusion in prompt
 * Extracts just the essential context without full details
 */
export function formatDependencySummaries(dependencies: ParsedShellStory[]): string {
  if (dependencies.length === 0) {
    return 'No dependencies for this story.';
  }
  
  return dependencies.map(dep => {
    return `**${dep.id}**: ${dep.title}
- ${dep.description}
- Screens: ${dep.screens.length > 0 ? dep.screens.map(s => `[Figma](${s})`).join(', ') : 'None'}
${dep.included.length > 0 ? `- Included: ${dep.included.join('; ')}` : ''}
${dep.excluded.length > 0 ? `- Excluded: ${dep.excluded.join('; ')}` : ''}`;
  }).join('\n\n');
}
