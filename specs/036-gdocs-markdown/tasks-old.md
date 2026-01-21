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

- [ ] T001 Create feature directory structure at server/providers/google/tools/drive-doc-to-markdown/
- [ ] T002 Create cache directory at cache/google-docs/
- [ ] T003 [P] Add GoogleDocMetadata interface to server/providers/google/types.ts
- [ ] T004 [P] Update server/readme.md with drive-doc-to-markdown tool documentation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types and utilities that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Create TypeScript types in `server/providers/google/tools/drive-doc-to-markdown/types.ts`:
  - ConversionRequest interface (url, authContext, forceRefresh)
  - DriveDocument interface (documentId, title, url, mimeType, modifiedTime, size, buffer)
  - MarkdownContent interface (content, metadata, conversionTimestamp, warnings)
  - CachedDocumentMetadata interface (documentId, title, mimeType, modifiedTime, cachedAt, conversionTimestamp, url, size, version)
  - ConversionResult interface (markdown, metadata, cacheHit, warnings, processingTimeMs)
  - DocumentMetadata interface (documentId, title, url, modifiedTime, size)

- [ ] T005 [P] Create URL parser in `server/providers/google/tools/drive-doc-to-markdown/url-parser.ts`:
  - Function: `parseGoogleDriveUrl(input: string): { documentId: string }`
  - Support 3 URL formats: standard sharing URL, mobile URL, bare document ID
  - Regex patterns from research.md R3
  - Validation: 25-44 chars, alphanumeric + `-_`
  - Throw user-friendly errors with format examples

- [ ] T006 [P] Create cache utilities in `server/providers/google/tools/drive-doc-to-markdown/cache-manager.ts`:
  - Function: `getCachedMetadata(documentId: string): Promise<CachedDocumentMetadata | null>`
  - Function: `getCachedContent(documentId: string): Promise<string | null>`
  - Function: `saveCache(documentId: string, metadata: CachedDocumentMetadata, content: string): Promise<void>`
  - Function: `isCacheValid(cached: CachedDocumentMetadata, current: { modifiedTime: string }): boolean`
  - Cache paths: `cache/google-docs/{documentId}/metadata.json` and `content.md`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Convert Google Doc via MCP Tool (Priority: P1) 🎯 MVP

**Goal**: Enable MCP clients (VS Code Copilot) to convert Google Drive documents to markdown by providing a URL

**Independent Test**: Invoke MCP tool with a Google Doc URL, verify returned markdown matches document structure

### Tests for User Story 1 (following TDD principle)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T007 [P] [US1] Unit test for URL parser in `tests/unit/url-parser.test.ts`:
  - Test 3 supported URL formats (standard, mobile, bare ID)
  - Test invalid URL formats (expect error with examples)
  - Test edge cases (trailing slashes, query params, fragments)

- [ ] T008 [P] [US1] Unit test for document fetcher in `tests/unit/document-fetcher.test.ts`:
  - Mock Google Drive API responses (metadata, export DOCX)
  - Test metadata extraction (documentId, title, mimeType, modifiedTime, size)
  - Test error handling (403, 404, 429, unsupported mimeType, size limit)

- [ ] T009 [P] [US1] Unit test for DOCX converter in `tests/unit/docx-converter.test.ts`:
  - Test formatting preservation (headings, bold, italic, lists, tables, links)
  - Test conversion warnings (unsupported styles, missing images)
  - Test error handling (invalid DOCX buffer, conversion failure)

- [ ] T010 [P] [US1] Unit test for cache manager in `tests/unit/cache-manager.test.ts`:
  - Test cache read/write (metadata.json, content.md)
  - Test cache validation (modifiedTime comparison)
  - Test stale cache detection (30-day threshold)

- [ ] T011 [US1] Integration test for core logic in `tests/integration/core-logic.test.ts`:
  - Test full workflow with test Google Doc (requires test document ID in env)
  - Test cache hit scenario (second request faster)
  - Test forceRefresh flag (bypass cache)
  - Test error scenarios (permission denied, document not found)

- [ ] T012 [US1] Contract test for MCP tool schema in `tests/contract/mcp-tool-schema.test.ts`:
  - Validate MCP tool registration (name, description, inputSchema, outputSchema)
  - Test tool invocation with valid params
  - Test error responses match schema

