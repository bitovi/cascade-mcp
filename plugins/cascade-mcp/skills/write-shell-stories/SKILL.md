---
name: write-shell-stories
description: "Write or refresh the Shell Stories section of a Jira epic by loading all linked context (Figma, Confluence, Google Docs), analyzing every Figma frame in parallel, running scope analysis, then generating a prioritized list of incremental shell story outlines grouped by user workflow. Preserves completion markers for already-written stories. Uses ☐/⏬/❌/❓ scope markers with SCREENS and DEPENDENCIES per story."
---

# Write Shell Stories

Generate or refresh the `## Shell Stories` section of a Jira epic using comprehensive context from all linked sources (Figma, Confluence, Google Docs) and a scope analysis pass.

## When to Use

Use when the user wants to:
- Generate the initial set of shell stories for an epic from its Figma designs and specs
- Refresh shell stories after new designs or scope changes
- Re-run to regenerate shell stories after questions have been answered (❓ → 💬 flipping in scope analysis)

Typical triggers:
- "Write shell stories for PROJ-123"
- "Generate shell stories for this epic"
- "Refresh the shell stories for PROJ-123 — we have new designs"

## Required Input

- **Jira epic key** (e.g., `PROJ-123`) — the epic to write shell stories for

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

**Important**: Figma URLs are collected but NOT loaded here — they go in the `## Figma` section of `to-load.md` for Phase 3.

### Phase 3: Figma Batch Load

For each Figma URL collected:

1. Call MCP tool `figma-batch-load` with the Figma file URL
2. Download and extract:
   ```
   curl -o .temp/cascade/figma/{fileKey}/batch.zip "{downloadUrl}"
   cd .temp/cascade/figma/{fileKey} && unzip -o batch.zip
   ```
3. The extracted zip contains:
   ```
   .temp/cascade/figma/{fileKey}/
   ├── manifest.json              ← frame list with metadata
   ├── prompts/
   │   └── frame-analysis.md      ← analysis prompt for frames
   └── frames/
       ├── {nodeId}-{name}/
       │   ├── image.png
       │   ├── structure.xml
       │   └── context.md
       └── ...
   ```

### Phase 4: Parallel Frame Analysis

For each frame listed in `manifest.json`, launch a **subagent** using the `cascade-analyze-figma-frame` sub-skill.

**Pass only the frame directory path** (e.g., `.temp/cascade/figma/{fileKey}/frames/{dirName}/`). Do NOT read `context.md`, `structure.xml`, or `image.png` yourself — the subagent reads all files internally.

Run all subagents in parallel. Wait for all to complete before proceeding.

### Phase 5: Scope Analysis

Use sub-skill `cascade-analyze-feature-scope` to produce `.temp/cascade/scope-analysis.md`. This categorizes every feature by scope (☐/✅/⏬/❌/❓/💬) using the epic context as the primary source of truth.

**Self-healing check**: If `cascade-analyze-feature-scope` recommends **CLARIFY** (>5 unanswered ❓ and no previous scope analysis exists), warn the user that there are many open questions. Suggest running `generate-behavior-questions` first to get answers before generating shell stories. Proceed only if the user confirms.

### Phase 6: Read Existing Epic Description

Call `atlassian-get-issue` with the epic key to get the current epic description. This is needed to:
- Detect if this is a first run or a re-run
- Extract any existing `## Shell Stories` section to find completion markers (stories with a Jira link + timestamp, e.g., `**[Story Title](https://...atlassian.net/browse/PROJ-456)** _(2025-01-15T10:30:00Z)_`) — these must be preserved exactly
- Identify the current `## Scope Analysis` section (if present) for ❓ → 💬 flipping awareness

**Preserve completion markers**: Record which story IDs already have a `jiraUrl` completion marker. During Phase 7, do NOT rewrite those stories — copy them verbatim from the existing description.

### Phase 7: Generate Shell Stories

Using the scope analysis (`.temp/cascade/scope-analysis.md`), frame analyses, content summaries, and Figma annotations, generate a prioritized list of shell stories.

