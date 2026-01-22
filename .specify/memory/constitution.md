<!--
Sync Impact Report:
Version: 0.0.0 → 1.0.0 (Initial constitution establishment)

Added Sections:
- Core Principles (4 principles: Code Quality First, Test-Driven Development, User Experience Consistency, Performance & Reliability)
- Quality Gates
- Development Workflow
- Governance

Templates requiring updates:
✅ plan-template.md - Constitution Check section aligned with new principles
✅ spec-template.md - User scenarios validate UX consistency principle
✅ tasks-template.md - Task categorization reflects all principles (testing, UX, performance)

Follow-up TODOs: None - all placeholders filled
-->

# Cascade MCP Tools Constitution

## Core Principles

### I. Code Quality First

Every code contribution MUST meet these non-negotiable standards:

- **Modular Architecture**: Complex MCP tools organized in dedicated folders (`server/providers/{provider}/tools/{tool-name}/`) with separation of concerns (main file, helper modules, parsers/validators)
- **Typed Interfaces**: TypeScript strict mode enforced; all function signatures require explicit types; no `any` types without justification
- **Documentation**: All public functions, tools, and APIs documented with purpose, parameters, return types, and usage examples; keep `server/readme.md` synchronized with all API changes
- **Code Organization**: Top section (imports/types), middle section (orchestration), bottom section (helper functions in execution order)
- **Utility Placement**: General utilities in `server/utils/`, provider-specific in `server/providers/{provider}/`, tool-specific in tool folder
- **Error Handling**: Functions throw descriptive errors (no error objects returned); use `InvalidTokenError` pattern for OAuth re-authentication

**Rationale**: Cascade MCP bridges multiple authentication systems and protocols. Poor code quality compounds complexity exponentially, making debugging OAuth flows, MCP transport sessions, and multi-provider integrations nearly impossible. Strict organization enables safe evolution of a system handling JWT tokens, PKCE flows, session management, and provider-specific API clients.

### II. Test-Driven Development (NON-NEGOTIABLE)

TDD cycle strictly enforced for all new functionality:

1. **Tests written first** → User approved → Tests fail → Implementation proceeds
2. **Red-Green-Refactor**: Write failing test → Make it pass → Refactor while keeping green
3. **Test Coverage Requirements**:
   - Contract tests for all MCP tools and REST API endpoints
   - Integration tests for OAuth flows (PKCE bridge, token refresh, session management)
   - Unit tests for helper functions (parsers, validators, formatters)
   - End-to-end tests for multi-provider workflows (Jira + Figma integration)
4. **Testing Exemptions**: Simple getters, type definitions, pure configuration files (must be explicitly justified)
5. **Test Organization**: `tests/contract/`, `tests/integration/`, `tests/unit/` - all tests export functions for testability

**Rationale**: OAuth 2.0 authentication, MCP transport sessions, and multi-provider integrations are inherently fragile. Token expiration, refresh flows, session cleanup, and provider API changes create countless failure modes. Tests written first force clear contracts and prevent regression when refactoring authentication flows or adding provider capabilities.

### III. User Experience Consistency

All user-facing interfaces MUST maintain consistency:

- **Dual Interface Pattern**: Every tool exposes both MCP protocol and REST API without code duplication (`core-logic.ts` for shared business logic)
- **Authentication Transparency**: OAuth (MCP clients) and PAT (REST API) paths yield identical functionality; users should not need to understand implementation details
- **Error Messages**: User-friendly errors with actionable guidance (e.g., "Token expired - re-authentication required" not "InvalidTokenError: 401")
- **LLM Provider Support**: Support 8 major LLM clients (Anthropic, OpenAI, Google, AWS Bedrock, Mistral, DeepSeek, Groq, xAI) with unified credential handling
- **Documentation Parity**: Every tool documented in both MCP schema and REST API docs with identical descriptions

**Rationale**: Cascade MCP serves multiple client types (VS Code Copilot, Claude Desktop, REST API users, scripts). Inconsistent interfaces force users to learn multiple mental models and create support burden. Unified business logic ensures feature parity while dual wrappers adapt to each interface's conventions.

### IV. Performance & Reliability

System MUST meet these performance and reliability standards:

- **Token Lifecycle Management**: JWT expires 1 minute before underlying provider token; automatic refresh flow triggers on `InvalidTokenError`
- **Session Efficiency**: Reuse MCP transport sessions via `mcp-session-id` headers; avoid creating new transports for each request
- **API Client Patterns**: All provider API requests through typed clients (`AtlassianClient`, `FigmaClient`); no direct fetch calls
- **Caching Strategy**: Figma file metadata cached in `cache/figma-files/` to reduce API calls; cache invalidation on 404/403 errors
- **Background Processes**: Long-running tasks (servers, file downloads, AI operations) use VS Code tasks with `isBackground: true`
- **Logging Standards**: First console.log in function has no extra indentation; subsequent logs indent content by 2 spaces
- **Resource Cleanup**: Transport `onclose` handlers MUST call `clearAuthContext(sessionId)` to prevent memory leaks

**Rationale**: OAuth flows impose latency (token exchange, validation). Session reuse, intelligent caching, and proper resource cleanup are critical for responsive UX. Poor token lifecycle management causes frequent re-authentication, frustrating users. Memory leaks in session management crash long-running MCP servers.

## Quality Gates

All pull requests MUST pass these gates before merge:

1. **Constitution Compliance**: Code reviewed against all four core principles
2. **Type Safety**: `npm run typecheck` passes with zero errors
3. **Test Suite**: All tests pass; new features include tests written first (TDD proof via commit history)
4. **Documentation Sync**: `server/readme.md` updated if public APIs changed; tool READMEs updated
5. **Authentication Validation**: OAuth and PAT paths tested if tool supports both interfaces
6. **Performance Baseline**: No regressions in token refresh flow latency (<2s for full PKCE exchange)

## Development Workflow

1. **Feature Specifications**: Use `.specify/templates/spec-template.md` with independently testable user stories prioritized (P1, P2, P3)
2. **Implementation Planning**: Use `.specify/templates/plan-template.md` including Constitution Check section
3. **Task Breakdown**: Use `.specify/templates/tasks-template.md` organized by user story for independent implementation
4. **Code Review**: Constitution principles explicitly verified in PR description
5. **Testing Gates**: Tests written first, reviewed before implementation approval
6. **Runtime Development**: Use `.github/copilot-instructions.md` for agent-assisted development patterns

## Governance

This Constitution supersedes all other development practices and documentation:

- **Amendment Process**: Constitution changes require documented rationale, impact analysis, and version bump per semantic versioning
- **Version Semantics**:
  - **MAJOR**: Principle removal, redefinition, or backward-incompatible governance changes
  - **MINOR**: New principle added or material expansion of existing principle
  - **PATCH**: Clarifications, wording improvements, typo fixes
- **Complexity Justification**: Violations of principles MUST be documented in `plan.md` Complexity Tracking section with business justification and mitigation plan
- **Compliance Reviews**: Quarterly review of codebase against Constitution; findings tracked in issues
- **Guidance Files**: `.github/copilot-instructions.md` provides runtime development guidance and MUST NOT contradict Constitution

**Version**: 1.0.0 | **Ratified**: 2026-01-15 | **Last Amended**: 2026-01-15
