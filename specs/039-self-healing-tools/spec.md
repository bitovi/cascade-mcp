# Feature Specification: Self-Healing Story Writing Tools

**Feature Branch**: `039-self-healing-tools`  
**Created**: 2026-01-26  
**Status**: Draft  
**Input**: User description: "Make write-shell-stories self-healing so it automatically checks for questions and guides users through clarification iterations, deprecating analyze-feature-scope as a standalone tool"

## Clarifications

### Session 2026-01-26

- Q: When Figma designs linked in an epic are no longer accessible (deleted/moved/permissions changed), what should the tool do? → A: If no Figma links, proceed without warning. If Figma links exist but can't load, error immediately. (existing behavior)
- Q: Edge case behaviors for Jira errors, rate limits, character limits, threshold boundary? → A: All follow existing behavior patterns (error on 404/403, retry-after on 429, warn/error on character limit, `>5` comparison for threshold)
- Q: How is question counting performed? → A: Run modified Scope Analysis (LLM outputs ❓/💬 markers), then parse output to count ❓ markers. No separate LLM call for counting.
- Q: Should `write-story` be included in this scope? → A: Deferred to future work. This spec focuses on `write-shell-stories` only.
- Q: When the LLM call that generates the Scope Analysis section fails (network timeout, rate limit, model unavailable), what should `write-shell-stories` do? → A: Error immediately and ask user to retry later

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Self-Healing Shell Stories (Priority: P1)

A product manager wants to break down an epic into shell stories. They call `write-shell-stories` directly without running any prerequisite tools. The tool automatically analyzes the Figma designs and epic context, counts how many clarifying questions exist, and either proceeds with shell stories (if few questions) or creates a Scope Analysis section asking for clarification (if many questions).

**Why this priority**: This is the core workflow improvement - eliminating the need for users to understand and manually run `analyze-feature-scope` first.

**Independent Test**: Run `write-shell-stories` on an epic that has NOT had `analyze-feature-scope` run. Verify the tool either creates shell stories directly (if designs are well-documented) or creates a Scope Analysis section with questions.

**Acceptance Scenarios**:

1. **Given** an epic with well-documented Figma designs (≤5 clarifying questions), **When** I run `write-shell-stories`, **Then** shell stories are created directly without a Scope Analysis section
2. **Given** an epic with incomplete requirements (>5 unanswered questions), **When** I run `write-shell-stories`, **Then** a Scope Analysis section with ❓-marked questions is created and the tool asks me to re-run after answering
3. **Given** an epic that already has a Scope Analysis section with answered questions, **When** I run `write-shell-stories`, **Then** the section is regenerated with 💬 markers on answered questions, and shell stories are created if ≤5 ❓ remain
4. **Given** an epic where `figma-review-design` was previously run, **When** I run `write-shell-stories`, **Then** Figma comment threads with answers reduce the unanswered question count (inferred by LLM)

---

### User Story 2 - Iterative Refinement (Priority: P1)

A user runs a self-healing tool and receives questions. They answer the questions (either in Jira or by providing context) and re-run the tool. The tool recognizes the answered questions and proceeds with the next step.

**Why this priority**: Critical for the self-healing pattern to work - users must be able to iterate until the tool is satisfied.

**Independent Test**: Run `write-shell-stories`, receive questions, answer them in the Scope Analysis section, re-run the tool, and verify shell stories are created.

**Acceptance Scenarios**:

1. **Given** an epic with unanswered questions (❓) in Scope Analysis, **When** I answer the questions and re-run `write-shell-stories`, **Then** the section is regenerated with 💬 markers on answered questions, and shell stories are created if ≤5 ❓ remain
2. **Given** some but not all questions are answered, **When** I re-run `write-shell-stories`, **Then** the regenerated section shows 💬 for answered and ❓ for remaining, and the tool proceeds if ❓ count is below threshold

---

### User Story 3 - Figma Comments Integration (Priority: P2)

A designer runs `figma-review-design` on their designs, answering questions in Figma comments. Later, when a PM runs `write-shell-stories` on the same epic, the tool reads the Figma comment threads and the LLM recognizes that questions have been answered, reducing the number of new questions it needs to ask.

**Why this priority**: Connects the designer workflow (`figma-review-design`) with the PM workflow (`write-shell-stories`), reducing duplicate questions.

**Independent Test**: Run `figma-review-design`, answer some questions in Figma comments, then run `write-shell-stories` on an epic linking those designs. Verify fewer questions are generated.

**Acceptance Scenarios**:

1. **Given** Figma designs with comment threads containing answers from `figma-review-design`, **When** I run `write-shell-stories` on an epic linking those designs, **Then** the LLM recognizes answered questions and marks them with 💬, reducing the ❓ count
2. **Given** Figma designs with comment threads that don't contain clear answers, **When** I run `write-shell-stories`, **Then** those questions remain marked with ❓

---

### Edge Cases

- **Figma access**: If no Figma links exist, proceed without Figma (no warning). If Figma links exist but data cannot be loaded (deleted/permissions), error immediately. *(existing behavior)*
- **Jira issue/epic not found or permissions denied**: Error with helpful message (e.g., "Issue not found" or "Insufficient permissions to update issue"). *(existing behavior)*
- **Figma/Google rate limits**: Error with retry-after message when 429 received. *(existing behavior)*
- **LLM call failure (Scope Analysis generation)**: Error immediately with message to retry later. Preserve existing Jira content (do not create placeholder section or proceed without analysis).
- **Question count exactly at threshold**: Threshold comparison is `> 5` (not `>=`), so exactly 5 unanswered questions proceeds to writing.
- **Very large epics exceeding Jira character limit**: Warn when approaching 43,838 character limit, error if exceeded with message to split content. *(existing behavior)*

## Requirements *(mandatory)*

