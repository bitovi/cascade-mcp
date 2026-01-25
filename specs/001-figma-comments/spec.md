# Feature Specification: Figma Comments Integration

**Feature Branch**: `001-figma-comments`  
**Created**: January 24, 2026  
**Status**: Draft  
**Input**: User description: "Integrate Figma comments into cascade-mcp workflow: read comments as context for existing tools, and create new tool to post questions directly to Figma frames"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read Figma Comments for Better Scope Analysis (Priority: P1)

As a user running scope analysis on Figma designs, I want the AI to automatically read existing comments from designers and stakeholders so that the generated scope analysis incorporates their feedback, questions, and decisions.

**Why this priority**: Core capability - reading comments provides immediate value by leveraging existing stakeholder discussions.

**Independent Test**: Run `analyze-feature-scope` on a Figma file that contains comments. Verify the scope analysis output references or incorporates information from those comments.

**Acceptance Scenarios**:

1. **Given** a Figma file with comments on design screens, **When** I run `analyze-feature-scope` with that Figma URL, **Then** the generated scope analysis includes relevant information from those comments in its context
2. **Given** a Figma file with threaded comment replies, **When** I run the analysis tool, **Then** the entire thread (parent and replies) is considered as context
3. **Given** a Figma file with both resolved and unresolved comments, **When** I run the analysis tool, **Then** both types of comments are included with resolved comments indicated as such
4. **Given** a Figma file with comments at different positions, **When** I run the analysis tool, **Then** comments are correctly associated with their nearest design screens/frames

---

### User Story 2 - Post AI Questions as Figma Comments (Priority: P1)

As a user analyzing Figma designs, I want to run a standalone tool that analyzes designs and posts clarifying questions directly as comments on the relevant Figma frames so that designers and stakeholders can respond directly in Figma.

**Why this priority**: Validate comment posting works early before integrating into more complex tools like shell story generation.

**Independent Test**: Run `analyze-figma-scope` on a Figma file. Verify that question comments appear on the relevant frames in Figma.

**Acceptance Scenarios**:

1. **Given** a Figma URL, **When** I run `analyze-figma-scope` without a Jira epic, **Then** the tool analyzes the designs and returns scope analysis markdown
2. **Given** the analysis generates questions (❓), **When** the analysis completes, **Then** questions are posted as comments on the relevant Figma frames with the format `Cascade🤖: {Question}❓`
3. **Given** a question is associated with a specific screen, **When** the comment is posted, **Then** it appears on that frame in Figma
4. **Given** a question has stronger association with one frame than others, **When** the comment is posted, **Then** it is placed on the frame with strongest association
5. **Given** a general question with no clear frame association, **When** the comment is posted, **Then** it is placed at the page level

---

### User Story 3 - Incorporate Comments into Shell Story Generation (Priority: P1)

As a user generating shell stories from an epic with Figma designs, I want the AI to consider Figma comments as additional context so that generated stories reflect designer intent and stakeholder feedback.

**Why this priority**: Extends comment reading to the main shell story workflow.

**Independent Test**: Run `write-shell-stories` on an epic linked to a Figma file with comments. Verify that generated stories incorporate context from comments.

**Acceptance Scenarios**:

1. **Given** an epic with linked Figma designs that have comments, **When** I run `write-shell-stories`, **Then** the generated stories incorporate relevant information from comments
2. **Given** comments include specific requirements or constraints, **When** stories are generated, **Then** those requirements are reflected in acceptance criteria

---

### User Story 4 - Provide Optional Context Description (Priority: P1)

As a user running standalone Figma analysis, I want to provide an optional text description for context so that the AI has additional context beyond what's visible in the designs.

**Why this priority**: Enhances the standalone Figma analysis tool with flexibility.

**Independent Test**: Run `analyze-figma-scope` with both a Figma URL and a context description. Verify the analysis incorporates the description.

**Acceptance Scenarios**:

1. **Given** a Figma URL and a context description, **When** I run `analyze-figma-scope`, **Then** the analysis considers both the visual designs and the text description
2. **Given** only a Figma URL (no context description), **When** I run `analyze-figma-scope`, **Then** the tool still functions correctly using only the visual designs

---

### User Story 5 - Debug Comment Output (Priority: P2)

As a developer debugging comment integration, I want to optionally save fetched comments to cache files so that I can inspect what comment data was loaded.

**Why this priority**: Developer convenience feature for debugging. Not required for core functionality.

**Independent Test**: Set `SAVE_FIGMA_COMMENTS_TO_CACHE=true`, run `analyze-feature-scope` on a Figma file with comments. Verify that `.comments.md` files are created in the cache directory.

**Acceptance Scenarios**:

1. **Given** `SAVE_FIGMA_COMMENTS_TO_CACHE` is not set or false, **When** I run analysis on a Figma file, **Then** comments are fetched fresh and held in memory only (no cache files written)
2. **Given** `SAVE_FIGMA_COMMENTS_TO_CACHE=true`, **When** I run analysis on a Figma file, **Then** comment data is also written to `{nodeId}.comments.md` files for inspection
3. **Given** debug cache files exist, **When** I view a `.comments.md` file, **Then** I can see author names, dates, and thread structure in readable markdown format

---

### Edge Cases

- What happens when a Figma file has no comments? The tools proceed normally without comment context, and no `.comments.md` files are created
- What happens when the OAuth token lacks `file_comments:read` scope? The tool logs a warning and proceeds without comment context
- What happens when the OAuth token lacks `file_comments:write` scope for posting? The `analyze-figma-scope` tool returns an error indicating the required scope
- What happens when a comment position cannot be associated with any frame? Comments are categorized as "unassociated" and included as general context
- How are emojis and special characters in comments handled? They are preserved as-is in the markdown
- What happens if posting comments would exceed rate limits? See FR-015 through FR-018 for the tiered posting strategy

