# Tasks: Google Drive Document MCP Tools

**Input**: Design documents from `/specs/002-google-docs-mcp/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, quickstart.md

**Tests**: Unit and integration tests included per constitution principle III (non-negotiable)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

All paths relative to repository root: `/Users/vitorforbrig/Documents/Projects/cascade-mcp/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and ensure Google provider infrastructure is ready

- [X] T001 Verify existing Google OAuth provider setup in server/providers/google/index.ts (from spec 001)
- [X] T002 [P] Review existing GoogleClient interface in server/providers/google/google-api-client.ts for extension points
- [X] T003 [P] Review existing Google provider types in server/providers/google/types.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core type definitions and client interface extensions that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [P] Add DriveFile interface to server/providers/google/types.ts (id, name, mimeType, kind, createdTime, modifiedTime, size, webViewLink, owners)
- [X] T005 [P] Add DriveOwner interface to server/providers/google/types.ts (displayName, emailAddress, permissionId)
- [X] T006 [P] Add DriveFileListResponse interface to server/providers/google/types.ts (kind, files, nextPageToken, incompleteSearch)
- [X] T007 [P] Add DriveFileListParams interface to server/providers/google/types.ts (query, pageSize, pageToken, orderBy, fields)
- [X] T008 [P] Add DocumentContent interface to server/providers/google/types.ts (fileId, fileName, content, exportFormat)
- [X] T009 Extend GoogleClient interface in server/providers/google/google-api-client.ts to add listFiles(params?: DriveFileListParams): Promise<DriveFileListResponse>
- [X] T010 Extend GoogleClient interface in server/providers/google/google-api-client.ts to add getDocumentContent(fileId: string): Promise<string>
- [X] T011 Implement createGoogleClient factory methods for listFiles() in server/providers/google/google-api-client.ts using fetch to call https://www.googleapis.com/drive/v3/files with OAuth bearer token
- [X] T012 Implement createGoogleClient factory methods for getDocumentContent() in server/providers/google/google-api-client.ts using fetch to call https://www.googleapis.com/drive/v3/files/{fileId}/export?mimeType=text/plain with OAuth bearer token

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - View Available Google Drive Files (Priority: P1) 🎯 MVP

**Goal**: Enable AI agents to list files from Google Drive with basic filtering, pagination, and sorting

**Independent Test**: Authenticate with Google Drive, call drive-list-files MCP tool with no parameters, verify it returns a formatted list of files with names, IDs, MIME types, and dates. Test filtering by MIME type (Google Docs only), test pagination with pageToken.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T013 [P] [US1] Create unit test for drive-list-files tool registration in tests/unit/providers/google/tools/drive-list-files.test.ts - test parameter validation (invalid pageSize, malformed query syntax)
- [ ] T014 [P] [US1] Create integration test for drive-list-files in tests/integration/google/drive-list-files.integration.test.ts - test OAuth flow, API response parsing, pagination handling

### Implementation for User Story 1

- [X] T015 [P] [US1] Create drive-list-files MCP tool in server/providers/google/tools/drive-list-files.ts - register with mcp.registerTool(), accept params (query, pageSize, pageToken, orderBy), call GoogleClient.listFiles()
- [X] T016 [P] [US1] Create REST API endpoint in server/api/drive-list-files.ts - extract Google token from headers (X-Google-Token for PAT or Authorization Bearer for OAuth), call GoogleClient.listFiles(), return JSON response
- [X] T017 [US1] Register drive-list-files tool in server/providers/google/tools/index.ts - export registerDriveListFilesTool function and call it in provider initialization
- [X] T018 [US1] Register drive-list-files API route in server/api/index.ts - add route /api/drive-list-files mapping to handler
- [X] T019 [US1] Add input validation using Zod schemas in server/providers/google/tools/drive-list-files.ts - validate query syntax, pageSize range (1-1000), pageToken format
- [X] T020 [US1] Add error handling for expired tokens, rate limits, and API errors in server/providers/google/tools/drive-list-files.ts - catch and format GoogleAPIError, handle 401/403/429 responses
- [X] T021 [US1] Add structured logging with Winston in server/providers/google/tools/drive-list-files.ts - log request params (sanitized), response metadata (file count, hasNextPage), errors
- [X] T022 [US1] Format tool output as markdown in server/providers/google/tools/drive-list-files.ts - create readable table/list showing file name, ID, MIME type, modified date, web link, with pagination info

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Agents can discover files, filter by type, paginate results, and sort by date/name.