### Implementation for User Story 1

- [ ] T013 [P] [US1] Implement document fetcher in `server/providers/google/tools/drive-doc-to-markdown/document-fetcher.ts`:
  - Function: `fetchDriveDocument(client: GoogleClient, documentId: string): Promise<DriveDocument>`
  - Fetch metadata: `GET /drive/v3/files/{fileId}?fields=id,name,mimeType,modifiedTime,size`
  - Export DOCX: `GET /drive/v3/files/{fileId}/export?mimeType=application/vnd.openxmlformats...`
  - Validate mimeType (must be `application/vnd.google-apps.document`)
  - Enforce size limit (10MB, configurable via env `GOOGLE_DOCS_SIZE_LIMIT_MB`)
  - Map Drive API errors to user-friendly messages (from research.md R5)

- [ ] T014 [P] [US1] Implement DOCX converter in `server/providers/google/tools/drive-doc-to-markdown/docx-converter.ts`:
  - Function: `convertDOCXToMarkdown(buffer: ArrayBuffer, title: string): Promise<{ markdown: string; warnings: string[] }>`
  - Use mammoth.js to convert DOCX to HTML: `mammoth.convertToHtml({ buffer })`
  - Use turndown to convert HTML to markdown
  - Collect conversion warnings from mammoth.js
  - Handle conversion errors gracefully (fallback to error message)

- [ ] T015 [US1] Implement core business logic in `server/providers/google/tools/drive-doc-to-markdown/core-logic.ts`:
  - Function: `executeDriveDocToMarkdown(params: ConversionRequest, client: GoogleClient): Promise<ConversionResult>`
  - Step 1: Parse URL to extract documentId (use url-parser)
  - Step 2: Check cache validity (use cache-manager)
  - Step 3: If cache valid and !forceRefresh, return cached content
  - Step 4: If cache miss/stale, fetch document (use document-fetcher)
  - Step 5: Convert DOCX to markdown (use docx-converter)
  - Step 6: Save to cache (use cache-manager)
  - Step 7: Return ConversionResult with processingTimeMs
  - Export function for reuse by both MCP and REST API wrappers

- [ ] T016 [US1] Implement MCP tool wrapper in `server/providers/google/tools/drive-doc-to-markdown/drive-doc-to-markdown.ts`:
  - Function: `registerDriveDocToMarkdownTool(mcp: MCPService): void`
  - Tool name: `drive-doc-to-markdown`
  - Extract Google access token from MCP context: `getAuthInfoSafe(context, 'drive-doc-to-markdown')`
  - Create GoogleClient: `createGoogleClient(accessToken)`
  - Call core logic: `executeDriveDocToMarkdown(params, client)`
  - Handle InvalidTokenError for OAuth re-authentication
  - Return ConversionResult as tool response

- [ ] T017 [US1] Register tool in `server/providers/google/tools/drive-doc-to-markdown/index.ts`:
  - Export `registerDriveDocToMarkdownTool` function
  - Import and call from `server/mcp-service.ts` during initialization

- [ ] T018 [US1] Update server/readme.md with MCP tool documentation:
  - Tool name and description
  - Input parameters (url, forceRefresh)
  - Output schema (markdown, metadata, cacheHit, warnings, processingTimeMs)
  - Example usage with VS Code Copilot
  - Error codes and user guidance

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently via MCP interface

---

## Phase 4: User Story 2 - Convert Google Doc via REST API (Priority: P2)

**Goal**: Enable external applications and scripts to convert Google Docs via REST API using Personal Access Token or Service Account credentials

**Independent Test**: Send POST request to `/api/drive-doc-to-markdown` with URL and auth header, verify markdown response

### Tests for User Story 2 (following TDD principle)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T019 [US2] Contract test for REST API in `tests/contract/rest-api.test.ts`:
  - Validate OpenAPI spec compliance (request/response schemas)
  - Test authentication methods (X-Google-Token, X-Google-Service-Account-JSON)
  - Test error response formats (400, 401, 403, 404, 429, 500)

- [ ] T020 [US2] Integration test for REST API endpoint in `tests/integration/rest-api-endpoint.test.ts`:
  - Test POST /api/drive-doc-to-markdown with OAuth token
  - Test POST /api/drive-doc-to-markdown with service account JSON
  - Test concurrent requests (100 parallel)
  - Test error scenarios (missing auth, invalid URL, rate limit)