#### Shell Story Format

Each story is a top-level list item with sub-bullets:

```markdown
## Shell Stories

- `st001` **Story Title** ⟩ One sentence description of what this story delivers
  * SCREENS: [Screen Name](figma-url), [Another Screen](figma-url)
  * DEPENDENCIES: none
  * ☐  Feature included in this story
  * ☐  Another included feature — [Screen Name](figma-url)
  * ⏬  Lower-priority feature (implement in st005)
  * ❌  Out of scope for this epic
  * ❓  Open question about behavior

- `st002` **Another Story Title** ⟩ One sentence description
  * SCREENS: [Screen Name](figma-url)
  * DEPENDENCIES: st001
  * ☐  Feature that builds on st001
  * ❓  Another open question
```

#### Story Generation Rules

1. **Scope-driven**: Every story maps to features from the scope analysis. Do NOT create stories for ❌ Out-of-Scope or ✅ Already Done features.
2. **Incremental value**: One story per logical user-facing workflow unit. Each story must be independently deployable and deliver real user value.
3. **Scope markers**:
   - `☐` In-Scope features → include as `☐` bullets
   - `⏬` Low Priority features → group into stories at the end (add `⏬` bullets with `(implement in stXXX)`)
   - `❌` Out-of-Scope features → add as `❌` bullets (no story reference needed)
   - `❓` Open questions → include as `❓` bullets in the most relevant story
4. **SCREENS**: Every story must have a `SCREENS` bullet with Figma links. Extract Figma URLs from the scope analysis feature areas.
5. **DEPENDENCIES**: List story IDs this story depends on. If none, write `none`. Only reference story IDs that exist in the output. Sequence foundational stories first.
6. **Story ordering**: Scaffolding first → user flow sequence → enhancements → low-priority items last.
7. **Shared components**: Introduce a shared component (modal, spinner, error state) only once, in the first story that needs it.
8. **Final story**: The last story in the list MUST have zero `⏬` bullets — all deferred work must be accounted for in earlier or intermediate stories.
9. **"None for now" answers = ❌**: If scope analysis Q&A contains responses like "None for now", "Not needed", or "No" — use `❌`, not `⏬`.

#### Re-Run Behavior (Preserving Completion Markers)

When the epic already has a `## Shell Stories` section:

1. **Copy completed stories verbatim**: Any story whose title is a Jira link with a timestamp (e.g., `**[Title](url)** _(date)_`) must be copied exactly as-is. Do NOT renumber or rephrase them.
2. **Regenerate uncompleted stories**: All stories without a completion marker are regenerated from the current scope analysis.
3. **Keep IDs stable where possible**: If a story ID from the old section maps to a logically similar story, keep the same ID to avoid breaking DEPENDENCIES references.
4. **Update DEPENDENCIES**: If a completed story's ID changes (rare), update all `DEPENDENCIES` bullets that reference it.

### Phase 8: Update Epic Description

1. Get the full current epic description from Phase 6
2. If `## Shell Stories` section exists: replace it with the newly generated section
3. If it does not exist: append `## Shell Stories` after `## Scope Analysis` (or at the end of the description if no scope analysis section is present)
4. Call `atlassian-update-issue-description` with the updated full description (preserve all other sections unchanged)

## Important Notes

- **Do not touch other sections**: Only modify the `## Shell Stories` section. Leave `## Scope Analysis`, `## Acceptance Criteria`, and any other sections exactly as they are.
- **Figma link format**: Use `[Screen Name](figma-url)` — screen name as link text, Figma node URL as target.
- **Story count is flexible**: There may be 3 stories or 20+. Do not force a fixed count — quality and incremental value delivery matter more than quantity.
- **Self-healing integration**: If re-running after questions were answered in Figma or Jira comments, the `cascade-analyze-feature-scope` sub-skill will flip ❓ → 💬 automatically. Updated scope analysis may result in different stories being generated.
- **Next step**: Once shell stories are written, use the `write-next-story-from-shell-story` skill to turn the first unwritten shell story into a full Jira subtask with acceptance criteria.
