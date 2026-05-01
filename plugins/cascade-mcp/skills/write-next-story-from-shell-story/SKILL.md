---
name: write-next-story-from-shell-story
description: "Write a full Jira story (User Story Statement, Scope Analysis, Acceptance Criteria in Gherkin, NFRs, Developer Notes) from the next unwritten shell story in a Jira epic. Loads only the Figma screens listed in that shell story, runs scope analysis anchored to its scope bullets, generates the full story description, creates a Jira story under the epic, adds blocker links for dependencies, and marks the shell story complete in the epic."
---

# Write Next Story From Shell Story

Turn the next unwritten shell story in a Jira epic into a full Jira subtask with comprehensive acceptance criteria, by loading only the relevant Figma screens and using the shell story's scope bullets as the scope anchor.

## When to Use

Use when the user wants to:
- Write out the next shell story in an epic as a full Jira story
- Turn a specific shell story into a full ticket
- Continue advancing an epic story by story after shell stories have been generated

Typical triggers:
- "Write the next story from PROJ-123's shell stories"
- "Write st003 from PROJ-123"
- "Advance the epic PROJ-123 — write the next story"

## Required Input

- **Jira epic key** (e.g., `PROJ-123`) — the epic containing the shell stories
- **Specific story ID** (optional, e.g., `st003`) — if omitted, the first unwritten story is used

## Procedure

### Phase 1: Fetch the Epic

Call MCP tool `extract-linked-resources` with the Jira epic URL (e.g., `https://myco.atlassian.net/browse/PROJ-123`).

Save the returned markdown+frontmatter directly to `.temp/cascade/context/jira-PROJ-123.md`.

Parse `discoveredLinks` from frontmatter to build `.temp/cascade/context/to-load.md`.

### Phase 2: Iterative Content Loading

For each non-Figma URL in `to-load.md` (prioritize `parent` and `blocks` relationships first):

1. Call `extract-linked-resources` with the URL
2. Save the returned markdown to `.temp/cascade/context/{type}-{identifier}.md`
3. Parse `discoveredLinks` from frontmatter — add any new URLs to `to-load.md`
4. Repeat until no unloaded non-Figma URLs remain

**Important**: Figma URLs are collected but NOT loaded here — only the target shell story's screens will be loaded in Phase 3.

### Phase 3: Identify Target Shell Story

Read the current epic description via `atlassian-get-issue` and locate the `## Shell Stories` section.

Parse shell stories from the section. Find the target story:
- If a specific story ID was provided (e.g., `st003`), use that story
- Otherwise, use the **first story without a completion marker** (i.e., the title is plain text, not a Jira link with a timestamp)

**Stop conditions**:
- If no `## Shell Stories` section exists: tell the user to run `write-shell-stories` first for this epic, then stop.
- If all stories are already written (all titles have Jira links + timestamps): tell the user the epic is complete, then stop.
- If the target story has unresolved DEPENDENCIES (a dependency story ID that itself is not yet written): tell the user which dependency needs to be written first, then stop.

The shell story has this structure:
```
- `st003` **Story Title** ⟩ One sentence description
  * SCREENS: [Screen Name](figma-url), [Another Screen](figma-url)
  * DEPENDENCIES: st001, st002
  * ☐  Included feature
  * ⏬  Deferred feature (implement in stXXX)
  * ❓  Open question
```

Record the story's:
- ID (e.g., `st003`)
- Title
- Description (the text after ⟩)
- SCREENS Figma URLs
- DEPENDENCIES story IDs
- All ☐, ⏬, ❓ scope bullets

### Phase 4: Figma Batch Load (Targeted)

For each Figma URL in the target story's **SCREENS** list only (do NOT load all epic Figma files):

1. Call MCP tool `figma-batch-zip` with the Figma URL
   - This returns a `downloadUrl` and `manifest`
2. Try to download and extract:
   ```
   curl -sL "{downloadUrl}" -o /tmp/cascade-figma.zip && unzip -qo /tmp/cascade-figma.zip -d .temp/cascade/figma/ && rm /tmp/cascade-figma.zip
   ```
3. **If curl fails** (e.g., DNS blocked in cloud environments):
   - Call `figma-batch-cache` with the same Figma URLs
   - Note the `batchToken` and `manifest` from the response

If frames for these screens were already analyzed in a prior run (`.temp/cascade/figma/{fileKey}/frames/{dirName}/analysis.md` exists), skip re-downloading for that file.

### Phase 5: Parallel Frame Analysis

**Choose the matching path based on Phase 4 outcome:**

#### Path A: Local files available (zip succeeded)

For each frame in the target story's screens, launch a **subagent** using the `cascade-analyze-figma-frame` sub-skill.

**Pass only the frame directory path** (e.g., `.temp/cascade/figma/{fileKey}/frames/{dirName}/`). Do NOT read `context.md`, `structure.xml`, or `image.png` yourself — the subagent reads all files internally.

#### Path B: MCP cache (curl failed, using batch cache)

For each frame in the `manifest` from `figma-batch-cache`, launch a **subagent** using the `cascade-analyze-figma-frame-mcp` sub-skill.

Pass the frame's **Figma URL** and the **batchToken**. The subagent calls `figma-frame-data(url, batchToken)` to retrieve data via MCP.

Run all subagents in parallel. Wait for all to complete before proceeding.

### Phase 6: Scope Analysis (Shell-Story-Anchored)

Use sub-skill `cascade-analyze-feature-scope` to produce `.temp/cascade/scope-analysis.md`.