### Implementation for User Story 2

- [ ] T021 [US2] Implement REST API endpoint in `server/api/drive-doc-to-markdown.ts`:
  - Route: `POST /api/drive-doc-to-markdown`
  - Extract auth from headers: `X-Google-Token` OR `X-Google-Service-Account-JSON`
  - Create GoogleClient: `createGoogleClient(token)` or `createGoogleClientWithServiceAccountJSON(credentials)`
  - Parse request body: { url, forceRefresh }
  - Call core logic: `executeDriveDocToMarkdown(params, client)` (reuse from US1)
  - Return JSON response with ConversionResult
  - Map errors to HTTP status codes (400, 401, 403, 404, 429, 500)
  - Add request logging (document ID, cache status, processing time)

- [ ] T022 [US2] Register REST API route in `server/server.ts`:
  - Import and mount `/api/drive-doc-to-markdown` route
  - Add CORS configuration for API endpoint
  - Add rate limiting middleware (if not already present)

- [ ] T023 [US2] Update server/readme.md with REST API documentation:
  - Endpoint: POST /api/drive-doc-to-markdown
  - Authentication methods (OAuth token, Service Account JSON)
  - Request schema (url, forceRefresh)
  - Response schema (markdown, metadata, cacheHit, warnings, processingTimeMs)
  - cURL examples for both auth methods
  - Error codes and troubleshooting

- [ ] T024 [US2] Verify dual interface consistency:
  - Test same document URL via MCP tool and REST API
  - Verify identical markdown output
  - Verify identical error messages
  - Document any expected differences (if any)

**Checkpoint**: At this point, User Story 2 should be fully functional and both MCP and REST API interfaces should return identical results

---

## Phase 5: User Story 3 - Handle Document Permissions and Sharing (Priority: P3)

**Goal**: Provide clear, actionable error messages for permission-related failures

**Independent Test**: Attempt to convert a private document without permissions, verify error message explains the issue and suggests actions

### Tests for User Story 3 (following TDD principle)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T025 [US3] Unit test for error mapping in `tests/unit/error-handling.test.ts`:
  - Test 403 Forbidden → "Permission denied" message with access guidance
  - Test 404 Not Found → "Document not found" message with URL validation
  - Test 429 Rate Limit → "Rate limit exceeded" message with retry guidance
  - Test 401 Unauthorized → "Authentication failed" message with re-auth guidance
  - Test unsupported mimeType → "Unsupported document type" message
  - Test document too large → "Document size exceeds limit" message

- [ ] T026 [US3] Integration test for permission scenarios in `tests/integration/permissions.test.ts`:
  - Test private document (403 expected with user guidance)
  - Test public document (200 success)
  - Test "anyone with link" document (200 success)
  - Test deleted document (404 expected with clear message)

### Implementation for User Story 3

- [ ] T027 [US3] Enhance error mapping in `server/providers/google/tools/drive-doc-to-markdown/document-fetcher.ts`:
  - Function: `mapDriveApiError(error: any, documentUrl: string): Error`
  - 403 → "Permission denied: You don't have access to this document. Request access from the document owner or ensure the document is shared with 'anyone with the link'.\n\nDocument: {url}"
  - 404 → "Document not found: The document may have been deleted or the URL is invalid. Check the URL and try again.\n\nURL: {url}"
  - 429 → "Rate limit exceeded: You've made too many requests. Try again in {retry-after} seconds."
  - 401 → throw InvalidTokenError('Google Drive authentication failed') for OAuth re-auth
  - Include document URL in error context for debugging

- [ ] T028 [US3] Add permission check logging in `core-logic.ts`:
  - Log permission-related errors with document ID and user context
  - Log successful conversions with sharing status (if available from API)
  - Add structured logging for error analysis

- [ ] T029 [US3] Update documentation with permission troubleshooting:
  - Add "Troubleshooting" section to quickstart.md
  - Document common permission issues and solutions
  - Include examples of changing document sharing settings
  - Add FAQ for "Permission denied" errors

**Checkpoint**: At this point, all three user stories are complete with comprehensive error handling

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Performance optimization, monitoring, and production readiness

