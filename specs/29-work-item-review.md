# Work Item Review Tool

## Overview

A combined MCP tool that reviews a Jira work item (typically a story) and generates a comprehensive list of questions identifying gaps, ambiguities, and missing information. The output is posted as a Jira comment to facilitate team discussion.

## Goals

- Identify missing acceptance criteria, edge cases, and unclear requirements
- Surface questions before development begins to reduce rework
- Provide structured, actionable feedback grouped by feature area
- Leverage all available context (parent items, linked docs, designs)

## Context Gathering

The tool will gather context from multiple sources:

### Jira Hierarchy (Recursive)
- Fetch the target work item
- Recursively fetch parent work items (task → story → epic → initiative)
- Fetch blockers and items blocked by this work item
- Stop at a configurable depth limit (default: 5 levels)

### Jira Project Description
- Fetch the project description for the story's project
- Extract any Confluence links found in the project description
- This is a common location for Definition of Ready and project-wide standards
- **API**: `GET /rest/api/3/project/{projectKey}` → `description` field
- **Scope**: `read:jira-work` (already configured)
- **Note**: Project description is plain text, not ADF - will need different link parsing

### Linked Resources
Parse links from work item description, comments, AND project description:
- **Confluence** - Requirements docs, technical specs, DoD
- **Figma** - Design files and prototypes  
- **Other Jira items** - Related stories, dependencies

### Definition of Ready (If Found)
If any linked Confluence doc is identified as a Definition of Ready (by title or content):
- Parse its structure to identify required sections and criteria
- Compare the story against each requirement from the DoR
- Flag missing or incomplete sections in the output

The tool should dynamically adapt to whatever DoR format the team uses - different teams may have different required sections and criteria.

### Existing Utilities to Reuse
- `server/providers/combined/tools/shared/confluence-setup.ts` - Confluence document fetching and relevance scoring
- `server/providers/atlassian/` - Jira API client and helpers
- `server/providers/figma/` - Figma file fetching and caching
- `server/providers/combined/tools/writing-shell-stories/prompt-screen-analysis.ts` - Figma screen analysis and LLM prompt formatting
- Link parsing from `analyze-feature-scope` epic description handling

## Output Format

The tool outputs markdown posted as a Jira comment:

```markdown
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
```

### Output Rules
- Group questions by feature/functionality area (similar to scope analysis)
- Order questions within each group by priority (most important first)
- Link relevant Figma screens and Confluence docs per section
- Use "Remaining Questions" for cross-cutting concerns
- No explicit priority labels - ordering implies priority

## Implementation Plan

### Step 1: Create Tool Folder Structure

Create `server/providers/combined/tools/review-work-item/` with:
- `index.ts` - Export the tool registration function
- `review-work-item.ts` - Main tool implementation
- `prompt-work-item-review.ts` - LLM prompt for generating questions
- `jira-hierarchy-fetcher.ts` - Recursive parent/blocker fetching

**Verification**: Folder structure exists, tool registers without errors

### Step 2: Implement Jira Hierarchy and Project Fetching

Create `jira-hierarchy-fetcher.ts`:
- `fetchWorkItemWithHierarchy(issueKey, atlassianClient, options)` 
- Recursively fetch parent issues via `parent` field (no child issues/subtasks)
- Fetch linked issues (blockers, blocked-by, related)
- Fetch the Jira project description for the story's project
- Return structured hierarchy object with all fetched items + project description
- Configurable depth limit
- Send notifications as each item is fetched ("Fetching parent epic PROJ-100...")

**Verification**: Unit tests pass; can fetch a story, its parent epic, and project description

### Step 3: Implement Link Extraction

Extract links from multiple sources:
- Work item description (ADF format)
- Work item comments (ADF format)
- Parent work items (ADF format)
- Project description (plain text - use regex/URL parsing, not ADF)

Link types to extract:
- Confluence page links
- Figma file links
- Other Jira issue links (beyond parent/blockers)

Reuse existing link parsing logic from `analyze-feature-scope` if applicable.

**Verification**: Given a work item with links, correctly identifies and categorizes them

### Step 4: Implement Context Loading (Parallel)

Load all extracted links using `Promise.all` / `Promise.allSettled`:
- **Confluence docs**: Fetch all via `setupConfluenceContext()` (see `specs/28-confluence.md`)
- **Figma files**: Fetch all via existing caching infrastructure
- **Additional Jira issues**: Fetch all if not already in hierarchy

Use `Promise.allSettled` to handle partial failures gracefully - if one link fails to load, continue with the rest. For LLM parallelization details, see "LLM Parallelization" in Additional Requirements.

**Verification**: All linked resources are fetched; LLM calls work correctly for both MCP and REST API paths

