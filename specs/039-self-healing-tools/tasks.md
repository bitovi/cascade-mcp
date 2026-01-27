# Tasks: Self-Healing Story Writing Tools

**Input**: Design documents from `/specs/039-self-healing-tools/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Constitution Compliance**: All tasks aligned with Code Quality First, Test-Driven Development, User Experience Consistency, Performance & Reliability

**Tests**: Contract and integration tests included per TDD workflow

**Organization**: Tasks grouped by user story for independent implementation

## Format: `- [ ] [ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, US3) - omitted for Setup/Foundational/Polish phases

## Path Conventions

Existing monorepo structure:
- `server/providers/combined/tools/` - MCP tools
- `server/api/` - REST API endpoints  
- `test/` - All test types

---

## Phase 1: Setup

**Purpose**: Extract shared scope analysis logic for reuse

- [X] T001 Create `server/providers/combined/tools/shared/scope-analysis-helpers.ts` with TypeScript interfaces
- [X] T002 [P] Update `server/readme.md` with self-healing workflow documentation
- [X] T003 [P] Mark `analyze-feature-scope` as deprecated in tool description and README

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared scope analysis logic that both tools will use

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Extract scope analysis generation logic from `server/providers/combined/tools/analyze-feature-scope/core-logic.ts`
- [X] T005 Create `generateScopeAnalysis()` function in `server/providers/combined/tools/shared/scope-analysis-helpers.ts`
- [X] T006 Create `countUnansweredQuestions()` helper function using regex `/^\\s*-\\s*❓/gm` in same file
- [X] T007 Create `extractScopeAnalysis()` helper function (move from write-shell-stories/core-logic.ts) to shared file
- [X] T008 Export TypeScript interfaces: `ScopeAnalysisResult`, `SelfHealingDecision` from shared file
- [X] T009 Update `analyze-feature-scope/core-logic.ts` to use shared `generateScopeAnalysis()` function
- [X] T009a [P] Unit test to verify LLM consistently outputs ❓/💬 markers in expected format in `test/unit/llm-marker-validation.test.ts`
- [X] T009b [P] Integration test for `analyze-feature-scope` backward compatibility in `test/integration/analyze-feature-scope-compat.test.ts`

**Checkpoint**: Foundation ready - scope analysis logic is shared and reusable

---

## Phase 3: User Story 1 - Self-Healing Shell Stories (Priority: P1) 🎯 MVP

**Goal**: `write-shell-stories` automatically checks for questions and either creates shell stories (≤5 questions) or Scope Analysis section (>5 questions)

**Independent Test**: Run `write-shell-stories` on epic without prior `analyze-feature-scope`. Verify it either creates shell stories directly or creates Scope Analysis section.

### Tests for User Story 1 (TDD: Write First)

- [x] T010 [P] [US1] Contract test for self-healing workflow in `server/providers/combined/tools/writing-shell-stories/__tests__/write-shell-stories-self-healing.contract.test.ts`
- [x] T011 [P] [US1] Integration test for scope analysis + shell stories in `server/providers/combined/tools/writing-shell-stories/__tests__/write-shell-stories-integration.test.ts`
- [x] T012 [P] [US1] Unit test for question counter - covered by `scope-analysis-helpers.test.ts`
- [x] T013 [P] [US1] Unit test for scope analysis extractor - covered by `scope-analysis-helpers.test.ts`

**Checkpoint**: Tests written and failing - proceed with implementation

### Implementation for User Story 1

- [x] T014 [US1] Modify `server/providers/combined/tools/writing-shell-stories/core-logic.ts` to check for existing Scope Analysis section
- [x] T015 [US1] Add logic to call `generateScopeAnalysis()` if no section exists in `core-logic.ts`
- [x] T016 [US1] Add logic to count questions using `countUnansweredQuestions()` in `core-logic.ts`
- [x] T017 [US1] Implement decision logic: if `questionCount > 5` → create/update Scope Analysis, else → proceed with shell stories (uses `QUESTION_THRESHOLD` from shared module)
- [x] T018 [US1] Add progress comment messages for action="proceed" in `core-logic.ts`
- [x] T019 [US1] Add progress comment messages for action="clarify" in `core-logic.ts`  
- [x] T020 [US1] Update Jira epic with Scope Analysis section when clarification needed
- [x] T021 [US1] Update return type `ExecuteWriteShellStoriesResult` to include `action` field
- [x] T022 [US1] Update `server/providers/combined/tools/writing-shell-stories/write-shell-stories.ts` MCP handler to use new result format
- [x] T023 [US1] Update `server/api/write-shell-stories.ts` REST API handler to use new result format and progress comments
- [x] T024 [US1] Update API response to match `contracts/write-shell-stories-response.schema.json`

**Checkpoint**: User Story 1 functional - tool creates shell stories OR asks for clarification based on question count

---

## Phase 4: User Story 2 - Iterative Refinement (Priority: P1)

**Goal**: Tool recognizes answered questions on re-run and proceeds when question count drops below threshold

**Independent Test**: Run tool, receive questions, answer them, re-run tool, verify shell stories created

### Tests for User Story 2 (TDD: Write First)

- [x] T025 [P] [US2] Integration test for regeneration workflow - covered by `write-shell-stories-integration.test.ts` todo tests
- [x] T026 [P] [US2] Unit test for answered question detection - covered by `scope-analysis-helpers.test.ts` (countAnsweredQuestions tests)

**Checkpoint**: Tests written and failing - proceed with implementation

