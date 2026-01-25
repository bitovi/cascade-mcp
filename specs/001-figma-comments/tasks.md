# Tasks: Figma Comments Integration

**Feature Branch**: `001-figma-comments`  
**Generated**: January 24, 2026  
**Total Tasks**: 33

---

## Phase 1: Setup

**Purpose**: Project initialization and OAuth scope configuration

- [X] T001 Add `file_comments:write` scope to OAuth configuration in .env.example, docs/deployment.md, and contributing.md
- [X] T002 [P] Create comment type definitions in server/providers/figma/figma-comment-types.ts
- [X] T003 [P] Create analyze-figma-scope tool folder structure at server/providers/combined/tools/analyze-figma-scope/

**Checkpoint**: OAuth scope added, type definitions created, folder structure ready

---

## Phase 2: Foundational

**Purpose**: Blocking prerequisites for all user stories - Figma client comment methods

- [X] T004 Add `fetchComments(fileKey: string)` method to FigmaClient in server/providers/figma/figma-api-client.ts
- [X] T005 Add `postComment(fileKey: string, request: PostCommentRequest)` method to FigmaClient in server/providers/figma/figma-api-client.ts

**Checkpoint**: FigmaClient can read and write comments. All user stories can proceed.

---

## Phase 3: User Story 2 - Post AI Questions as Figma Comments (Priority: P1)

**Goal**: Validate comment posting works with a standalone tool before integrating into more complex tools.

**Independent Test**: Run `analyze-figma-scope` on a Figma file. Verify that question comments appear on the relevant frames in Figma with format `Cascade🤖: {Question}❓`.

### Implementation for User Story 2

- [X] T006 [P] [US2] Create Figma URL parser in server/providers/combined/tools/analyze-figma-scope/url-parser.ts
- [X] T007 [P] [US2] Create Figma analysis prompt template in server/providers/combined/tools/analyze-figma-scope/prompt-figma-analysis.ts
- [X] T007b [P] [US2] Create parseQuestionsFromScopeAnalysis regex parser in server/providers/combined/tools/analyze-feature-scope/parse-scope-analysis.ts (extracts ❓ questions from markdown)
- [X] T008 [US2] Create core logic with executeAnalyzeFigmaScope in server/providers/combined/tools/analyze-figma-scope/core-logic.ts (MUST always return questions in response per FR-019/FR-020)
- [X] T009 [US2] Create postQuestionsToFigma helper in server/providers/combined/tools/analyze-figma-scope/figma-comment-utils.ts
- [X] T010 [US2] Implement rate limit handling (consolidation logic + 429 retry with Retry-After header, max 3 retries) in server/providers/combined/tools/analyze-figma-scope/figma-comment-utils.ts
- [X] T011 [US2] Create MCP tool wrapper in server/providers/combined/tools/analyze-figma-scope/analyze-figma-scope.ts
- [X] T012 [US2] Create index.ts with registerAnalyzeFigmaScopeTool in server/providers/combined/tools/analyze-figma-scope/index.ts
- [X] T013 [US2] Register tool in combined tools index at server/providers/combined/index.ts
- [X] T014 [US2] Create REST API wrapper in server/api/analyze-figma-scope.ts
- [X] T015 [US2] Register REST endpoint in server/api/index.ts

**Checkpoint**: `analyze-figma-scope` tool posts questions to Figma frames. Rate limiting handled.

---

## Phase 4: User Story 1 - Read Figma Comments for Better Scope Analysis (Priority: P1)

**Goal**: Existing analysis tools incorporate comments from Figma as context.

**Independent Test**: Run `analyze-feature-scope` on a Figma file that contains comments. Verify the scope analysis output references or incorporates information from those comments.

### Implementation for User Story 1

- [X] T016 [P] [US1] Create fetchCommentsForFile helper in server/providers/combined/tools/analyze-figma-scope/figma-comment-utils.ts
- [X] T017 [P] [US1] Create groupCommentsIntoThreads helper in server/providers/combined/tools/analyze-figma-scope/figma-comment-utils.ts
- [X] T018 [US1] Create associateCommentsWithFrames helper in server/providers/combined/tools/analyze-figma-scope/figma-comment-utils.ts
- [X] T019 [US1] Create formatCommentsForContext helper in server/providers/combined/tools/analyze-figma-scope/figma-comment-utils.ts
- [X] T020 [US1] Integrate comment fetching into analyze-feature-scope core-logic at server/providers/combined/tools/analyze-feature-scope/core-logic.ts
- [X] T021 [US1] Update prompt generation to include comment context in server/providers/combined/tools/analyze-feature-scope/

**Checkpoint**: `analyze-feature-scope` reads and incorporates Figma comments as context.

---

## Phase 5: User Story 3 - Incorporate Comments into Shell Story Generation (Priority: P1)

**Goal**: Shell story generation considers Figma comments when creating stories.

**Independent Test**: Run `write-shell-stories` on an epic linked to a Figma file with comments. Verify that generated stories incorporate context from comments.

### Implementation for User Story 3

- [X] T022 [US3] Integrate comment fetching into write-shell-stories core-logic at server/providers/combined/tools/writing-shell-stories/core-logic.ts
- [X] T023 [US3] Update shell story prompt to include comment context in server/providers/combined/tools/writing-shell-stories/

**Checkpoint**: `write-shell-stories` incorporates Figma comments into generated stories.

---

## Phase 6: User Story 4 - Provide Optional Context Description (Priority: P1)

**Goal**: Users can provide additional text context for standalone Figma analysis.

**Independent Test**: Run `analyze-figma-scope` with both a Figma URL and a context description. Verify the analysis incorporates the description.

### Implementation for User Story 4

