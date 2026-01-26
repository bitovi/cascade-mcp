# Feature Specification: Self-Healing Story Writing Tools

**Feature Branch**: `039-self-healing-tools`  
**Created**: 2026-01-26  
**Status**: Draft  
**Input**: User description: "Make write-shell-stories and write-story self-healing so they automatically check for questions and guide users through clarification iterations, deprecating analyze-feature-scope as a standalone tool"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Self-Healing Shell Stories (Priority: P1)

A product manager wants to break down an epic into shell stories. They call `write-shell-stories` directly without running any prerequisite tools. The tool automatically analyzes the Figma designs and epic context, counts how many clarifying questions exist, and either proceeds with shell stories (if few questions) or creates a Scope Analysis section asking for clarification (if many questions).

**Why this priority**: This is the core workflow improvement - eliminating the need for users to understand and manually run `analyze-feature-scope` first.

**Independent Test**: Run `write-shell-stories` on an epic that has NOT had `analyze-feature-scope` run. Verify the tool either creates shell stories directly (if designs are well-documented) or creates a Scope Analysis section with questions.

**Acceptance Scenarios**:

1. **Given** an epic with well-documented Figma designs (≤5 clarifying questions), **When** I run `write-shell-stories`, **Then** shell stories are created directly without a Scope Analysis section
2. **Given** an epic with incomplete requirements (>5 clarifying questions), **When** I run `write-shell-stories`, **Then** a Scope Analysis section with questions is created and the tool asks me to re-run after answering
3. **Given** an epic that already has a Scope Analysis section with answered questions, **When** I run `write-shell-stories`, **Then** shell stories are created based on the answered questions
4. **Given** an epic where `figma-review-design` was previously run, **When** I run `write-shell-stories`, **Then** resolved Figma comment threads reduce the question count

---

### User Story 2 - Single Story Creation (Priority: P2)

A developer wants to write a single detailed story for a small feature or bug fix without creating an epic structure. They call `write-story` with an issue key and optional Figma URLs. The tool automatically checks if it has enough information and either writes the story immediately or returns questions for clarification.

**Why this priority**: Enables quick story creation for common small-scope work without the overhead of the epic workflow.

**Independent Test**: Run `write-story` on a Jira issue with linked Figma designs. Verify the tool either writes the story directly or returns questions asking for clarification.

**Acceptance Scenarios**:

1. **Given** a Jira issue with clear requirements and linked Figma designs (≤5 questions), **When** I run `write-story`, **Then** a detailed story with acceptance criteria is written to the issue
2. **Given** a Jira issue with unclear requirements (>5 questions), **When** I run `write-story`, **Then** questions are returned and the tool asks me to provide clarification
3. **Given** a Jira issue where `figma-review-design` was previously run on linked designs, **When** I run `write-story`, **Then** resolved Figma comment threads reduce the question count
4. **Given** a Jira issue with no Figma designs, **When** I run `write-story` with `contextDescription`, **Then** the tool uses the context to analyze requirements

---

### User Story 3 - Iterative Refinement (Priority: P1)

A user runs a self-healing tool and receives questions. They answer the questions (either in Jira or by providing context) and re-run the tool. The tool recognizes the answered questions and proceeds with the next step.

**Why this priority**: Critical for the self-healing pattern to work - users must be able to iterate until the tool is satisfied.

**Independent Test**: Run `write-shell-stories`, receive questions, answer them in the Scope Analysis section, re-run the tool, and verify shell stories are created.

**Acceptance Scenarios**:

1. **Given** an epic with unanswered questions in Scope Analysis, **When** I answer the questions and re-run `write-shell-stories`, **Then** the tool recognizes answers and creates shell stories
2. **Given** questions were returned from `write-story`, **When** I update the issue with answers and re-run, **Then** the tool writes the story
3. **Given** some but not all questions are answered, **When** I re-run the tool, **Then** remaining questions are surfaced but the tool proceeds if count is below threshold

---

### User Story 4 - Figma Comments Integration (Priority: P2)

A designer runs `figma-review-design` on their designs, answering questions in Figma comments. Later, when a PM runs `write-shell-stories` on the same epic, the tool reads the resolved Figma comment threads and uses them as answered questions, reducing the number of new questions it needs to ask.

