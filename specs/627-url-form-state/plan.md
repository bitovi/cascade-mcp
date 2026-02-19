# Implementation Plan: URL-Based Form State Restoration

**Branch**: `627-url-form-state` | **Date**: February 19, 2026 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/627-url-form-state/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add URL-based state restoration to the Simple Client (browser MCP client) enabling users to share URLs with pre-configured tool selections and API keys. When a user selects a tool, the browser URL automatically updates with a kebab-case tool parameter using history.replaceState (no new history entries). URL parameters are read on page load to restore both the Anthropic API key input and tool selection after connection. Invalid tool parameters are kept in the URL for transparency. Manual key entry never exposes keys in the URL for security, but URL-provided keys persist for reload convenience.

## Technical Context

**Language/Version**: TypeScript 5.3 (React 18, Vite 5)  
**Primary Dependencies**: React, @modelcontextprotocol/sdk, URLSearchParams API, History API (history.replaceState)  
**Storage**: URL query parameters only (no localStorage for this feature per FR-012)  
**Testing**: Vitest for unit tests, React Testing Library for component tests  
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge) with ES2020+ support  
**Project Type**: Web application (frontend-only feature within existing Simple Client)  
**Performance Goals**: URL update <100ms on tool selection, tool restoration <2s after connection (per success criteria)  
**Constraints**: No page reloads on URL changes, no localStorage/sessionStorage persistence, manual key entry must not expose keys in URL  
**Scale/Scope**: Single-page application with ~10 tools, affects 3 components (HomePage, ConnectionPanel, ToolSelector)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Initial Check (Pre-Research)**: ✅ Passed

- [x] **Code Quality First**: Modular architecture planned - URL parameter utilities will be created in `client/src/lib/url-params/` with separate modules for reading, writing, and tool name conversion. TypeScript strict mode already enforced in project. Documentation requirements identified (utility functions, hook updates).
- [x] **Test-Driven Development**: TDD workflow planned - unit tests for URL parameter utilities (kebab-case conversion, param parsing), integration tests for URL updates on tool selection, component tests for URL restoration on mount. Test types: unit (utilities), integration (URL behavior), component (React Testing Library).
- [x] **User Experience Consistency**: Feature is frontend-only within Simple Client (browser MCP client), no REST API equivalent needed. Error handling planned: invalid tool parameters ignored gracefully with no UI errors shown (silent fallback per clarification). No special error messages required beyond existing connection/tool execution errors.
- [x] **Performance & Reliability**: Performance targets defined (<100ms URL update, <2s tool restoration). URL reading happens once on mount; URL writing uses replaceState (synchronous, no performance overhead). No caching strategy needed (stateless URL reads). No resource cleanup required (no subscriptions, no timers, no event listeners beyond React lifecycle).

**Post-Design Re-Evaluation**: ✅ Passed

- [x] **Code Quality First**: Design confirmed modular structure with `client/src/lib/url-params/{reader.ts, writer.ts, tool-name.ts, types.ts, index.ts}`. All functions documented in quickstart.md with usage examples. TypeScript types defined in types.ts. Separation of concerns maintained (reading, writing, conversion as separate modules).
- [x] **Test-Driven Development**: Test suite designed in quickstart.md with unit tests (`url-params.test.ts`: toKebabCase, findToolByKebabName) and integration tests (`url-state-restoration.test.tsx`: full workflow scenarios). 6 manual testing scenarios documented. TDD commitment: tests written before implementation per workflow in tasks.md.
- [x] **User Experience Consistency**: Design maintains consistency - no visible errors for invalid tools, silent fallback to tool selector. URL updates happen transparently without page reload. Security preserved: manual keys never exposed in URL. User expectations met: back button navigates pages (no history pollution via replaceState).
- [x] **Performance & Reliability**: Design achieves performance targets - URLSearchParams API (<10ms), replaceState (<5ms), tool lookup O(n) with n≈10 (<1ms). Total overhead <20ms well under 100ms budget. Reliability ensured: no async operations, no race conditions, no resource leaks (stateless URL operations).

**Violations Requiring Justification**: None - feature aligns with all constitution principles in both planning and design phases

## Project Structure

### Documentation (this feature)

```text
specs/627-url-form-state/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Not applicable (no API contracts for frontend-only feature)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
client/
├── src/
│   ├── lib/
│   │   ├── url-params/          # NEW: URL parameter utilities
│   │   │   ├── index.ts         # Public API exports
│   │   │   ├── reader.ts        # Read URL parameters on mount
│   │   │   ├── writer.ts        # Update URL with replaceState
│   │   │   └── tool-name.ts     # Tool name <-> kebab-case conversion
│   │   └── mcp-client/
│   │       └── ...              # Existing MCP client code
│   ├── pages/
│   │   └── HomePage.tsx         # MODIFIED: Add URL restoration logic
│   ├── components/
│   │   ├── ConnectionPanel/
│   │   │   └── ConnectionPanel.tsx  # MODIFIED: Read anthropicKey from URL
│   │   └── ToolSelector/
│   │       └── ToolSelector.tsx     # MODIFIED: Write tool to URL on selection
│   └── hooks/
│       └── useMcpClient.ts      # MODIFIED (if needed): Expose tool state
└── tests/
    ├── unit/
    │   └── url-params.test.ts   # NEW: URL parameter utility tests
    └── integration/
        └── url-state-restoration.test.tsx  # NEW: Full workflow tests
```

**Structure Decision**: Web application frontend-only feature. Selected Option 2 structure (Web application), using only the `client/` (frontend) portion since no backend changes required. New URL parameter utilities isolated in `client/src/lib/url-params/` for modularity, following the Code Quality First principle. Changes touch HomePage (orchestration), ConnectionPanel (key restoration), and ToolSelector (URL updates) components.

## Complexity Tracking

No Constitution violations - this section intentionally empty.
