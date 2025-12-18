# Implementation Plan: Google Drive OAuth Integration

**Branch**: `001-google-drive-oauth` | **Date**: December 18, 2025 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/001-google-drive-oauth/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add Google Drive as a third OAuth provider to CascadeMCP, following the established pattern used for Figma and Atlassian. Implement traditional OAuth 2.0 flow with client_secret (not PKCE) to authenticate users and retrieve their Google Drive user information via the `drive-about-user` MCP tool and REST API endpoint.

**Primary Requirements**:
- OAuth 2.0 authentication for Google Drive with full access scope (`https://www.googleapis.com/auth/drive`)
- `drive-about-user` MCP tool to retrieve authenticated user profile (display name, email, permission ID)
- REST API endpoint `/api/drive-about-user` for non-MCP clients using PAT authentication
- Integration with connection hub for multi-provider OAuth flow

**Technical Approach** (from research.md):
- Reuse existing OAuthProvider interface pattern from Figma provider (traditional OAuth with client_secret)
- Create Google provider at `server/providers/google/` with index.ts, google-api-client.ts, and tools/
- Register provider in connection hub alongside Atlassian and Figma
- Implement dual interface (MCP + REST API) without code duplication
- Token management: reactive refresh on 401 errors (align with existing patterns)

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 modules), Node.js 18+  
**Primary Dependencies**: Express 4.x, MCP SDK, Google OAuth2 endpoints (no new npm packages)  
**Storage**: Express session (memory/Redis), JWT for token embedding, no persistent database  
**Testing**: Jest for unit/integration tests, Supertest for REST API contract tests  
**Target Platform**: Node.js server (Linux/macOS), Docker containerization  
**Project Type**: Single backend project (existing monolithic structure)  
**Performance Goals**: OAuth token validation <50ms p95, API responses <2s p95 (excluding LLM)  
**Constraints**: Follow existing provider patterns (Figma/Atlassian), reuse code, no breaking changes  
**Scale/Scope**: Single OAuth provider, 1 MCP tool, 1 REST endpoint, ~500 LOC new code

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Principle I - Modular Architecture**:

- [x] Tool follows `server/providers/{provider}/tools/{tool-name}/` structure
- [x] Implements dual interface (MCP + REST API) if user-facing
- [x] Helpers properly separated (semi-specific vs workflow steps)

**Principle II - Type Safety**:

- [x] TypeScript strict mode enabled
- [x] No `any` types without documented justification
- [x] Explicit return types on exported functions

**Principle III - Testing Standards** (NON-NEGOTIABLE):

- [x] Integration tests planned for new tools
- [x] Unit tests planned for helper modules
- [x] Contract tests planned for API endpoints
- [x] E2E tests planned for OAuth/auth flows

**Principle IV - User Experience**:

- [x] Error handling follows OAuth 2.0 standards
- [x] API design consistent with existing patterns
- [x] Documentation includes README and usage examples

**Principle V - Performance & Observability**:

- [x] Structured logging with Winston
- [x] Token sanitization in logs
- [x] Performance requirements documented (if applicable)
- [x] Caching strategy defined (if applicable)

**Constitution Check Result**: ✅ **ALL GATES PASSED**

No violations. Feature fully complies with all constitutional principles:

- Follows modular architecture with provider/tools structure
- Reuses existing OAuthProvider interface (zero new abstractions)
- Implements dual interface pattern (MCP + REST) with shared core logic
- TypeScript strict mode already enabled project-wide
- Comprehensive test plan covers all layers (unit, integration, contract, E2E)
- Error handling aligns with OAuth 2.0 RFC 6750 standards
- Uses existing logging infrastructure (Winston with token sanitization)
- Performance goals align with constitution requirements (<50ms token validation, <2s API response)

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
server/
├── providers/
│   ├── google/                          # NEW: Google Drive provider
│   │   ├── index.ts                     # Provider object implementing OAuthProvider
│   │   ├── google-api-client.ts         # API client factory (OAuth & PAT)
│   │   ├── types.ts                     # TypeScript interfaces for Google data
│   │   └── tools/                       # MCP tools
│   │       ├── index.ts                 # Tool registration
│   │       └── drive-about-user/        # User info tool
│   │           ├── index.ts             # Export registration
│   │           └── drive-about-user.ts  # Tool implementation
│   ├── figma/                           # Existing (reference pattern)
│   ├── atlassian/                       # Existing (reference pattern)
│   └── provider-interface.ts            # Existing interface (reused)
├── api/
│   └── drive-about-user.ts              # NEW: REST API endpoint
├── provider-server-oauth/
│   └── connection-hub.ts                # MODIFIED: Add Google to REQUIRED_PROVIDERS
└── server.ts                            # MODIFIED: Register Google provider & API route

specs/001-google-drive-oauth/           # This feature
├── plan.md                              # This file
├── research.md                          # Phase 0 output
├── data-model.md                        # Phase 1 output
├── quickstart.md                        # Phase 1 output
├── contracts/                           # Phase 1 output
│   ├── mcp-tool-drive-about-user.md
│   ├── rest-api-drive-about-user.md
│   └── oauth-provider-google.md
└── tasks.md                             # Phase 2 (NOT created yet)

tests/
├── unit/
│   └── google-provider.test.ts          # NEW: Provider unit tests
├── integration/
│   └── google-oauth-flow.test.ts        # NEW: OAuth integration tests
└── contract/
    └── api-drive-about-user.test.ts     # NEW: REST API contract tests
```

**Structure Decision**: Single backend project structure (existing pattern). All Google Drive code follows the established provider pattern at `server/providers/google/`, matching Figma and Atlassian structures. No new directories outside this pattern.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
