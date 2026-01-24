# Feature Specification: Google Drive Document Context Integration

**Feature Branch**: `001-google-docs-context`  
**Created**: January 23, 2026  
**Status**: Draft  
**Input**: User description: "I'd like to have the same behavior with google drive document links."

## Overview

Enable Google Drive document links (Google Docs) in Jira epic descriptions to provide additional context for the `analyze-feature-scope`, `write-shell-stories`, and `write-next-story` tools—mirroring the existing Confluence integration.

When a Jira epic contains Google Docs URLs, the system will:
1. Extract and parse the URLs from the epic's ADF content
2. Fetch document content via Google Drive API (convert to markdown)
3. Score document relevance using LLM against tool summaries
4. Cache documents with version-based invalidation
5. Include relevant documents as context in AI prompts

## Clarifications

### Session 2026-01-23

- Q: How should Google Docs be included in the AI prompt alongside Confluence documents? → A: Single unified "Referenced Documentation" section with source type tags (e.g., `[Google Docs]`, `[Confluence]`) and document titles, sorted by relevance. This allows the AI to interpret epic instructions like "Follow the 'Specs' Google Doc over the 'Meeting Notes' Confluence page."
- Q: Should Google Docs sharing permissions be validated before attempting to fetch content? → A: Reactive handling—attempt to fetch content directly; if 403/404, log warning and skip document. Simpler, matches Confluence pattern, avoids extra API call.
- Q: Should Google Docs and Confluence share a single relevance threshold, or have separate thresholds? → A: Single shared threshold (e.g., `DOCS_RELEVANCE_THRESHOLD`) for both Google Docs and Confluence. Simpler configuration, consistent behavior.
- Q: How should multiple Google Docs be processed? → A: Fully sequential processing (metadata + export together for each doc). Google Drive API doesn't support batch exports, so batching metadata only adds complexity for marginal gain. Matches Confluence pattern.

## User Scenarios & Testing *(mandatory)*

<!--
  User stories prioritized by importance. Each is independently testable.
-->

### User Story 1 - Basic Google Docs Context Extraction (Priority: P1)

A product manager has requirements documented in Google Docs instead of (or in addition to) Confluence. When they run `analyze-feature-scope` on an epic that contains Google Docs links, the tool automatically fetches those documents and uses them as context for scope analysis.

**Why this priority**: This is the core value proposition—teams using Google Docs for documentation need the same context enrichment that Confluence users get.

**Independent Test**: Create a Jira epic with a Google Docs link in the description, run `analyze-feature-scope`, and verify the scope analysis references information from the Google Doc.

**Acceptance Scenarios**:

1. **Given** a Jira epic with a Google Docs URL in the description (e.g., `https://docs.google.com/document/d/abc123/edit`), **When** `analyze-feature-scope` is called, **Then** the document content is fetched, converted to markdown, and included in the AI prompt context.

2. **Given** a Jira epic with multiple Google Docs URLs, **When** any combined tool is called, **Then** all unique documents are processed (deduplicated by document ID).

3. **Given** a Google Doc with requirements about what's in-scope vs out-of-scope, **When** `analyze-feature-scope` runs, **Then** the scope analysis correctly categorizes features based on that document's guidance.

---

### User Story 2 - Relevance Scoring for Google Docs (Priority: P1)

Not all linked documents are equally relevant to each tool. The system scores Google Docs for relevance (just like Confluence pages) and only includes documents that meet the relevance threshold.

**Why this priority**: Without relevance scoring, irrelevant documents would dilute prompt context and potentially confuse the AI, degrading output quality.

**Independent Test**: Link both a PRD (high relevance) and a team vacation schedule (low relevance) in an epic, run a tool, and verify only the PRD is included in context.

**Acceptance Scenarios**:

1. **Given** a Google Doc with requirements/PRD content, **When** relevance is scored, **Then** it receives a high score (7+) for `analyze-feature-scope`.

2. **Given** a Google Doc with unrelated content (meeting notes, vacation schedule), **When** relevance is scored, **Then** it receives a low score (<3) and is excluded from prompts.

