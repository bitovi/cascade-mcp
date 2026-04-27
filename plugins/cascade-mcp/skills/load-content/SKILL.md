---
name: load-content
description: "Sub-skill: Fetch raw content for one or more URLs via Cascade MCP tools. Supports Jira issues, Confluence pages, Google Docs, and raw URLs. Saves content to .temp/cascade/context/ and appends newly discovered links to to-load.md. Used as a building block by parent skills like generate-questions and write-story."
---

# Load Content

Fetch raw content for a set of URLs using Cascade MCP tools. Save content locally and discover new links for iterative loading.

## When to Use

This is a **sub-skill** — called by parent skills (generate-questions, write-story, review-design), not directly by users. Use when the parent skill needs to gather raw content from one or more URLs before analysis.

## Prerequisites

- Cascade MCP server connected (tools available)
- URLs to load (from `extract-linked-resources` output or from `to-load.md`)

## Procedure

### 1. Read the loading manifest

Check if `.temp/cascade/context/to-load.md` exists. If it does, read it to find URLs marked as `[ ]` (not yet loaded).

If the file doesn't exist, create it from the URLs provided by the parent skill:

```markdown
# Links to Load

## Unloaded
- [ ] https://mycompany.atlassian.net/browse/PROJ-123
- [ ] https://docs.google.com/document/d/abc123/edit

## Loaded
(none yet)
```

### 2. Fetch content for each unloaded URL

For each `[ ]` URL, determine the type and call the appropriate MCP tool:

| URL Pattern | MCP Tool | Output |
|-------------|----------|--------|
| `*.atlassian.net/browse/PROJ-*` | `atlassian-get-issue` | Issue description, comments, metadata |
| `*.atlassian.net/wiki/*` | `confluence-analyze-page` | Page content as markdown |
| `docs.google.com/document/*` | `google-drive-doc-to-markdown` | Document as markdown |
| `docs.google.com/spreadsheets/*` | `google-drive-doc-to-markdown` | Spreadsheet as markdown |
| `figma.com/design/*` | **Do not load here** — Figma URLs are handled separately by the parent skill via `figma-batch-load` |

### 3. Save fetched content

Save each fetched content to `.temp/cascade/context/` using a descriptive filename:

```
.temp/cascade/context/
├── to-load.md                          ← loading manifest
├── jira-PROJ-123.md                    ← Jira issue content
├── jira-PROJ-124.md                    ← linked Jira issue
├── confluence-page-title.md            ← Confluence page
├── gdoc-document-title.md              ← Google Doc
└── gdoc-spreadsheet-title.md           ← Google Spreadsheet
```

**File naming**: Use the source type prefix + a slugified identifier:
- Jira: `jira-{issueKey}.md`
- Confluence: `confluence-{slugified-page-title}.md`
- Google Doc: `gdoc-{slugified-doc-title}.md`

### 4. Scan for newly discovered links

After saving content, scan the fetched text for new URLs that aren't already in `to-load.md`:

**URL patterns to look for:**
- `https://*.atlassian.net/browse/PROJ-*` (Jira issues)
- `https://*.atlassian.net/wiki/*` (Confluence pages)
- `https://docs.google.com/document/*` (Google Docs)
- `https://docs.google.com/spreadsheets/*` (Google Sheets)
- `https://www.figma.com/design/*` (Figma files)
- `https://www.figma.com/file/*` (Figma files, old format)

### 5. Update the loading manifest

Mark loaded URLs as `[x]` and append any newly discovered URLs as `[ ]`:

```markdown
# Links to Load

## Unloaded
- [ ] https://mycompany.atlassian.net/wiki/spaces/TEAM/pages/12345
- [ ] https://www.figma.com/design/abc123/Designs

## Loaded
- [x] https://mycompany.atlassian.net/browse/PROJ-123
- [x] https://docs.google.com/document/d/abc123/edit

## Figma (handled separately)
- https://www.figma.com/design/abc123/Designs?node-id=0-1
```

**Important**: Figma URLs should be listed in a separate "Figma" section — they are NOT loaded by this skill. The parent skill handles Figma loading via `figma-batch-load`.

### 6. Return to parent skill

Report back to the parent skill:
- How many URLs were loaded
- How many new URLs were discovered
- Whether there are remaining unloaded URLs in `to-load.md`

The parent skill decides whether to call `load-content` again (if new links were discovered) or proceed to analysis.

## Important Notes

- **Do NOT load Figma URLs** — they require batch loading via `figma-batch-load` + `curl`/`unzip`, which the parent skill handles
- **Do NOT analyze or summarize content** — that's the `analyze-content` sub-skill's job
- **Deduplicate URLs** — don't add a URL to `to-load.md` if it's already there (loaded or unloaded)
- **Handle errors gracefully** — if a tool call fails, mark the URL with `[!]` in the manifest and continue with other URLs