---

## Phase 4: User Story 2 - Retrieve Document Content as Text (Priority: P1) 🎯 MVP

**Goal**: Enable AI agents to retrieve full text content from Google Docs for requirements analysis and document-to-code workflows

**Independent Test**: Provide a known Google Doc file ID (from User Story 1), call drive-get-document MCP tool with fileId parameter, verify it returns complete plain text content preserving paragraph structure. Test with large document (>100 pages), test error handling for invalid file ID.

**Dependencies**: While this is P1, it logically follows User Story 1 (users first discover files, then retrieve content). However, it can be implemented in parallel since both depend only on Foundational phase.

### Tests for User Story 2

- [ ] T023 [P] [US2] Create unit test for drive-get-document tool registration in tests/unit/providers/google/tools/drive-get-document.test.ts - test parameter validation (missing fileId, invalid format)
- [ ] T024 [P] [US2] Create integration test for drive-get-document in tests/integration/google/drive-get-document.integration.test.ts - test content retrieval, format conversion (Google Doc → plain text), large file handling

### Implementation for User Story 2

- [X] T025 [P] [US2] Create drive-get-document MCP tool in server/providers/google/tools/drive-get-document.ts - register with mcp.registerTool(), accept fileId param (required), call GoogleClient.getDocumentContent()
- [X] T026 [P] [US2] Create REST API endpoint in server/api/drive-get-document.ts - extract Google token from headers, validate fileId param, call GoogleClient.getDocumentContent(), return JSON with content
- [X] T027 [US2] Register drive-get-document tool in server/providers/google/tools/index.ts - export registerDriveGetDocumentTool function and call it in provider initialization
- [X] T028 [US2] Register drive-get-document API route in server/api/index.ts - add route /api/drive-get-document mapping to handler
- [X] T029 [US2] Add input validation using Zod schemas in server/providers/google/tools/drive-get-document.ts - validate fileId is non-empty string with valid format
- [X] T030 [US2] Add error handling in server/providers/google/tools/drive-get-document.ts - handle file not found (404), insufficient permissions (403), unsupported file type, export failures
- [X] T031 [US2] Add structured logging with Winston in server/providers/google/tools/drive-get-document.ts - log fileId (sanitized), file name, content length, export duration, errors
- [X] T032 [US2] Format tool output in server/providers/google/tools/drive-get-document.ts - return plain text content with metadata header (file name, size, modified date) for context

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Complete P1 MVP achieved: agents can discover files AND retrieve document content.

---

## Phase 5: User Story 3 - Search and Filter Files (Priority: P2)

**Goal**: Enhance file discovery with advanced search queries and folder filtering for large file collections

**Independent Test**: Submit search query "name contains 'requirements'" to drive-list-files tool, verify only matching files returned. Test folder filtering with folderId query parameter. Test combined criteria (type AND name).

**Dependencies**: Extends User Story 1 - adds advanced query capabilities to existing listFiles implementation. Can be implemented after US1 is complete, but US2 can proceed in parallel.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add unit tests for query parsing in tests/unit/providers/google/tools/drive-list-files.test.ts - test complex query syntax (AND/OR operators, folder queries, field filters)
- [ ] T034 [P] [US3] Add integration tests for search scenarios in tests/integration/google/drive-list-files.integration.test.ts - test name search, folder filtering, combined criteria, empty results

### Implementation for User Story 3