## Requirements *(mandatory)*

### Functional Requirements

#### Comment Reading

- **FR-001**: System MUST fetch comments from Figma files using the Figma API endpoint `GET /v1/files/:key/comments`
- **FR-002**: System MUST parse comment data including message text, author handle, creation date, and resolution status
- **FR-003**: System MUST support threaded comments by grouping replies (via `parent_id`) under their parent comment
- **FR-004**: System MUST include resolved comments in context with an indicator showing they are resolved
- **FR-005**: System MUST associate comments with frames using spatial proximity when `client_meta` contains Vector coordinates (a comment is associated with a frame if its position is within the frame's bounding box or within 50px of its edges); if equidistant from multiple frames, associate with all of them
- **FR-006**: System MUST directly associate comments with frames when `client_meta` contains a `node_id`
- **FR-007**: System MUST fetch comments fresh on each run (no persistent caching) since Figma comments do not trigger file `last_touched_at` updates
- **FR-008**: System MUST support optional `SAVE_FIGMA_COMMENTS_TO_CACHE` environment variable to write comments to `{nodeId}.comments.md` files for debugging
- **FR-009**: When debug output is enabled, system MUST format comments in readable markdown including author, date, and thread structure

#### Comment Posting

- **FR-010**: System MUST post comments to Figma using `POST /v1/files/:file_key/comments`
- **FR-011**: System MUST format posted questions as `Cascade🤖: {Question}❓`
- **FR-012**: System MUST position comments at the top-left of relevant frames using `client_meta` with `FrameOffset` type
- **FR-013**: System MUST post general questions (no clear frame association) at the page level
- **FR-014**: System MUST only create new top-level comments (no replies to existing threads)

#### Rate Limit Handling for Comment Posting

- **FR-015**: System MUST assume Dev/Full seat rate limits (25 comments/min as baseline)
- **FR-016**: If question count exceeds 25, system MUST consolidate all questions for each screen into a single comment per screen using bullet list format with header "Cascade🤖 Questions:"
- **FR-017**: If consolidated comment count still exceeds 25, system MUST return an error with the generated questions in the response so users can post manually
- **FR-018**: On 429 rate limit response, system MUST respect `Retry-After` header and retry up to 3 times before failing
- **FR-019**: Regardless of posting success/failure, the tool response MUST always include the full list of generated questions
- **FR-020**: If any posting errors occur, the tool response MUST include error details alongside the questions

#### Tool Integration

- **FR-021**: `analyze-feature-scope` tool MUST include comment context when analyzing Figma screens
- **FR-022**: `write-shell-stories` tool MUST include comment context when generating stories from Figma-linked epics
- **FR-023**: New `analyze-figma-scope` tool MUST accept one or more Figma URLs as input
- **FR-024**: `analyze-figma-scope` tool MUST accept an optional context description text input
- **FR-025**: `analyze-figma-scope` tool MUST work standalone without requiring a Jira epic

### Key Entities

- **FigmaComment**: Represents a comment from Figma including message, author, position metadata, resolution status, and optional parent reference for threading
- **CommentThread**: A grouping of a parent comment and its replies, associated with a specific frame or categorized as unassociated
- **ClientMeta**: Position information for a comment - either a `FrameOffset` (node_id + offset) or `Vector` (x, y coordinates)
- **ScreenComments**: Mapping of screen/frame node IDs to their associated comment threads

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can run `analyze-feature-scope` on a Figma file with comments and see comment-informed output within the same time constraints as current analysis (no significant performance degradation)
- **SC-002**: Users can run `analyze-figma-scope` on Figma URLs without any Jira configuration and receive scope analysis with questions posted to Figma
- **SC-003**: 100% of comments with direct `node_id` references are correctly associated with their target frames
- **SC-004**: Comments with Vector positions are associated with the nearest frame using consistent proximity calculation
- **SC-005**: Posted questions appear on the correct Figma frames with the specified format prefix

## Clarifications

### Session 2026-01-24

- Q: What cache invalidation strategy for Figma comments? → A: Always fetch fresh on each run (Figma comments do NOT trigger file `last_touched_at` updates, so existing cache invalidation won't work)
- Q: Should comments be cached to disk? → A: No, keep in memory only. Add optional `SAVE_FIGMA_COMMENTS_TO_CACHE` env var for debug output.
- Q: How should ties be broken when a comment is equidistant from multiple frames? → A: Associate with all equidistant frames (duplicate comment in context for each)
- Q: What should happen if posting comments fails or exceeds rate limits? → A: Assume Dev/Full seat (25/min). If >25 questions, consolidate to one comment per screen. If still >25 screens, fail with error. Always return generated questions in response regardless of posting success.
- Q: What format for consolidated multi-question comments? → A: Bullet list with header (e.g., "Cascade🤖 Questions:" followed by bulleted questions)
- Q: What are the priorities for user stories? → A: All core features are P1. Validate posting (User Story 2) early before integrating into shell stories. Debug output is P2.

## Assumptions

- The Figma API `file_comments:read` scope is already included in default OAuth scopes
- The `file_comments:write` scope can be added to OAuth configuration without breaking existing authorizations (users may need to re-authorize)
- The spatial proximity logic from existing frame association code can be reused for comment association
- The existing cache directory structure is appropriate for storing comment data
- Figma's API returns comments in a consistent format with the documented fields

## Dependencies

- Figma API access with appropriate OAuth scopes
- Existing screen analysis infrastructure for analyzing Figma designs
- Existing caching infrastructure for storing processed data
- LLM client for generating scope analysis and questions