- [ ] T030 [P] Add retry logic with exponential backoff in `document-fetcher.ts`:
  - Retry on 429 (rate limit) and 5xx errors
  - Max 3 retries with exponential backoff (1s, 2s, 4s)
  - Parse `Retry-After` header from 429 responses
  - Log retry attempts

- [ ] T031 [P] Implement cache cleanup in `cache-manager.ts`:
  - Function: `cleanupStaleCache(maxAgeDays: number = 30): Promise<void>`
  - Scan cache directory for documents older than threshold
  - Delete stale cache folders
  - Log cleanup results (deleted count)
  - Expose as API endpoint: `DELETE /api/cache/google-docs/cleanup` (admin only)

- [ ] T032 [P] Add performance monitoring in `core-logic.ts`:
  - Track processing time for each step (parse, cache check, fetch, convert, cache write)
  - Log slow conversions (>5 seconds)
  - Add metrics for cache hit rate
  - Add metrics for conversion warnings

- [ ] T033 Create integration example in `docs/google-drive-integration.md`:
  - Show how to extract Google Doc URLs from epic descriptions (similar to extractConfluenceUrlsFromADF)
  - Example: `extractGoogleDocUrlsFromADF(epicAdf): string[]`
  - Show integration with analyze-feature-scope tool
  - Show integration with write-shell-stories tool
  - Example LLM prompt with document context

- [ ] T034 Add environment configuration:
  - `GOOGLE_DOCS_SIZE_LIMIT_MB` (default: 10)
  - `GOOGLE_DOCS_CACHE_MAX_AGE_DAYS` (default: 30)
  - Document in .env.example and README
  - Add validation on startup

- [ ] T035 Final testing and validation:
  - Run all tests (unit, integration, contract)
  - Test with real Google Docs (various sizes, formats)
  - Verify cache performance (cache hit <100ms)
  - Test concurrent requests (100 parallel)
  - Validate error messages (user-friendliness)
  - Check TypeScript strict mode compliance

**Checkpoint**: Feature is production-ready with comprehensive testing, documentation, and monitoring

---

## Dependencies Graph

### User Story Completion Order

```
Phase 1 (Setup)
  ↓
Phase 2 (Foundational) ← MUST complete before user stories
  ↓
  ├→ Phase 3 (US1 - MCP Tool) ← MVP (can deliver independently)
  │    ↓
  ├→ Phase 4 (US2 - REST API) ← Depends on US1 core-logic.ts
  │    ↓
  └→ Phase 5 (US3 - Permissions) ← Depends on US1 error handling
       ↓
Phase 6 (Polish) ← Can start after US1 complete
```

### Task Dependencies Within User Stories

**US1 (MCP Tool)**:
- T007-T012 (tests) can run in parallel ✅
- T013-T014 (fetcher, converter) can run in parallel ✅
- T015 (core-logic) depends on T005, T006, T013, T014
- T016 (MCP wrapper) depends on T015
- T017-T018 (registration, docs) depend on T016

**US2 (REST API)**:
- T019-T020 (tests) can run in parallel ✅
- T021 (REST endpoint) depends on T015 (core-logic from US1)
- T022-T024 (registration, docs, validation) depend on T021

**US3 (Permissions)**:
- T025-T026 (tests) can run in parallel ✅
- T027 (error mapping) enhances T013 (document-fetcher)
- T028-T029 (logging, docs) depend on T027

**Phase 6 (Polish)**:
- T030-T032 (retry, cleanup, monitoring) can run in parallel ✅
- T033-T035 (examples, config, validation) can run in parallel ✅

---

## Parallel Execution Opportunities

### Maximum Parallelization (8 developers)

**Round 1** (after Phase 1-2 complete):
1. Dev 1: T007-T008 (US1 tests - URL parser, document fetcher)
2. Dev 2: T009-T010 (US1 tests - DOCX converter, cache manager)
3. Dev 3: T013 (US1 - document fetcher implementation)
4. Dev 4: T014 (US1 - DOCX converter implementation)
5. Dev 5: T019 (US2 tests - REST API contract)
6. Dev 6: T025 (US3 tests - error handling)
7. Dev 7: T030 (Polish - retry logic)
8. Dev 8: T031 (Polish - cache cleanup)

