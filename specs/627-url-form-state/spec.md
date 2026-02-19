# Feature Specification: URL-Based Form State Restoration

**Feature Branch**: `627-url-form-state`  
**Created**: February 19, 2026  
**Status**: Draft  
**Input**: User description: "Allow sharing a URL that restores the Simple Client form state (Anthropic key + selected tool) and re-applies it on reload or reconnect."

## Clarifications

### Session 2026-02-19

- Q: When a user opens a URL with a `tool` parameter but hasn't connected yet (tool selector is hidden), should the user interface provide visual feedback indicating that a tool will be automatically selected after connection? → A: No visual feedback - tool selection happens silently after connection completes
- Q: What format should tool names use in the URL parameter? → A: Use kebab-case version of tool name (e.g., `?tool=get-jira-issue`)
- Q: When the URL contains an invalid tool parameter and the connection is established, what should happen to the URL? → A: Keep the invalid parameter in the URL unchanged (transparency for debugging)
- Q: When a user switches between multiple tools (e.g., selects Tool A, then Tool B, then Tool C), should each tool selection create a new browser history entry that allows back/forward navigation between tools? → A: No, use replaceState only (updates URL without creating history entries)
- Q: When the URL contains an `anthropicKey` parameter from a shared link, and the user successfully connects, should the system remove the key from the URL after connection is established? → A: Keep the key in the URL unchanged (allows page reload without re-entering key)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Share Direct Tool Access Link (Priority: P1)

A user wants to share a link with a colleague that opens the Simple Client with a specific tool pre-selected, allowing the colleague to immediately start using that tool by only entering their own API key.

**Why this priority**: This is the core value proposition - enabling quick knowledge sharing and reducing onboarding friction. Users can say "here's the link to test our Jira integration" instead of explaining navigation steps.

**Independent Test**: Can be fully tested by creating a URL with a tool parameter, sending it to another user, and verifying they see the correct tool pre-selected after entering their API key.

**Acceptance Scenarios**:

1. **Given** a user has selected a tool in the Simple Client, **When** they copy the URL from the browser address bar, **Then** the URL includes the tool name as a parameter
2. **Given** a user receives a URL with a tool parameter, **When** they open the URL and connect with their API key, **Then** the specified tool is automatically selected after connection
3. **Given** a user opens a shared URL while already connected, **When** the page loads, **Then** the tool is immediately selected without requiring reconnection

---

### User Story 2 - Resume Session After Browser Reload (Priority: P2)

A user is working with a specific tool but needs to reload the page (due to browser refresh, tab restoration, or system restart). They want to continue exactly where they left off without re-navigating to the tool.

**Why this priority**: Improves user experience by preserving context across browser sessions, reducing repetitive navigation steps and preventing workflow interruption.

**Independent Test**: Can be tested by selecting a tool, reloading the page, and verifying the tool selection is restored automatically after reconnection.

**Acceptance Scenarios**:

1. **Given** a user has selected a tool and the URL contains the tool parameter, **When** they reload the page, **Then** the tool is automatically re-selected after reconnection
2. **Given** a user has a URL with tool parameter in their browser history, **When** they use browser back/forward navigation, **Then** the correct tool state is restored
3. **Given** a user closes and reopens a browser tab with a tool URL, **When** the page loads again, **Then** the tool selection is preserved

---

### User Story 3 - Manual Tool Selection Updates URL (Priority: P2)

A user manually selects a tool from the tool selector and wants the URL to automatically update so they can bookmark or share their current state without additional steps.

**Why this priority**: Enables seamless sharing workflow - users don't need to learn a special "share" feature, they can simply use standard browser bookmarking or copy-paste URL actions.

**Independent Test**: Can be tested by selecting any tool and verifying the browser URL updates immediately without page reload.

**Acceptance Scenarios**:

1. **Given** a user is viewing the tool selector, **When** they select a tool, **Then** the browser URL updates to include the tool parameter without page reload
2. **Given** a user switches between different tools, **When** they select each tool, **Then** the URL updates each time to reflect the current tool
3. **Given** a user has a URL with one tool parameter, **When** they select a different tool, **Then** the URL parameter switches to the new tool name

---

### User Story 4 - Reconnect After Token Expiration (Priority: P3)

A user's connection drops due to token expiration or network issues. When they reconnect, they want their tool selection preserved without manually re-navigating.