### Step 5: Create LLM Prompt

Create `prompt-work-item-review.ts`:
- System prompt defining the reviewer role
- User prompt with all gathered context
- Instructions for grouping by feature area
- Instructions for prioritizing questions within groups
- Output format specification

Reference `prompt-scope-analysis-2.ts` for prompt structure patterns.

**Verification**: Prompt generates well-structured questions when tested manually

### Step 6: Implement Main Tool Logic

Create `review-work-item.ts`:
1. Fetch work item and hierarchy (with notifications)
2. Extract and load linked resources in parallel (with notifications)
3. Summarize and filter documents by relevance (use `specs/28-confluence.md` approach)
4. Build prompt with summarized context
5. Call LLM to generate questions (notify: "Generating review questions...")
6. Return markdown result (positive feedback if no questions)

Support batch mode: accept array of issue keys, process each and post individual comments.

**Verification**: End-to-end test with a real Jira story produces meaningful output

### Step 7: Add Jira Comment Posting

After generating the review:
- Convert markdown to ADF format
- Post as comment on the work item
- Return success/failure status

**Verification**: Comment appears on Jira issue with correct formatting

### Step 8: Add REST API Endpoint (Optional)

Following the dual interface pattern:
- Create `server/api/review-work-item.ts` 
- Use PAT authentication
- Call shared core logic

**Verification**: REST endpoint returns same results as MCP tool

## Question Categories to Consider

The LLM prompt should guide questions around:

- **Acceptance Criteria** - Are success conditions measurable and complete?
- **Scope Boundaries** - What's explicitly in/out of scope?
- **Edge Cases** - Error states, empty states, boundary conditions?
- **Dependencies** - Are all blockers identified? Hidden dependencies?
- **User Experience** - Loading states, error messages, accessibility?
- **Technical Considerations** - API contracts, data models, performance?
- **Testing Strategy** - How will this be verified?

## Answered Questions

1. **Child issues (subtasks)?** - No, only fetch parents and blockers, not child issues.

2. **Dry run mode?** - No, always post the comment.

3. **Skip posting if no questions?** - No, if story is well-defined, post a comment saying "Story looks great!" or similar positive feedback.

4. **Required question categories?** - No fixed categories. Questions should be dynamically derived from context (e.g., if a Definition of Ready mentions security scopes for APIs, and the story describes an API without scopes, ask about it).

5. **Batch support?** - Yes, support reviewing multiple work items. The queue wrapper from `specs/31-generate-parallel-or-sequential.md` handles parallel vs sequential LLM processing automatically. Each work item gets its own individual comment.

6. **Context size limits?** - Use the document summarization and relevance scoring from `specs/28-confluence.md`. Documents should be summarized and filtered by relevance before being included in the prompt.

## Additional Requirements (from answers)

### Progress Notifications
Use MCP notifications to inform users as resources are loaded:
- "Fetching story PROJ-123..."
- "Loading parent epic PROJ-100..."
- "Fetching 3 Confluence documents..."
- "Analyzing Figma designs..."
- "Generating review questions..."

### Positive Feedback for Well-Defined Stories
If the LLM determines the story is well-defined with no significant questions:
- Still post a comment
- Content should be positive (e.g., "## Story Review\n\nThis story looks well-defined! No significant gaps or questions identified.")

### Dynamic Question Categories
Questions should emerge from the context, not a fixed checklist:
- If DoR mentions security requirements → check for security gaps
- If DoR mentions accessibility → check for accessibility considerations  
- If linked designs exist → check for design-implementation alignment
- Etc.

### Error Handling
Follow the established pattern: if anything goes wrong, error immediately. Specifically:
- If the target work item fails to fetch → throw error
- If a linked resource fails to load → throw error (no partial results)
- Authentication failures → throw error to trigger re-auth flow

### LLM Parallelization

This tool will need multiple LLM calls (Confluence summarization, Figma analysis, question generation). The queue wrapper from `specs/31-generate-parallel-or-sequential.md` (now implemented) handles this automatically:

- MCP tools wrap `generateText` with `createQueuedGenerateText()` at creation time
- Tool code can freely use `Promise.all()` for parallel LLM calls
- Queue transparently sequences requests for MCP sampling
- AI SDK gets true parallel execution

## Related Specs

- `specs/26-parallel-analysis.md` - Parallel screen analysis (existing pattern)
- `specs/28-confluence.md` - Document summarization, relevance scoring, and Confluence authentication
- `specs/31-generate-parallel-or-sequential.md` - Queue wrapper for LLM parallelization
- `specs/32-context-reduction-strategy.md` - Future: Dynamic context sizing based on document importance

