# Feature Specification: Google Drive Document to Markdown Converter

**Feature Branch**: `036-gdocs-markdown`  
**Created**: 2026-01-15  
**Status**: Draft  
**Input**: User description: "Build a feature that has ability to get a google drive document as markdown so that we can eventually integrate google drive documents into our story-writing tools. The feature should grab the original document content via a link, transform it from docx (usually that is the extension of google docs) and transform it into markdown to be easily used by other parts of the system. It needs to work as an mcp tool and a api call as well."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Convert Google Doc via MCP Tool (Priority: P1)

As an AI agent or MCP client user, I need to convert a Google Drive document to markdown by providing its URL, so I can use the markdown content in downstream workflows like story generation or analysis.

**Why this priority**: Core MVP functionality - enables the primary use case of converting Google Docs to markdown for integration with existing story-writing tools. This must work before any API or advanced features.

**Independent Test**: Can be fully tested by providing a Google Drive document URL to the MCP tool and verifying the returned markdown content matches the document structure and formatting.

**Acceptance Scenarios**:

1. **Given** a valid Google Drive document URL, **When** the MCP tool is invoked with the URL, **Then** the tool returns the document content as properly formatted markdown
2. **Given** a Google Drive document with headings, bold text, and lists, **When** the tool converts it, **Then** the markdown preserves all formatting (# headers, **bold**, bullet lists)
3. **Given** a Google Drive document with images, **When** the tool converts it, **Then** the markdown includes image references with appropriate alt text or placeholders
4. **Given** an authenticated user with access to the document, **When** the tool is called, **Then** the conversion completes successfully using Google Drive API credentials

---

### User Story 2 - Convert Google Doc via REST API (Priority: P2)

As a developer or script user, I need to convert a Google Drive document to markdown by calling a REST API endpoint, so I can integrate this functionality into external applications or automation scripts.

**Why this priority**: Extends the core capability to REST API users, enabling broader integration scenarios. Builds on P1 by adding the second interface while reusing the same business logic.

**Independent Test**: Can be fully tested by making a POST request to the API endpoint with a Google Doc URL and Personal Access Token, and verifying the response contains the markdown content.

**Acceptance Scenarios**:

1. **Given** a valid Google Drive document URL and PAT credentials, **When** a POST request is sent to `/api/drive-doc-to-markdown`, **Then** the API returns markdown content with 200 status
2. **Given** missing or invalid credentials, **When** the API is called, **Then** it returns 401 Unauthorized with a clear error message
3. **Given** an invalid or inaccessible document URL, **When** the API is called, **Then** it returns 404 Not Found with a descriptive error message
4. **Given** concurrent API requests, **When** multiple conversions are requested, **Then** each request completes independently without interference

---

### User Story 3 - Handle Document Permissions and Sharing (Priority: P3)

As a user with limited document access, I need clear error messages when trying to convert documents I don't have permission to access, so I understand why the conversion failed and what actions I can take.

**Why this priority**: Enhances user experience for permission-related failures. Not critical for MVP but important for production use with multiple users and shared documents.

**Independent Test**: Can be tested by attempting to convert a private document without proper permissions and verifying the error message explains the permission issue and suggests requesting access.

**Acceptance Scenarios**:

1. **Given** a document URL the user doesn't have access to, **When** conversion is attempted, **Then** the system returns a clear error: "Permission denied: You don't have access to this document. Request access from the document owner."
2. **Given** a document shared with "anyone with link" permissions, **When** conversion is attempted, **Then** the system successfully converts the document regardless of ownership
3. **Given** a document that was accessible but permissions changed, **When** conversion is attempted, **Then** the system detects the permission change and returns an updated error message

---

### Edge Cases

- What happens when the Google Drive API rate limit is exceeded? (System should return 429 error with retry-after guidance)
- How does the system handle extremely large documents (>10MB)? (Implement size limit check with clear error message)
- What happens when the document format is not supported (e.g., Google Sheets, Slides)? (Return error: "Unsupported document type: only Google Docs documents are supported")
- How are tables in Google Docs converted to markdown? (Use markdown table format or fallback to plain text with clear structure)
- What happens when the document URL format is invalid or malformed? (Return 400 Bad Request with validation error explaining expected URL format)
- How does the system handle documents with embedded fonts or custom styling? (Convert to standard markdown formatting, log a warning about unsupported styling)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a valid Google Drive document URL as input (supports both document ID format and full sharing URLs)
- **FR-002**: System MUST authenticate with Google Drive API using OAuth2 credentials to access documents
- **FR-003**: System MUST download the document content from Google Drive in a format suitable for conversion (preferably DOCX or native Google Docs format)
- **FR-004**: System MUST convert the downloaded document content to properly formatted markdown
- **FR-005**: System MUST preserve document structure including headings (h1-h6), paragraphs, lists (ordered/unordered), bold, italic, and inline code
- **FR-006**: System MUST handle images by including markdown image syntax with appropriate references
- **FR-007**: System MUST expose functionality via MCP tool interface with proper tool registration and schema
- **FR-008**: System MUST expose identical functionality via REST API endpoint (`POST /api/drive-doc-to-markdown`)
- **FR-009**: System MUST support both OAuth authentication (MCP) and Personal Access Token authentication (REST API)
- **FR-010**: System MUST return user-friendly error messages for common failure scenarios (permission denied, document not found, invalid URL, unsupported format)
- **FR-011**: System MUST validate Google Drive URLs before attempting conversion
- **FR-012**: System MUST handle Google Drive API errors gracefully and map them to appropriate HTTP status codes

### Key Entities

- **Google Drive Document**: Represents the source document to be converted, identified by URL or document ID, with associated permissions and content
- **Markdown Content**: The converted output containing structured text with markdown formatting, ready for downstream consumption
- **Conversion Request**: Represents a single conversion operation, containing the source URL, authentication context, and resulting markdown or error information

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can successfully convert a Google Drive document to markdown in under 5 seconds for documents under 1MB
- **SC-002**: System correctly converts 95% of common document formatting (headings, bold, italic, lists) to equivalent markdown syntax
- **SC-003**: Both MCP and REST API interfaces return identical markdown output for the same input document
- **SC-004**: Error messages are clear and actionable, with 90% of users understanding the issue without requiring documentation lookup
- **SC-005**: System handles 100 concurrent conversion requests without errors or timeouts

## Assumptions

- Google Drive API credentials (OAuth2) are already configured in the system (based on existing Google Drive OAuth support mentioned in specs/34-google-drive-oauth.md)
- Documents are primarily Google Docs format (not Sheets, Slides, or other Google Workspace types)
- Standard markdown format is sufficient (no need for extended syntax like GitHub Flavored Markdown tables)
- Document size limit of 10MB is reasonable for typical use cases
- Users have appropriate Google Drive API permissions configured in their OAuth app
- Markdown output does not need to be byte-perfect identical to the original document appearance, only semantically equivalent
- Image conversion can use reference syntax without embedding base64 content (images remain as links)
- The existing LLM provider infrastructure can be leveraged if AI-assisted conversion is needed for complex formatting

## Dependencies & Integration

- **Google Drive API**: Requires OAuth2 authentication and access to the Drive API v3 (docs.google.com/document URLs)
- **Document Conversion Library**: Requires a library capable of converting DOCX or Google Docs format to markdown (e.g., pandoc, mammoth.js, or similar)
- **Existing OAuth Infrastructure**: Depends on the OAuth2 configuration from specs/34-google-drive-oauth.md
- **MCP Protocol**: Integrates with existing MCP tool registration patterns (server/providers/*/tools/)
- **REST API Framework**: Integrates with existing Express.js API structure (server/api/)
- **Authentication System**: Leverages existing dual authentication pattern (OAuth for MCP, PAT for REST API)
