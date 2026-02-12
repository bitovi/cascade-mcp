# Tasks: Generic Text Encryption

**Input**: Design documents from `/specs/626-generic-text-encryption/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md  
**Constitution Compliance**: All tasks align with Code Quality First, Test-Driven Development, User Experience Consistency, Performance & Reliability

**Tests**: Tests are OPTIONAL for this feature - not included as spec does not explicitly request TDD approach

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization - no changes needed for this UI-only refactoring

✅ **SKIPPED**: Project structure already exists, no new dependencies required

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core changes that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T001 Rename GoogleServiceEncryptPage.tsx to TextEncryptPage.tsx in client/src/pages/
- [X] T002 Rename GoogleServiceEncryptionForm.tsx to TextEncryptionForm.tsx in client/src/components/
- [X] T003 Rename GoogleServiceEncryptionResult.tsx to TextEncryptionResult.tsx in client/src/components/
- [X] T004 Update all imports referencing renamed components in client/src/
- [X] T005 Update frontend route from /google-service-encrypt to /encrypt in client/src/router.tsx
- [X] T006 Add redirect from /google-service-encrypt to /encrypt for backward compatibility in client/src/router.tsx
- [X] T007 Update page component title and description in client/src/pages/TextEncryptPage.tsx
- [X] T008 Update backend parameter name from "text" to "data" in server/encrypt.ts
- [X] T009 Add 50KB size validation with client-side check and server-side backup in client/src/components/TextEncryptionForm.tsx
- [X] T010 [P] Add informational banner above form about provider-specific requirements in client/src/components/TextEncryptionForm.tsx

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Encrypt Arbitrary Sensitive Text (Priority: P1) 🎯 MVP

**Goal**: Users can encrypt any text (API keys, credentials, tokens, config) and receive encrypted output with conditional metadata display

**Independent Test**: Visit encryption page, paste API key text, click encrypt, receive RSA-ENCRYPTED output without metadata

### Implementation for User Story 1

- [X] T011 [P] [US1] Update form label from "Service Account JSON:" to "Data to Encrypt:" in client/src/components/TextEncryptionForm.tsx
- [X] T012 [P] [US1] Update textarea placeholder with generic examples (API keys, JSON, tokens) in client/src/components/TextEncryptionForm.tsx
- [X] T013 [P] [US1] Update button text from "Encrypt Credentials" to "Encrypt Data" in client/src/components/TextEncryptionForm.tsx
- [X] T014 [P] [US1] Update blue info box text to be generic (remove Google-specific wording) in client/src/components/TextEncryptionForm.tsx
- [X] T015 [US1] Change frontend request body field from "serviceAccountJson" to "data" in client/src/components/TextEncryptionForm.tsx
- [X] T016 [P] [US1] Implement conditional metadata parsing (detect Google service account JSON) in client/src/components/TextEncryptionForm.tsx
- [X] T017 [P] [US1] Update result component props to accept optional metadata in client/src/components/TextEncryptionResult.tsx
- [X] T018 [US1] Implement collapsible metadata section (initially expanded) in result component in client/src/components/TextEncryptionResult.tsx
- [X] T019 [US1] Hide metadata section when non-Google data is encrypted in client/src/components/TextEncryptionResult.tsx
- [X] T020 [US1] Update success message to be generic in client/src/components/TextEncryptionResult.tsx

**Checkpoint**: At this point, User Story 1 should be fully functional - users can encrypt any text with conditional metadata display

---

## Phase 4: User Story 2 - Understand Provider-Specific Requirements (Priority: P2)

**Goal**: Users see generic usage examples plus informational notes about provider-specific headers like X-Google-Token

**Independent Test**: Read page instructions and verify provider notes are visible without limiting generic functionality

### Implementation for User Story 2

- [X] T021 [P] [US2] Replace Google-specific usage examples with generic examples (environment variables) in client/src/components/TextEncryptionResult.tsx
- [X] T022 [P] [US2] Add generic HTTP header usage example in client/src/components/TextEncryptionResult.tsx
- [X] T023 [P] [US2] Add configuration file usage example in client/src/components/TextEncryptionResult.tsx
- [X] T024 [US2] Add provider-specific callout section explaining X-Google-Token requirement in client/src/components/TextEncryptionResult.tsx
- [X] T025 [US2] Include note about other APIs accepting encrypted data in different headers in client/src/components/TextEncryptionResult.tsx

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - generic encryption with clear provider guidance

---

## Phase 5: User Story 3 - Copy Public Key for Programmatic Encryption (Priority: P3)

**Goal**: Users can copy RSA public key for use in their own encryption scripts

**Independent Test**: Click "Copy Public Key" button, verify key is copied in PEM format

### Implementation for User Story 3

- [X] T026 [US3] Update "Manual Encryption" section text to be generic (not Google-specific) in client/src/components/TextEncryptionForm.tsx
- [X] T027 [US3] Verify "Copy Public Key" button functionality works (already implemented, just test)

**Checkpoint**: User Story 3 complete - public key copying works for generic use cases

---

## Phase 6: User Story 4 - Encrypt Any Text via Terminal (Priority: P3)

**Goal**: Documentation enables terminal-based encryption for any text type using OpenSSL

**Independent Test**: Follow docs/encryption-setup.md manual encryption section with non-Google text file, verify encrypted output decrypts successfully

### Implementation for User Story 4

- [X] T028 [P] [US4] Verify manual terminal encryption section exists with generic examples in docs/encryption-setup.md
- [X] T029 [P] [US4] Verify OpenSSL command examples work for any text type in docs/encryption-setup.md
- [X] T030 [P] [US4] Add cross-reference note in docs/google-drive-setup.md pointing to generic encryption guide

**Checkpoint**: All user stories complete - terminal encryption documented for any text type

---

## Phase 7: Validation & Testing

**Purpose**: Verify all acceptance scenarios pass

- [X] T031 [P] Add integration test for non-JSON text encryption in test/e2e/encryption.test.ts
- [X] T032 [P] Add integration test for JSON without service account fields in test/e2e/encryption.test.ts
- [X] T033 [P] Add integration test for Google service account JSON (verify metadata displays) in test/e2e/encryption.test.ts
- [X] T034 [P] Update existing test request body from "serviceAccountJson" to "data" in test/e2e/encryption.test.ts
- [ ] T035 [P] Verify route redirect from /google-service-encrypt to /encrypt works in tests
- [ ] T036 Run all integration tests: npm test -- test/e2e/encryption.test.ts
- [ ] T037 Manual testing checklist per quickstart.md Step 11

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and documentation

- [X] T038 [P] Verify all Google-specific terminology removed from UI and file names
- [ ] T039 [P] Test copy-to-clipboard functionality in all browsers
- [ ] T040 [P] Verify page load time <2s
- [ ] T041 [P] Verify encryption completes in <500ms
- [ ] T042 [P] Verify 50KB size limit validation works correctly
- [ ] T043 [P] Verify new route /encrypt works and old route /google-service-encrypt redirects
- [X] T044 Update README.md encryption section with new route /encrypt
- [ ] T045 Run quickstart.md validation checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: ✅ Skipped (no setup needed)
- **Foundational (Phase 2)**: No dependencies - can start immediately - **BLOCKS all user stories**
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P3)
- **Validation (Phase 7)**: Depends on desired user stories being complete
- **Polish (Phase 8)**: Depends on validation passing

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Depends on User Story 1 completion (builds on result display from US1)
- **User Story 3 (P3)**: Depends on Foundational (Phase 2) - Independent of US1/US2
- **User Story 4 (P3)**: Depends on Foundational (Phase 2) - Independent of all other stories (documentation only)

### Within Each User Story

**Foundational Phase**:
- T001-T003 (file renames) must complete sequentially
- T004 (update imports) depends on T001-T003
- T005-T006 (route updates) depend on T004
- T007-T010 can run in parallel after T006

**User Story 1**:
- T011-T014 (text updates) can run in parallel
- T015 must complete before other US1 tasks (changes request format)
- T016-T020 (metadata logic) depend on T015

**User Story 2**:
- All US2 tasks (T021-T025) can run in parallel
- All depend on US1 completion (modify result component)

**User Story 3**:
- T026-T027 can run in parallel
- Independent of US1/US2

**User Story 4**:
- All US4 tasks (T028-T030) can run in parallel
- Documentation-only, no code dependencies

### Parallel Opportunities

- **Phase 2 (Foundational)**: T007 and T010 can run in parallel (after route setup completes)
- **Phase 3 (US1)**: T011, T012, T013, T014 can run in parallel (independent text changes)
- **Phase 3 (US1)**: T016, T017 can run in parallel (different components)
- **Phase 4 (US2)**: All tasks T021-T025 can run in parallel (same component, different examples)
- **Phase 5 (US3)**: T026-T027 can run in parallel
- **Phase 6 (US4)**: All tasks T028-T030 can run in parallel (different doc files)
- **Phase 7 (Validation)**: All test tasks T031-T035 can run in parallel (different test cases)
- **Phase 8 (Polish)**: All verification tasks T038-T043 can run in parallel

---

## Parallel Example: User Story 1

**Scenario**: 2 developers working on User Story 1 after Foundational phase completes

**Developer A**:
```bash
# Work on form component text updates (T005-T008)
# Edit: client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionForm.tsx
- Update label, placeholder, button, info box text
```

**Developer B**:
```bash
# Work on result component metadata logic (T011-T014)  
# Edit: client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionResult.tsx
- Implement collapsible metadata section
- Add conditional rendering
```

**Sequential dependency**: Both must wait for Developer C to complete T009 (request body field change)

---

## MVP Scope Recommendation

**Phase 2 (Foundational) + Phase 3 (User Story 1)** = Minimum Viable Product

**Why**:
- Delivers core value: Users can encrypt any text (not just Google JSON)
- Demonstrates generic functionality with conditional metadata
- Estimated time: ~1.5 hours (based on quickstart.md estimates)
- Testable independently: Visit page, encrypt API key, verify output

**User Stories 2-4 can be delivered in subsequent increments**

---

## Implementation Strategy

1. **Start with MVP**: Complete Phase 2 + Phase 3 (User Story 1)
2. **Validate MVP**: Run integration tests, manual testing
3. **Iterate**: Add User Story 2 (provider guidance) if time permits
4. **Optional enhancements**: User Stories 3-4 for advanced users

**Total estimated time**: 3-3.5 hours for all phases (includes file/route refactoring)

---

## Task Summary

- **Total Tasks**: 45
- **Foundational (Phase 2)**: 10 tasks (includes file renaming, route updates)
- **User Story 1 (P1)**: 10 tasks
- **User Story 2 (P2)**: 5 tasks
- **User Story 3 (P3)**: 2 tasks
- **User Story 4 (P3)**: 3 tasks
- **Validation**: 7 tasks
- **Polish**: 8 tasks

**Parallel opportunities**: 24 tasks can run in parallel (marked with [P])

**MVP scope**: 20 tasks (Phase 2 + Phase 3)
