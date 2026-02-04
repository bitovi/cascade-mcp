/**
 * Story Content Generation Prompts
 * 
 * Prompts for generating story content with the write-story tool.
 * Uses a modified story format that replaces "Out of Scope" with "Scope Analysis".
 */

import type { JiraIssueHierarchy, IssueComment } from '../review-work-item/jira-hierarchy-fetcher.js';
import type { LoadedContext } from '../review-work-item/context-loader.js';
import type { ChangeDetectionResult } from './change-detection.js';
import { convertAdfToMarkdown } from '../../../atlassian/markdown-converter.js';
import { groupAnnotationsBySource } from '../shared/screen-annotation.js';

/**
 * System prompt for story content generation
 */
export const STORY_CONTENT_SYSTEM_PROMPT = `You are an expert technical writer specializing in agile user stories. Your task is to write or refine a Jira story based on the provided context.

## Story Format

**IMPORTANT:** Do NOT include the story title as a heading (e.g., "# Like and Dislike Buttons"). The story title is managed separately in Jira. Start directly with the sections below.

Write the story in this exact format:

### User Story Statement
A short description from the user's perspective:
"As a [user/role], I want [feature/action], so that [benefit/value]."

### Supporting Artifacts
Links to Figma designs, documentation, and other resources relevant to the story.
ALWAYS include all Figma, Confluence, and Google Docs links from the context - these must be preserved.

### Scope Analysis
Copy the scope analysis section EXACTLY as provided (if available).
If no scope analysis is provided, create one with:
- ☐ Feature that IS in scope for this story
- ❌ Feature that is explicitly OUT of scope
- ❓ Question that needs clarification?
- 💬 Question that has been answered → Answer text

### Non-Functional Requirements (if applicable)
Performance, security, accessibility, or other technical requirements.

**CRITICAL: ONLY include NFRs that are EXPLICITLY mentioned in the provided context (Figma, Confluence, Google Docs, comments).**
- DO NOT infer or generate requirements based on best practices
- DO NOT add accessibility requirements (ARIA labels, keyboard nav, etc.) unless explicitly mentioned
- DO NOT add performance requirements (caching, optimization, etc.) unless explicitly mentioned
- DO NOT add security requirements unless explicitly mentioned
- If no NFRs are explicitly stated in the context, SKIP this section entirely


### Developer Notes (if applicable)
Implementation hints, dependencies, or technical considerations.
**ONLY include notes that are EXPLICITLY mentioned in the provided context. Do NOT invent data models, API endpoints, or implementation details.**

### Acceptance Criteria
Nested Gherkin format with GIVEN/WHEN/THEN structure.

**CRITICAL RULES for Acceptance Criteria:**
1. **NO ❓ MARKERS IN ACCEPTANCE CRITERIA** - Questions belong ONLY in Scope Analysis
2. **INCLUDE FIGMA LINKS** - Each acceptance criteria group should reference the relevant Figma screen
3. **BE SPECIFIC** - Write concrete, testable criteria based on the Figma designs

Format:
**GIVEN** the user is on the [screen name]:
[View in Figma](link-to-specific-screen)

- **WHEN** the user [action], **THEN**
  - [Specific observable outcome 1]
  - [Specific observable outcome 2]

Example:
**GIVEN** the user is on the Product Page:
[View Product Page in Figma](https://figma.com/file/xxx?node-id=yyy)

- **WHEN** the user clicks "Add to Cart", **THEN**
  - The item is added to the cart
  - The cart count badge updates to show the new count
  - A "Added to cart" toast notification appears

## Important Guidelines

1. **Always preserve original links** - All Figma, Confluence, and Google Docs links from context MUST appear in the output
2. **❓ markers ONLY in Scope Analysis** - Never put questions in Acceptance Criteria
3. **Preserve 💬 markers** - If a question has been answered, keep the 💬 marker and include the answer
4. **Link Figma screens to ACs** - Each AC group should reference the relevant Figma screen by name and URL
5. **Be specific** - Include concrete details from Figma screens, documentation, and comments
6. **Don't repeat context verbatim** - Synthesize and organize the information

## On Subsequent Runs

When refining an existing story:
1. Check for inline answers (text added after ❓ markers)
2. Flip ❓ → 💬 for answered questions and include the answer
3. Incorporate new information from changed context
4. Improve the story based on the new information
5. Keep the structure consistent`;

