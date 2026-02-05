# Implementation Plan: Generic Text Encryption

**Branch**: `626-generic-text-encryption` | **Date**: February 5, 2026 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/626-generic-text-encryption/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Transform the Google-specific encryption web page into a generic text encryption interface that accepts any sensitive data (API keys, service account JSON, tokens, configuration). Backend encryption already supports arbitrary text - only frontend UI/UX needs generalization. Must maintain an informational note about provider-specific header requirements (e.g., `X-Google-Token` for Google Drive endpoints).

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 18+, React 18.x  
**Primary Dependencies**: Express.js (server), React + React Router (frontend), TailwindCSS (styling), Node.js crypto (RSA encryption)  
**Storage**: Local filesystem for RSA keys (cache/keys/), browser localStorage for UI state  
**Testing**: Jest + React Testing Library (component tests), integration tests (E2E encryption workflows)  
**Target Platform**: Web application (server-side encryption, browser-based UI)
**Project Type**: Web (frontend React SPA + Express backend)  
**Performance Goals**: <2s page load time, <30s encryption workflow, <500ms encryption API response  
**Constraints**: No backend API changes required (endpoint already generic), maintain backward compatibility with existing encrypted data format (`RSA-ENCRYPTED:` prefix)  
**Scale/Scope**: Single encryption page, 3 React components (Page, Form, Result), ~15 user-facing text strings to update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Initial Check (Before Phase 0)**: ✅ PASSED

- [x] **Code Quality First**: ✅ Changes limited to UI components with clear separation (Page/Form/Result components). TypeScript strict mode enforced. Documentation updates planned (component JSDoc, README). No complex new architecture required - simple text updates in existing modular structure.
- [x] **Test-Driven Development**: ✅ Component tests for generic text rendering (unit), integration tests for encryption workflow with non-JSON text (E2E). TDD cycle: Write tests for generic labels/placeholders → implement text changes → verify rendering. Existing encryption logic untouched (already tested).
- [x] **User Experience Consistency**: ✅ Maintains existing dual interface pattern (web page + REST API). No authentication changes needed. Error messages remain user-friendly. UI becomes MORE consistent by removing service-specific terminology. Provider-specific guidance (X-Google-Token) added as informational notes.
- [x] **Performance & Reliability**: ✅ No performance impact - pure UI text changes. No token lifecycle changes. No session management changes. No API client changes. No caching strategy changes. Same encryption performance (<500ms maintained). Resource cleanup patterns unchanged.

**Post-Phase 1 Check**: ✅ PASSED

- [x] **Code Quality First**: ✅ Design maintains modular structure (3 components, clear separation). TypeScript interfaces defined in contracts/component-interfaces.md. Documentation complete (data-model.md, contracts/, quickstart.md).
- [x] **Test-Driven Development**: ✅ Test strategy documented in quickstart.md Steps 8-9. Contract tests specified in contracts/api-endpoint.md. Component tests specified in contracts/component-interfaces.md. TDD workflow: Write failing tests for non-JSON → implement conditional metadata → tests pass.
- [x] **User Experience Consistency**: ✅ Design preserves dual interface. Backend parameter change (`text` → `data`) maintains REST API compatibility. Error handling unchanged. UI consistency improved (generic terminology). Provider guidance separated from core functionality.
- [x] **Performance & Reliability**: ✅ Design has zero performance impact (text-only changes). No new dependencies. No additional API calls. No caching changes. Same encryption algorithm. Resource cleanup unchanged.

**Violations Requiring Justification**: None - this is a pure UI refactoring with no architecture, authentication, or performance changes. All Constitution principles maintained through Phase 0 and Phase 1.

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
client/
├── src/
│   ├── pages/
│   │   └── GoogleServiceEncryptPage.tsx    # MODIFY: Update title/description
│   ├── components/
│   │   └── GoogleServiceEncryptionForm/
│   │       ├── GoogleServiceEncryptionForm.tsx    # MODIFY: Generic labels/placeholders/instructions
│   │       ├── GoogleServiceEncryptionResult.tsx  # MODIFY: Generic success messages, add provider note
│   │       └── EncryptionNotAvailableWarning.tsx  # KEEP: Already generic
│   └── router.tsx    # KEEP: Route path unchanged for backward compat
└── public/
    └── index.html    # KEEP: No changes needed

server/
├── encrypt.ts    # KEEP: Backend already generic (accepts any text)
└── utils/
    └── encryption-manager.ts    # KEEP: No changes needed

test/
└── e2e/
    └── encryption.test.ts    # MODIFY: Add test cases for non-JSON text
```

**Structure Decision**: Selected "Web application" structure. Feature is UI-only refactoring of existing React components + Express backend. No new files, only modifications to 3 React component files and 1 test file. Backend encryption logic unchanged (already accepts arbitrary text per `server/encrypt.ts`).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
