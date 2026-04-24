# 28-confluence.md

## Status
Implemented

## What it proposes
Integrate Confluence pages linked from Jira epic descriptions as additional context for the combined tools (`analyze-feature-scope`, `write-shell-stories`, `write-next-story`). The spec covers URL extraction from ADF, fetching/caching page content, relevance scoring per tool, and injecting summarized document content into LLM prompts.

## Architectural decisions made
- Follow the established Figma caching pattern: cache by page ID under `cache/confluence-pages/{pageId}/`, timestamp-validated
- Use Confluence v2 API with `atlas_doc_format` (ADF) so existing `convertAdfToMarkdown()` can be reused
- Extract Confluence URLs from ADF `inlineCard` nodes and `text` nodes with link marks
- Resolve short links (`/wiki/x/{shortId}`) via redirect following with in-memory cache
- Score document relevance per tool using tool summary markdown files co-located with each tool
- `setupConfluenceContext()` as the idempotent orchestration helper shared across tools
- `confluence-helpers.ts` in the Atlassian provider for URL parsing and API calls
- `confluence-cache.ts` for caching infrastructure with 7-day retention

## What still needs implementing
Fully implemented.