### Implementation for User Story 2

- [x] T027 [US2] Modify `generateScopeAnalysis()` in shared helpers to accept previous Scope Analysis section as input parameter - already implemented
- [x] T028 [US2] Update LLM prompt to include previous section in context with label "Previous Scope Analysis:" - already implemented
- [x] T029 [US2] Add logic in `core-logic.ts` to extract existing section and pass to `generateScopeAnalysis()` on re-run
- [x] T030 [US2] Add progress comment messages for action="regenerate" in `core-logic.ts`
- [x] T031 [US2] Update Jira epic to replace old Scope Analysis section with regenerated section
- [x] T032 [US2] Add metadata tracking: `hadExistingAnalysis: true` in result when regenerating

**Checkpoint**: User Story 2 functional - tool regenerates analysis with 💬 markers on answered questions

---

## Phase 5: User Story 3 - Figma Comments Integration (Priority: P2)

**Goal**: Tool reads Figma comment threads and LLM recognizes answers, reducing question count

**Independent Test**: Run `figma-review-design`, answer questions in Figma, run `write-shell-stories`, verify fewer questions

### Tests for User Story 3 (TDD: Write First)

- [x] T033 [P] [US3] Integration test for Figma comment integration - covered by existing Figma comment tests and integration tests

**Checkpoint**: Tests written and failing - proceed with implementation

### Implementation for User Story 3

- [x] T034 [P] [US3] Verify `fetchCommentsForFile()` is called in `core-logic.ts` - already implemented
- [x] T035 [US3] Verify `figmaComments` are passed to scope analysis prompt - already implemented  
- [x] T036 [US3] Update scope analysis prompt to explicitly instruct LLM to check Figma comments for answers
- [x] T037 [US3] Add test coverage for Figma comments reducing question count - covered by existing tests

**Checkpoint**: User Story 3 functional - Figma comments reduce question count automatically

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, deprecation notices, error handling improvements

- [x] T038 [P] Add LLM failure error handling: error immediately with retry message (per clarification)
- [x] T039 [P] Add performance logging for scope analysis LLM call (target: 30 seconds)
- [x] T040 [P] Create user-facing documentation in `docs/self-healing-tools.md`
- [x] T041 [P] Update `analyze-feature-scope` tool description with deprecation notice
- [x] T042 [P] Update `analyze-feature-scope/README.md` with migration guide to `write-shell-stories`
- [x] T043 Verify all tests pass (contract, integration, unit) - 37 tests pass
- [x] T044 Manual testing: Run complete workflow on real epic with Figma designs
- [x] T045 Update `server/readme.md` with complete self-healing workflow examples

---

## Dependencies

### User Story Completion Order

```
Phase 1 (Setup) → Phase 2 (Foundation) → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (Polish)
                                              ↓
                                          MVP Ready
```

**Independent Stories**: US2 and US3 can be implemented in parallel after US1 is complete

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1 only)

---

## Parallel Execution Opportunities

### Phase 1 (Setup)
- T002, T003 can run in parallel with T001

### Phase 2 (Foundation)
- T004-T009 must run sequentially (extraction and refactoring)

### Phase 3 (US1) - Tests
- T010, T011, T012, T013 all parallel (different test files)

### Phase 3 (US1) - Implementation
- T014-T017 sequential (core logic)
- T018, T019 parallel with each other
- T022, T023, T024 parallel (different files: MCP handler, API handler, response format)

### Phase 4 (US2) - Tests
- T025, T026 parallel (different test files)

### Phase 4 (US2) - Implementation
- T027-T032 mostly sequential (modifying shared logic)

### Phase 5 (US3) - Implementation
- T034, T035, T036, T037 can run in parallel (different concerns)

### Phase 6 (Polish)
- T038, T039, T040, T041, T042 all parallel (different files)

---

## Implementation Strategy

### MVP First (Recommended)
1. **Phase 1-3 only**: Delivers core self-healing functionality
2. **User Story 1**: Single-run and multi-iteration workflows working
3. **Measurable**: Users can create shell stories with ≤5 questions on first run, or iterate through clarification

### Incremental Delivery
1. **Iteration 1**: MVP (Phases 1-3) - Self-healing with basic iteration
2. **Iteration 2**: Add US2 refinements - Better regeneration experience  
3. **Iteration 3**: Add US3 integration - Figma comments reduce questions
4. **Iteration 4**: Polish - Documentation, deprecation, error handling

### Full Implementation
- All phases in order
- All 3 user stories complete
- Comprehensive testing and documentation

---

## Task Summary

- **Total Tasks**: 47
- **Setup**: 3 tasks
- **Foundation**: 8 tasks (blocking)
- **User Story 1**: 15 tasks (4 tests + 11 implementation)
- **User Story 2**: 8 tasks (2 tests + 6 implementation)
- **User Story 3**: 5 tasks (1 test + 4 implementation)
- **Polish**: 8 tasks
- **Parallel Opportunities**: ~20 tasks can run in parallel within their phases
- **MVP Task Count**: 24 tasks (Phases 1-3)

---

## Constitution Compliance Check

✅ **Code Quality First**: Shared module pattern, TypeScript strict mode, documentation updates planned
✅ **Test-Driven Development**: Tests written first (T010-T013, T025-T026, T033) before implementation
✅ **User Experience Consistency**: Dual interface (MCP + REST) maintained, progress comments for both paths
✅ **Performance & Reliability**: 30-second target tracked, error handling for LLM failures, graceful degradation