/**
 * Maximum tokens for story content generation
 */
export const STORY_CONTENT_MAX_TOKENS = 8000;

/**
 * Parameters for generating the story content prompt
 */
export interface GenerateStoryContentPromptParams {
  /** Issue summary (title) */
  issueSummary: string;
  /** Existing description content (for subsequent runs) */
  existingDescription?: string;
  /** Issue hierarchy (target, parents, blockers) */
  hierarchy: JiraIssueHierarchy;
  /** Comments to include (all for first run, changed for subsequent) */
  allComments: IssueComment[];
  /** Loaded linked resources (Confluence, Figma) */
  loadedContext?: LoadedContext;
  /** Change detection result (for subsequent runs) */
  changedContext?: ChangeDetectionResult | null;
  /** Whether this is the first run */
  isFirstRun: boolean;
  /** Pre-generated scope analysis content (from two-phase approach) */
  scopeAnalysis?: string;
}

/**
 * Generate the prompt for story content generation
 */
export function generateStoryContentPrompt(params: GenerateStoryContentPromptParams): string {
  const {
    issueSummary,
    existingDescription,
    hierarchy,
    allComments,
    loadedContext,
    changedContext,
    isFirstRun,
    scopeAnalysis,
  } = params;
  
  const sections: string[] = [];
  
  // Header
  sections.push(`# Write Story: ${issueSummary}`);
  sections.push('');
  
  // Run type indicator
  if (isFirstRun) {
    sections.push('**First Run** - Generate a complete story from scratch.');
  } else {
    sections.push('**Subsequent Run** - Refine the existing story with new context.');
    sections.push('Look for inline answers (text after ❓) and flip them to 💬.');
  }
  sections.push('');
  
  // Pre-generated scope analysis (from two-phase approach)
  if (scopeAnalysis) {
    sections.push('## Pre-Generated Scope Analysis');
    sections.push('This scope analysis was generated by analyzing the Figma screens. Copy it EXACTLY into the "Scope Analysis" section of the story.');
    sections.push('');
    sections.push('```markdown');
    sections.push(scopeAnalysis);
    sections.push('```');
    sections.push('');
  }
  
  // Existing description (for subsequent runs)
  if (!isFirstRun && existingDescription) {
    sections.push('## Existing Story Content');
    sections.push('This is the current story. Refine it based on new context below.');
    sections.push('');
    sections.push('```markdown');
    sections.push(existingDescription);
    sections.push('```');
    sections.push('');
  }
  
  // Changed context section (for subsequent runs)
  if (!isFirstRun && changedContext) {
    sections.push('## Changes Since Last Update');
    sections.push(`Last updated: ${changedContext.lastUpdated.toISOString()}`);
    sections.push('');
    
    if (changedContext.inlineAnswers.length > 0) {
      sections.push('### Inline Answers Detected');
      sections.push('The following questions appear to have answers added inline:');
      changedContext.inlineAnswers.forEach(answer => {
        sections.push(`- Question: "${answer.question}"`);
        sections.push(`  Answer: "${answer.answer}"`);
      });
      sections.push('');
    }
    
    if (changedContext.changedComments.length > 0) {
      sections.push('### New/Updated Comments');
      changedContext.changedComments.forEach(comment => {
        sections.push(`**${comment.author}** (${comment.created}):`);
        sections.push(comment.bodyText || '[Comment content]');
        sections.push('');
      });
    }
    
    if (changedContext.changedIssues.length > 0) {
      sections.push('### Updated Linked Issues');
      changedContext.changedIssues.forEach(issue => {
        sections.push(`- **${issue.key}**: ${issue.fields.summary}`);
      });
      sections.push('');
    }
  }
  
  // Parent hierarchy context
  sections.push('## Parent Hierarchy');
  if (hierarchy.parents.length > 0) {
    hierarchy.parents.forEach((parent, index) => {
      const indent = '  '.repeat(index);
      sections.push(`${indent}**${parent.key}** (${parent.fields.issuetype?.name || 'Issue'}): ${parent.fields.summary}`);
    });
  } else {
    sections.push('No parent issues found.');
  }
  sections.push('');
  
  // Blockers
  if (hierarchy.blockers.length > 0) {
    sections.push('## Blockers');
    hierarchy.blockers.forEach(blocker => {
      sections.push(`- **${blocker.key}**: ${blocker.fields.summary} (${blocker.fields.status?.name || 'Unknown'})`);
    });
    sections.push('');
  }
  
  // Comments (all for first run, none here for subsequent - shown in changed context)
  if (isFirstRun && allComments.length > 0) {
    sections.push('## Comments');
    allComments.forEach(comment => {
      sections.push(`**${comment.author}** (${comment.created}):`);
      // Note: comment.body is ADF, we need to convert it
      sections.push('[Comment content - see ADF body]');
      sections.push('');
    });
  }
  
  // Linked resources
  if (loadedContext) {
    // Figma screens
    if (loadedContext.analyzedScreens.length > 0) {
      sections.push('## Figma Screens');
      loadedContext.analyzedScreens.forEach(screen => {
        sections.push(`### ${screen.name}`);
        if (screen.url) {
          sections.push(`[View in Figma](${screen.url})`);
        }
        if (screen.analysis) {
          sections.push('');
          sections.push(screen.analysis);
        }
        sections.push('');
      });
    }
    
    // Figma comments from design review
    if (loadedContext.figmaComments && loadedContext.figmaComments.length > 0) {
      // Separate attached and unattached comments
      const { comments: attachedComments, unattachedComments } = groupAnnotationsBySource(loadedContext.figmaComments);
      
      if (attachedComments.length > 0) {
        sections.push('## Figma Comments (Design Review)');
        sections.push('');
        sections.push('The following comments are from designers, stakeholders, or previous analysis on Figma screens. Use these to understand design intent, clarifications, and questions that have been raised.');
        sections.push('');
        attachedComments.forEach(screenComment => {
          sections.push(`### Comments on: ${screenComment.screenName}`);
          sections.push('');
          sections.push(screenComment.markdown);
          sections.push('');
        });
      }
      
      if (unattachedComments.length > 0) {
        sections.push('## File-Level Comments (Unattached)');
        sections.push('');
        sections.push('The following comments are not attached to specific screens in Figma. Only incorporate their context if it clearly pertains to the screens being analyzed. They may relate to other parts of the design.');
        sections.push('');
        unattachedComments.forEach(comment => {
          sections.push(comment.markdown);
          sections.push('');
        });
      }
    }
    
    // Confluence docs
    if (loadedContext.confluenceDocs.length > 0) {
      sections.push('## Confluence Documentation');
      loadedContext.confluenceDocs.forEach(doc => {
        sections.push(`### ${doc.title}`);
        if (doc.url) {
          sections.push(`[View in Confluence](${doc.url})`);
        }
        sections.push('');
        sections.push(doc.markdown);
        sections.push('');
      });
    }
    
    // Google Docs
    if (loadedContext.googleDocs && loadedContext.googleDocs.length > 0) {
      sections.push('## Google Docs');
      loadedContext.googleDocs.forEach(doc => {
        sections.push(`### ${doc.title}`);
        sections.push(`[View in Google Docs](${doc.url})`);
        sections.push('');
        sections.push(doc.markdown);
        sections.push('');
      });
    }
    
    // Additional Jira issues referenced
    if (loadedContext.additionalJiraIssues.length > 0) {
      sections.push('## Additional Referenced Issues');
      loadedContext.additionalJiraIssues.forEach(issue => {
        sections.push(`- **${issue.key}** (${issue.issueType}): ${issue.summary} [${issue.status}]`);
      });
      sections.push('');
    }
  }
  
  // Project context
  if (hierarchy.project.description) {
    sections.push('## Project Context');
    sections.push(hierarchy.project.description);
    sections.push('');
  }
  
  // Final instruction
  sections.push('---');
  sections.push('');
  sections.push('Generate the complete story content following the format specified in the system prompt.');
  sections.push('');
  sections.push('**CRITICAL REMINDERS:**');
  sections.push('1. ❓ markers belong ONLY in the Scope Analysis section - NEVER in Acceptance Criteria');
  sections.push('2. Include Figma links with each Acceptance Criteria group (reference the relevant screen)');
  sections.push('3. All original Figma, Confluence, and Google Docs links MUST be preserved in Supporting Artifacts');
  if (scopeAnalysis) {
    sections.push('4. Copy the Pre-Generated Scope Analysis EXACTLY into the Scope Analysis section');
  }
  sections.push('');
  sections.push('If this is a subsequent run, flip answered ❓ to 💬 and incorporate the answers.');
  
  return sections.join('\n');
}
