# Implementation Plan: Google Drive Document MCP Tools

**Branch**: `002-google-docs-mcp` | **Date**: January 5, 2026 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-google-docs-mcp/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add two new MCP tools to the existing Google Drive provider: `drive-list-files` for discovering user's Google Drive files, and `drive-get-document` for retrieving text content from Google Docs. These tools enable AI agents to discover and extract content from Google Documents for requirements analysis and document-to-code workflows.

**Primary Requirements**:
- `drive-list-files` MCP tool with filtering, pagination, search, and sorting capabilities
- `drive-get-document` MCP tool to export Google Docs as plain text
- REST API endpoints `/api/drive-list-files` and `/api/drive-get-document` following dual interface pattern
- Support for both OAuth (MCP clients) and PAT-style auth (REST API) following existing patterns

**Technical Approach**:
- Extend existing `server/providers/google/` infrastructure (OAuth provider already exists from spec 001)
- Add methods to `GoogleClient` interface: `listFiles()` and `getDocumentContent()`
- Follow Atlassian tool patterns (e.g., `atlassian-get-issue`, `atlassian-get-sites`) for consistent UX
- Use Google Drive API v3 endpoints: `/files` for listing, `/files/{id}/export` for content retrieval
- Implement error handling for expired tokens, rate limiting, and file access permissions

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode enabled)  
**Primary Dependencies**: 
- Google Drive API v3 (native fetch, no SDK)
- Zod for schema validation
- Winston for structured logging
- Existing MCP server infrastructure

**Storage**: N/A (read-only operations)  
**Testing**: Jest for unit/integration tests  
**Target Platform**: Node.js server (v18+)  
**Project Type**: Server-side MCP provider extension  
**Performance Goals**: 
- File listing <2s for <1000 files
- Document retrieval <3s for typical docs (<100 pages)
- Support pagination for 10,000+ files

**Constraints**: 
- Google Drive API rate limits (1000 requests per 100 seconds per user)
- Plain text export only (no formatting preservation)
- OAuth token expiration handling

**Scale/Scope**: 
- 2 new MCP tools
- 2 new REST API endpoints
- Extension of existing GoogleClient interface
- Reuses existing OAuth infrastructure (no new auth flows)

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
- [ ] E2E tests planned for OAuth/auth flows - N/A (reusing existing OAuth from spec 001)

**Principle IV - User Experience**:

- [x] Error handling follows OAuth 2.0 standards
- [x] API design consistent with existing patterns
- [x] Documentation includes README and usage examples

**Principle V - Performance & Observability**:

- [x] Structured logging with Winston
- [x] Token sanitization in logs
- [x] Performance requirements documented (if applicable)
- [x] Caching strategy defined (if applicable) - N/A (no caching needed for this feature)

**GATE STATUS**: ✅ PASS - All applicable constitution checks pass. Reusing existing OAuth infrastructure (no new auth flows). Tools follow established patterns from Atlassian provider.

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
│   └── google/                                  # Existing (from spec 001)
│       ├── index.ts                             # Existing OAuth provider
│       ├── google-api-client.ts                 # MODIFIED: Add listFiles() and getDocumentContent()
│       ├── types.ts                             # MODIFIED: Add DriveFile, DriveFileList, params types
│       └── tools/                               # Existing directory
│           ├── index.ts                         # MODIFIED: Register new tools
│           ├── drive-about-user.ts              # Existing
│           ├── drive-list-files.ts              # NEW: List files tool
│           └── drive-get-document.ts            # NEW: Get document content tool
├── api/
│   ├── index.ts                                 # MODIFIED: Register new API routes
│   ├── drive-about-user.ts                      # Existing
│   ├── drive-list-files.ts                      # NEW: REST API endpoint
│   └── drive-get-document.ts                    # NEW: REST API endpoint
└── server.ts                                    # Existing (no changes needed)

specs/002-google-docs-mcp/                       # This feature
├── spec.md                                      # Completed feature specification
├── plan.md                                      # This file
├── research.md                                  # Phase 0 output (to be generated)
├── data-model.md                                # Phase 1 output (to be generated)
├── quickstart.md                                # Phase 1 output (to be generated)
├── contracts/                                   # Phase 1 output (to be generated)
│   ├── mcp-tool-drive-list-files.md
│   ├── mcp-tool-drive-get-document.md
│   ├── rest-api-drive-list-files.md
│   ├── rest-api-drive-get-document.md
│   └── google-api-client-extension.md
└── tasks.md                                     # Phase 2 output (/speckit.tasks - NOT created yet)

tests/
├── unit/
│   └── providers/
│       └── google/
│           ├── google-api-client.test.ts        # NEW: Unit tests for client methods
│           └── tools/
│               ├── drive-list-files.test.ts     # NEW
│               └── drive-get-document.test.ts   # NEW
└── integration/
    └── google/
        ├── drive-list-files.integration.test.ts # NEW
        └── drive-get-document.integration.test.ts # NEW
```

**Structure Decision**: Extends existing Google provider infrastructure (spec 001). No new directories needed - all changes are additions to existing `server/providers/google/` structure. Follows established dual interface pattern (MCP tools + REST API endpoints).

## Complexity Tracking

> **No violations** - All constitution checks pass. This feature extends existing infrastructure without introducing additional complexity.
