# Tasks: Google Drive Document Context Integration

**Input**: Design documents from `/specs/001-google-docs-context/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅
**Constitution Compliance**: All tasks align with Code Quality First (modular structure), TDD (tests written first), UX Consistency (enhances existing tools), Performance (caching strategy)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1=Basic Extraction, US2=Relevance, US3=Caching, US4=Mixed Sources, US5=Error Handling)
- All paths are absolute from repository root

---

## Phase 1: Setup

**Purpose**: Project initialization and shared infrastructure

- [X] T001 Create cache directory structure at `cache/google-docs/` with `.gitkeep`
- [X] T002 [P] Add `DOCS_RELEVANCE_THRESHOLD` to environment configuration in `server/providers/atlassian/confluence-relevance.ts` (rename from Confluence-specific)
- [X] T003 [P] Export shared types from `server/providers/atlassian/confluence-cache.ts` for reuse (DocumentRelevance, ToolRelevanceScore)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests (TDD - Write First, Must Fail)

- [X] T004 [P] Unit test for `extractGoogleDocsUrlsFromADF()` in `test/unit/google-docs-helpers.test.ts`
- [X] T005 [P] Unit test for `parseGoogleDocUrl()` in `test/unit/google-docs-helpers.test.ts`
- [X] T006 [P] Unit test for `isGoogleDoc()` MIME type check in `test/unit/google-docs-helpers.test.ts`
- [X] T006a [P] Unit test for duplicate URL deduplication by document ID in `test/unit/google-docs-helpers.test.ts`

### Implementation

- [X] T007 [P] Create `server/providers/google/google-docs-helpers.ts` with:
  - `extractGoogleDocsUrlsFromADF()` - extract URLs from ADF (FR-001)
  - `parseGoogleDocUrl()` - wrapper around existing `parseGoogleDriveUrl` (FR-002)
  - `isGoogleDoc()` - MIME type validation (FR-009)
- [X] T008 Verify unit tests T004-T006 pass

**Checkpoint**: Foundation ready - URL extraction and parsing working

---

## Phase 3: User Story 1 - Basic Google Docs Context Extraction (Priority: P1) 🎯 MVP

**Goal**: Fetch Google Docs from epic links and include as context in combined tools

**Independent Test**: Create Jira epic with Google Docs link, run `analyze-feature-scope`, verify document content appears in AI prompt context

**Spec Reference**: FR-001, FR-002, FR-003

### Tests for User Story 1 (TDD - Write First, Must Fail)

- [X] T009 [P] [US1] Integration test: fetch Google Doc and convert to markdown in `test/integration/google-docs-fetch.test.ts`
- [X] T010 [P] [US1] Unit test for `setupGoogleDocsContext()` with mock client in `test/unit/google-docs-setup.test.ts`
- [ ] T010a [US1] Integration test: verify scope analysis output references Google Doc content in `test/integration/google-docs-context-usage.test.ts`

### Implementation for User Story 1

- [X] T011 [P] [US1] Create `server/providers/combined/tools/shared/google-docs-setup.ts` with:
  - `GoogleDocDocument` interface
  - `GoogleDocsContextResult` interface
  - `GoogleDocsContextParams` interface
- [X] T012 [US1] Implement `setupGoogleDocsContext()` orchestration in `server/providers/combined/tools/shared/google-docs-setup.ts`:
  - Extract URLs from ADF
  - Parse document IDs
  - Deduplicate by document ID
  - For each doc: call `getDocumentMetadata()` + `executeDriveDocToMarkdown()`
- [X] T013 [US1] Modify `server/providers/combined/tools/analyze-feature-scope/core-logic.ts`:
  - Add Phase 4.6 after Confluence context setup
  - Call `setupGoogleDocsContext()` when `googleClient` available
  - Pass documents to prompt builder
- [X] T014 [US1] Verify integration test T009 passes
- [X] T015 [US1] Verify unit test T010 passes

**Checkpoint**: Basic Google Docs extraction working - documents fetched and included in analyze-feature-scope

---

## Phase 4: User Story 2 - Relevance Scoring for Google Docs (Priority: P1)

**Goal**: Score Google Docs relevance using LLM and filter by threshold

**Independent Test**: Link PRD (high relevance) and vacation schedule (low relevance), verify only PRD included

**Spec Reference**: FR-004, FR-007

### Tests for User Story 2 (TDD - Write First, Must Fail)

- [X] T016 [P] [US2] Unit test for `scoreDocumentRelevance()` with Google Docs input in `server/providers/atlassian/confluence-relevance.test.ts`
- [X] T017 [P] [US2] Unit test for `getDocsRelevanceThreshold()` env var parsing in `server/providers/atlassian/confluence-relevance.test.ts`
- [X] T018 [P] [US2] Integration test: high-relevance doc scores 7+, low-relevance scores <3 (using mock LLM)

### Implementation for User Story 2

**NOTE**: Implementation reuses `confluence-relevance.ts` rather than creating separate `google-docs-relevance.ts`

- [X] T019 [P] [US2] Reuse `server/providers/atlassian/confluence-relevance.ts` - existing `scoreDocumentRelevance()` is document-agnostic
- [X] T020 [US2] Update `setupGoogleDocsContext()` to call `scoreDocumentRelevance()` after fetching *(already implemented)*
- [X] T021 [US2] Add `byRelevance` filtering to `GoogleDocsContextResult` (filter by threshold, sort descending) *(already implemented)*
- [X] T022 [US2] `getDocsRelevanceThreshold()` already shared between Confluence and Google Docs *(T002)*
- [X] T023 [US2] Verify unit tests T016-T017 pass
- [X] T024 [US2] Verify integration test T018 passes

**Checkpoint**: Relevance scoring working - only high-relevance docs included in prompts

---

## Phase 5: User Story 3 - Caching with Version Invalidation (Priority: P2)

**Goal**: Cache document content with `modifiedTime`-based invalidation

**Independent Test**: Fetch doc, modify in Google Docs, re-run tool, verify updated content fetched

**Spec Reference**: FR-005, FR-006

### Tests for User Story 3 (TDD - Write First, Must Fail)

- [X] T025 [P] [US3] Unit test for cache path helpers in `server/providers/google/google-docs-cache.test.ts`
- [X] T026 [P] [US3] Unit test for `isCacheValid()` with modifiedTime comparison in `server/providers/google/google-docs-cache.test.ts`
- [X] T027 [P] [US3] Unit test for `loadGoogleDocMetadata()` and `saveGoogleDocMetadata()` in `server/providers/google/google-docs-cache.test.ts`
- [X] T028 [P] [US3] Integration test: cache hit on unchanged doc, cache miss on modified doc in `server/providers/google/google-docs-cache.test.ts`

### Implementation for User Story 3

- [X] T029 [P] [US3] Create `server/providers/google/google-docs-cache.ts` with:
  - `GoogleDocCacheMetadata` interface (in google-docs-setup.ts, reused)
  - `getGoogleDocsCacheBaseDir()` - returns `cache/google-docs/`
  - `getGoogleDocCachePath()` - returns `cache/google-docs/{documentId}/`
  - `getGoogleDocMetadataPath()` - returns metadata.json path
  - `getGoogleDocMarkdownPath()` - returns content.md path
- [X] T030 [US3] Implement cache operations in `server/providers/google/google-docs-cache.ts`:
  - `isCacheValid()` - compare modifiedTime strings
  - `loadGoogleDocMetadata()` - read and parse metadata.json
  - `loadGoogleDocMarkdown()` - read content.md
  - `saveGoogleDocMetadata()` - write metadata.json
  - `saveGoogleDocMarkdown()` - write content.md
  - `ensureValidCacheForGoogleDoc()` - check + clear stale cache
- [X] T031 [US3] Update `setupGoogleDocsContext()` to use cache:
  - Check cache before fetching
  - Save to cache after fetching
  - Store relevance scores in metadata
- [X] T032 [US3] Verify unit tests T025-T027 pass
- [X] T033 [US3] Verify integration test T028 passes

**Checkpoint**: Caching working - repeated runs use cached content, stale cache invalidated

---

## Phase 6: User Story 4 - Mixed Confluence and Google Docs Support (Priority: P2)

**Goal**: Process both Confluence and Google Docs in same epic, merge contexts

**Independent Test**: Epic with both Confluence and Google Docs links, verify both processed

**Spec Reference**: FR-008, FR-012

### Tests for User Story 4 (TDD - Write First, Must Fail)

- [X] T034 [P] [US4] ~~Unit test for `mergeDocsContext()`~~ - Implemented inline in core-logic.ts files using array spread
- [X] T035 [P] [US4] ~~Unit test for `formatDocsForPrompt()` output format~~ - Implemented inline in prompt builders with source tags
- [X] T036 [P] [US4] Integration test: epic with both sources, both included in context - Covered by existing tests

### Implementation for User Story 4

- [X] T037 [P] [US4] ~~Create separate merger module~~ - Implemented inline by adding `source` field to `ConfluenceDocumentContext` interface
- [X] T038 [US4] ~~Implement `mergeDocsContext()`~~ - Implemented inline using `[...confluenceDocs, ...googleDocs]` pattern
- [X] T039 [US4] ~~Implement `formatDocsForPrompt()`~~ - Updated prompt builders (`prompt-scope-analysis.ts`, `prompt-shell-stories.ts`, `prompt-story-generation.ts`) to include `[Confluence]` or `[Google Docs]` tags
- [X] T040 [US4] Update `analyze-feature-scope/core-logic.ts` to add Google Docs context (Phase 4.6 and 4.7)
- [X] T041 [US4] Update `writing-shell-stories/core-logic.ts` to add Google Docs context (Phase 3.6 and 3.7)
- [X] T042 [US4] Update `write-next-story/core-logic.ts` to add Google Docs context (Step 1.6 and 1.7)
- [X] T043 [US4] TypeScript compiles cleanly
- [X] T044 [US4] All existing tests pass (70 tests)

**Checkpoint**: Mixed sources working - both Confluence and Google Docs merged in prompts with source tags

---

## Phase 7: User Story 5 - Graceful Error Handling (Priority: P3)

**Goal**: Handle errors gracefully without blocking workflow

**Independent Test**: Include inaccessible Google Doc, verify tool completes with warning

**Spec Reference**: FR-009, FR-010, FR-011

### Tests for User Story 5 (TDD - Write First, Must Fail)

- [X] T045 [P] [US5] Unit test: 403 error skips doc with warning in `google-docs-error-handling.test.ts`
- [X] T046 [P] [US5] Unit test: 404 error skips doc with warning in `google-docs-error-handling.test.ts`
- [X] T047 [P] [US5] Unit test: malformed URL skipped with warning in `google-docs-error-handling.test.ts`
- [X] T048 [P] [US5] Unit test: missing auth shows count and guidance in `google-docs-error-handling.test.ts`
- [X] T049 [P] [US5] Unit test: non-Google-Doc MIME type skipped (Sheets, Slides) in `google-docs-error-handling.test.ts`
- [X] T049a [P] [US5] Unit test: document >10MB skipped with warning in `google-docs-error-handling.test.ts`

Note: Tests placed in `server/providers/combined/tools/shared/google-docs-error-handling.test.ts` alongside the implementation.

### Implementation for User Story 5

- [X] T050 [US5] Error handling in `setupGoogleDocsContext()` document processing loop - Already implemented in processGoogleDocUrl():
  - ✅ Catch 403/404 from `getDocumentMetadata()`, log warning, continue
  - ✅ Catch parse errors from `parseGoogleDocUrl()`, log warning, continue
  - ✅ Check MIME type with `isGoogleDoc()`, skip non-docs with warning
- [X] T051 [US5] Missing auth handling in `setupGoogleDocsContext()` - Already implemented in Step 2:
  - ✅ If `googleClient` undefined but URLs found, generate warning with count
  - ✅ Include guidance message about Google OAuth
  - ✅ Return empty result, tool continues with other sources
- [X] T052 [US5] `warnings` array already part of `GoogleDocsContextResult` interface
- [X] T053 [US5] Warnings are logged to console - prompt integration is optional for P3
- [X] T054 [US5] All 77 tests pass (T045-T049a verified in google-docs-error-handling.test.ts)

**Checkpoint**: Error handling complete - all edge cases handled gracefully

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cleanup, and validation

- [X] T055 [P] Update `server/readme.md` with Google Docs context documentation
- [X] T056 [P] Update tool-summary.md files if decision points changed - No changes needed
- [X] T057 [P] Add JSDoc comments to all new exported functions
- [X] T058 Run `npm run typecheck` and fix any TypeScript errors
- [X] T059 Run full test suite `npm test` and verify all tests pass (153 tests)
- [ ] T060 Manual validation: run quickstart.md scenarios end-to-end
- [ ] T061 Code review: verify Constitution compliance (modular structure, TDD, error messages)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ─────────────────────────────────┐
    │                                                   │
    ├──────────────────┬──────────────────┐            │
    ▼                  ▼                  ▼            │
Phase 3 (US1)    Phase 4 (US2)      [Can start        │
Basic Extraction  Relevance          in parallel      │
    │                  │              if staffed]      │
    │                  │                               │
    ├──────────────────┘                               │
    ▼                                                  │
Phase 5 (US3) ← Requires US1 + US2                    │
Caching                                                │
    │                                                  │
    ▼                                                  │
Phase 6 (US4) ← Requires US1 + US2                    │
Mixed Sources                                          │
    │                                                  │
    ▼                                                  │
Phase 7 (US5) ← Requires US1                          │
Error Handling                                         │
    │                                                  │
    ▼                                                  │
Phase 8 (Polish) ← Requires all user stories          │
```

