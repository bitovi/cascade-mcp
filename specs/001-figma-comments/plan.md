# Implementation Plan: Figma Comments Integration

**Branch**: `001-figma-comments` | **Date**: January 24, 2026 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-figma-comments/spec.md`

## Summary

Integrate Figma comments into cascade-mcp workflow to enhance AI analysis with stakeholder feedback. The feature enables:

1. **Reading comments**: Existing tools (`analyze-feature-scope`, `write-shell-stories`) will read Figma comments as additional context for better scope analysis and story generation
2. **Posting questions**: New `analyze-figma-scope` tool analyzes Figma designs standalone and posts clarifying questions directly as comments on relevant frames

**Technical Approach**:
- Use Figma REST API `GET/POST /v1/files/:key/comments` endpoints
- Add `file_comments:write` OAuth scope (read scope already exists)
- Fresh fetch per run (no caching - comments don't trigger `last_touched_at`)
- Dual interface pattern (MCP + REST API) with shared core logic
- Rate limit handling: consolidate questions if >25, return questions even on failure

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)  
**Primary Dependencies**: Figma API, @modelcontextprotocol/sdk, ai (vercel AI SDK), Express  
**Storage**: In-memory only for comments; optional debug output to `cache/figma-files/` via env var  
**Testing**: Jest (unit, integration, e2e)  
**Target Platform**: Node.js server (MCP + REST API)
**Project Type**: Web application (backend API + optional frontend client)  
**Performance Goals**: No regression in existing tool latency; <5s for comment operations  
**Constraints**: Figma API rate limits (25-100 req/min per seat tier); ~10KB max comment size  
**Scale/Scope**: Typical Figma files have 10-100 comments; support up to 1000 comments per file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Code Quality First**: Modular architecture planned with proper folder structure (`server/providers/combined/tools/analyze-figma-scope/`)? TypeScript strict mode enforced. New code organized as: main tool file, core-logic.ts for shared logic, figma-comment-utils.ts for comment helpers. Documentation requirements: update server/readme.md with new tool.
- [x] **Test-Driven Development**: TDD workflow planned. Test types: contract tests for new MCP tool, integration tests for comment posting, unit tests for comment parsing/association helpers. Test files in tool `__tests__/` folder.
- [x] **User Experience Consistency**: Dual interface pattern planned - MCP tool wrapper + REST API wrapper sharing `core-logic.ts`. OAuth path (MCP) and PAT path (REST) yield identical functionality. Error messages include actionable guidance (e.g., "Missing scope: file_comments:write. Please re-authorize.").
- [x] **Performance & Reliability**: Fresh fetch strategy (no caching for comments since they don't trigger last_touched_at). Rate limit handling with retry and consolidation fallback. API calls through FigmaClient. Questions always returned in response regardless of posting success.

**Violations Requiring Justification**: None identified. All principles can be followed.

## Project Structure

### Documentation (this feature)

```text
specs/001-figma-comments/
├── plan.md              # This file
├── spec.md              # Feature specification (completed)
├── research.md          # Phase 0 output (completed)
├── data-model.md        # Phase 1 output (completed)
├── quickstart.md        # Phase 1 output (completed)
├── contracts/           # Phase 1 output (completed)
│   ├── analyze-figma-scope.yaml     # OpenAPI spec for REST API
│   └── analyze-figma-scope-mcp.md   # MCP tool contract
├── checklists/
│   └── requirements.md  # Requirements tracking
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── providers/
│   ├── figma/
│   │   ├── figma-api-client.ts      # Existing - add comment methods
│   │   ├── figma-cache.ts           # Existing - add debug comment output
│   │   ├── figma-helpers.ts         # Existing - no changes needed
│   │   ├── figma-comment-types.ts   # NEW - Comment type definitions
│   │   └── tools/
│   │       └── index.ts             # Existing - register new tool
│   └── combined/
│       └── tools/
│           ├── analyze-feature-scope/
│           │   ├── core-logic.ts    # MODIFY - Add comment context
│           │   └── ...
│           ├── writing-shell-stories/
│           │   ├── core-logic.ts    # MODIFY - Add comment context  
│           │   └── ...
│           └── analyze-figma-scope/    # NEW - Complete tool folder
│               ├── index.ts            # Tool registration
│               ├── analyze-figma-scope.ts  # MCP tool wrapper
│               ├── core-logic.ts       # Shared business logic
│               ├── figma-comment-utils.ts  # Comment fetch/post/associate
│               ├── prompt-figma-analysis.ts # AI prompts
│               ├── README.md           # Tool documentation
│               └── __tests__/          # Test files
│                   ├── figma-comment-utils.test.ts
│                   └── core-logic.test.ts
├── api/
│   └── analyze-figma-scope.ts      # NEW - REST API wrapper
└── readme.md                       # UPDATE - Document new tool

test/
└── e2e/
    └── analyze-figma-scope.test.ts  # NEW - E2E tests
```

**Structure Decision**: Follows existing combined tools pattern (`analyze-feature-scope`, `write-shell-stories`). New `analyze-figma-scope` tool placed in `server/providers/combined/tools/` because it may optionally integrate with Jira in future. Comment utilities in tool folder since they're semi-specific to this workflow. Type definitions in `server/providers/figma/` for reuse across Figma tools.

## Complexity Tracking

> **No Constitution violations identified. This section is for documentation only.**

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| No comment caching | Fresh fetch each run | Figma comments don't trigger `last_touched_at` - cache invalidation would fail |
| Rate limit assumption | 25/min (Dev/Full seat) | Cannot determine user's seat type; conservative baseline with graceful fallback |
| Tie-breaking for frame association | Associate with all equidistant frames | Deterministic behavior; no information loss |
| Comment position in frame | Top-left (0,0) | Simple, consistent; avoids obscuring design content |