- [X] T024 [US4] Add contextDescription parameter to AnalyzeFigmaScopeInput in server/providers/combined/tools/analyze-figma-scope/core-logic.ts
- [X] T025 [US4] Update prompt template to incorporate context description in server/providers/combined/tools/analyze-figma-scope/prompt-figma-analysis.ts
- [X] T026 [US4] Update MCP tool schema to include contextDescription in server/providers/combined/tools/analyze-figma-scope/analyze-figma-scope.ts

**Checkpoint**: `analyze-figma-scope` accepts and uses optional context description.

---

## Phase 7: User Story 5 - Debug Comment Output (Priority: P2)

**Goal**: Developers can inspect fetched comment data via debug cache files.

**Independent Test**: Set `SAVE_FIGMA_COMMENTS_TO_CACHE=true`, run `analyze-feature-scope` on a Figma file with comments. Verify that `.comments.md` files are created in the cache directory.

### Implementation for User Story 5

- [X] T027 [US5] Add SAVE_FIGMA_COMMENTS_TO_CACHE environment variable handling in server/providers/combined/tools/analyze-figma-scope/figma-comment-utils.ts
- [X] T028 [US5] Create formatCommentsAsMarkdown helper for debug output in server/providers/combined/tools/analyze-figma-scope/figma-comment-utils.ts
- [X] T029 [US5] Integrate debug cache writing into comment fetch flow in server/providers/combined/tools/analyze-figma-scope/figma-comment-utils.ts

**Checkpoint**: Debug comment files written when `SAVE_FIGMA_COMMENTS_TO_CACHE=true`.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cleanup, and validation

- [X] T030 [P] Create README.md for analyze-figma-scope tool at server/providers/combined/tools/analyze-figma-scope/README.md
- [X] T031 Update server/readme.md to document new tool and comment integration
- [X] T032 Run quickstart.md validation scenarios (requires manual testing with live Figma/Jira tokens - see quickstart.md for steps)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on T002 (type definitions) - BLOCKS all user stories
- **User Story 2 (Phase 3)**: Depends on Phase 2 - Validates posting before integration
- **User Story 1 (Phase 4)**: Depends on Phase 2 - Can parallel with US2 if resources allow
- **User Story 3 (Phase 5)**: Depends on Phase 4 (needs comment fetching) - Sequential after US1
- **User Story 4 (Phase 6)**: Depends on Phase 3 - Enhances analyze-figma-scope tool
- **User Story 5 (Phase 7)**: Depends on Phase 4 - Debug feature built on comment fetching
- **Polish (Phase 8)**: Depends on all user story phases completing

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (FigmaClient methods)
    ↓
    ├─────────────────────────────────────────┐
    ↓                                         ↓
Phase 3: User Story 2 (Post Questions)    Phase 4: User Story 1 (Read Comments)
    ↓                                         ↓
Phase 6: User Story 4 (Context Desc)     Phase 5: User Story 3 (Shell Stories)
                                              ↓
                                         Phase 7: User Story 5 (Debug Output)
                                              ↓
                                         Phase 8: Polish
```

### Within Each User Story

- Models/types before utilities
- Utilities before core logic
- Core logic before wrappers (MCP/REST)
- Wrappers before registration

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T006 and T007 can run in parallel (different files)
- T016 and T017 can run in parallel (different functions in same file - different responsibilities)
- Phase 3 (US2) and Phase 4 (US1) can run in parallel after Phase 2

---

## Parallel Example: User Story 2

```bash
# Launch foundational URL parser and prompt in parallel:
Task T006: "Create Figma URL parser in .../url-parser.ts"
Task T007: "Create Figma analysis prompt template in .../prompt-figma-analysis.ts"

# Then sequential core logic and utilities:
Task T008: "Create core logic with executeAnalyzeFigmaScope"
Task T009: "Create postQuestionsToFigma helper"
Task T010: "Implement rate limit handling"

# Then parallel wrappers:
Task T011: "Create MCP tool wrapper"
Task T014: "Create REST API wrapper"
```

---

## Implementation Strategy

### MVP First (User Story 2 Only)

1. Complete Phase 1: Setup (OAuth scope, types, folder)
2. Complete Phase 2: Foundational (FigmaClient methods)
3. Complete Phase 3: User Story 2 (Post Questions)
4. **STOP and VALIDATE**: Test `analyze-figma-scope` posts questions to Figma
5. Deploy/demo if ready - standalone Figma analysis tool works

### Incremental Delivery

1. Complete Setup + Foundational → Infrastructure ready
2. Add User Story 2 → Test posting → Deploy (MVP!)
3. Add User Story 1 → Existing tools read comments → Deploy
4. Add User Story 3 → Shell stories use comments → Deploy
5. Add User Story 4 → Context description support → Deploy
6. Add User Story 5 → Debug output → Deploy
7. Each story adds value without breaking previous stories

### Recommended Execution Order

Per clarifications, validate posting (US2) early before integration (US3):

1. **Phase 1-2**: Setup + Foundational
2. **Phase 3**: User Story 2 - Validate posting works
3. **Phase 4**: User Story 1 - Add comment reading
4. **Phase 5**: User Story 3 - Integrate into shell stories
5. **Phase 6**: User Story 4 - Add context description
6. **Phase 7**: User Story 5 - Debug features (P2)
7. **Phase 8**: Polish

---

## Notes

- **TDD Decision**: Tests not included in initial task list per user request. Constitution mandates TDD; add test tasks before implementation if strict compliance required.
- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- User Story 2 prioritized first per clarification to validate posting before integration
- User Story 5 is P2 (debug feature) - can be deferred if needed
- Adding `file_comments:write` scope may require existing users to re-authorize
