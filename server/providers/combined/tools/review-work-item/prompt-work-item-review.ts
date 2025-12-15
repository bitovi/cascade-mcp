/**
 * Prompt Generator for Work Item Review
 * 
 * Creates prompts for LLM to analyze a work item and generate
 * comprehensive review questions grouped by feature area.
 */

import type { JiraIssueHierarchy, JiraIssue } from './jira-hierarchy-fetcher.js';
import { parseComments, buildJiraIssueUrl } from './jira-hierarchy-fetcher.js';
import type { LoadedContext } from './context-loader.js';
import type { ConfluenceDocument } from '../shared/confluence-setup.js';
import { convertAdfNodesToMarkdown } from '../../../atlassian/markdown-converter.js';

// ============================================================================
// Constants
// ============================================================================

export const WORK_ITEM_REVIEW_SYSTEM_PROMPT = `You are an expert product analyst and technical reviewer helping teams identify gaps, ambiguities, and missing information in Jira work items before development begins.

FUNDAMENTAL PRINCIPLES:
1. **Evidence-Based**: Only ask questions about things actually mentioned or implied in the work item
2. **Actionable**: Each question should have a clear path to being answered
3. **Contextual**: Questions should consider parent items, linked docs, and project standards
4. **Prioritized**: More important questions come first within each group
5. **Constructive**: Frame questions to help clarify, not criticize

QUESTION CATEGORIES TO CONSIDER:
- **Acceptance Criteria** - Are success conditions measurable and complete?
- **Scope Boundaries** - What's explicitly in/out of scope?
- **Edge Cases** - Error states, empty states, boundary conditions?
- **Dependencies** - Are all blockers identified? Hidden dependencies?
- **User Experience** - Loading states, error messages, accessibility?
- **Technical Considerations** - API contracts, data models, performance?
- **Testing Strategy** - How will this be verified?

DEFINITION OF READY (if provided):
- Compare the work item against each DoR requirement
- Flag missing or incomplete sections
- Ask about anything the DoR requires that isn't addressed

OUTPUT FORMAT:
- Group questions by feature/functionality area
- Order questions within each group by importance (most critical first)
- Include relevant Figma/Confluence links per section when available
- Use "Remaining Questions" for cross-cutting concerns
- If the story is well-defined with no gaps, say so positively

QUESTION FORMATTING:
- Each question starts with ❓
- Include context/reason when helpful: "❓ Question (because X)"
- Keep questions concise but complete`;

export const WORK_ITEM_REVIEW_MAX_TOKENS = 8000;

// ============================================================================
// Main Export
// ============================================================================

/**
 * Generate the complete prompt for work item review
 */
