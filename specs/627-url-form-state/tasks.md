---
description: "Task list for URL-Based Form State Restoration"
---

# Tasks: URL-Based Form State Restoration

**Feature Branch**: `627-url-form-state`  
**Input**: Design documents from `/specs/627-url-form-state/`  
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)  
**Constitution Compliance**: All tasks align with Code Quality First (modular URL utilities), Test-Driven Development (unit/integration tests planned), User Experience Consistency (graceful error handling), Performance & Reliability (<100ms URL updates)

**Tests**: Manual test scenarios documented in quickstart.md § Testing Checklist. Automated tests OPTIONAL but recommended for regression prevention.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Validate project structure and prepare for URL parameter utility development

- [X] T001 Create directory structure client/src/lib/url-params/ for URL parameter utilities
- [X] T002 Verify TypeScript configuration in client supports strict mode for new utilities

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core URL parameter utilities that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Create types interface in client/src/lib/url-params/types.ts
- [X] T004 [P] Implement toKebabCase function in client/src/lib/url-params/tool-name.ts
- [X] T005 [P] Implement findToolByKebabName function in client/src/lib/url-params/tool-name.ts
- [X] T006 [P] Implement readUrlParams function in client/src/lib/url-params/reader.ts
- [X] T007 [P] Implement updateUrlWithTool function in client/src/lib/url-params/writer.ts
- [X] T008 [P] Implement removeToolFromUrl function in client/src/lib/url-params/writer.ts
- [X] T009 Create public API exports in client/src/lib/url-params/index.ts

**Checkpoint**: Foundation ready - URL utilities available for all user stories

---

## Phase 3: User Story 1 - Share Direct Tool Access Link (Priority: P1) 🎯 MVP

**Goal**: Enable users to share URLs with pre-selected tools. When someone opens `?tool=get-jira-issue`, that tool is automatically selected after connection.

**Independent Test**: Open URL with `?tool=get-jira-issue` parameter, connect with API key, verify tool is automatically selected.

### Tests for User Story 1 (OPTIONAL - recommended for regression prevention)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T010 [P] [US1] Unit test for toKebabCase conversion in client/tests/unit/url-params.test.ts
- [X] T011 [P] [US1] Unit test for findToolByKebabName lookup in client/tests/unit/url-params.test.ts
- [X] T012 [P] [US1] Unit test for readUrlParams parsing in client/tests/unit/url-params.test.ts

### Implementation for User Story 1

- [X] T013 [US1] Add pendingToolSelection state to client/src/pages/HomePage.tsx
- [X] T014 [US1] Implement URL reading on mount in client/src/pages/HomePage.tsx (useEffect with empty deps)
- [X] T015 [US1] Implement auto-select logic when connection established in client/src/pages/HomePage.tsx (useEffect with connection/tools deps)
- [X] T016 [US1] Update handleConnect to preserve URL params in client/src/pages/HomePage.tsx
- [X] T017 [US1] Modify ConnectionPanel to read anthropicKey from URL on mount in client/src/components/ConnectionPanel/ConnectionPanel.tsx

**Checkpoint**: Users can now open URLs with tool parameters and see tools auto-selected after connection (US1 complete)

---

## Phase 4: User Story 3 - Manual Tool Selection Updates URL (Priority: P2)

**Goal**: When users manually select a tool from the tool selector, the browser URL automatically updates to include the tool parameter (enabling bookmarking and sharing).

**Independent Test**: Select a tool from the tool selector, verify URL updates to include `?tool=<kebab-case-name>` without page reload.

**Dependency**: US1 must be complete (shares same state management in HomePage)

### Tests for User Story 3 (OPTIONAL)

- [X] T018 [P] [US3] Unit test for updateUrlWithTool in client/tests/unit/url-params.test.ts
- [X] T019 [P] [US3] Integration test for URL update on tool selection in client/tests/integration/url-state-restoration.test.tsx

### Implementation for User Story 3

