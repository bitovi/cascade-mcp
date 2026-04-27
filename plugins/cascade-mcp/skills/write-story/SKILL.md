---
name: write-story
description: "Write or refine a Jira story description with full context from Figma designs, Confluence docs, Google Docs, and parent epic. Gathers all linked resources, analyzes Figma frames, runs scope analysis, and writes a comprehensive story with User Story Statement, Scope Analysis, Acceptance Criteria (Gherkin), NFRs, and Developer Notes. Uses ☐/✅/❌/❓/💬 scope markers and flips ❓→💬 when answers are found."
---

# Write Story

Write or refine a Jira story description using comprehensive context from all linked sources (Figma, Confluence, Google Docs, parent epic).

## When to Use

Use when the user wants to:
- Write a new story description from Figma designs and specs
- Refine an existing story with newly available context (answered questions, updated designs)
- Re-run story writing to incorporate inline answers (❓ → 💬 flipping)

Typical triggers:
- "Write the story for PROJ-456"
- "Update PROJ-456 with the latest design context"
- "Refine this story — questions have been answered"

## Required Input

- **Jira issue key** (e.g., `PROJ-456`) — the story to write/refine

## Procedure

### Phase 1: Extract Links

Call MCP tool `extract-linked-resources` with the Jira issue key.

This returns: Figma URLs, Confluence pages, Google Docs, linked Jira issues (including parent epic).

### Phase 2: Iterative Content Loading

Run the **load → analyze** loop:

1. Use `load-content` to fetch all non-Figma URLs
2. Use `analyze-content` to summarize and discover new links
3. Repeat if new URLs were discovered
4. Continue until no remaining `[ ]` entries in `to-load.md` (excluding Figma)

### Phase 3: Figma Batch Load

For each Figma URL:

1. Call `figma-batch-load` with the URL
2. Download and extract:
   ```
   curl -o .temp/cascade/figma/{fileKey}/batch.zip "{downloadUrl}"
   cd .temp/cascade/figma/{fileKey} && unzip -o batch.zip
   ```

### Phase 4: Fetch Fresh Comments

For each Figma file:

1. Call `figma-get-comments` with the file key
2. Save to `.temp/cascade/figma/{fileKey}/comments/context.md`

### Phase 5: Parallel Frame Analysis

Launch subagents with `analyze-figma-frame` sub-skill for each frame. Run in parallel.

### Phase 6: Scope Analysis

Use `scope-analysis` sub-skill to produce `.temp/cascade/scope-analysis.md`. This categorizes every feature by scope (☐/✅/⏬/❌/❓/💬) using the epic context as the primary source of truth.

**Self-healing check**: If the `scope-analysis` sub-skill recommends **CLARIFY** (>5 unanswered ❓ and no previous scope analysis), warn the user that there are many open questions. Suggest running `generate-questions` first to get answers before writing the story. Proceed only if the user confirms.

### Phase 7: Read Existing Description

Call `atlassian-get-issue` to get the current story description (if it exists). This is needed to:
- Detect if this is a first run or subsequent run
- Find ❓ markers that may now have inline answers (💬 flipping)
- Preserve content the user added manually

### Phase 8: Write Story Description

Using the scope analysis (`.temp/cascade/scope-analysis.md`), frame analyses, content summaries, Figma comments, and existing description (if any), write the story description.

#### Story Format

```markdown
## User Story Statement
As a {role}, I want {capability} so that {benefit}.

## Supporting Artifacts
- **Figma**: [Screen Name](figma-url) | [Another Screen](figma-url)
- **Confluence**: [Spec Title](confluence-url)
- **Epic**: [PROJ-123](jira-url): {epic summary}

## Scope Analysis

### {Feature Area}
- ☐ **{Feature}**: {description} — [Screen Name](figma-url)
- ✅ **{Existing Feature}**: {description}
- ❌ **{Out of Scope}**: {why excluded}
- ❓ **{Open Question}**: {what needs clarification}
- 💬 **{Answered Question}**: {question} → {answer from comments/context}

## Non-Functional Requirements
{ONLY include if explicitly mentioned in context — do NOT invent}
- Performance: {specific requirement from specs}
- Accessibility: {specific requirement from specs}

## Developer Notes
{ONLY include if explicitly mentioned in context — do NOT invent}
- {specific technical guidance from Confluence, Google Docs, or Jira comments}

## Acceptance Criteria

### {Feature Area}
**Given** {precondition}
**When** {action}
**Then** {expected result}
- Links: [Figma screen](figma-url) showing this behavior

### {Another Feature Area}
**Given** {precondition}
**When** {action}
**Then** {expected result}
```

#### Critical Story Writing Rules

1. **Scope markers in Scope Analysis only** — ❓ markers go in the Scope Analysis section, NOT in Acceptance Criteria
2. **Preserve original links** — always keep Figma URLs, Confluence links, etc. from the original context
3. **Link Figma screens to ACs** — each Acceptance Criteria item should reference the Figma frame that shows the behavior
4. **No invention** — NFRs and Developer Notes are ONLY included if explicitly stated in source context. Do NOT add generic requirements
5. **Evidence-based** — every feature in the scope analysis must reference actual UI elements or explicit requirements

#### Subsequent Run Behavior (❓ → 💬 Flipping)

When the story already has a description:

1. **Check for inline answers**: Look for ❓ items in the existing description that now have answers in:
   - Figma comments (new replies to questions)
   - Jira comments on the story or parent epic
   - Updated Confluence/Google Doc content
2. **Flip ❓ → 💬**: Change answered questions from ❓ to 💬 and include the answer
3. **Incorporate new context**: Add any new information from updated sources
4. **Preserve user edits**: Don't remove content that the user manually added to the description

### Phase 9: Update Jira

Call MCP tool `atlassian-update-issue-description` to write the story description to Jira.

Present the updated description to the user and confirm the update was successful.

## Important Notes

- **First run vs. subsequent run**: The skill handles both — first run creates from scratch, subsequent runs refine with new context
- **💬 flipping is key**: The main value of re-running is converting ❓ to 💬 as questions get answered across sources
- **Don't over-scope**: The story description should only cover what's in the scope analysis. Features marked ❌ or ⏬ should be mentioned as exclusions, not detailed
- **Gherkin in ACs**: Use Given/When/Then format for testable acceptance criteria
- **Resumable**: If `.temp/cascade/` already has data from a prior `review-design` or `generate-questions` run, reuse it instead of re-fetching everything