**Why this priority**: Reduces friction during error recovery. While less common than reloads, this scenario improves resilience and user satisfaction when issues occur.

**Independent Test**: Can be tested by simulating a connection loss, reconnecting with the same or new API key, and verifying tool selection is maintained.

**Acceptance Scenarios**:

1. **Given** a user has selected a tool and their connection expires, **When** they reconnect with a valid API key, **Then** the tool remains selected
2. **Given** a user has a tool parameter in the URL and no active connection, **When** they connect for the first time, **Then** the tool is automatically selected after successful connection
3. **Given** a user has a tool parameter but the connection fails, **When** they retry connection successfully, **Then** the tool selection is applied after successful retry

---

### Edge Cases

- What happens when the URL contains an invalid or non-existent tool name?
  - System should ignore the invalid parameter and display the tool selector without pre-selection, allowing the user to choose manually. The invalid parameter remains in the URL unchanged for transparency and debugging purposes
- What happens when the URL contains both `anthropicKey` and `tool` parameters but the key is invalid?
  - System should display the key input field with the invalid key visible (for user to correct), and defer tool selection until valid connection
- What happens when a user manually enters a new API key while a URL already has an `anthropicKey` parameter?
  - Manual entry should take precedence and the URL should NOT be updated with the manually entered key for security reasons
- What happens when the URL has a tool parameter but the tool selector hasn't loaded yet (during connection process)?
  - System should queue the tool selection and apply it automatically once the tool selector becomes available after connection, with no visual feedback or indicator shown while waiting
- What happens when a user opens multiple tabs with different tool URLs?
  - Each tab should maintain its own independent state based on its URL, with no cross-tab interference
- What happens when browser history navigation (back/forward) changes the URL parameters?
  - System should detect URL changes and update the displayed state accordingly, re-applying the tool selection from the new URL

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST read URL query parameters on initial page load to extract `anthropicKey` and `tool` values
- **FR-002**: System MUST populate the Anthropic key input field with the value from the `anthropicKey` URL parameter if present
- **FR-003**: System MUST NOT display the tool selector until after the user has successfully connected with a valid Anthropic key
- **FR-004**: System MUST defer automatic tool selection until the tool selector becomes visible (after successful connection)
- **FR-005**: System MUST update the browser URL when a user manually selects a tool from the tool selector using history.replaceState (no page reload, no new history entries)
- **FR-006**: System MUST add or update the `tool` query parameter in the URL using kebab-case format of the tool name (e.g., "Get Jira Issue" becomes `?tool=get-jira-issue`)
- **FR-007**: System MUST NOT write manually entered Anthropic keys to the URL for security reasons
- **FR-008**: System MUST preserve URL parameters (including `anthropicKey` and `tool` parameters) unchanged after successful connection, allowing page reload without re-entering credentials
- **FR-009**: System MUST restore tool selection from the URL parameter when the page reloads or when the user reconnects
- **FR-010**: System MUST automatically select the tool specified in the kebab-case URL parameter (converting back to display name) once the tool selector is available
- **FR-011**: System MUST handle invalid or non-existent kebab-case tool names in URL parameters gracefully without errors, keeping the invalid parameter unchanged in the URL
- **FR-012**: System MUST NOT persist any state beyond the URL (no localStorage, sessionStorage, or cookies)
- **FR-013**: System MUST detect URL parameter changes (from browser navigation) and update displayed state accordingly

### Key Entities

- **URL Parameters**: Represents the state encoded in the browser URL
  - `anthropicKey`: Optional. Pre-fills the API key input field when present
  - `tool`: Optional. Specifies which tool should be selected after connection using kebab-case format (e.g., "get-jira-issue")
- **Form State**: Represents the current user input and selection state in the Simple Client UI
  - API key value (from manual entry or URL parameter)
  - Selected tool (from manual selection or URL parameter)
  - Connection status (determines tool selector visibility)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a shareable URL by selecting a tool, with the URL automatically updating within 100ms of selection
- **SC-002**: Users opening a URL with tool parameter see the correct tool selected within 2 seconds of establishing connection
- **SC-003**: Page reload preserves tool selection 100% of the time when URL contains tool parameter
- **SC-004**: Manual API key entry never exposes the key in the URL, maintaining security
- **SC-005**: Users can share working tool links that require only API key entry (0 navigation steps) for recipients