3. **Given** the `GOOGLE_DOCS_RELEVANCE_THRESHOLD` environment variable is set to 5.0, **When** a document scores 4.5, **Then** it is excluded from the tool's context.

---

### User Story 3 - Caching with Version Invalidation (Priority: P2)

Google Docs are frequently updated. The system caches document content and metadata but invalidates the cache when the document is modified.

**Why this priority**: Caching improves performance and reduces API quota usage, but stale cache would cause tools to use outdated requirements.

**Independent Test**: Fetch a Google Doc, modify it in Google Docs, re-run the tool, and verify the updated content is fetched.

**Acceptance Scenarios**:

1. **Given** a Google Doc that has been previously cached, **When** the same epic is processed again within the cache validity period and the document hasn't changed, **Then** the cached markdown is used (no API call to export).

2. **Given** a cached Google Doc that has been modified (new `modifiedTime`), **When** the epic is processed, **Then** the cache is invalidated and fresh content is fetched.

3. **Given** a Google Doc, **When** it is first fetched, **Then** metadata (ID, title, modifiedTime, relevance scores) and markdown content are saved to the cache directory.

---

### User Story 4 - Mixed Confluence and Google Docs Support (Priority: P2)

Teams may use both Confluence and Google Docs. The system processes both types of links in the same epic and merges their contexts.

**Why this priority**: Many organizations use both tools; requiring exclusivity would limit adoption.

**Independent Test**: Create an epic with both Confluence and Google Docs links, run `analyze-feature-scope`, and verify both are processed and included.

**Acceptance Scenarios**:

1. **Given** a Jira epic with both Confluence URLs and Google Docs URLs, **When** `analyze-feature-scope` is called, **Then** both document types are extracted, processed, scored, and included in context.

2. **Given** conflicting information between a Confluence page and a Google Doc, **When** the AI generates scope analysis, **Then** the epic description takes precedence (per existing behavior) and a question may be raised about the conflict.

---

### User Story 5 - Graceful Error Handling (Priority: P3)

Document fetching can fail for various reasons (permissions, deleted docs, API errors, missing authentication). The system handles errors gracefully without blocking the entire workflow.

**Why this priority**: Robustness is important but not core functionality.

**Independent Test**: Include a Google Docs link that the user doesn't have access to, run the tool, and verify it completes with a warning rather than failing.

**Acceptance Scenarios**:

1. **Given** a Google Docs URL that returns 403 (permission denied), **When** processing the epic, **Then** a warning is logged, the document is skipped, and processing continues with other documents.

2. **Given** a Google Docs URL that returns 404 (document not found), **When** processing the epic, **Then** a warning is logged and processing continues.

3. **Given** a malformed Google Docs URL that cannot be parsed, **When** processing the epic, **Then** a warning is logged and processing continues with valid URLs.

4. **Given** an epic with Google Docs URLs but the user has not authenticated with Google, **When** processing the epic, **Then** a clear warning is displayed indicating Google Docs were found but cannot be fetched due to missing authentication, and the tool continues processing other content (Figma, Confluence).

---

### Edge Cases

- **Non-Google-Docs files**: When a Google Sheets or Google Slides URL is linked, it is skipped with a warning (only Google Docs are supported).
  
- **Missing Google OAuth**: If Google authentication is not available but Google Docs URLs are found in the epic:
  - A warning message is displayed to the user explaining that Google Docs were detected but cannot be accessed
  - The warning includes guidance on how to authenticate with Google
  - The tool continues processing without Google Docs context (Confluence and Figma still work)
  - The final output notes that some context sources were unavailable
  
- **Very large documents**: Documents exceeding 10MB are skipped with a warning (matching existing `drive-doc-to-markdown` behavior).
  
- **Duplicate links**: The same document linked multiple times is deduplicated by document ID and processed once.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST extract Google Docs URLs from Jira epic ADF content (same extraction pattern as Confluence URLs).