**Round 2** (after Round 1):
1. Dev 1: T011 (US1 integration test)
2. Dev 2: T012 (US1 contract test)
3. Dev 3: T015 (US1 core-logic) ← BLOCKS others
4. Dev 4: T020 (US2 integration test)
5. Dev 5: T026 (US3 integration test)
6. Dev 6: T032 (Polish - monitoring)
7. Dev 7: T033 (Polish - examples)
8. Dev 8: T034 (Polish - config)

**Round 3** (after T015 complete):
1. Dev 1: T016 (US1 MCP wrapper)
2. Dev 2: T021 (US2 REST endpoint)
3. Dev 3: T027 (US3 error mapping)
4. Dev 4-8: Continue polish tasks

### Minimum Team (2 developers)

**Sprint 1 - US1 (MVP)**:
- Dev A: T007-T012 (all US1 tests)
- Dev B: T013-T014 (fetcher + converter)
- Both: T015 (core-logic - pair programming)
- Dev A: T016-T018 (MCP wrapper + docs)

**Sprint 2 - US2 (REST API)**:
- Dev A: T019-T020 (US2 tests)
- Dev B: T021-T024 (REST endpoint + docs)

**Sprint 3 - US3 + Polish**:
- Dev A: T025-T029 (permissions + error handling)
- Dev B: T030-T035 (polish tasks)

---

## Success Metrics

### Code Quality (Constitution Principle I)
- ✅ TypeScript strict mode: 0 errors
- ✅ Modular architecture: 7 separate modules (url-parser, document-fetcher, docx-converter, cache-manager, core-logic, MCP wrapper, REST wrapper)
- ✅ Documentation: README + quickstart.md + API docs

### Test Coverage (Constitution Principle II)
- ✅ Unit tests: URL parser, document fetcher, DOCX converter, cache manager, error mapping
- ✅ Integration tests: Core logic, REST API, permissions
- ✅ Contract tests: MCP tool schema, REST API OpenAPI

### User Experience (Constitution Principle III)
- ✅ Dual interface: MCP tool + REST API with identical functionality
- ✅ Error messages: User-friendly with actionable guidance (8 error types)
- ✅ OAuth + PAT support: Multiple authentication methods

### Performance (Constitution Principle IV)
- ✅ Cache-first strategy: <2s for cached documents
- ✅ Version-based invalidation: Only fetch when document changes
- ✅ Retry logic: Exponential backoff for rate limits
- ✅ Resource cleanup: Stale cache cleanup (30-day threshold)

### Measurable Outcomes (from spec.md Success Criteria)
- ✅ SC-001: <5s for documents <1MB (target met by mammoth.js performance)
- ✅ SC-002: 95% formatting preservation (mammoth.js proven capability)
- ✅ SC-003: Identical output (guaranteed by shared core-logic.ts)
- ✅ SC-004: Clear error messages (8 mapped errors with guidance)
- ✅ SC-005: 100 concurrent requests (Express.js + cache strategy)

---

## Summary

**Total Tasks**: 35 tasks across 6 phases  
**User Stories**: 3 (US1: MCP Tool, US2: REST API, US3: Permissions)  
**MVP Scope**: Phase 1-3 (US1 only) = 18 tasks  
**Parallel Opportunities**: 14 tasks marked [P] can run concurrently  
**Dependencies**: Clear blocking relationships documented  

**Estimated Timeline** (2 developers, full-time):
- **Sprint 1** (1 week): Phase 1-3 (US1 - MVP)
- **Sprint 2** (1 week): Phase 4-5 (US2-US3)
- **Sprint 3** (3 days): Phase 6 (Polish)

**Recommended Delivery**:
1. **Week 1**: Deliver US1 (MCP tool) as MVP - immediately usable by story-writing tools
2. **Week 2**: Add US2 (REST API) - expand to external integrations
3. **Week 3**: Complete US3 (permissions) + polish - production-ready

**Next Actions**:
1. Create feature branch: `git checkout -b 036-gdocs-markdown`
2. Start with Phase 1 (Setup): Install dependencies
3. Complete Phase 2 (Foundational): Types and utilities
4. Begin US1 tests (TDD): T007-T012
5. Implement US1: T013-T018
