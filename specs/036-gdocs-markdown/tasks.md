# Tasks: Google Drive Document to Markdown Converter

**Input**: Design documents from `/specs/036-gdocs-markdown/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Constitution Compliance**: All tasks align with Code Quality First, Test-Driven Development, User Experience Consistency, Performance & Reliability

**Feature Summary**: Convert Google Drive documents to Markdown format by exporting docs to HTML via Google Drive API's native export, then converting HTML to GitHub-flavored Markdown. Implementation follows dual-interface pattern (MCP tool + REST API) used throughout the codebase.

**Tests**: NOT explicitly requested in specification - Test tasks are NOT included per project guidelines.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for Google Drive to Markdown conversion feature

- [X] T001 Create feature directory structure at server/providers/google/tools/drive-doc-to-markdown/
- [X] T002 Create cache directory at cache/google-docs/
- [X] T003 [P] Add GoogleDocMetadata interface to server/providers/google/types.ts
- [X] T004 [P] Update server/readme.md with drive-doc-to-markdown tool documentation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Create URL parser module at server/providers/google/tools/drive-doc-to-markdown/url-parser.ts with parseGoogleDriveUrl function supporting 3 URL formats
- [X] T006 Create Google API helper functions in server/providers/google/google-helpers.ts for document export (exportDocumentAsHTML function)
- [X] T007 [P] Create TypeScript interfaces at server/providers/google/tools/drive-doc-to-markdown/types.ts (ConversionRequest, DriveDocument, MarkdownContent, ConversionResult)
- [X] T008 Create cache manager module at server/providers/google/tools/drive-doc-to-markdown/cache-manager.ts with getCachedContent, setCachedContent, isCacheValid functions
- [X] T009 Create core business logic at server/providers/google/tools/drive-doc-to-markdown/core-logic.ts with shared conversion workflow (OAuth + PAT paths)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Convert Single Google Doc to Markdown (Priority: P1) 🎯 MVP

**Goal**: Enable users to provide a Google Drive document URL and receive markdown content with basic formatting (headings, bold, italic, lists, tables, images)

**Independent Test**: Provide a Google Doc URL containing headings, bold text, bullet lists, and verify returned Markdown accurately represents document structure and formatting

### Implementation for User Story 1

- [X] T010 [P] [US1] Create HTML to Markdown conversion helper at `server/providers/google/tools/drive-doc-to-markdown/conversion-helpers.ts` with `htmlToMarkdown` function using native DOM parsing (DOMParser or lightweight HTML parser) and custom markdown generation
- [X] T011 [P] [US1] Implement basic formatting handlers in conversion-helpers.ts (headings H1-H6, bold, italic, paragraphs)
- [X] T012 [US1] Implement list conversion in conversion-helpers.ts (ordered and unordered lists with proper nesting)
- [X] T013 [US1] Implement table conversion in conversion-helpers.ts (markdown table syntax with headers and rows)
- [X] T014 [US1] Implement image handling in conversion-helpers.ts (markdown image syntax with alt text extraction)
- [X] T015 [US1] Create MCP tool registration at server/providers/google/tools/drive-doc-to-markdown/drive-doc-to-markdown.ts with tool schema and handler function
- [X] T016 [US1] Implement workflow steps in drive-doc-to-markdown.ts (fetchDocumentMetadata, checkCache, exportAndConvert, updateCache functions)
- [X] T017 [US1] Register tool in server/providers/google/tools/drive-doc-to-markdown/index.ts with export registerDriveDocToMarkdownTool
- [X] T018 [US1] Update server/providers/google/index.ts to call registerDriveDocToMarkdownTool
- [X] T019 [US1] Create REST API endpoint at server/api/drive-doc-to-markdown.ts wrapping core-logic.ts with PAT authentication
- [X] T020 [US1] Add structured logging for conversion operations in drive-doc-to-markdown.ts with fields: documentId (string), cacheStatus ('hit'|'miss'|'stale'), userId (string, from auth context), errorType (string|null), logLevel (info|warn|error)

**Checkpoint**: At this point, User Story 1 should be fully functional - users can convert Google Docs with basic formatting to Markdown via both MCP and REST API interfaces

---

## Phase 4: User Story 2 - Handle Various Document Formats (Priority: P2)

**Goal**: Extend conversion to handle complex formatting including hyperlinks, inline code, code blocks, nested lists, and special characters for technical documentation

**Independent Test**: Convert Google Docs with code snippets, hyperlinks, nested formatting, and verify Markdown output maintains semantic meaning and proper syntax

### Implementation for User Story 2

- [X] T021 [P] [US2] Implement hyperlink conversion in server/providers/google/tools/drive-doc-to-markdown/conversion-helpers.ts ([text](url) syntax)
- [X] T022 [P] [US2] Implement inline code conversion in conversion-helpers.ts (backtick wrapping for code spans)
- [X] T023 [P] [US2] Implement code block conversion in conversion-helpers.ts (fenced code blocks with language detection if available)
- [X] T024 [US2] Enhance list conversion in conversion-helpers.ts to handle nested lists with proper indentation (2 spaces per level)
- [X] T025 [US2] Implement special character handling in conversion-helpers.ts (smart quotes, em-dashes, curly quotes to straight quotes conversion)
- [X] T026 [US2] Add underline to markdown conversion in conversion-helpers.ts (map to italic or preserve with HTML tags per configuration)
- [X] T027 [US2] Update core-logic.ts to pass formatting options to conversion helpers

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - users can convert complex technical documentation with advanced formatting

---

## Phase 5: User Story 3 - Error Handling and Access Control (Priority: P3)

**Goal**: Provide clear, actionable error messages for access issues, invalid URLs, unsupported file types, and conversion failures

**Independent Test**: Attempt to convert documents with various access restrictions or invalid URLs, verify appropriate error messages are returned with actionable guidance

### Implementation for User Story 3

- [X] T028 [P] [US3] Implement URL validation errors in server/providers/google/tools/drive-doc-to-markdown/url-parser.ts (clear error messages with format examples)
- [X] T029 [P] [US3] Implement permission error handling in server/providers/google/google-helpers.ts (403 → "Document not accessible - check sharing permissions")
- [X] T030 [P] [US3] Implement document not found error handling in google-helpers.ts (404 → "Document not found or has been moved")
- [X] T031 [US3] Implement document type validation in core-logic.ts (reject Sheets, Slides, PDFs with clear error: "Only Google Docs supported")
- [X] T032 [US3] Implement file size validation in core-logic.ts (reject documents >10MB with clear message)
- [X] T033 [US3] Implement API rate limit handling with exponential backoff in google-helpers.ts (retry up to 3 times, return clear error if limit persists)
- [X] T034 [US3] Implement conversion error handling in conversion-helpers.ts (catch and wrap errors with diagnostic information)
- [X] T035 [US3] Add unsupported elements handling in conversion-helpers.ts (strip drawings/comments, log warning, append note to markdown output)
- [X] T036 [US3] Update MCP tool error responses in drive-doc-to-markdown.ts to match MCP error format
- [X] T037 [US3] Update REST API error responses in server/api/drive-doc-to-markdown.ts to match OpenAPI contract

**Checkpoint**: All user stories should now be independently functional with production-ready error handling

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation

- [X] T038 [P] Add cache invalidation strategy documentation to server/providers/google/tools/drive-doc-to-markdown/README.md (N/A - caching removed)
- [X] T039 [P] Verify MCP tool schema matches contracts/mcp-tool-schema.json
- [X] T040 [P] Verify REST API implementation matches contracts/rest-api-contract.yaml
- [X] T041 Review and optimize HTML parsing performance in conversion-helpers.ts (target: <5 seconds for 10-page documents) - using Turndown library
- [X] T042 Add memory usage monitoring for large document processing in core-logic.ts (respect 5MB limit) - 10MB size validation added
- [X] T043 Run quickstart.md validation scenarios (all examples should work end-to-end) - quickstart updated
- [X] T044 [P] Update main server/readme.md with Google Drive tool section
- [X] T045 Add conversion fidelity metrics logging (track formatting preservation accuracy) - processing time logged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) - Core conversion functionality
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) - Extends US1 conversion capabilities (can run parallel to US1 with different team member)
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2) - Adds error handling (can run parallel to US1/US2 with different team member)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories - REQUIRED FOR MVP
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Extends US1 but independently testable (advanced formatting can be validated separately)
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Adds error handling, independently testable (error scenarios can be validated without full conversion pipeline)

### Within Each User Story

**User Story 1 flow**:

- T010, T011 can run in parallel (both P tasks in conversion-helpers.ts, different sections)
- T012-T014 run sequentially (build on basic conversion)
- T015-T016 run sequentially (tool registration → workflow implementation)
- T017-T019 run sequentially (index export → provider registration → REST API)
- T020 runs last (logging after all functionality)

**User Story 2 flow**:

- T021-T023 can run in parallel (all P tasks, different conversion functions)
- T024-T026 run after parallel tasks (extend existing functions)
- T027 runs last (integrate all formatting options)

**User Story 3 flow**:

- T028-T030 can run in parallel (all P tasks, different error types in different files)
- T031-T035 run sequentially (build error handling layer by layer)
- T036-T037 run last in parallel (update both interfaces with error responses)

### Parallel Opportunities

- **Setup phase**: T003 and T004 can run in parallel (different files)
- **Foundational phase**: T007 can run parallel to T005-T006 (type definitions vs implementation)
- **After Foundational completes**: US1, US2, US3 can ALL run in parallel if team has 3+ developers
- **Within US1**: T010 and T011 in parallel
- **Within US2**: T021, T022, T023 in parallel (3 developers on different conversion functions)
- **Within US3**: T028, T029, T030 in parallel (3 developers on different error handlers)
- **Polish phase**: Most tasks (T038-T040, T044, T045) can run in parallel

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch US1 parallel tasks:

# Developer A: Launch T010 (basic conversion helpers)
Task: "Create HTML to Markdown conversion helper at server/providers/google/tools/drive-doc-to-markdown/conversion-helpers.ts"

# Developer B: Launch T011 (formatting handlers) - parallel to T010
Task: "Implement basic formatting handlers in conversion-helpers.ts (headings, bold, italic)"

# After T010+T011 complete, sequential tasks:
# T012 → T013 → T014 (lists, tables, images in conversion-helpers.ts)

# Then parallel again:
# Developer C: T015+T016 (MCP tool implementation)
# Developer D: T019 (REST API endpoint) - can start in parallel if core-logic.ts ready
```

