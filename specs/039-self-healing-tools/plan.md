# Implementation Plan: Self-Healing Story Writing Tools

**Branch**: `039-self-healing-tools` | **Date**: 2026-01-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/039-self-healing-tools/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Make `write-shell-stories` self-healing by automatically running scope analysis internally when no "## Scope Analysis" section exists in the epic. The tool will count unanswered questions (❓) and either proceed with shell stories (≤5 questions) or create/regenerate a Scope Analysis section asking for clarification (>5 questions). This eliminates the need for users to understand and manually run `analyze-feature-scope` first, while maintaining backward compatibility. The approach integrates Figma comment threads from `figma-review-design` to reduce duplicate questions.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js runtime)
**Primary Dependencies**: Existing codebase using AI SDK, Zod, MCP protocol libraries
**Storage**: File-based caching (`cache/` directory), Jira API for persistence
**Testing**: Jest (contract/integration/unit tests)
**Target Platform**: Node.js server (MCP + REST API)
**Project Type**: Single project (existing monorepo structure)
**Performance Goals**: Scope Analysis LLM call completes within 30 seconds for typical epic with 3-5 Figma designs
**Constraints**: Jira character limit (43,838), Must preserve existing behavior for backward compatibility
**Scale/Scope**: Refactoring 1 existing tool (`write-shell-stories`), deprecating 1 tool (`analyze-feature-scope`), modifying shared logic

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Code Quality First**: Modular architecture with proper folder structure already exists. Will extract scope analysis logic into `shared/scope-analysis-helpers.ts` for reuse. TypeScript strict mode enforced. Will update `server/readme.md` with new self-healing workflow.
- [x] **Test-Driven Development**: TDD workflow planned with contract tests (self-healing flow), integration tests (scope analysis + shell stories), and unit tests (question counter, scope extractor). Tests will be written first per TDD cycle.
- [x] **User Experience Consistency**: Dual interface pattern already exists (`write-shell-stories` has both MCP and REST API endpoints). OAuth/PAT paths will work identically. Error messages will be user-friendly (e.g., "Could not analyze questions - please retry" not technical LLM errors).
- [x] **Performance & Reliability**: Performance target: Scope Analysis LLM call completes within 30 seconds. Will reuse existing token lifecycle (no changes needed). Caching strategy: Existing Figma file cache. On LLM failure, error immediately and ask user to retry (preserve existing content).

**Violations Requiring Justification**: None - all Constitution principles followed.

## Project Structure

### Documentation (this feature)

```text
specs/039-self-healing-tools/
├── spec.md              # Feature specification (already exists)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── write-shell-stories-response.schema.json
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
server/providers/combined/tools/
├── writing-shell-stories/
│   ├── core-logic.ts                    # [MODIFIED] Add self-healing logic
│   ├── write-shell-stories.ts           # [MODIFIED] Update tool description
│   ├── prompt-shell-stories.ts          # No changes needed
│   ├── figma-screen-setup.ts           # No changes needed
│   └── ... (other existing files)
│
├── analyze-feature-scope/
│   ├── analyze-feature-scope.ts         # [MODIFIED] Add deprecation notice
│   ├── core-logic.ts                    # [EXTRACT] Extract scope analysis logic for reuse
│   ├── strategies/
│   │   └── prompt-scope-analysis-2.ts   # [EXTRACT] Reusable prompt generation
│   └── README.md                        # [MODIFIED] Add deprecation notice
│
└── shared/
    └── scope-analysis-helpers.ts        # [NEW] Shared scope analysis utilities

server/api/
├── write-shell-stories.ts               # [MODIFIED] Update to handle new workflow
└── analyze-feature-scope.ts             # No changes needed (backward compatibility)

test/
├── contract/
│   └── write-shell-stories-self-healing.test.ts  # [NEW] Contract tests
├── integration/
│   └── scope-analysis-integration.test.ts        # [NEW] Integration tests
└── unit/
    ├── question-counter.test.ts                  # [NEW] Unit tests
    └── scope-analysis-extractor.test.ts          # [NEW] Unit tests

docs/
└── self-healing-tools.md                # [NEW] User-facing documentation
```

