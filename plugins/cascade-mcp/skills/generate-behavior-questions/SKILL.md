---
name: generate-behavior-questions
description: "Generate frame-specific clarifying questions about ambiguous UI behaviors from a Jira epic and its linked Figma designs, Confluence pages, and Google Docs. Uses iterative content loading, parallel Figma frame analysis, and cross-content synthesis to produce targeted behavior questions organized by Figma frame."
---

# Generate Questions

Generate frame-specific clarifying questions for a feature by gathering all context (Jira, Confluence, Google Docs, Figma designs) and analyzing them comprehensively.

## When to Use

Use when the user wants to:
- Review a feature's designs and generate clarifying questions
- Identify gaps, ambiguities, or contradictions in a feature spec
- Prepare for a feature review by listing what needs clarification

Typical trigger: "Generate questions for PROJ-123" or "What questions do we have about this feature?"

## Required Input

- **Jira issue key** (e.g., `PROJ-123`) — the epic or story to analyze

## Procedure

### Phase 1: Fetch the Starting Issue

Call MCP tool `extract-linked-resources` with the Jira issue URL (e.g., `https://myco.atlassian.net/browse/PROJ-123`).

This returns the issue content as **markdown with YAML frontmatter** — save it directly to `.temp/cascade/context/jira-PROJ-123.md`.

The frontmatter contains `discoveredLinks` grouped by type (figma, confluence, jira, googleDocs) with relationship info (parent, blocks, etc.). Parse these to build your initial `.temp/cascade/context/to-load.md`.

If `hasMoreComments: true`, call again with `commentsStartAt` to get additional comment pages.

### Phase 2: Iterative Content Loading

For each non-Figma URL in `to-load.md` (prioritize `parent` and `blocks` relationships first):

1. Call `extract-linked-resources` with the URL
2. Save the returned markdown to `.temp/cascade/context/{type}-{identifier}.md`
3. Parse `discoveredLinks` from frontmatter — add any new URLs to `to-load.md`
4. Repeat until no unloaded non-Figma URLs remain

**Important**: Figma URLs are collected but NOT loaded here — they go in the `## Figma` section of `to-load.md` for Phase 3.

### Phase 3: Figma Batch Load

For each Figma URL collected:

1. Call MCP tool `figma-batch-zip` with the Figma file URL
   - This returns a `downloadUrl` for a zip file and a `manifest`
2. Try to download and extract the zip:
   ```
   curl -sL "{downloadUrl}" -o /tmp/cascade-figma.zip && unzip -qo /tmp/cascade-figma.zip -d .temp/cascade/figma/ && rm /tmp/cascade-figma.zip
   ```
3. **If curl succeeds** (exit code 0), the extracted data is at:
   ```
   .temp/cascade/figma/{fileKey}/
   ├── manifest.json              ← frame list with metadata
   ├── prompts/
   │   └── frame-analysis.md      ← analysis prompt for frames
   └── frames/
       ├── {nodeId}-{name}/
       │   ├── image.png           ← frame screenshot
       │   ├── structure.xml       ← semantic component tree
       │   └── context.md          ← annotations/connections
       └── ...
   ```
   → Proceed to Phase 4 (filesystem path).

4. **If curl fails** (e.g., DNS resolution blocked in cloud environments):
   - Call MCP tool `figma-batch-cache` with the same Figma URLs
   - Note the `batchToken` and `manifest` from the response
   → Proceed to Phase 4 (MCP path).

### Phase 4: Parallel Frame Analysis

**Choose the matching path based on Phase 3 outcome:**

#### Path A: Local files available (zip succeeded)

For each frame listed in `manifest.json`:

1. Launch a **subagent** using the `cascade-analyze-figma-frame` sub-skill
2. Pass only the **frame directory path** (e.g., `.temp/cascade/figma/{fileKey}/frames/{dirName}/`) — the subagent reads the files itself
3. Subagents write `analysis.md` to their frame directory

**Do NOT read context.md, structure.xml, or image.png yourself.** The subagent handles all file reading. You only pass the path.

#### Path B: MCP cache (curl failed, using batch cache)

For each frame in the `manifest` from `figma-batch-cache`:

1. Launch a **subagent** using the `cascade-analyze-figma-frame-mcp` sub-skill
2. Pass the frame's **Figma URL** and the **batchToken**
3. The subagent calls `figma-frame-data(url, batchToken)` to retrieve its data via MCP, then returns its analysis as text

