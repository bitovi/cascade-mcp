# Implementation Plan: Google Drive Document Context Integration

**Branch**: `001-google-docs-context` | **Date**: 2026-01-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-google-docs-context/spec.md`

## Summary

Enable Google Drive document links in Jira epic descriptions to provide additional context for the combined tools (`analyze-feature-scope`, `write-shell-stories`, `write-next-story`), mirroring the existing Confluence integration. The implementation follows the established Confluence pattern: extract URLs from ADF → fetch/convert to markdown → score relevance via LLM → cache with version invalidation → include in AI prompts.

**Technical Approach**: Mirror the `confluence-setup.ts` / `confluence-cache.ts` / `confluence-relevance.ts` pattern with new Google-specific modules. Reuse existing Google Drive API client and `drive-doc-to-markdown` conversion logic. Unified documentation context merges both sources sorted by relevance.

## Technical Context

**Language/Version**: TypeScript (ES2022 target, strict mode enabled via tsconfig.json)  
**Primary Dependencies**: @modelcontextprotocol/sdk, Google Drive API (via fetch wrapper in google-api-client.ts), ai (AI SDK for LLM providers)  
**Storage**: File-based cache at `cache/google-docs/{documentId}/` (metadata.json + content.md)  
**Testing**: Jest (unit, integration, e2e patterns established; e2e tests in `test/e2e/`)  
**Target Platform**: Node.js server (Express), deployed via Docker  
**Project Type**: Single monorepo with `server/` (backend) and `src/` (React frontend)  
**Performance Goals**: Document fetch + conversion < 5s per document; cache hits < 50ms  
**Constraints**: Google Drive API rate limits (1000 req/100s); max document size 10MB  
**Scale/Scope**: Typically 1-5 Google Docs per epic; relevance scoring requires LLM call per document

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Code Quality First**: Modular architecture planned with proper folder structure (`server/providers/google/` for cache/relevance, `server/providers/combined/tools/shared/` for setup). TypeScript strict mode enforced. Documentation in `server/readme.md` will be updated.
- [x] **Test-Driven Development**: TDD workflow planned. Test types: unit tests for cache/relevance modules, integration tests for Google API + LLM scoring, e2e tests for full tool flow. Helper functions exported for testability.
- [x] **User Experience Consistency**: Not a new tool, enhances existing MCP+REST tools. Both OAuth (Google token) and PAT (via headers) paths supported. Error messages include actionable guidance (e.g., "Google Docs found but no authentication - run with Google OAuth").
- [x] **Performance & Reliability**: Cache invalidation via `modifiedTime` comparison. Existing GoogleClient handles token lifecycle. Cache stored in `cache/google-docs/` with version-based invalidation.

**Violations Requiring Justification**: None - feature follows established patterns.

## Project Structure

### Documentation (this feature)

```text
specs/001-google-docs-context/
├── plan.md              # This file
├── research.md          # Phase 0 output - design decisions
├── data-model.md        # Phase 1 output - entity definitions
├── quickstart.md        # Phase 1 output - implementation guide
├── contracts/           # Phase 1 output - N/A (no new external APIs)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── providers/
│   ├── google/
│   │   ├── google-docs-cache.ts      # NEW: Cache management (mirrors confluence-cache.ts)
│   │   ├── google-docs-relevance.ts  # NEW: LLM relevance scoring (mirrors confluence-relevance.ts)
│   │   ├── google-docs-helpers.ts    # NEW: URL extraction from ADF, document processing
│   │   ├── google-api-client.ts      # EXISTING: GoogleClient with fetch wrapper
│   │   ├── google-helpers.ts         # EXISTING: getDocumentMetadata, exportDocumentAsHTML
│   │   └── tools/drive-doc-to-markdown/
│   │       └── url-parser.ts         # EXISTING: parseGoogleDriveUrl
│   ├── atlassian/
│   │   ├── confluence-cache.ts       # REFERENCE: Pattern to mirror
│   │   ├── confluence-relevance.ts   # REFERENCE: Pattern to mirror
│   │   └── confluence-helpers.ts     # REFERENCE: extractConfluenceUrlsFromADF pattern
│   └── combined/tools/
│       ├── shared/
│       │   ├── confluence-setup.ts   # EXISTING: setupConfluenceContext
│       │   ├── google-docs-setup.ts  # NEW: setupGoogleDocsContext (mirrors confluence-setup.ts)
│       │   └── docs-context-merger.ts # NEW: Merge + sort Confluence + Google Docs by relevance
│       ├── analyze-feature-scope/
│       │   └── core-logic.ts         # MODIFY: Add Phase 4.6 Google Docs context
│       ├── writing-shell-stories/
│       │   └── core-logic.ts         # MODIFY: Add Google Docs context
│       └── write-next-story/
│           └── core-logic.ts         # MODIFY: Add Google Docs context