- [X] T020 [US3] Implement URL writing on tool selection change in client/src/pages/HomePage.tsx (useEffect with selectedTool deps)
- [X] T021 [US3] Ensure URL updates use history.replaceState (no new history entries) in client/src/lib/url-params/writer.ts
- [X] T022 [US3] Handle manual API key security: never write manually-entered keys to URL in client/src/pages/HomePage.tsx

**Checkpoint**: Manually selecting tools now updates the URL, enabling seamless sharing workflow (US3 complete)

---

## Phase 5: User Story 2 - Resume Session After Browser Reload (Priority: P2)

**Goal**: When a user reloads the page with a tool parameter in the URL, the tool selection is automatically restored after reconnection.

**Independent Test**: Select a tool (URL updates via US3), reload page, reconnect, verify tool is automatically re-selected.

**Dependency**: US1 AND US3 must be complete (this story validates they work together)

### Tests for User Story 2 (OPTIONAL)

- [X] T023 [US2] Integration test for page reload restoration in client/tests/integration/url-state-restoration.test.tsx
- [X] T024 [US2] Integration test for browser history navigation (back/forward) in client/tests/integration/url-state-restoration.test.tsx

### Implementation for User Story 2

- [X] T025 [US2] Verify URL persistence through page reload (manual test scenario 6 from quickstart.md)
- [X] T026 [US2] Test browser back/forward navigation maintains tool state (spec acceptance scenario 2.2)
- [X] T027 [US2] Validate tab close/reopen preserves tool selection (spec acceptance scenario 2.3)

**Checkpoint**: Page reload now seamlessly restores tool selection from URL (US2 complete)

---

## Phase 6: User Story 4 - Reconnect After Token Expiration (Priority: P3)

**Goal**: When a user's connection drops and they reconnect, the tool selection is preserved (from URL parameter).

**Independent Test**: Open URL with tool parameter, connect (tool selected), disconnect, reconnect, verify tool remains selected.

**Dependency**: US1 must be complete (uses same auto-selection logic)

### Tests for User Story 4 (OPTIONAL)

- [X] T028 [US4] Integration test for reconnection with tool preservation in client/tests/integration/url-state-restoration.test.tsx
- [X] T029 [US4] Integration test for connection retry with tool parameter in client/tests/integration/url-state-restoration.test.tsx

### Implementation for User Story 4

- [X] T030 [US4] Handle reconnection scenario: preserve pendingToolSelection state in client/src/pages/HomePage.tsx
- [X] T031 [US4] Test connection expiration and reconnection flow (spec acceptance scenario 4.1)
- [X] T032 [US4] Validate first-time connection with URL tool parameter (spec acceptance scenario 4.2)
- [X] T033 [US4] Test connection retry after failure (spec acceptance scenario 4.3)

**Checkpoint**: Connection issues no longer disrupt tool selection - URL state survives reconnection (US4 complete)

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and ensure production readiness

- [X] T034 [P] Add edge case handling for invalid tool names (keep in URL, silent fallback) per spec edge cases
- [X] T035 [P] Add edge case handling for invalid anthropicKey (display for correction) per spec edge cases
- [X] T036 [P] Validate URL with both anthropicKey and tool parameters works correctly (manual test scenario 4)
- [X] T037 [P] Verify manual key entry never exposes keys in URL (manual test scenario 5, security requirement FR-007)
- [X] T038 Test performance: URL updates complete within 100ms target (success criteria SC-001)
- [X] T039 Test performance: Tool restoration within 2s of connection (success criteria SC-002)
- [X] T040 [P] Run all manual test scenarios from quickstart.md § Testing Checklist (scenarios 1-6)
- [X] T041 Update client documentation with URL parameter usage examples
- [X] T042 Code review: verify all tasks align with constitution principles

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3, P1)**: Depends on Foundational - Core MVP functionality
- **User Story 3 (Phase 4, P2)**: Depends on US1 - Shares HomePage state management
- **User Story 2 (Phase 5, P2)**: Depends on US1 AND US3 - Validates integration
- **User Story 4 (Phase 6, P3)**: Depends on US1 - Uses same auto-selection mechanism
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Foundational (Phase 2)
    ↓
