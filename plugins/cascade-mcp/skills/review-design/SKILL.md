---
name: review-design
description: "End-to-end design review workflow for a Jira epic. Gathers all context (Jira, Confluence, Google Docs, Figma), analyzes designs, generates scope analysis with feature inventory, produces clarifying questions, and offers to post them to Figma and/or Jira. Orchestrates load-content, analyze-content, analyze-figma-frame, scope-analysis, and generate-questions sub-skills."
---

# Review Design

Full design review workflow: gather all context for a Jira epic, analyze Figma designs, produce a scope analysis with feature inventory, generate clarifying questions, and post them to Figma/Jira.

## When to Use

Use when the user wants a comprehensive design review. This is the **top-level orchestrator** that runs the full pipeline.

Typical triggers:
- "Review the design for PROJ-123"
- "Analyze this epic's Figma designs"
- "Do a design review for this feature"

## Required Input

- **Jira issue key** (e.g., `PROJ-123`) — the epic or feature to review

## Procedure

### Phase 1: Extract Links

Call MCP tool `extract-linked-resources` with the Jira issue key.

This returns all URLs: Figma files, Confluence pages, Google Docs, linked Jira issues.

### Phase 2: Iterative Content Loading

Run the **load → analyze** loop using sub-skills:

1. Use `load-content` to fetch all non-Figma URLs
2. Use `analyze-content` to summarize and discover new links
3. If new URLs were discovered, repeat from step 1
4. Continue until `to-load.md` has no remaining `[ ]` entries (excluding Figma)

### Phase 3: Figma Batch Load

For each Figma URL collected:

1. Call MCP tool `figma-batch-load` with the Figma file URL
2. Download and extract the zip:
   ```
   curl -o .temp/cascade/figma/{fileKey}/batch.zip "{downloadUrl}"
   cd .temp/cascade/figma/{fileKey} && unzip -o batch.zip
   ```

### Phase 4: Fetch Fresh Comments

For each Figma file:

1. Call MCP tool `figma-get-comments` with the file key
2. Save to `.temp/cascade/figma/{fileKey}/comments/context.md`

### Phase 5: Parallel Frame Analysis

For each frame in `manifest.json`, launch a **subagent** with the `analyze-figma-frame` sub-skill. Run all subagents in parallel.

### Phase 6: Scope Analysis

Use sub-skill `scope-analysis` to produce `.temp/cascade/scope-analysis.md`. This is the critical step that:
- Takes all frame analyses + epic context + reference docs + Figma comments
- Categorizes every observed feature by scope (☐/✅/⏬/❌/❓/💬)
- Groups features by user workflow, with epic context as the source of truth
- Reports self-healing recommendation based on ❓ count

### Phase 7: Present Scope Analysis

Present the scope analysis to the user. It includes:
- Feature Overview
- User Journeys
- Feature Inventory (☐/✅/❌/⏬/❓/💬 markers grouped by workflow area)
- Cross-Screen Patterns
- Technical Scope
- Implementation Notes

**Self-healing check**: If >5 unanswered ❓ questions:
- Tell the user how many open questions exist
- Recommend they answer the ❓ items before proceeding
- Offer to post questions to Figma/Jira for async resolution

Ask the user: "Would you like me to generate clarifying questions for the open items?"

### Phase 8: Generate Questions (if requested)

If the user wants questions, follow the question generation process from the `generate-questions` skill (Phase 7 — the question generation step, since scope analysis is already done).

#### Question Filtering Rules

1. **Cross-Screen Awareness**: If ANY screen defines a behavior, don't ask about it
2. **Scope Markers**: Only ask about ☐ features, skip ✅ and ❌
3. **Context First**: Check all sources before marking ❓
4. **No Duplicates**: Skip questions already in Figma comments

#### Output Format

```markdown
# Design Review Questions

## [Frame: Screen Name (nodeId: 123:456)](https://www.figma.com/design/{fileKey}?node-id=123-456)

1. {question}?
2. {question}?
```

### Phase 9: Post Questions (if requested)

After presenting questions, offer:
- **Post to Figma** → use `post-questions-to-figma` skill
- **Post to Jira** → use `post-questions-to-jira` skill
- **Both**
- **Neither** (just keep as reference)

## Important Notes

- **This is the main entry point** for design reviews — it orchestrates all sub-skills
- **Interruptible**: The user can stop at any phase (e.g., just get the scope analysis without questions)
- **Resumable**: If `.temp/cascade/` already has data from a previous run, skip phases that are complete (check for existing files)
- **User in control**: Always present results and ask before taking actions (posting comments)