**Run all frame subagents in parallel** — they are independent of each other.

Wait for all subagents to complete before proceeding.

### Phase 5: Scope Analysis

Use sub-skill `analyze-feature-scope` to produce the scope analysis. This:
- Combines all frame analyses with epic context, reference docs, and per-frame annotations
- Categorizes every feature: ☐ In-Scope, ✅ Already Done, ⏬ Low Priority, ❌ Out-of-Scope, ❓ Questions, 💬 Answered
- Groups features by user workflow (not by screen)
- Returns a self-healing recommendation based on ❓ count

This produces `.temp/cascade/scope-analysis.md`.

**Self-healing check**: If the `analyze-feature-scope` sub-skill recommends **CLARIFY** (>5 unanswered ❓), present the scope analysis to the user and ask them to answer questions before generating behavior questions. Only proceed to Phase 6 if the user confirms or if ≤5 ❓ remain.

### Phase 6: Generate Questions

Using the scope analysis and all frame analyses, generate frame-specific clarifying questions.

#### Critical Filtering Rules

1. **Cross-Screen Awareness**: If ANY screen shows a behavior (component style, position, interaction pattern), that behavior is DEFINED — do NOT ask about it
2. **Scope Markers**: Only ask about ☐ (in-scope) features. Skip ✅ (already done) and ❌ (out-of-scope)
3. **Context First**: If any context source (Jira comments, Confluence, Google Docs, Figma annotations) answers a question, don't ask it
4. **No Duplicates**: Don't repeat questions already present in Figma comments (check per-frame `context.md` files)
5. **Check answered questions**: If a question was previously asked (as a Figma comment) and has a reply, mark it 💬 — don't re-ask

#### Question Assignment Rules

- Every question must be assigned to the **MOST RELEVANT** Figma frame
- NO general/cross-cutting category — pick the closest screen
- Frames with no questions are omitted from output

#### Output Format

Present questions to the user in this format:

```markdown
# Behavior Questions

## [Frame: Screen Name (nodeId: 123:456)](https://www.figma.com/design/{fileKey}?node-id=123-456)

1. ❓ What is the expected behavior when the user clicks the "Submit" button with invalid data?
2. ❓ Should the filter panel persist its state across page navigation?

## [Frame: Another Screen (nodeId: 789:012)](https://www.figma.com/design/{fileKey}?node-id=789-012)

1. ❓ Is the data table sortable by all columns or only specific ones?
```

**Important formatting:**
- Each frame heading is a markdown link to the Figma frame URL
- Node IDs use hyphens in URLs (`123:456` → `node-id=123-456`) but colons in heading text
- Only include frames that have questions
- Number questions within each frame section

### Phase 7: Present Questions and Ask Next Action

Present the generated questions to the user.

After presenting, ask the user what they'd like to do next. Present these options clearly (use structured question UI if available — e.g., `askQuestions` in Copilot, `AskUserQuestion` in Claude Code):

1. **Post questions to Figma** — Post as comments pinned to each frame (use `post-design-questions-to-figma` sub-skill)
2. **Post questions to Jira** — Post as a single structured comment on the issue (use `post-design-questions-to-jira` sub-skill)
3. **Answer questions here, post Q&A to Figma** — Walk through each question interactively, post answered Q&A pairs as Figma comments (use `answer-design-questions-post-to-figma` sub-skill)
4. **Answer questions here, post Q&A to Jira** — Walk through each question interactively, build a growing Q&A comment on Jira (use `answer-design-questions-post-to-jira` sub-skill)

**Do NOT offer "modify questions" as an option** — if the user wants to modify, they'll say so naturally.

## Important Notes

- **Subagent depth**: Frame analysis subagents are leaf tasks — they do NOT launch further subagents
- **Cache efficiency**: If `.temp/cascade/figma/{fileKey}/` already has valid data, `figma-batch-zip` may return cached data — don't re-download unnecessarily
- **Error resilience**: If a single frame analysis fails, report the error and continue with remaining frames
- **Fresh comments**: To get the latest Figma comments (e.g., replies to previously posted questions), re-run `figma-batch-zip` — it always fetches fresh annotation data per frame
- **Two frame analysis paths**: Use `cascade-analyze-figma-frame` for local files (zip path) and `cascade-analyze-figma-frame-mcp` for MCP cache path. The parent skill chooses based on whether the zip download succeeded