US1 (P1) ← MVP starts here
    ↓
    ├─→ US3 (P2) ← URL writing
    │       ↓
    └─→ US2 (P2) ← Tests US1+US3 integration
    ↓
US4 (P3) ← Reconnection handling
```

### Within Each User Story

1. Tests (if included) MUST be written and FAIL before implementation
2. URL utilities (Foundational) before all user stories
3. US1 (read URL, auto-select) before US3 (write URL)
4. US1 + US3 before US2 (reload validation)
5. US1 before US4 (reconnection uses same logic)

### Parallel Opportunities

**Phase 2 (Foundational)**: All tasks T003-T008 can run in parallel (different files)

**Phase 3 (US1 Tests)**: Tasks T010-T012 can run in parallel

**Phase 4 (US3 Tests)**: Tasks T018-T019 can run in parallel

**Phase 5 (US2 Tests)**: Tasks T023-T024 can run in parallel

**Phase 6 (US4 Tests)**: Tasks T028-T029 can run in parallel

**Phase 7 (Polish)**: Tasks T034-T037 and T040-T042 can run in parallel

**Between User Stories**: Once US1 is complete, US3 and US4 can proceed in parallel (US2 must wait for US3)

---

## Parallel Example: Foundational Phase

```bash
# Launch all URL utility modules together (all in parallel):
Developer A: "Create types interface in client/src/lib/url-params/types.ts"
Developer B: "Implement toKebabCase + findToolByKebabName in client/src/lib/url-params/tool-name.ts"
Developer C: "Implement readUrlParams in client/src/lib/url-params/reader.ts"
Developer D: "Implement updateUrlWithTool + removeToolFromUrl in client/src/lib/url-params/writer.ts"

# Once T003-T008 complete, one developer creates exports:
Developer A: "Create public API exports in client/src/lib/url-params/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002) → 30 minutes
2. Complete Phase 2: Foundational (T003-T009) → 2-3 hours
3. Complete Phase 3: User Story 1 (T010-T017) → 3-4 hours
4. **STOP and VALIDATE**: Test US1 independently using manual test scenario 1
5. Deploy/demo: "Users can now share tool-specific URLs!"

**Total MVP Effort**: ~6-8 hours for a complete, working feature

### Incremental Delivery

1. **Week 1**: Setup + Foundational → Foundation ready
2. **Week 2**: US1 (P1) → Test independently → Deploy MVP: "Share tool links!"
3. **Week 3**: US3 (P2) → Test independently → Deploy: "Manual selection updates URL!"
4. **Week 4**: US2 (P2) → Test independently → Deploy: "Reload preserves state!"
5. **Week 5**: US4 (P3) → Test independently → Deploy: "Reconnection works!"
6. **Week 6**: Polish → Production-ready

Each week adds value without breaking previous stories.

### Parallel Team Strategy

With 2-3 developers:

1. **Together**: Complete Setup + Foundational (all must have URL utilities)
2. **Once Foundational is done**:
   - Developer A: US1 (P1) - Core functionality
   - Developer B: Starts on US3 (P2) tests - then waits for US1
3. **After US1 complete**:
   - Developer A: Starts US4 (P3)
   - Developer B: Completes US3 (P2)
   - Developer C: Validates US2 (P2)
4. **Final**: All developers collaborate on Polish

---

## Notes

- **[P] tasks**: Different files, no dependencies, safe to parallelize
- **[Story] label**: Maps task to specific user story for traceability
- **Each user story independently testable**: US1 (share links), US3 (URL updates), US2 (reload), US4 (reconnect)
- **Security critical** (T022, T037): Manual API keys NEVER written to URL per FR-007
- **Performance targets** (T038, T039): <100ms URL update, <2s tool restoration per success criteria
- **Invalid tool handling** (T034): Keep parameter in URL for transparency per clarification decision
- **Commit strategy**: Commit after each task or logical group (e.g., all Foundational utilities)
- **Validation checkpoints**: Stop after each phase to validate story works independently
- **Constitution alignment**: All tasks follow modular architecture (url-params lib), TDD workflow (tests first), UX consistency (graceful errors), performance targets
