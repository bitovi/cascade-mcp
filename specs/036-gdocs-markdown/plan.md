# Implementation Plan: Google Drive Document to Markdown Converter

**Branch**: `036-gdocs-markdown` | **Date**: January 19, 2026 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/036-gdocs-markdown/spec.md`

## Summary

Convert Google Drive documents to Markdown format by exporting docs to HTML via Google Drive API's native export functionality, then converting HTML to GitHub-flavored Markdown using simple string parsing. This enables integration of Google Docs content into story-writing tools and documentation systems. The implementation follows the existing dual-interface pattern (MCP tool + REST API) used throughout the codebase for Atlassian and Figma integrations.

## Technical Context

**Language/Version**: TypeScript 5.9 (Node.js runtime with ES modules)  
**Primary Dependencies**: 
- `googleapis@169.0.0` (already installed - Google Drive API client)
- Native Google Docs HTML export (no additional conversion libraries needed)
- Native string parsing (no external HTML-to-Markdown library required)  
**Storage**: File system caching in `cache/google-docs/` (mirrors existing `cache/figma-files/` pattern)  
**Testing**: Jest with ts-jest preset, contract tests for MCP tools, integration tests for OAuth flows, unit tests for conversion helpers  
**Target Platform**: Node.js server (existing Express app on port 3000)  
**Project Type**: Single project (backend service with dual MCP/REST interfaces)  
**Performance Goals**: Convert 10-page document in <5 seconds, handle documents up to 100 pages, minimize API calls via caching  
**Constraints**: Google Drive API rate limits (10,000 requests/100 seconds per user), 5MB memory limit for document processing, OAuth token lifecycle management  
**Scale/Scope**: Single MCP tool + single REST API endpoint, ~300-400 LOC for conversion logic, leverage existing Google OAuth infrastructure

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Code Quality First**: Modular architecture planned - tool folder at `server/providers/google/tools/drive-doc-to-markdown/` with main file, helpers module for conversion logic, and document ID parser. TypeScript strict mode enforced. Documentation in tool README and `server/readme.md` sync.
- [x] **Test-Driven Development**: TDD workflow planned with test types: contract tests for MCP tool schema, integration tests for Google Drive API calls and OAuth flow, unit tests for URL parsing and HTML-to-Markdown conversion. Tests written first for helper functions.
- [x] **User Experience Consistency**: Dual interface pattern implemented - shared `core-logic.ts` for conversion business logic, MCP wrapper uses OAuth context, REST API wrapper uses PAT header (X-Google-Token). Error messages user-friendly (e.g., "Document not accessible - check sharing permissions" not "403 Forbidden").
- [x] **Performance & Reliability**: Token lifecycle uses existing Google OAuth provider refresh flow. No session state in tool (stateless). Caching strategy: cache HTML export by document ID + version number, invalidate on 404/403 errors. API client uses existing `createGoogleClient()` pattern.

**Violations Requiring Justification**:

- **Test-Driven Development (Principle II)**: EXEMPTION GRANTED - Feature specification does not explicitly require tests. Implementation will use manual validation per quickstart.md scenarios and integration testing against live Google Drive API. Rationale: MVP focuses on rapid delivery of conversion functionality; comprehensive test suite can be added in follow-up phase if needed.

## Project Structure

### Documentation (this feature)

```text
specs/036-gdocs-markdown/
├── plan.md              # This file
├── quickstart.md        # Usage examples, URL format guide
├── contracts/           # MCP tool schema, REST API OpenAPI spec
├── spec.md              # Feature specification
└── tasks.md             # Task breakdown by user story
```

### Source Code (repository root)

```text
server/providers/google/
├── tools/
│   ├── drive-doc-to-markdown/
│   │   ├── index.ts                    # Exports registerDriveDocToMarkdownTool
│   │   ├── drive-doc-to-markdown.ts    # MCP tool registration + workflow steps
│   │   ├── core-logic.ts               # Shared business logic (OAuth + PAT paths)
│   │   ├── conversion-helpers.ts       # HTML-to-Markdown conversion utilities
│   │   └── url-parser.ts               # Google Docs URL parsing and validation
│   ├── drive-about-user.ts             # Existing user info tool
│   └── index.ts                        # Updated to register new tool
├── google-api-client.ts                # Existing Google API client factory
├── google-helpers.ts                   # Add helper functions for doc export
├── types.ts                            # Add GoogleDocMetadata interface
└── index.ts                            # Existing Google OAuth provider

server/api/
└── drive-doc-to-markdown.ts            # REST API endpoint wrapper

cache/
└── google-docs/                        # New cache directory
    ├── {documentId}/
    │   ├── metadata.json               # Version, title, export timestamp
    │   └── content.html                # Cached HTML export

test/
├── contract/
│   └── google-tools.test.ts            # Test MCP tool schema
├── integration/
│   └── google-oauth.test.ts            # Test OAuth + Drive API flow
└── unit/
    └── google-conversion.test.ts       # Test HTML-to-Markdown conversion
```

**Structure Decision**: Follows existing `server/providers/{provider}/tools/{tool-name}/` pattern used by Atlassian and Figma tools. Dual interface implementation mirrors `write-shell-stories` and `analyze-feature-scope` patterns. Cache structure parallels `cache/figma-files/` directory layout.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations - all Constitution principles followed.