### Functional Requirements

#### Self-Healing Pattern

- **FR-001**: `write-shell-stories` MUST automatically check for a "## Scope Analysis" section before proceeding
- **FR-002**: `write-shell-stories` MUST run scope analysis internally if no Scope Analysis section exists
- **FR-003**: Tools MUST run a modified Scope Analysis (LLM call) that outputs questions with ❓ (unanswered) or 💬 (answered) markers, then parse the output to count remaining ❓ questions
- **FR-004**: Tools MUST use a hardcoded question threshold of 5 to decide whether to proceed or ask for clarification
- **FR-005**: If unanswered questions > threshold, tools MUST create/regenerate Scope Analysis section with questions
- **FR-006**: If unanswered questions ≤ threshold, `write-shell-stories` MUST proceed with creating shell stories
- **FR-007**: On re-run, tools MUST regenerate the Scope Analysis section by:
  1. Including the previous Scope Analysis section in LLM context
  2. Including all other context (Figma comments, Jira description edits, linked Confluence docs)
  3. Having LLM re-analyze and output updated section with ❓ (unanswered) and 💬 (answered) markers
  4. Parsing the LLM output to count ❓ markers (not a separate LLM call)
  5. Comparing ❓ count against threshold to decide next action

#### Figma Integration

- **FR-008**: Tools MUST read existing Figma comments from linked designs and include them in LLM context
- **FR-009**: LLM MUST consider Figma comment threads (including replies) when determining if questions have been answered
- **FR-010**: Figma comments that contain answers to questions MUST reduce the unanswered question count (inferred by LLM, not by resolved status)

#### Deprecation

- **FR-011**: `analyze-feature-scope` MUST remain functional for backward compatibility
- **FR-012**: `analyze-feature-scope` MUST be marked as deprecated in documentation and tool descriptions
- **FR-013**: Documentation MUST recommend using `write-shell-stories` directly instead of `analyze-feature-scope`

### Key Entities

- **Question**: A clarifying question about unclear requirements, edge cases, or missing information
  - Source: Figma design analysis, comment threads, or documentation gaps
  - Visual markers:
    - ❓ = Unanswered question (needs clarification)
    - 💬 = Answered question (LLM determined answer exists in context)
  - State determined by LLM analyzing all context (Figma comments, Jira text, linked docs)
  
- **Scope Analysis Section**: A markdown section in a Jira epic containing categorized features and open questions
  - Contains feature categorization: ✅ confirmed, ❌ out-of-scope, ❓ needs-clarification, ⏬ low-priority
  - Contains questions with status markers (❓ unanswered, 💬 answered)
  - Created only when questions exceed threshold
  - Regenerated on subsequent tool runs (previous section included in LLM context)
  
- **Shell Story**: A high-level story outline in a Jira epic
  - Created after Scope Analysis questions are sufficiently answered
  - Used as input for `write-next-story`

### Jira User Experience

#### Progress Comments

The tool MUST create a Jira comment using `progress-comment-manager` showing operation progress. Comment format follows existing pattern:

**When action = "proceed" (shell stories created):**
```markdown
🔄 **Write Shell Stories Progress**

1. Analyzing Figma designs...
2. Scope Analysis: Found 3 questions (below threshold)
3. Generating shell stories...
4. ✅ Jira Update Complete: Successfully generated 8 shell stories
```

**When action = "clarify" (first time, needs answers):**
```markdown
🔄 **Write Shell Stories Progress**

1. Analyzing Figma designs...
2. Scope Analysis: Found 12 questions
3. ⏸️ Clarification Required: Too many unanswered questions (12 > threshold of 5)
```

**When action = "regenerate" (subsequent runs, still needs answers):**
```markdown
🔄 **Write Shell Stories Progress**

1. Analyzing Figma designs...
2. Scope Analysis: Found 6 questions
3. ⏸️ Clarification Required: Still need more answers (6 > threshold of 5)
```

**On error:**
```markdown
🔄 **Write Shell Stories Progress**

1. Analyzing Figma designs...
2. ❌ Error occurred

---

[Error details here]
```

#### Scope Analysis Section Format

The `## Scope Analysis` section MUST NOT include guidance text. Format is clean analysis only:

```markdown
## Scope Analysis

### Feature Area 1: Authentication
- ☐ User login
- ❓ How should failed login attempts be handled?
- ⏬ Social login (low priority)

### Feature Area 2: Profile Management
- ☐ Edit profile
- ❌ Delete account (out of scope)

### Questions
- ❓ What are the performance requirements?
- ❓ How should errors be handled?

**Figma screens**: [links]
```

No iteration tracking, status banners, or instruction text in the section itself. Users rely on the progress comment for guidance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create shell stories with a single tool call when designs are well-documented (≤5 questions)
- **SC-002**: Users complete the epic breakdown workflow in 2 or fewer tool iterations on average
- **SC-003**: Question count is reduced by 30%+ when `figma-review-design` was run first
- **SC-004**: 95% of users successfully complete their intended workflow without needing to understand the deprecated `analyze-feature-scope` tool

## Assumptions

- The question threshold of 5 is appropriate for most use cases (may need tuning based on user feedback)
- LLM can reliably infer whether a question has been answered from surrounding context (Figma comments, Jira text, linked docs)
- Users will provide answers in natural language (no special formatting or markers required)
- The existing Figma comment reading infrastructure supports this workflow
- Question counting via parsing ❓ markers is reliable (LLM consistently uses the marker format)

## Out of Scope

- **`write-story` tool for single issues** (deferred to future work)
- Automatic question answering by AI (users must provide answers)
- Integration with Slack or other communication tools for question routing
- Custom per-user or per-project question thresholds (single global default)
- Automatic retry/re-run after questions are answered (users must manually re-run)
