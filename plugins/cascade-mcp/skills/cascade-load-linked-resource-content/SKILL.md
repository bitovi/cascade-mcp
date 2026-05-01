---
name: cascade-load-linked-resource-content
description: "Sub-skill: Fetch raw content for one or more URLs via the extract-linked-resources MCP tool. Supports Jira issues, Confluence pages, Google Docs, and Google Sheets. Saves content to .temp/cascade/context/ and appends newly discovered links to to-load.md. Used as a building block by parent skills like generate-questions and write-jira-story."
---

# Load Content

Fetch raw content for a set of URLs using Cascade MCP tools. Save content locally and discover new links for iterative loading.

## When to Use

This is a **sub-skill** — called by parent skills (generate-questions, write-jira-story), not directly by users. Use when the parent skill needs to gather raw content from one or more URLs before analysis.

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

For each `[ ]` URL, call the MCP tool `extract-linked-resources` with the URL:

```
extract-linked-resources({ url: "https://mycompany.atlassian.net/browse/PROJ-123" })
```

This returns **markdown with YAML frontmatter** containing:
- The document content (description, page body, etc.) as the markdown body
- `discoveredLinks` in frontmatter (categorized: figma, confluence, jira, googleDocs)
- For Jira: `relationship` on each link (parent, blocks, relates-to, etc.)
- For Jira: `hasMoreComments` / `commentsStartAt` for comment pagination

**Figma URLs**: If a Figma URL is passed, the tool returns a message to use `figma-batch-zip` instead. Figma URLs should NOT be loaded by this skill.

### 3. Save fetched content

Save the returned markdown+frontmatter directly as a file. The response is ready to write as-is:

```
.temp/cascade/context/
├── to-load.md                          ← loading manifest
├── jira-PROJ-123.md                    ← Jira issue (saved directly from tool response)
├── jira-PROJ-124.md                    ← linked Jira issue
├── confluence-page-title.md            ← Confluence page
├── gdoc-document-title.md              ← Google Doc
└── gsheet-spreadsheet-title.md         ← Google Spreadsheet
```

**File naming**: Use the source type prefix + a slugified identifier:
- Jira: `jira-{issueKey}.md`
- Confluence: `confluence-{slugified-page-title}.md`
- Google Doc: `gdoc-{slugified-doc-title}.md`
- Google Sheet: `gsheet-{slugified-title}.md`

### 4. Parse discovered links from frontmatter

Read the `discoveredLinks` YAML frontmatter from each saved file. Add any new URLs that aren’t already in `to-load.md`.

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

**Important**: Figma URLs should be listed in a separate "Figma" section — they are NOT loaded by this skill. The parent skill handles Figma loading via `figma-batch-zip` (or `figma-batch-cache` in cloud environments).

### 6. Return to parent skill

Report back to the parent skill:
- How many URLs were loaded
- How many new URLs were discovered
- Whether there are remaining unloaded URLs in `to-load.md`

The parent skill decides whether to call `load-linked-resource-content` again (if new links were discovered) or proceed to analysis.

## Important Notes

- **Do NOT load Figma URLs** — they require batch loading via `figma-batch-zip` + `curl`/`unzip` (or `figma-batch-cache` in cloud environments), which the parent skill handles
- **Do NOT analyze or summarize content** — that's the `summarize-document-content` sub-skill's job
- **Deduplicate URLs** — don't add a URL to `to-load.md` if it's already there (loaded or unloaded)
- **Handle errors gracefully** — if a tool call fails, mark the URL with `[!]` in the manifest and continue with other URLs