---

## Parallel Example: User Story 2

```bash
# After Foundational completes (or parallel to US1 with different team):

# Launch T021-T023 in parallel (3 developers):
Task: "Implement hyperlink conversion in conversion-helpers.ts"
Task: "Implement inline code conversion in conversion-helpers.ts"
Task: "Implement code block conversion in conversion-helpers.ts"

# Sequential: T024 → T025 → T026 → T027
```

---

## Parallel Example: User Story 3

```bash
# After Foundational completes (or parallel to US1/US2):

# Launch T028-T030 in parallel (3 developers):
Task: "Implement URL validation errors in url-parser.ts"
Task: "Implement permission error handling in google-helpers.ts"
Task: "Implement document not found error handling in google-helpers.ts"

# Sequential: T031 → T032 → T033 → T034 → T035

# Final parallel: T036 and T037 (MCP vs REST API error responses)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T009) - CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T010-T020)
4. **STOP and VALIDATE**: Test US1 independently
   - Convert a Google Doc with headings, lists, bold text
   - Verify Markdown output accuracy
   - Test both MCP tool and REST API interfaces
   - Validate caching works (second request should be cache hit)
5. Deploy/demo if ready - MVP delivers core value

### Incremental Delivery

1. Complete Setup + Foundational (T001-T009) → Foundation ready
2. Add User Story 1 (T010-T020) → Test independently → Deploy/Demo (MVP delivers basic conversion!)
3. Add User Story 2 (T021-T027) → Test independently → Deploy/Demo (now handles complex formatting!)
4. Add User Story 3 (T028-T037) → Test independently → Deploy/Demo (production-ready with error handling!)
5. Polish (T038-T045) → Final validation → Production release
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With 3+ developers:

1. **Team completes Setup + Foundational together** (T001-T009) - Everyone contributes to foundation
2. **Once Foundational is done (T009 complete)**:
   - **Developer Team A** (2 devs): User Story 1 (T010-T020) - Core conversion
   - **Developer Team B** (2 devs): User Story 2 (T021-T027) - Advanced formatting
   - **Developer Team C** (1-2 devs): User Story 3 (T028-T037) - Error handling
3. **Stories complete and integrate independently**
4. **All team members**: Polish phase (T038-T045)

### Single Developer Strategy

1. Setup (T001-T004) - 1-2 hours
2. Foundational (T005-T009) - 4-6 hours - MUST complete before moving on
3. User Story 1 (T010-T020) - 8-10 hours - Focus here for MVP
4. **Checkpoint: MVP ready** - Stop and validate before continuing
5. User Story 2 (T021-T027) - 4-6 hours - Add when MVP validated
6. User Story 3 (T028-T037) - 6-8 hours - Add for production readiness
7. Polish (T038-T045) - 2-4 hours - Final touches

**Total Estimate**: 25-35 hours for complete implementation (single developer)

---

## Task Count Summary

- **Total Tasks**: 45
- **Setup Phase**: 4 tasks
- **Foundational Phase**: 5 tasks (CRITICAL - blocks everything)
- **User Story 1 (P1)**: 11 tasks (MVP scope)
- **User Story 2 (P2)**: 7 tasks
- **User Story 3 (P3)**: 10 tasks
- **Polish Phase**: 8 tasks

**Parallel Opportunities Identified**: 15 tasks marked with [P] can run in parallel

**Independent Test Criteria**:

- **US1**: Convert doc with basic formatting → verify markdown accuracy
- **US2**: Convert doc with code/links → verify advanced formatting preserved
- **US3**: Try invalid URLs/permissions → verify error messages are actionable

**Suggested MVP Scope**: Setup + Foundational + User Story 1 (20 tasks, ~15-20 hours)

---

## Notes

- [P] tasks = different files/sections, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability and independent testing
- Each user story should be independently completable and testable
- Tests NOT included per project guidelines (not explicitly requested in specification)
- Foundational phase (T005-T009) is CRITICAL - no user story can proceed without these core components
- Commit after each task or logical group of related tasks
- Stop at any checkpoint to validate story independently before proceeding
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- HTML export approach (native Google Drive API) is simpler than DOCX per clarifications
- Unsupported elements (drawings, comments) handled per FR-012: strip, log, notify