**Structure Decision**: Existing single-project structure. Modifications focus on `server/providers/combined/tools/writing-shell-stories/` to add self-healing logic. Extract shared scope analysis logic into reusable modules to avoid duplication between `write-shell-stories` and `analyze-feature-scope`.

## Complexity Tracking

No Constitution violations - this section is empty.

---

## Phase 0: Research (COMPLETE)

All research questions have been answered and documented in [research.md](./research.md).

**Key Decisions**:
- Extract scope analysis logic to shared module
- Parse ❓ markers with regex (no separate LLM call)
- Use existing `extractScopeAnalysis()` for section detection
- Always regenerate analysis when section exists
- Hardcoded threshold of 5 (no configuration)
- Deprecate `analyze-feature-scope` gracefully

---

## Phase 1: Design & Contracts (COMPLETE)

### Data Model

Created [data-model.md](./data-model.md) defining:
- **Question**: Clarifying question with status (❓/💬)
- **ScopeAnalysisSection**: Epic section with feature areas
- **FeatureArea**: Functional grouping of features
- **Feature**: Single feature with category (☐/❌/❓/⏬/✅)
- **ScopeAnalysisResult**: Return type from shared function
- **SelfHealingDecision**: Enum for workflow decisions

### API Contracts

Created contracts in `/contracts/`:
- `write-shell-stories-response.schema.json` - Tool response format
- `scope-analysis-result.schema.json` - Internal result type

Both use JSON Schema for validation and documentation.

### Quickstart Guide

Created [quickstart.md](./quickstart.md) with:
- Old vs new workflow comparison
- 3 scenarios (happy path, clarification, Figma comments)
- Migration guide from `analyze-feature-scope`
- Response field reference
- Tips & troubleshooting

### Agent Context Update

Updated `.github/agents/copilot-instructions.md` with:
- TypeScript 5.x (Node.js runtime)
- AI SDK, Zod, MCP protocol libraries
- File-based caching + Jira API
- Single project (monorepo structure)

---

## Phase 2: Implementation Planning (NEXT STEP)

This phase is completed by running `/speckit.tasks` command, which will:

1. Break down implementation into tasks organized by user story
2. Identify dependencies between tasks
3. Estimate complexity for each task
4. Create test-first workflow checkpoints

**DO NOT proceed to Phase 2 manually.** Run `/speckit.tasks` when ready to begin implementation.

---

## Re-evaluation: Constitution Check (POST-DESIGN)

*GATE: Must pass after Phase 1 design completion.*

- [x] **Code Quality First**: Data model clearly defined with TypeScript interfaces. Shared module pattern (`scope-analysis-helpers.ts`) follows existing conventions. Documentation requirements captured in quickstart and will be reflected in `server/readme.md`.
- [x] **Test-Driven Development**: Test types identified (contract, integration, unit) with specific test files in project structure. TDD workflow will be enforced via `/speckit.tasks` command which generates test-first checkpoints.
- [x] **User Experience Consistency**: API contract shows identical structure for both MCP and REST API responses. Error messages are user-friendly in all examples. Migration guide ensures smooth transition from old workflow.
- [x] **Performance & Reliability**: Performance target (30 seconds) documented in Technical Context. Error handling strategy (error immediately, preserve content) documented in research. Existing caching patterns reused.

**GATE STATUS**: ✅ PASSED

**Violations**: None

**Justification**: Design maintains all Constitution principles. Ready for implementation (Phase 2).

---

## Summary

**Status**: Phases 0 and 1 complete, ready for Phase 2 (task breakdown)

**Deliverables**:
- ✅ research.md - All technical decisions documented
- ✅ data-model.md - Complete entity definitions and state machines
- ✅ contracts/ - JSON schemas for API responses
- ✅ quickstart.md - User-facing migration guide
- ✅ Agent context updated with new patterns

**Next Command**: `/speckit.tasks` to generate implementation tasks