- [ ] T035 [P] [US3] Extend query validation in server/providers/google/tools/drive-list-files.ts - validate Google Drive query syntax (mimeType, name, parents operators)
- [ ] T036 [P] [US3] Add query building helpers in server/providers/google/tools/drive-list-files.ts - create utility functions for common query patterns (filterByMimeType, filterByFolder, searchByName)
- [ ] T037 [US3] Update tool documentation in server/providers/google/tools/drive-list-files.ts - add detailed query examples in tool description (folder filtering, name search, combined queries)
- [ ] T038 [US3] Add logging for search queries in server/providers/google/tools/drive-list-files.ts - log query string, result count, filter criteria for debugging

**Checkpoint**: All P1 and P2 user stories should now be independently functional. Advanced search capabilities enhance file discovery without affecting basic listing or content retrieval.

---

## Phase 6: User Story 4 - Handle Different Document Formats (Priority: P3)

**Goal**: Extend content retrieval to support Google Sheets, Slides, and PDFs beyond Google Docs

**Independent Test**: Provide file IDs for different file types (Sheet, Slide, PDF) to drive-get-document, verify appropriate export format is used (CSV for Sheets, text for Slides/PDFs). Test unsupported file type (image) returns clear error.

**Dependencies**: Extends User Story 2 - adds multi-format support to existing getDocumentContent implementation. Lower priority as most requirement documents are Google Docs.

### Tests for User Story 4

- [ ] T039 [P] [US4] Add unit tests for MIME type detection in tests/unit/providers/google/tools/drive-get-document.test.ts - test export format selection for Sheets, Slides, PDFs, unsupported types
- [ ] T040 [P] [US4] Add integration tests for multi-format retrieval in tests/integration/google/drive-get-document.integration.test.ts - test Sheet export as CSV, Slide text extraction, PDF text extraction

### Implementation for User Story 4

- [ ] T041 [P] [US4] Add MIME type detection in server/providers/google/tools/drive-get-document.ts - map mimeType to appropriate export format (application/vnd.google-apps.spreadsheet → text/csv)
- [ ] T042 [P] [US4] Extend GoogleClient.getDocumentContent() in server/providers/google/google-api-client.ts - add optional mimeType parameter to determine export format, update export API call
- [ ] T043 [US4] Update drive-get-document tool in server/providers/google/tools/drive-get-document.ts - add logic to detect file type and call getDocumentContent() with appropriate export format
- [ ] T044 [US4] Add format-specific error handling in server/providers/google/tools/drive-get-document.ts - handle export failures for specific formats, provide clear messages for unsupported types
- [ ] T045 [US4] Update tool documentation in server/providers/google/tools/drive-get-document.ts - document supported file types and export formats (Docs→text, Sheets→CSV, Slides→text, PDF→text)
- [ ] T046 [US4] Add logging for multi-format exports in server/providers/google/tools/drive-get-document.ts - log detected MIME type, export format used, content length by type

**Checkpoint**: All user stories (P1, P2, P3) should now be independently functional. Multi-format support extends content retrieval to diverse document types.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation

- [ ] T047 [P] Update server/readme.md with Google Drive tool documentation - add tool descriptions, parameter examples, usage patterns following existing Atlassian tool format
- [ ] T048 [P] Update REST API documentation in docs/rest-api.md - add /api/drive-list-files and /api/drive-get-document endpoints with curl examples
- [ ] T049 [P] Add usage examples to specs/002-google-docs-mcp/quickstart.md - verify all examples work, update with actual testing results
- [ ] T050 Run complete test suite for all user stories - npm test or Jest command to verify all unit/integration tests pass
- [ ] T051 Manual validation following quickstart.md scenarios - test OAuth flow, list files, retrieve content, search queries, multi-format support
- [ ] T052 [P] Performance testing for large file lists (10,000+ files) - verify pagination performance meets <2s target
- [ ] T053 [P] Performance testing for large document retrieval - verify documents >100 pages retrieve in <5s
- [ ] T054 Code review and refactoring - ensure consistent error handling, logging patterns, type safety across all tools
- [ ] T055 [P] Security review - verify token sanitization in logs, input validation completeness, rate limit handling
- [ ] T056 Update contributing.md if new patterns introduced - document Google Drive tool patterns for future contributors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (P1): Can start after Phase 2 - No dependencies on other stories
  - US2 (P1): Can start after Phase 2 - Logically follows US1 but technically independent
  - US3 (P2): Extends US1 - Should start after US1 complete (or parallel if careful)
  - US4 (P3): Extends US2 - Should start after US2 complete
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Logically builds on US1 for workflow, but technically independent (only depends on Phase 2)
- **User Story 3 (P2)**: Extends User Story 1 - Adds query features to existing list tool - Best to complete US1 first
- **User Story 4 (P3)**: Extends User Story 2 - Adds format support to existing get tool - Best to complete US2 first