- **FR-002**: System MUST parse Google Docs URLs to extract document IDs, supporting:
  - Standard format: `https://docs.google.com/document/d/{id}/edit`
  - Mobile format: `https://docs.google.com/document/u/0/d/{id}/...`
  - Direct link: `https://docs.google.com/document/d/{id}`

- **FR-003**: System MUST fetch Google Doc content via Drive API and convert to markdown (reusing existing `drive-doc-to-markdown` logic).

- **FR-004**: System MUST score document relevance using LLM against tool summaries (same pattern as Confluence relevance scoring).

- **FR-005**: System MUST cache Google Docs content and metadata to `cache/google-docs/{documentId}/` directory.

- **FR-006**: System MUST invalidate cache when document `modifiedTime` changes (version-based invalidation).

- **FR-007**: System MUST filter documents by relevance threshold before including in prompts (configurable via shared `DOCS_RELEVANCE_THRESHOLD` env var, default 3.0, applies to both Google Docs and Confluence).

- **FR-008**: System MUST support Google Docs alongside Confluence docs in the same epic (merged context).

- **FR-009**: System MUST skip non-Google-Docs files (Sheets, Slides, PDFs) with a warning.

- **FR-010**: System MUST handle authentication errors gracefully—if Google OAuth is unavailable, Google Docs extraction is skipped but the tool continues.

- **FR-011**: When Google Docs URLs are detected but Google authentication is missing, system MUST display a user-friendly warning that includes:
  - The number of Google Docs links found that cannot be processed
  - Clear indication that Google authentication is required
  - The tool continues with available context sources (Figma, Confluence, epic description)

- **FR-012**: In AI prompts, Google Docs and Confluence pages MUST be presented in a single unified "Referenced Documentation" section, sorted by relevance score. Each document MUST include:
  - Document title
  - Source type tag (e.g., `[Google Docs]` or `[Confluence]`)
  - This enables the AI to correctly interpret epic instructions like "Follow the 'Specs' Google Doc over the 'Meeting Notes' Confluence page"

### Key Entities

- **GoogleDocMetadata**: Document ID, title, modifiedTime, mimeType, cached relevance scores, cached markdown path.
  
- **GoogleDocsContextResult**: Processed documents array, documents filtered by tool relevance (similar to `ConfluenceContextResult`).

- **GoogleDocumentContext**: Title, URL, markdown content, document type, relevance score, summary (passed to prompt builders).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can link Google Docs in Jira epics and have their content automatically included as context in `analyze-feature-scope`, `write-shell-stories`, and `write-next-story` tools.

- **SC-002**: Irrelevant Google Docs (scoring below threshold) are excluded from prompts, maintaining output quality.

- **SC-003**: Repeated tool runs on the same epic with unchanged Google Docs use cached content, reducing API calls and improving response time.

- **SC-004**: Tool execution completes successfully even when some Google Docs are inaccessible, with clear warnings about skipped documents.

- **SC-005**: Users without Google authentication receive clear, actionable feedback when Google Docs links are detected in their epic.

- **SC-006**: Teams using both Confluence and Google Docs can link both in the same epic and receive context from both sources.

## Assumptions

- Google OAuth integration is already available (per existing `001-google-drive-oauth` work and `google-api-client.ts`).
- The `drive-doc-to-markdown` conversion logic (HTML export → markdown) can be reused.
- The relevance scoring prompt and logic from `confluence-relevance.ts` can be adapted for Google Docs.
- Cache directory structure follows the existing pattern (`cache/confluence-pages/{pageId}/` → `cache/google-docs/{documentId}/`).

## Dependencies

- Existing Google OAuth flow and `GoogleClient` from `server/providers/google/google-api-client.ts`
- Existing `parseGoogleDriveUrl` from `server/providers/google/tools/drive-doc-to-markdown/url-parser.ts`
- Existing `executeDriveDocToMarkdown` logic for fetching and converting documents
- Existing relevance scoring pattern from `server/providers/atlassian/confluence-relevance.ts`
- Existing cache management pattern from `server/providers/atlassian/confluence-cache.ts`
