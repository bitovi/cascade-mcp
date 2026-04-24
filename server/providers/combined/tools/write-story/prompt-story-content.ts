/**
 * Story Content Generation Prompts
 * 
 * Prompts for generating story content with the write-story tool.
 * Uses a modified story format that replaces "Out of Scope" with "Scope Analysis".
 */

import dedent from 'dedent';
import type { JiraIssueHierarchy, IssueComment } from '../review-work-item/jira-hierarchy-fetcher.js';
import type { LoadedContext } from '../review-work-item/context-loader.js';
import type { ChangeDetectionResult } from './change-detection.js';
import { convertAdfToMarkdown } from '../../../atlassian/markdown-converter.js';
import { groupAnnotationsBySource } from '../shared/screen-annotation.js';

/**
 * Simplified hierarchy context for story prompts
 * Contains only the metadata needed by the prompt (no ADF or deep Jira fields)
 */
export interface StoryHierarchyContext {
  /** Parent issues in order from immediate parent to root */
  parents: Array<{
    key: string;
    summary: string;
    issueType?: string;
    url?: string;
  }>;
  /** Issues blocking this story */
  blockers: Array<{
    key: string;
    summary: string;
    status?: string;
    url?: string;
  }>;
  /** Project description (optional) */
  projectDescription?: string;
}

/**
 * Maps JiraIssueHierarchy to StoryHierarchyContext
 * Extracts only the simple metadata needed by the story prompt
 */
export function mapJiraHierarchyToContext(hierarchy: JiraIssueHierarchy): StoryHierarchyContext {
  return {
    parents: hierarchy.parents.map(parent => ({
      key: parent.key,
      summary: parent.fields.summary,
      issueType: parent.fields.issuetype?.name,
      // url not included - agents can construct URLs from siteName if needed
    })),
    blockers: hierarchy.blockers.map(blocker => ({
      key: blocker.key,
      summary: blocker.fields.summary,
      status: blocker.fields.status?.name,
      // url not included - agents can construct URLs from siteName if needed
    })),
    projectDescription: hierarchy.project.description || undefined,
  };
}

/**
 * System prompt for story content generation
 */