cache/
└── google-docs/                      # NEW: Cache directory
    └── {documentId}/
        ├── metadata.json             # GoogleDocMetadata
        └── content.md                # Converted markdown

test/
├── unit/
│   ├── google-docs-cache.test.ts     # NEW: Cache unit tests
│   └── google-docs-helpers.test.ts   # NEW: URL extraction tests
└── integration/
    └── google-docs-relevance.test.ts # NEW: LLM scoring tests
```

**Structure Decision**: Follows established provider pattern with Google-specific modules in `server/providers/google/` and shared setup in `server/providers/combined/tools/shared/`.

## Phase 0: Research

### Research Tasks

1. **Google Drive API Patterns**: Best practices for document metadata caching and content export
2. **Cache Invalidation Strategy**: How `modifiedTime` compares to Confluence's `versionNumber`
3. **URL Extraction from ADF**: Pattern for extracting Google Docs URLs from Jira ADF content
4. **Unified Relevance Threshold**: How to share threshold between Confluence and Google Docs

### Research Findings

See [research.md](./research.md) for detailed findings.

**Key Decisions:**
- **Cache Key**: Use document ID (extracted from URL) as cache directory name
- **Version Check**: Compare `modifiedTime` ISO timestamp; cache miss if different
- **URL Pattern**: Match `docs.google.com/document/d/{id}` in ADF link nodes (same as Confluence pattern)
- **Shared Threshold**: Single `DOCS_RELEVANCE_THRESHOLD` env var (default 3.0) applies to both sources
- **Sequential Processing**: Process documents one-by-one (no batch export in Google Drive API)

## Phase 1: Design

### Data Model

See [data-model.md](./data-model.md) for complete entity definitions.

**Key Entities:**
- `GoogleDocMetadata` - Cached document metadata with relevance scores
- `GoogleDocsContextResult` - Processed documents filtered by tool relevance
- `GoogleDocumentContext` - Document content for prompt inclusion
- `UnifiedDocsContext` - Merged Confluence + Google Docs sorted by relevance

### Contracts

No new external APIs exposed. This feature enhances existing tools' internal behavior.

**Internal Interfaces:**
- `setupGoogleDocsContext(params)` → `GoogleDocsContextResult`
- `mergeDocsContext(confluence, googleDocs, toolId)` → `UnifiedDocsContext`

### Implementation Phases

#### Phase 1.1: Core Infrastructure (FR-001, FR-002, FR-005, FR-006)
- `google-docs-helpers.ts`: Extract Google Docs URLs from ADF
- `google-docs-cache.ts`: Cache management with version invalidation

#### Phase 1.2: Content Processing (FR-003, FR-009)
- Integrate with existing `drive-doc-to-markdown` for content conversion
- Add MIME type filtering (skip Sheets, Slides)

#### Phase 1.3: Relevance Scoring (FR-004, FR-007)
- `google-docs-relevance.ts`: LLM scoring using tool summaries
- Shared threshold configuration

#### Phase 1.4: Context Setup (FR-008, FR-012)
- `google-docs-setup.ts`: Orchestrate extraction → fetch → score → cache
- `docs-context-merger.ts`: Unified documentation section for prompts

#### Phase 1.5: Tool Integration (FR-010, FR-011)
- Modify `analyze-feature-scope/core-logic.ts`: Add Phase 4.6
- Modify `write-shell-stories` and `write-next-story` similarly
- Handle missing Google auth with user-friendly warnings

#### Phase 1.6: Error Handling (Edge Cases)
- 403/404 graceful skip with warnings
- Malformed URL handling
- Large document (>10MB) skip
- Missing authentication guidance

### Quickstart

See [quickstart.md](./quickstart.md) for step-by-step implementation guide.

## Complexity Tracking

> No constitution violations identified.

| Area | Complexity | Mitigation |
|------|------------|------------|
| LLM Cost | Each document requires relevance scoring LLM call | Cache scores in metadata; reuse on cache hit |
| Rate Limits | Google Drive API has quotas | Sequential processing; exponential backoff on 429 |
| Mixed Sources | Merging two doc sources requires sorting | Single relevance threshold; unified context builder |
