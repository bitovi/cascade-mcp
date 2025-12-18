<!--
Sync Impact Report - Version 1.0.0
================================================================================
Version Change: Initial → 1.0.0
Type: MINOR (new governance structure established)

Principles Established:
- I. Modular Architecture & Code Organization
- II. Type Safety & Code Quality
- III. Testing Standards (NON-NEGOTIABLE)
- IV. User Experience Consistency
- V. Performance & Observability

Sections Added:
- Core Principles (5 principles)
- Technical Standards
- Development Workflow
- Governance

Templates Status:
✅ plan-template.md - Updated with specific constitution check gates for all 5 principles
✅ spec-template.md - Already aligned with user story prioritization and testing requirements
✅ tasks-template.md - Already aligned with test-first and parallel execution principles
✅ checklist-template.md - No changes needed (general purpose template)
✅ agent-file-template.md - No changes needed (general purpose template)

Follow-up TODOs:
- None - all templates reviewed and aligned

Rationale:
- MINOR version (1.0.0) as this is the initial establishment of governance
- Focus on MCP tool development patterns, OAuth security, and multi-provider architecture
- Emphasizes modular, testable, and observable code practices
- All principles are immediately applicable and enforceable
================================================================================
-->

# Cascade MCP Tools Constitution

## Core Principles

### I. Modular Architecture & Code Organization

All code MUST follow the established modular patterns for MCP tools:

- **Tool Structure**: Complex MCP tools MUST have their own folder under `server/providers/{provider}/tools/{tool-name}/` containing:
  - `index.ts` - Tool registration export
  - `{tool-name}.ts` - Main implementation with orchestration function and step helpers
  - `{helper-name}.ts` - Semi-specific helper modules (parsers, validators, formatters)

- **Dual Interface Pattern**: New tools MUST support both MCP protocol and REST API without code duplication:
  - `core-logic.ts` - Shared business logic
  - MCP wrapper - Uses OAuth context
  - REST API wrapper - Uses PAT headers

- **Helper Function Separation**:
  - Semi-specific helpers (reusable across workflows) → Separate module files
  - Broad workflow steps → Exported functions at bottom of main file in execution order
  - General utilities → `server/utils/`
  - Provider-specific utilities → `server/providers/{provider}/`

**Rationale**: Modularity enables independent testing, code reuse, and maintainability. The dual interface pattern ensures features are accessible through multiple channels without duplication.

### II. Type Safety & Code Quality

TypeScript MUST be used with strict type checking enabled:

- **No `any` types** except when interfacing with untyped external libraries (must be documented)
- **Explicit return types** on all exported functions
- **Interface definitions** for all data structures passed between modules
- **Consistent logging format**: First console.log in function has no extra indentation; subsequent logs indent content by 2 spaces

**Code Organization**:

- Main tool file structure: Imports → Type definitions → Registration function → Step helper functions (execution order)
- All exported functions MUST throw descriptive errors (never return error objects)
- Follow existing patterns from `write-shell-stories` or `analyze-feature-scope` for consistency

**Rationale**: Type safety prevents runtime errors and improves developer experience through autocomplete and refactoring support. Consistent patterns reduce cognitive load.

### III. Testing Standards (NON-NEGOTIABLE)

Testing discipline MUST be maintained across all changes:

- **Test Types**:
  - Unit tests for helper functions and utilities
  - Integration tests for OAuth flows and API interactions
  - E2E tests for complete user workflows
  - Contract tests for API endpoints

- **Coverage Requirements**:
  - All new tools MUST have integration tests
  - All helper modules MUST have unit tests
  - All API endpoints MUST have contract tests
  - OAuth and authentication flows MUST have E2E tests

- **Testing Commands**:
  - `npm run test` - Run all tests
  - `npm run test:watch` - Development mode
  - `npm run test:e2e` - Full E2E suite
  - `npm run test:e2e:rest-api` - REST API workflow tests

**Rationale**: The OAuth bridge architecture and multi-provider integrations create complex interaction patterns. Comprehensive testing prevents regressions and ensures authentication flows work correctly.

### IV. User Experience Consistency

All user-facing interfaces MUST maintain consistency:

- **Error Handling**:
  - Use `InvalidTokenError` for OAuth re-authentication triggers
  - Follow RFC 6750 for OAuth 2.0 bearer token error responses
  - Provide clear, actionable error messages
  - Include proper CORS headers for VS Code compatibility