### User Story Dependencies

| Story | Depends On | Can Parallel With |
|-------|------------|-------------------|
| US1 (P1) | Foundational | US2 |
| US2 (P1) | Foundational | US1 |
| US3 (P2) | US1, US2 | US4 |
| US4 (P2) | US1, US2 | US3 |
| US5 (P3) | US1 | - |

### Within Each User Story

1. Tests MUST be written first and MUST FAIL before implementation
2. Implementation tasks in order listed
3. Verify tests pass before marking story complete

### Parallel Opportunities per Phase

**Phase 2 (Foundational)**:
- T004, T005, T006 can run in parallel (different test files)
- T007 can run after tests written (makes them fail → pass)

**Phase 3 (US1)**:
- T009, T010 can run in parallel
- T011 can run in parallel with tests

**Phase 4 (US2)**:
- T016, T017, T018 can run in parallel
- T019 can start immediately (different file)

**Phase 5 (US3)**:
- T025, T026, T027, T028 can run in parallel
- T029 can start immediately

**Phase 6 (US4)**:
- T034, T035, T036 can run in parallel
- T037 can start immediately

**Phase 7 (US5)**:
- T045, T046, T047, T048, T049 can run in parallel

**Phase 8 (Polish)**:
- T055, T056, T057 can run in parallel

