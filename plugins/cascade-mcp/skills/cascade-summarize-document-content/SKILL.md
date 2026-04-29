---
name: cascade-summarize-document-content
description: "Sub-skill: Summarize and categorize fetched content from .temp/cascade/context/. Extracts key information, identifies newly discovered links, and writes analysis summaries. Used as a building block by parent skills like generate-questions and write-jira-story."
---

# Analyze Content

Summarize and categorize raw content previously fetched by the `load-linked-resource-content` sub-skill. Extract key information and discover any additional links embedded in the content.

## When to Use

This is a **sub-skill** — called by parent skills after `load-linked-resource-content` has fetched raw content. Use when the parent skill needs summarized, structured content before synthesis or generation steps.

## Prerequisites

- Raw content files exist in `.temp/cascade/context/` (written by `load-linked-resource-content`)
- `.temp/cascade/context/to-load.md` exists with loading manifest

## Procedure

### 1. Read content files

Read all `.md` files in `.temp/cascade/context/` (excluding `to-load.md` and any files ending in `-summary.md`).

### 2. Analyze each content file

For each raw content file, produce a summary that extracts:

**For Jira issues (`jira-*.md`):**
- Issue type, status, priority
- Summary and key requirements from description
- Acceptance criteria (if present)
- Linked issues and their relationships (blocks, is blocked by, relates to)
- Figma/Confluence/Google Docs URLs found in description or comments
- Key decisions or answers from comments (look for 💬 markers)
- Open questions (look for ❓ markers)

**For Confluence pages (`confluence-*.md`):**
- Page purpose and key sections
- Requirements, specifications, or design decisions documented
- Referenced Figma designs or mockups
- Links to other Confluence pages, Jira issues, or external docs
- Tables of data (preserve structure in summary)

**For Google Docs (`gdoc-*.md`):**
- Document purpose
- Key requirements or specifications
- Design decisions or constraints
- Referenced links

### 3. Write summary files

Save each summary alongside the raw content file with a `-summary.md` suffix:

```
.temp/cascade/context/
├── jira-PROJ-123.md              ← raw content (from load-linked-resource-content)
├── jira-PROJ-123-summary.md      ← summary (from summarize-document-content)
├── confluence-design-spec.md
├── confluence-design-spec-summary.md
├── gdoc-requirements.md
├── gdoc-requirements-summary.md
└── to-load.md
```

### 4. Extract newly discovered links

While analyzing, collect any URLs found in the content that are NOT already in `to-load.md`. Append them as `[ ]` entries in the `## Unloaded` section.

### 5. Return to parent skill

Report back:
- How many files were analyzed
- How many new links were discovered (and added to `to-load.md`)
- Brief summary of what was found (e.g., "Analyzed 3 files: 1 Jira epic with 5 linked stories, 1 Confluence design spec, 1 Google Doc requirements doc. Found 2 new Confluence links.")

## Summary Format

Keep summaries concise but complete. Target 200-500 words per file. Use this structure:

```markdown
# Summary: {source title}

**Source**: {URL}
**Type**: {Jira Issue | Confluence Page | Google Doc}

## Key Information
- {bullet points of the most important facts}

## Requirements / Specifications
- {requirements extracted from the content}

## Open Questions
- ❓ {any unanswered questions found}
- 💬 {any answered questions found with their answers}

## Discovered Links
- {new URLs found in this content}
```

## Important Notes

- **Do NOT re-analyze files that already have a `-summary.md`** — skip them unless the parent skill explicitly requests re-analysis
- **Preserve scope markers** — if the source content uses ☐/✅/❌/⏬/❓/💬 markers, preserve them in the summary
- **Be factual** — summaries should extract information, not generate new content or opinions
- **Link discovery is critical** — the parent skill's load→analyze loop depends on finding new links to continue iterating