**Key difference from other skills**: Pass the shell story's own `☐`, `⏬`, and `❓` bullets as the **starting scope anchor**. The scope analysis should refine and expand on these, but the shell story's scope bullets are the primary source of truth for what is in and out of scope for this story.

**Self-healing check**: If the scope analysis recommends **CLARIFY** (>5 unanswered ❓), warn the user. Proceed if the user confirms — this story may have open questions embedded as ❓ bullets in the output.

### Phase 7: Read Existing Story (Re-Run Detection)

Check whether the target shell story already has a Jira link (i.e., is partially or fully written):
- If the shell story title is already a Jira link (e.g., `**[Title](https://...)**`), the story was previously created. Call `atlassian-get-issue` on that issue key to fetch the existing description.
- Use the existing description to detect ❓ → 💬 flipping opportunities (inline answers in Jira comments) before rewriting.

### Phase 8: Write Story Description

Using the scope analysis (`.temp/cascade/scope-analysis.md`), frame analyses, content summaries, Figma annotations, and existing description (if any), write the full story description.

#### Story Format

```markdown
## User Story Statement
As a {role}, I want {capability} so that {benefit}.

## Supporting Artifacts
- **Figma**: [Screen Name](figma-url) | [Another Screen](figma-url)
- **Confluence**: [Spec Title](confluence-url)
- **Epic**: [PROJ-123](jira-url): {epic summary}

<details>
<summary>Scope Analysis</summary>

### {Feature Area}
- ☐ **{Feature}**: {description} — [Screen Name](figma-url)
- ✅ **{Existing Feature}**: {description}
- ❌ **{Out of Scope}**: {why excluded}
- ❓ **{Open Question}**: {what needs clarification}
- 💬 **{Answered Question}**: {question} → {answer from comments/context}

</details>

## Non-Functional Requirements
{ONLY include if explicitly mentioned in context — do NOT invent}

## Developer Notes
{ONLY include if explicitly mentioned in context — do NOT invent}

## Acceptance Criteria

**GIVEN** {precondition}:

[View in Figma](figma-url)

- **WHEN** {user action}, **THEN**
  - {expected result 1}
  - {expected result 2}

  - **WHEN** {subsequent action}, **THEN**
    - {nested expected result}

**GIVEN** {another precondition}:

- **WHEN** {user action}, **THEN**
  - {expected result}
```

#### Critical Story Writing Rules

1. **Shell story scope is the anchor**: The shell story's `☐` bullets define what goes in Acceptance Criteria. Scope analysis refines and adds detail — it does not override the shell story's explicit scope.
2. **Exclude deferred and out-of-scope**: Do NOT include `⏬` deferred features or `❌` out-of-scope features in Acceptance Criteria.
3. **Include ❓ as open questions**: If the shell story had `❓` bullets that are still unresolved, include them in the Scope Analysis section — do NOT include them in Acceptance Criteria.
4. **Scope markers in Scope Analysis only**: ❓ markers go in Scope Analysis, NOT in Acceptance Criteria.
5. **Nested Gherkin**: Use **GIVEN** / **WHEN** / **THEN** (all caps, all bolded). Nest subsequent WHEN/THEN inside bullet points. Embed Figma links inline below relevant GIVEN or THEN clause.
6. **No invention**: NFRs and Developer Notes are ONLY included if explicitly stated in source context.
7. **Evidence-based**: Every feature in the scope analysis must reference actual UI elements or explicit requirements.

### Phase 9: Create Jira Subtask

1. Generate a clean story title from the shell story title (e.g., strip backtick ID prefix if needed)
2. Convert the story description markdown to ADF using `atlassian-update-issue-description` conventions
3. Call `atlassian-create-issue` (or equivalent available tool) to create a Jira story under the epic:
   - **Parent**: the epic key (e.g., `PROJ-123`)
   - **Summary**: the story title
   - **Description**: the ADF story description from Phase 8
   - **Issue type**: Story (or the project's equivalent — epics contain stories/tasks, not subtasks)
4. If the shell story has DEPENDENCIES (other story IDs that are already written as Jira issues), add "Blocks" links from those dependency issues to the new issue.

Record the new issue key (e.g., `PROJ-456`) and URL for Phase 10.

### Phase 10: Mark Shell Story Complete in Epic

1. Get the full current epic description via `atlassian-get-issue`
2. In the `## Shell Stories` section, find the target shell story entry
3. Add the completion marker:
   - Change the title from plain text to a Jira link: `**[Story Title](https://myco.atlassian.net/browse/PROJ-456)**`
   - Append a timestamp: `_(2025-02-10T14:23:00Z)_` (use current UTC time)
4. Call `atlassian-update-issue-description` with the updated full epic description (only the shell story entry changes)

## Important Notes

- **Targeted Figma loading**: Only load Figma screens listed in the target story's SCREENS bullets — do NOT load all Figma files linked in the epic. This keeps each run fast and focused.
- **Dependency enforcement**: Never write a story whose DEPENDENCIES include an unwritten story. If dependencies aren't met, stop and tell the user which story to write first.
- **Do not touch other sections**: Only modify the target shell story entry in `## Shell Stories`. All other epic sections stay exactly as-is.
- **Re-run safe**: If the same story is run twice (e.g., to incorporate newly answered questions), the existing Jira issue is updated (not duplicated). The completion marker is updated with the new timestamp.
- **Next step**: After completion, suggest running `write-next-story-from-shell-story` again to write the next unwritten shell story.
