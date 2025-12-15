# confluence-analyze-page

Debug tool that performs the full Confluence integration workflow on a single page.

## Purpose

Executes the complete Confluence integration flow: fetches page, converts to markdown, scores relevance with LLM, and caches everything. Returns all data for debugging and testing.

This is the same workflow the combined tools use, but focused on a single page with full output visibility.

## When to Use

- Testing Confluence authentication and API access
- Debugging cache issues (stale data, missing caches)
- Testing relevance scoring for a specific page
- Verifying LLM analysis is working correctly
- Inspecting page content and markdown conversion
- Troubleshooting Confluence URL parsing (especially short links)

## Environment

Gated behind `ENABLE_CONFLUENCE_DEBUG_TOOLS=true` environment variable.

Requires an LLM provider (uses MCP sampling for relevance scoring).

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| pageUrl | No* | Full Confluence page URL |
| pageId | No* | Confluence page ID (use with siteName) |
| siteName | No* | Atlassian site name (e.g., "mycompany") |

*Must provide either `pageUrl` OR both `pageId` and `siteName`

## Workflow

1. **Parse URL** - Extract page ID and site from URL, resolve short links
2. **Fetch Page** - Call Confluence API for page content (ADF format)
3. **Convert Markdown** - Transform ADF to markdown
4. **Check Cache** - Determine if existing cache is valid
5. **Score Relevance** - Use LLM to score relevance for each tool (if not cached)
6. **Save to Cache** - Cache markdown and metadata with relevance scores
7. **Return All Data** - Output everything as YAML metadata + full markdown

## Output Sections

1. **URL Info** - Parsed URL components, short link resolution status
2. **Page Metadata** - Title, ID, space, version, last modified
3. **Cache Status** - fresh/cached/stale, wasCached flag, timestamps
4. **Relevance Analysis** - Document type, wasScored flag, per-tool scores with summaries
5. **Document Summary** - (If large doc was summarized) Key topics, lengths
6. **Full Markdown** - Complete page content in markdown format

## Example Usage

```
confluence-analyze-page pageUrl="https://mycompany.atlassian.net/wiki/spaces/PROJ/pages/123456/Requirements"
```

## Related Tools

- `analyze-feature-scope` - Uses Confluence context for scope analysis
- `write-shell-stories` - Uses Confluence context for story generation
- `write-next-story` - Uses Confluence context for detailed story writing
