# 036-gdocs-markdown

## Status
Implemented

## What it proposes
Add an MCP tool and REST API endpoint that accepts a Google Drive document URL and returns the document content converted to GitHub-flavored Markdown. The conversion works by exporting the Google Doc as HTML via the Google Drive API, then transforming that HTML into Markdown using a custom conversion helper.

## Architectural decisions made
- Dual-interface pattern: both MCP tool (`drive-doc-to-markdown`) and REST API endpoint (`/api/drive-doc-to-markdown`)
- HTML export path: uses Google Drive API native HTML export (`mimeType: text/html`) rather than direct Docs API
- Custom HTML-to-Markdown conversion via `conversion-helpers.ts` (using `linkedom` for DOM parsing)
- Caching layer at `cache/google-docs/` with cache invalidation support
- Shared `core-logic.ts` keeps business logic out of both the MCP wrapper and REST wrapper
- URL parser supports multiple Google Drive URL formats with `GOOGLE_DOCS_URL_PATTERN` constant
- Only Google Docs are supported (Sheets, Slides, PDFs explicitly rejected with clear errors)
- Error handling covers: invalid URLs, permission errors (403), not found (404), unsupported file types, file size limits (>10MB), API rate limiting with exponential backoff

## What still needs implementing
Fully implemented.