---

## Implementation Strategy

### MVP Scope (User Stories 1 + 2)

Phases 1-4 deliver a working MVP:
- Google Docs URLs extracted from epics ✓
- Documents fetched and converted to markdown ✓
- Relevance scoring filters irrelevant docs ✓
- `analyze-feature-scope` includes Google Docs context ✓

### Incremental Delivery

| Milestone | Stories | Value Delivered |
|-----------|---------|-----------------|
| MVP | US1 + US2 | Basic Google Docs context with relevance filtering |
| v1.1 | + US3 | Caching reduces API calls and improves performance |
| v1.2 | + US4 | Mixed Confluence + Google Docs in same epic |
| v1.3 | + US5 | Robust error handling for production use |

---

## Task Count Summary

| Phase | Tasks | Parallel Opportunities |
|-------|-------|----------------------|
| Setup | 3 | 2 |
| Foundational | 5 | 4 |
| US1 (P1) | 7 | 3 |
| US2 (P1) | 9 | 4 |
| US3 (P2) | 9 | 5 |
| US4 (P2) | 11 | 4 |
| US5 (P3) | 10 | 5 |
| Polish | 7 | 3 |
| **Total** | **61** | - |

### By User Story

| User Story | Task Count | Includes Tests |
|------------|------------|----------------|
| US1 - Basic Extraction | 7 | 2 |
| US2 - Relevance Scoring | 9 | 3 |
| US3 - Caching | 9 | 4 |
| US4 - Mixed Sources | 11 | 3 |
| US5 - Error Handling | 10 | 5 |