export const STORY_CONTENT_SYSTEM_PROMPT = `You are an expert technical writer specializing in agile user stories. Your task is to write or refine a Jira story based on the provided context.

## Story Format

**IMPORTANT:** Do NOT include the story title as a heading (e.g., "# Like and Dislike Buttons"). The story title is managed separately in Jira. Start directly with the sections below.

Write the story in this exact format:

## User Story Statement
A short description from the user's perspective:
"As a [user/role], I want [feature/action], so that [benefit/value]."

## Supporting Artifacts
Links to Figma designs, documentation, and other resources relevant to the story.
ALWAYS include all Figma, Confluence, and Google Docs links from the context - these must be preserved.

## Scope Analysis
Copy the scope analysis section EXACTLY as provided (if available).
If no scope analysis is provided, create one with:
- ☐ Feature that IS in scope for this story
- ❌ Feature that is explicitly OUT of scope
- ❓ Question that needs clarification?
- 💬 Question that has been answered → Answer text

## Non-Functional Requirements (if applicable)
Performance, security, accessibility, or other technical requirements.

**CRITICAL: ONLY include NFRs that are EXPLICITLY mentioned in the provided context (Figma, Confluence, Google Docs, comments).**
- DO NOT infer or generate requirements based on best practices
- DO NOT add accessibility requirements (ARIA labels, keyboard nav, etc.) unless explicitly mentioned
- DO NOT add performance requirements (caching, optimization, etc.) unless explicitly mentioned
- DO NOT add security requirements unless explicitly mentioned
- If no NFRs are explicitly stated in the context, SKIP this section entirely


## Developer Notes (if applicable)
Implementation hints, dependencies, or technical considerations.
**ONLY include notes that are EXPLICITLY mentioned in the provided context. Do NOT invent data models, API endpoints, or implementation details.**

## Acceptance Criteria
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
  /** Issue hierarchy context (parents, blockers, project) */
  hierarchy: StoryHierarchyContext;
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
  
  // Helper: Format run type indicator
  const runTypeSection = isFirstRun
    ? '**First Run** - Generate a complete story from scratch.'
    : dedent`
        **Subsequent Run** - Refine the existing story with new context.
        Look for inline answers (text after ❓) and flip them to 💬.
      `;
  
  // Helper: Format scope analysis section
  const scopeAnalysisSection = scopeAnalysis
    ? dedent`
        ## Pre-Generated Scope Analysis
        This scope analysis was generated by analyzing the Figma screens. Copy it EXACTLY into the "Scope Analysis" section of the story.

        \`\`\`markdown
        ${scopeAnalysis}
        \`\`\`
      `
    : '';
  
  // Helper: Format existing description
  const existingDescriptionSection = !isFirstRun && existingDescription
    ? dedent`
        ## Existing Story Content
        This is the current story. Refine it based on new context below.

        \`\`\`markdown
        ${existingDescription}
        \`\`\`
      `
    : '';
  
  // Helper: Format changed context (subsequent runs only)
  const changedContextSection = !isFirstRun && changedContext
    ? dedent`
        ## Changes Since Last Update
        Last updated: ${changedContext.lastUpdated.toISOString()}

        ${changedContext.inlineAnswers.length > 0 ? dedent`
          ### Inline Answers Detected
          The following questions appear to have answers added inline:
          ${changedContext.inlineAnswers.map(a => `- Question: "${a.question}"\n  Answer: "${a.answer}"`).join('\n')}
        ` : ''}

        ${changedContext.changedComments.length > 0 ? dedent`
          ### New/Updated Comments
          ${changedContext.changedComments.map(c => `**${c.author}** (${c.created}):\n${c.bodyText || '[Comment content]'}`).join('\n\n')}
        ` : ''}

        ${changedContext.changedIssues.length > 0 ? dedent`
          ### Updated Linked Issues
          ${changedContext.changedIssues.map(i => `- **${i.key}**: ${i.fields.summary}`).join('\n')}
        ` : ''}
      `
    : '';
  
  // Helper: Format parent hierarchy
  const parentHierarchySection = hierarchy.parents.length > 0
    ? hierarchy.parents.map((parent, index) => {
        const indent = '  '.repeat(index);
        return `${indent}**${parent.key}** (${parent.issueType || 'Issue'}): ${parent.summary}`;
      }).join('\n')
    : 'No parent issues found.';
  
  // Helper: Format blockers
  const blockersSection = hierarchy.blockers.length > 0
    ? dedent`
        ## Blockers
        ${hierarchy.blockers.map(b => `- **${b.key}**: ${b.summary} (${b.status || 'Unknown'})`).join('\n')}
      `
    : '';
  
  // Helper: Format comments (first run only)
  const commentsSection = isFirstRun && allComments.length > 0
    ? dedent`
        ## Comments
        ${allComments.map(c => `**${c.author}** (${c.created}):\n[Comment content - see ADF body]`).join('\n\n')}
      `
    : '';
  
  // Helper: Format Figma screens
  const figmaScreensSection = loadedContext?.analyzedScreens.length && loadedContext.analyzedScreens.length > 0
    ? dedent`
        ## Figma Screens
        ${loadedContext.analyzedScreens.map(screen => dedent`
          ### ${screen.name}
          ${screen.url ? `[View in Figma](${screen.url})` : ''}
          ${screen.analysis ? `\n${screen.analysis}` : ''}
        `).join('\n\n')}
      `
    : '';
  
  // Helper: Format Figma comments
  const figmaCommentsSection = (() => {
    if (!loadedContext?.figmaComments || loadedContext.figmaComments.length === 0) return '';
    
    const { comments: attachedComments, unattachedComments } = groupAnnotationsBySource(loadedContext.figmaComments);
    const sections = [];
    
    if (attachedComments.length > 0) {
      sections.push(dedent`
        ## Figma Comments (Design Review)

        The following comments are from designers, stakeholders, or previous analysis on Figma screens. Use these to understand design intent, clarifications, and questions that have been raised.

        ${attachedComments.map(sc => `### Comments on: ${sc.screenName}\n\n${sc.markdown}`).join('\n\n')}
      `);
    }
    
    if (unattachedComments.length > 0) {
      sections.push(dedent`
        ## File-Level Comments (Unattached)

        The following comments are not attached to specific screens in Figma. Only incorporate their context if it clearly pertains to the screens being analyzed. They may relate to other parts of the design.

        ${unattachedComments.map(c => c.markdown).join('\n\n')}
      `);
    }
    
    return sections.join('\n\n');
  })();
  
  // Helper: Format Confluence docs
  const confluenceDocsSection = loadedContext?.confluenceDocs.length && loadedContext.confluenceDocs.length > 0
    ? dedent`
        ## Confluence Documentation
        ${loadedContext.confluenceDocs.map(doc => dedent`
          ### ${doc.title}
          ${doc.url ? `[View in Confluence](${doc.url})` : ''}

          ${doc.markdown}
        `).join('\n\n')}
      `
    : '';
  
  // Helper: Format Google Docs
  const googleDocsSection = loadedContext?.googleDocs && loadedContext.googleDocs.length > 0
    ? dedent`
        ## Google Docs
        ${loadedContext.googleDocs.map(doc => dedent`
          ### ${doc.title}
          [View in Google Docs](${doc.url})

          ${doc.markdown}
        `).join('\n\n')}
      `
    : '';
  
  // Helper: Format additional Jira issues
  const additionalIssuesSection = loadedContext?.additionalJiraIssues.length && loadedContext.additionalJiraIssues.length > 0
    ? dedent`
        ## Additional Referenced Issues
        ${loadedContext.additionalJiraIssues.map(i => `- **${i.key}** (${i.issueType}): ${i.summary} [${i.status}]`).join('\n')}
      `
    : '';
  
  // Helper: Format project context
  const projectContextSection = hierarchy.projectDescription
    ? dedent`
        ## Project Context
        ${hierarchy.projectDescription}
      `
    : '';
  
  // Build the complete prompt using template literals
  return dedent`
    # Write Story: ${issueSummary}

    ${runTypeSection}

    ${scopeAnalysisSection}

    ${existingDescriptionSection}

    ${changedContextSection}

    ## Parent Hierarchy
    ${parentHierarchySection}

    ${blockersSection}

    ${commentsSection}

    ${figmaScreensSection}

    ${figmaCommentsSection}

    ${confluenceDocsSection}

    ${googleDocsSection}

    ${additionalIssuesSection}

    ${projectContextSection}

    ---

    Generate the complete story content following the format specified in the system prompt.

    **CRITICAL REMINDERS:**
    1. ❓ markers belong ONLY in the Scope Analysis section - NEVER in Acceptance Criteria
    2. Include Figma links with each Acceptance Criteria group (reference the relevant screen)
    3. All original Figma, Confluence, and Google Docs links MUST be preserved in Supporting Artifacts
    ${scopeAnalysis ? '4. Copy the Pre-Generated Scope Analysis EXACTLY into the Scope Analysis section' : ''}

    If this is a subsequent run, flip answered ❓ to 💬 and incorporate the answers.
  `.replace(/\n{3,}/g, '\n\n'); // Clean up excessive blank lines
}
