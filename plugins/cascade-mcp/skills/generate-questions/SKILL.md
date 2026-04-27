---
name: generate-questions
description: "Generate frame-specific clarifying questions from a Jira epic and its linked Figma designs, Confluence pages, and Google Docs. Uses iterative content loading, parallel Figma frame analysis, and cross-content synthesis to produce targeted questions organized by Figma frame."
---

# Generate Questions

Generate frame-specific clarifying questions for a feature by gathering all context (Jira, Confluence, Google Docs, Figma designs) and analyzing them comprehensively.

## When to Use

Use when the user wants to:
- Review a feature's designs and generate clarifying questions
- Identify gaps, ambiguities, or contradictions in a feature spec
- Prepare for a design review by listing what needs clarification

Typical trigger: "Generate questions for PROJ-123" or "What questions do we have about this feature?"

## Required Input

- **Jira issue key** (e.g., `PROJ-123`) — the epic or story to analyze

## Procedure

### Phase 1: Extract Links from Jira

Call MCP tool `extract-linked-resources` with the Jira issue key.

This returns all URLs linked from the issue: Figma files, Confluence pages, Google Docs, linked Jira issues.

Save the returned URLs to `.temp/cascade/context/to-load.md`.

### Phase 2: Iterative Content Loading

Run the **load-content → analyze-content** loop:

1. Use sub-skill `load-content` to fetch all non-Figma URLs
2. Use sub-skill `analyze-content` to summarize fetched content and discover new links
3. Check `to-load.md` — if new `[ ]` URLs exist, repeat from step 1
4. Continue until no new unloaded URLs remain

**Important**: Figma URLs discovered during this phase are collected but NOT loaded yet — they go in the `## Figma` section of `to-load.md`.

### Phase 3: Figma Batch Load

For each Figma URL collected:

1. Call MCP tool `figma-batch-load` with the Figma file URL
   - This returns a download URL for a zip file
2. Download and extract the zip:
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
       │   ├── image.png           ← frame screenshot
       │   ├── structure.xml       ← semantic component tree
       │   └── context.md          ← annotations/connections
       └── ...
   ```

### Phase 4: Fetch Fresh Comments

For each Figma file loaded:

1. Call MCP tool `figma-get-comments` with the file key
2. Save comments to `.temp/cascade/figma/{fileKey}/comments/context.md`

Comments are always fetched fresh (not from cache) because they change frequently.

### Phase 5: Parallel Frame Analysis

For each frame listed in `manifest.json`:

1. Launch a **subagent** using the `analyze-figma-frame` sub-skill
2. Each subagent receives the frame directory path and analyzes independently
3. Subagents write `analysis.md` to their frame directory

**Run all frame subagents in parallel** — they are independent of each other.

Wait for all subagents to complete before proceeding.

### Phase 6: Scope Analysis

Use sub-skill `scope-analysis` to produce the scope analysis. This:
- Combines all frame analyses with epic context, reference docs, and Figma comments
- Categorizes every feature: ☐ In-Scope, ✅ Already Done, ⏬ Low Priority, ❌ Out-of-Scope, ❓ Questions, 💬 Answered
- Groups features by user workflow (not by screen)
- Returns a self-healing recommendation based on ❓ count

This produces `.temp/cascade/scope-analysis.md`.

**Self-healing check**: If the `scope-analysis` sub-skill recommends **CLARIFY** (>5 unanswered ❓), present the scope analysis to the user and ask them to answer questions before generating design review questions. Only proceed to Phase 7 if the user confirms or if ≤5 ❓ remain.

### Phase 7: Generate Questions

Using the scope analysis and all frame analyses, generate frame-specific clarifying questions.

#### Critical Filtering Rules

1. **Cross-Screen Awareness**: If ANY screen shows a behavior (component style, position, interaction pattern), that behavior is DEFINED — do NOT ask about it
2. **Scope Markers**: Only ask about ☐ (in-scope) features. Skip ✅ (already done) and ❌ (out-of-scope)
3. **Context First**: If any context source (Jira comments, Confluence, Google Docs, Figma annotations) answers a question, don't ask it
4. **No Duplicates**: Don't repeat questions already present in Figma comments (check `.temp/cascade/figma/{fileKey}/comments/context.md`)
5. **Check answered questions**: If a question was previously asked (as a Figma comment) and has a reply, mark it 💬 — don't re-ask

#### Question Assignment Rules

- Every question must be assigned to the **MOST RELEVANT** Figma frame
- NO general/cross-cutting category — pick the closest screen
- Frames with no questions are omitted from output

#### Output Format

Present questions to the user in this format:

```markdown
# Design Review Questions

## [Frame: Screen Name (nodeId: 123:456)](https://www.figma.com/design/{fileKey}?node-id=123-456)

1. What is the expected behavior when the user clicks the "Submit" button with invalid data?
2. Should the filter panel persist its state across page navigation?

## [Frame: Another Screen (nodeId: 789:012)](https://www.figma.com/design/{fileKey}?node-id=789-012)

1. Is the data table sortable by all columns or only specific ones?
```

**Important formatting:**
- Each frame heading is a markdown link to the Figma frame URL
- Node IDs use hyphens in URLs (`123:456` → `node-id=123-456`) but colons in heading text
- Only include frames that have questions
- Number questions within each frame section

### Phase 8: Present to User

Present the generated questions to the user. After presenting:

- Ask if they want to **post these questions to Figma** (use `post-questions-to-figma` skill)
- Ask if they want to **post these questions to Jira** (use `post-questions-to-jira` skill)
- Ask if they want to modify any questions before posting

## Important Notes

- **Subagent depth**: Frame analysis subagents are leaf tasks — they do NOT launch further subagents
- **Cache efficiency**: If `.temp/cascade/figma/{fileKey}/` already has valid data, `figma-batch-load` may return cached data — don't re-download unnecessarily
- **Error resilience**: If a single frame analysis fails, report the error and continue with remaining frames
- **Figma comments are separate**: Always fetch fresh via `figma-get-comments`, never rely on the batch-load zip for comments