**Why this priority**: Connects the designer workflow (`figma-review-design`) with the PM workflow (`write-shell-stories`), reducing duplicate questions.

**Independent Test**: Run `figma-review-design`, answer some questions in Figma, then run `write-shell-stories` on an epic linking those designs. Verify fewer questions are generated.

**Acceptance Scenarios**:

1. **Given** Figma designs with resolved comment threads from `figma-review-design`, **When** I run `write-shell-stories` on an epic linking those designs, **Then** resolved threads are treated as answered questions
2. **Given** Figma designs with unresolved comment threads, **When** I run `write-shell-stories`, **Then** unresolved threads are included as additional context but still count as open questions

---

### Edge Cases

- What happens when the Jira issue/epic doesn't exist or user lacks permissions?
- How does the system handle Figma rate limits during question analysis?
- What happens if the question count is exactly at the threshold (e.g., exactly 5)?
- How does the system handle very large epics that would exceed Jira's character limit?
- What happens if Figma designs are no longer accessible (deleted/moved)?

## Requirements *(mandatory)*

### Functional Requirements

#### Self-Healing Pattern

- **FR-001**: `write-shell-stories` MUST automatically check for a "## Scope Analysis" section before proceeding
- **FR-002**: `write-shell-stories` MUST run scope analysis internally if no Scope Analysis section exists
- **FR-003**: Tools MUST count clarifying questions after analyzing Figma designs, comments, and documentation
- **FR-004**: Tools MUST use a configurable question threshold (default: 5) to decide whether to proceed or ask for clarification
- **FR-005**: If questions > threshold, tools MUST create appropriate artifacts (Scope Analysis for epics, or return questions for single stories)
- **FR-006**: If questions ≤ threshold, tools MUST proceed with their primary function (creating shell stories or writing the story)

#### Figma Integration

- **FR-007**: Tools MUST read existing Figma comments from linked designs
- **FR-008**: Resolved Figma comment threads MUST be treated as answered questions
- **FR-009**: Unresolved Figma comment threads MUST be included as context but counted as open questions

#### Single Story Tool

- **FR-010**: `write-story` MUST accept an issue key and optional Figma URLs
- **FR-011**: `write-story` MUST NOT create intermediate artifacts (Scope Analysis) unless questions exceed threshold
- **FR-012**: `write-story` MUST return questions as a structured response when clarification is needed

#### Deprecation

- **FR-013**: `analyze-feature-scope` MUST remain functional for backward compatibility
- **FR-014**: `analyze-feature-scope` MUST be marked as deprecated in documentation and tool descriptions
- **FR-015**: Documentation MUST recommend using `write-shell-stories` directly instead of `analyze-feature-scope`

### Key Entities

- **Question**: A clarifying question about unclear requirements, edge cases, or missing information
  - Source: Figma design analysis, comment threads, or documentation gaps
  - State: Open (needs answer) or Resolved (answered in Figma, Jira, or context)
  
- **Scope Analysis Section**: A markdown section in a Jira epic containing categorized features and open questions
  - Created only when questions exceed threshold
  - Updated on subsequent tool runs
  
- **Shell Story**: A high-level story outline in a Jira epic
  - Created after Scope Analysis questions are sufficiently answered
  - Used as input for `write-next-story`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create shell stories with a single tool call when designs are well-documented (≤5 questions)
- **SC-002**: Users complete the epic breakdown workflow in 2 or fewer tool iterations on average
- **SC-003**: Question count is reduced by 30%+ when `figma-review-design` was run first
- **SC-004**: Single story creation via `write-story` completes in under 2 minutes for well-documented issues
- **SC-005**: 95% of users successfully complete their intended workflow without needing to understand the deprecated `analyze-feature-scope` tool

## Assumptions

- The question threshold of 5 is appropriate for most use cases (may need tuning based on user feedback)
- Resolved Figma comment threads reliably indicate answered questions
- Users will answer questions in the Scope Analysis section or Jira issue description
- The existing Figma comment reading infrastructure supports this workflow

## Out of Scope

- Automatic question answering by AI (users must provide answers)
- Integration with Slack or other communication tools for question routing
- Custom per-user or per-project question thresholds (single global default)
- Automatic retry/re-run after questions are answered (users must manually re-run)