export function generateWorkItemReviewPrompt(
  hierarchy: JiraIssueHierarchy,
  context: LoadedContext
): string {
  const { target, parents, blockers, siteName } = hierarchy;
  const { definitionOfReady, confluenceDocs, analyzedScreens, additionalJiraIssues } = context;
  
  const otherDocs = confluenceDocs.filter(doc => doc !== definitionOfReady);
  
  // Build all sections, filter out empty ones, join with separator
  const sections = [
    // =========================================================================
    // HEADER
    // =========================================================================
    `# Work Item Review Request

You are reviewing **${target.key}**: ${target.fields.summary}

Please identify gaps, ambiguities, and missing information that should be clarified before development begins.`,

    // =========================================================================
    // TARGET WORK ITEM
    // =========================================================================
    formatIssue(target, 'TARGET WORK ITEM', siteName),

    // =========================================================================
    // PARENT HIERARCHY
    // =========================================================================
    (() => {
      if (parents.length === 0) return '';
      
      const parentSections = parents.map(parent => {
        const desc = parent.fields.description 
          ? truncate(convertAdfNodesToMarkdown(parent.fields.description.content || []), 2000)
          : '*No description*';
        return `### ${parent.key} (${parent.fields.issuetype?.name}): ${parent.fields.summary}

${desc}`;
      });
      
      return `## PARENT HIERARCHY

The following parent items provide context about the broader initiative:

${parentSections.join('\n\n')}`;
    })(),

    // =========================================================================
    // BLOCKERS
    // =========================================================================
    (() => {
      if (blockers.length === 0) return '';
      
      const blockerList = blockers
        .map(b => `- **${b.key}** (${b.fields.issuetype?.name}): ${b.fields.summary} [${b.fields.status?.name}]`)
        .join('\n');
      
      return `## BLOCKERS

The following items are blocking this work:

${blockerList}`;
    })(),

    // =========================================================================
    // DEFINITION OF READY
    // =========================================================================
    (() => {
      if (!definitionOfReady) return '';
      
      return `## DEFINITION OF READY

**IMPORTANT**: Compare the work item against this Definition of Ready. Flag any missing or incomplete sections.

**Document**: [${definitionOfReady.title}](${definitionOfReady.url})

<definition_of_ready>
${definitionOfReady.markdown}
</definition_of_ready>`;
    })(),

    // =========================================================================
    // REFERENCED DOCUMENTATION (Confluence)
    // =========================================================================
    (() => {
      if (otherDocs.length === 0) return '';
      
      const docSections = otherDocs.map(doc => {
        const content = doc.metadata.summary?.text 
          ? `**Summary**:\n${doc.metadata.summary.text}`
          : truncate(doc.markdown, 1500);
        
        return `### ${doc.title}

**URL**: ${doc.url}

${content}`;
      });
      
      return `## REFERENCED DOCUMENTATION

The following linked Confluence documents provide additional context:

${docSections.join('\n\n')}`;
    })(),

    // =========================================================================
    // FIGMA DESIGN ANALYSIS
    // =========================================================================
    (() => {
      if (analyzedScreens.length === 0) return '';
      
      const screenSections = analyzedScreens.map(screen => {
        const notes = screen.notes.length > 0 
          ? `**Design Notes:**\n${screen.notes.map(n => `- ${n}`).join('\n')}\n\n` 
          : '';
        
        return `### Screen: ${screen.name}

**URL**: ${screen.url}

${notes}**Analysis:**

${screen.analysis}`;
      });
      
      return `## FIGMA DESIGN ANALYSIS

The following ${analyzedScreens.length} screen(s) were analyzed from linked Figma designs:

${screenSections.join('\n\n')}

---

*Consider: Do the designs match the requirements? Are there missing states? Unclear interactions? Contradictions with acceptance criteria?*`;
    })(),

    // =========================================================================
    // RELATED JIRA ISSUES
    // =========================================================================
    (() => {
      if (additionalJiraIssues.length === 0) return '';
      
      const issueSections = additionalJiraIssues.map(issue => {
        const desc = issue.descriptionMarkdown 
          ? truncate(issue.descriptionMarkdown, 500) 
          : '';
        
        return `### ${issue.key} (${issue.issueType}): ${issue.summary}
**Status**: ${issue.status}
**URL**: ${issue.url}

${desc}`;
      });
      
      return `## RELATED JIRA ISSUES

The following related issues are referenced:

${issueSections.join('\n\n')}`;
    })(),

    // =========================================================================
    // OUTPUT FORMAT INSTRUCTIONS
    // =========================================================================
    `## OUTPUT FORMAT

Generate a review in this format:

\`\`\`markdown
## Story Review

### {Feature Area Name}

[Figma: Screen Name](figma-url) | [Confluence: Doc Title](confluence-url)

- ❓ Most important question for this area (context/reason)
- ❓ Second most important question
- ❓ Lower priority question

### {Second Feature Area}

[Figma: Another Screen](figma-url)

- ❓ Question about this area
- ❓ Another question

### Remaining Questions

- ❓ Cross-cutting question not specific to one area
- ❓ General question about the work item
\`\`\`

**Rules**:
- Group questions by feature/functionality area
- Order questions within each group by importance (most critical first)
- Link relevant Figma screens and Confluence docs per section
- Use "Remaining Questions" for cross-cutting concerns
- If the story is well-defined with no significant questions, respond with:

\`\`\`markdown
## Story Review

This story looks well-defined! No significant gaps or questions identified.
\`\`\`

Output ONLY the markdown review. Do not include explanations or process notes.`
  ];

  return sections.filter(s => s).join('\n\n---\n\n');
}

// ============================================================================
// Helpers
// ============================================================================

function formatIssue(item: JiraIssue, title: string, siteName: string): string {
  const labels = item.fields.labels?.length 
    ? `**Labels**: ${item.fields.labels.join(', ')}\n` 
    : '';
  
  const description = item.fields.description
    ? convertAdfNodesToMarkdown(item.fields.description.content || [])
    : '*No description provided*';
  
  const comments = parseComments(item.fields.comment?.comments);
  const commentsSection = comments.length > 0 ? `

### Comments

${comments.slice(-5).map(c => 
  `**${c.author}** (${formatDate(c.created)}):
${convertAdfNodesToMarkdown(c.body.content || [])}`
).join('\n\n')}` : '';

  return `## ${title}

**Key**: ${item.key}
**Type**: ${item.fields.issuetype?.name || 'Unknown'}
**Status**: ${item.fields.status?.name || 'Unknown'}
**Summary**: ${item.fields.summary}
${labels}**URL**: ${buildJiraIssueUrl(item.key, siteName)}

### Description

${description}${commentsSection}`;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength 
    ? text.substring(0, maxLength) + '\n\n*[Content truncated...]*'
    : text;
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return isoDate;
  }
}
