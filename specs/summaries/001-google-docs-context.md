# 001-google-docs-context

## Status
Implemented

## What it proposes
Enable Google Drive document links in Jira epic descriptions to provide additional context for `analyze-feature-scope`, `write-shell-stories`, and `write-next-story` tools—mirroring the existing Confluence integration. The system extracts Google Docs URLs from epic descriptions, fetches document content via Google Drive API, scores relevance with LLM, caches with version-based invalidation, and includes relevant docs in AI prompts.

## Architectural decisions made
- Single unified "Referenced Documentation" prompt section with source type tags (`[Google Docs]`, `[Confluence]`) sorted by relevance
- Reactive 403/404 error handling (attempt fetch, skip with warning on failure) rather than pre-validating permissions
- Single shared `DOCS_RELEVANCE_THRESHOLD` for both Google Docs and Confluence
- Sequential document processing per doc (metadata + export together) since Google Drive API lacks batch export
- Version-based cache invalidation using `modifiedTime` from Drive API metadata
- Google authentication is optional; tools continue without Google Docs context if unauthenticated (with warning)
- Only Google Docs supported (Sheets/Slides skipped with warning)

## What still needs implementing
Fully implemented.