### Within Each User Story

1. Tests MUST be written and FAIL before implementation (TDD approach)
2. MCP tool and REST API implementations can be done in parallel (marked [P])
3. Tool registration follows implementation
4. Validation and error handling follow core implementation
5. Logging and formatting are final touches

### Parallel Opportunities

**Phase 1 (Setup)**: All 3 tasks can run in parallel

**Phase 2 (Foundational)**: 
- T004-T008 (type definitions) can all run in parallel
- T009-T010 (interface extensions) must wait for types, but can run in parallel with each other
- T011-T012 (implementations) must wait for interfaces, but can run in parallel with each other

**Phase 3 (User Story 1)**:
- T013-T014 (tests) can run in parallel
- T015-T016 (MCP tool + REST API) can run in parallel
- T017-T018 (registrations) can run in parallel after implementations

**Phase 4 (User Story 2)**:
- T023-T024 (tests) can run in parallel
- T025-T026 (MCP tool + REST API) can run in parallel
- T027-T028 (registrations) can run in parallel

**Phase 5 (User Story 3)**:
- T033-T034 (tests) can run in parallel
- T035-T036 (query features) can run in parallel

**Phase 6 (User Story 4)**:
- T039-T040 (tests) can run in parallel
- T041-T042 (MIME type detection + client extension) can run in parallel

**Phase 7 (Polish)**:
- T047-T049 (documentation) can all run in parallel
- T052-T053 (performance tests) can run in parallel
- T055 (security review) can run in parallel with docs

**Cross-Story Parallelism** (if team capacity allows):
- After Phase 2 completes, US1 and US2 can proceed in parallel (both are P1, independent implementations)
- While US3 work happens (extends US1), US4 can proceed in parallel (extends US2)

---

## Parallel Example: User Story 1

```bash
# After Phase 2 complete, launch all tests for User Story 1 together:
Task: "T013 - Unit test for drive-list-files tool registration"
Task: "T014 - Integration test for drive-list-files"

# After tests written, launch both implementations in parallel:
Task: "T015 - Create drive-list-files MCP tool"
Task: "T016 - Create REST API endpoint for drive-list-files"

# After implementations done, register in parallel:
Task: "T017 - Register drive-list-files tool in provider"
Task: "T018 - Register drive-list-files API route"
```

## Parallel Example: Both P1 Stories Together