- **API Design**:
  - RESTful endpoints follow `/api/{tool-name}` pattern
  - MCP tools follow Model Context Protocol specification
  - Support both OAuth (MCP clients) and PAT (REST API) authentication
  - Consistent response formats (JSON for APIs, structured output for tools)

- **Documentation**:
  - Every tool MUST have a README.md with usage examples
  - Keep `server/readme.md` synchronized with API changes
  - Document all environment variables in deployment docs
  - Include OAuth setup instructions for new providers

**Rationale**: Users interact through multiple interfaces (MCP clients, REST API, browser client). Consistency across these touchpoints creates a predictable, reliable experience.

### V. Performance & Observability

All production code MUST be observable and performant:

- **Logging Standards**:
  - Use structured logging (Winston) with appropriate log levels
  - Include context (session IDs, tool names, operation IDs)
  - Log key events: OAuth flows, token refresh, API calls, errors
  - Sanitize tokens before logging (use `sanitizeTokenForLogging()`)

- **Performance Requirements**:
  - OAuth token validation: <50ms p95
  - API endpoint responses: <2s p95 (excluding LLM calls)
  - Session cleanup on transport close to prevent memory leaks
  - Implement caching for Figma files (`cache/figma-files/`)

- **Monitoring**:
  - Sentry integration for error tracking and performance monitoring
  - CloudWatch logging for production deployments
  - Session lifecycle tracking via `mcp-session-id` headers
  - Track token expiration and refresh patterns

**Rationale**: The OAuth bridge operates as a critical authentication proxy. Observability ensures quick diagnosis of issues, and performance standards maintain responsive user experiences.

## Technical Standards

### Authentication & Security

- **OAuth 2.0 Compliance**: Follow RFC 6749, RFC 7636 (PKCE), RFC 6750 (Bearer Tokens)
- **JWT Token Management**: Embed provider tokens in JWT payload, expire 1 minute before provider token
- **Session Security**: Use `SESSION_SECRET` for Express session encryption
- **Token Sanitization**: Always sanitize tokens in logs using `sanitizeTokenForLogging()`

### MCP Protocol Compliance

- **Transport**: Follow MCP HTTP Transport specification
- **Session Management**: Associate auth context with transport sessions via `mcp-session-id`
- **Tool Registration**: Use `mcp.addTool()` with proper schema validation
- **Discovery**: Support `/.well-known/oauth-protected-resource` for client registration

### LLM Integration

- **Multi-Provider Support**: Support 8 LLM providers (Anthropic, OpenAI, Google, AWS Bedrock, Mistral, DeepSeek, Groq, xAI)
- **Header-Based Selection**: Use provider-specific headers (e.g., `X-Anthropic-Token`)
- **MCP Sampling**: Support MCP sampling for clients that provide LLM capabilities
- **Fallback Logic**: Fall back to header-based auth when sampling unavailable

## Development Workflow

### Code Review Requirements

- **Constitution Check**: All changes MUST align with core principles
- **Test Coverage**: New code MUST include appropriate tests (see Principle III)
- **Documentation**: Update relevant README files and API documentation
- **Type Safety**: No TypeScript errors, no `any` types without justification

### Branch & Deployment Strategy

- **Feature Branches**: Use descriptive names (e.g., `feature/add-confluence-tools`)
- **Pre-commit Hooks**: Husky runs Prettier on all files
- **Testing Gates**: All tests must pass before merge
- **Deployment**: Docker Compose for containerized deployment, environment-specific configurations

### VS Code Task Preference

**MUST use VS Code tasks over terminal commands** for:

- Long-running processes (servers, watchers)
- Build commands
- Any command whose output needs review later

Use `create_and_run_task` or `run_task` tools instead of `run_in_terminal`.

## Governance

This constitution supersedes all other development practices. All pull requests, code reviews, and architectural decisions MUST verify compliance with these principles.

**Amendment Process**:

1. Propose amendment with clear rationale and impact analysis
2. Document version bump rationale (MAJOR/MINOR/PATCH)
3. Update all affected templates and documentation
4. Generate Sync Impact Report
5. Update `LAST_AMENDED_DATE` and `CONSTITUTION_VERSION`

**Compliance Reviews**:

- Required before starting any new feature (Phase 0)
- Required after design completion (Phase 1)
- Continuous during implementation and code review

**Runtime Guidance**: See `.github/copilot-instructions.md` for detailed development patterns, OAuth flows, and integration specifications.

**Version**: 1.0.0 | **Ratified**: 2025-12-18 | **Last Amended**: 2025-12-18
