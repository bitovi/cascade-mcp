# Research: Google Drive Document Context Integration

**Feature**: 001-google-docs-context  
**Date**: 2026-01-23

## Research Questions

### 1. Google Drive API Patterns for Caching and Export

**Question**: What are the best practices for caching Google Drive document metadata and content?

**Research Findings**:

The existing `google-helpers.ts` already implements the key patterns:
- `getDocumentMetadata(client, documentId)` - Fetches `id`, `name`, `mimeType`, `modifiedTime`, `size`
- `exportDocumentAsHTML(client, documentId)` - Exports Google Docs as HTML for conversion

**Decision**: Reuse existing functions. Cache structure will store:
- `metadata.json` - Document metadata including `modifiedTime` for version checking
- `content.md` - Converted markdown content

**Rationale**: Existing code is well-tested and handles error cases (403, 404, 429) with user-friendly messages.

**Alternatives Considered**:
- Direct Drive API calls without helper abstraction → Rejected: Would duplicate error handling
- Using Google Docs API instead of Drive API → Rejected: Drive API is simpler for export

---

### 2. Cache Invalidation Strategy

**Question**: How does Google Drive's `modifiedTime` compare to Confluence's `versionNumber` for cache invalidation?

**Research Findings**:

| Aspect | Confluence | Google Docs |
|--------|------------|-------------|
| Version identifier | `versionNumber` (integer) | `modifiedTime` (ISO 8601 timestamp) |
| Update granularity | Explicit saves | Auto-save (continuous) |
| API field | `version.number` | `modifiedTime` |
| Comparison | Simple integer compare | String comparison (ISO format sorts correctly) |

**Decision**: Compare cached `modifiedTime` string against API response. Cache miss if different.

**Rationale**: ISO 8601 timestamps can be compared as strings (lexicographic order matches chronological order). Simple and reliable.

**Alternatives Considered**:
- Hash-based comparison → Rejected: Requires fetching content to compute hash, defeats caching purpose
- Time-based TTL only → Rejected: Misses live edits within TTL window

---

### 3. URL Extraction from ADF

**Question**: What pattern should be used to extract Google Docs URLs from Jira ADF content?

**Research Findings**:

The existing `extractUrlsFromADF()` utility in `adf-utils.ts` supports:
- `inlineCard` nodes (embedded smart links)
- Text nodes with `link` marks (hyperlinks)
- Plain text URLs (regex fallback)

Pattern for Confluence:
```typescript
extractUrlsFromADF(adf, {
  urlPattern: 'atlassian.net/wiki',
  plainTextRegex: /https?:\/\/[^\s]+atlassian\.net\/wiki[^\s]*/g,
});
```

**Decision**: Create equivalent function for Google Docs:
```typescript
export function extractGoogleDocsUrlsFromADF(adf: ADFDocument): string[] {
  return extractUrlsFromADF(adf, {
    urlPattern: 'docs.google.com/document',
    plainTextRegex: /https?:\/\/docs\.google\.com\/document\/[^\s]*/g,
  });
}
```

**Rationale**: Follows established pattern, reuses battle-tested URL extraction logic.

**Alternatives Considered**:
- Custom ADF traversal → Rejected: Would duplicate existing logic
- Match all google.com URLs → Rejected: Would include Sheets, Slides, Drive folders

---

### 4. Unified Relevance Threshold

**Question**: Should Google Docs and Confluence share a single relevance threshold?

**Research Findings**:

Current Confluence implementation uses:
- `CONFLUENCE_RELEVANCE_THRESHOLD` environment variable
- Default value: 3.0
- Retrieved via `getRelevanceThreshold()` function

Both document types are scored by the same LLM prompt against the same tool summaries, producing comparable scores.

**Decision**: Single shared threshold:
- Environment variable: `DOCS_RELEVANCE_THRESHOLD` (rename from Confluence-specific)
- Default: 3.0
- Shared `getDocsRelevanceThreshold()` function used by both sources

**Rationale**: Same scoring methodology should use same threshold. Simplifies configuration. Per the spec clarifications: "Single shared threshold for both Google Docs and Confluence."

**Alternatives Considered**:
- Separate thresholds per source → Rejected: Added complexity, no scoring methodology difference
- Hardcoded threshold → Rejected: Reduces flexibility for tuning

---

### 5. Sequential vs Batch Processing

**Question**: Should Google Docs be processed in parallel or sequentially?

**Research Findings**:

Google Drive API limitations:
- Batch API supports only metadata operations, NOT exports
- Export endpoint (`/files/{id}/export`) must be called individually
- Rate limit: 1000 requests per 100 seconds (10 req/s average)

Confluence pattern processes pages sequentially, which works well.

**Decision**: Fully sequential processing (metadata + export together for each doc).

**Rationale**: Per spec clarifications: "Google Drive API doesn't support batch exports, so batching metadata only adds complexity for marginal gain."

**Alternatives Considered**:
- Parallel exports → Rejected: Risk of rate limiting with multiple large docs
- Batch metadata + sequential export → Rejected: Added complexity for minimal benefit

---

## Implementation Decisions Summary

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Cache structure | `cache/google-docs/{documentId}/` | Mirrors Confluence pattern |
| Version check | Compare `modifiedTime` strings | ISO 8601 sorts correctly |
| URL extraction | Use `extractUrlsFromADF()` with Google pattern | Reuses proven utility |
| Threshold | Single shared `DOCS_RELEVANCE_THRESHOLD` | Same scoring = same threshold |
| Processing | Sequential per-document | No batch export API support |
| Content conversion | Reuse `drive-doc-to-markdown` | Already implemented and tested |
| Relevance scoring | Adapt `confluence-relevance.ts` pattern | Same prompt structure |

---

## Open Questions Resolved

All NEEDS CLARIFICATION items from spec have been resolved through the clarification session:

1. ✅ Document presentation in prompts → Unified "Referenced Documentation" section with source tags
2. ✅ Permission validation → Reactive handling (attempt fetch, handle 403/404)
3. ✅ Relevance threshold → Single shared threshold
4. ✅ Processing strategy → Sequential (no batch export support)

---

## Dependencies Validated

| Dependency | Status | Notes |
|------------|--------|-------|
| `GoogleClient` | ✅ Exists | `server/providers/google/google-api-client.ts` |
| `parseGoogleDriveUrl` | ✅ Exists | `server/providers/google/tools/drive-doc-to-markdown/url-parser.ts` |
| `getDocumentMetadata` | ✅ Exists | `server/providers/google/google-helpers.ts` |
| `exportDocumentAsHTML` | ✅ Exists | `server/providers/google/google-helpers.ts` |
| `extractUrlsFromADF` | ✅ Exists | `server/providers/atlassian/adf-utils.ts` |
| `loadToolSummaries` | ✅ Exists | `server/providers/atlassian/confluence-relevance.ts` |
| HTML to Markdown | ✅ Exists | `drive-doc-to-markdown/core-logic.ts` uses Turndown |