```bash
# After Phase 2 complete, if team has 2+ developers:
Developer A: Complete Phase 3 (User Story 1 - List Files)
Developer B: Complete Phase 4 (User Story 2 - Get Document Content)

# Both stories are independent and deliver P1 MVP value
# They can merge and integrate without conflicts (different files)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only - Both P1)

1. Complete Phase 1: Setup (review existing infrastructure)
2. Complete Phase 2: Foundational (types, interfaces, client methods) - CRITICAL blocker
3. Complete Phase 3: User Story 1 (List Files) - First part of P1 MVP
4. Complete Phase 4: User Story 2 (Get Document Content) - Second part of P1 MVP
5. **STOP and VALIDATE**: Test both stories independently, then together (discover → retrieve workflow)
6. Deploy/demo MVP if ready

**MVP Value**: Agents can discover Google Drive files AND retrieve document content - complete workflow for document-to-code use cases

### Incremental Delivery

1. **Foundation** (Phase 1-2) → Infrastructure ready
2. **MVP** (Phase 3-4) → Both P1 stories → Test independently → Deploy/Demo
   - Value: Complete discover-and-retrieve workflow operational
3. **Enhanced Search** (Phase 5) → P2 story → Test independently → Deploy/Demo
   - Value: Faster file discovery for large collections
4. **Multi-Format** (Phase 6) → P3 story → Test independently → Deploy/Demo
   - Value: Support beyond Google Docs (Sheets, Slides, PDFs)
5. **Polish** (Phase 7) → Production-ready
   - Each phase adds value without breaking previous functionality

### Parallel Team Strategy

With 2 developers:

1. **Together**: Complete Phase 1 (Setup) + Phase 2 (Foundational)
2. **Split** (after Phase 2 done):
   - Developer A: Phase 3 (User Story 1 - List Files)
   - Developer B: Phase 4 (User Story 2 - Get Document)
3. **Together**: Validate MVP (both stories working)
4. **Split** (if continuing):
   - Developer A: Phase 5 (User Story 3 - Search/Filter)
   - Developer B: Phase 6 (User Story 4 - Multi-Format)
5. **Together**: Phase 7 (Polish)

With 1 developer: Follow phases sequentially (1→2→3→4→5→6→7)

---

## Validation Checkpoints

### After Phase 2 (Foundation)
- [ ] All TypeScript interfaces compile without errors
- [ ] GoogleClient interface has listFiles() and getDocumentContent() methods
- [ ] Client factory methods make successful API calls to Google Drive (manual test with OAuth token)

### After Phase 3 (User Story 1)
- [ ] drive-list-files tool registered in MCP server
- [ ] REST API endpoint /api/drive-list-files responds to requests
- [ ] Can list files with no parameters (returns all files)
- [ ] Can filter by MIME type (Google Docs only)
- [ ] Pagination works with pageToken
- [ ] Sorting works (by name, modifiedTime)
- [ ] All tests pass (T013, T014)

### After Phase 4 (User Story 2)
- [ ] drive-get-document tool registered in MCP server
- [ ] REST API endpoint /api/drive-get-document responds to requests
- [ ] Can retrieve content from valid Google Doc file ID
- [ ] Content is plain text with preserved structure
- [ ] Large documents (>100 pages) retrieve completely
- [ ] Error handling works (invalid ID, no permissions)
- [ ] All tests pass (T023, T024)

### MVP Validation (After Phase 3 + 4)
- [ ] End-to-end workflow: List files → Identify document → Retrieve content
- [ ] Both OAuth (MCP clients) and PAT (REST API) auth methods work
- [ ] Error messages are clear and actionable
- [ ] Performance meets targets (<2s list, <3s retrieve for typical docs)
- [ ] Follow quickstart.md scenarios successfully

### After Phase 5 (User Story 3)
- [ ] Advanced search queries work (name contains, folder filtering)
- [ ] Combined criteria work (type AND name)
- [ ] Empty search results return clear message
- [ ] Query validation prevents malformed queries
- [ ] All tests pass (T033, T034)

### After Phase 6 (User Story 4)
- [ ] Google Sheets export as CSV
- [ ] Google Slides export as text
- [ ] PDF text extraction works
- [ ] Unsupported file types return clear error
- [ ] All tests pass (T039, T040)

### After Phase 7 (Polish)
- [ ] All documentation updated and accurate
- [ ] All tests pass (unit + integration)
- [ ] Manual validation scenarios complete
- [ ] Performance testing meets targets
- [ ] Security review passes (token sanitization, input validation)
- [ ] Code review complete

---

## Notes

- **[P] tasks**: Different files, no dependencies - safe to parallelize
- **[Story] label**: Maps task to specific user story for traceability
- **Test-First**: All tests must fail before implementation (TDD principle)
- **Independent Stories**: Each user story should be independently completable and testable
- **Commit Strategy**: Commit after each task or logical group of related tasks
- **Constitution Compliance**: All tasks follow modular architecture, type safety, testing standards, UX consistency, and observability requirements
- **Pattern Consistency**: Follow existing Atlassian provider patterns (dual interface, error handling, logging, token management)

**Avoid**:
- Vague tasks without file paths
- Multiple developers editing same file simultaneously (conflicts)
- Cross-story dependencies that break independence
- Implementing before tests fail
- Skipping validation checkpoints
