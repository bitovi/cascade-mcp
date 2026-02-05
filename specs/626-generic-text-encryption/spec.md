# Feature Specification: Generic Text Encryption

**Feature Branch**: `626-generic-text-encryption`  
**Created**: February 5, 2026  
**Status**: Draft  
**Input**: User description: "the web encryption page needs to be generic, the encryption will work for any text (useful if we want to encrypt something else aside from google json in the future). no google references aside from a note mentioning that some endpoints only accept x-google-token encrypted."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Encrypt Arbitrary Sensitive Text (Priority: P1)

Users need to encrypt any sensitive text data (API keys, service account credentials, tokens, configuration data) using the web interface, receiving an encrypted string they can safely store in configuration files or environment variables.

**Why this priority**: This is the core capability that makes the encryption page reusable across different use cases. Without this, users are limited to Google-specific encryption only.

**Independent Test**: Can be fully tested by visiting the encryption page, pasting any text (e.g., a sample API key), clicking encrypt, and receiving an RSA-encrypted string starting with `RSA-ENCRYPTED:` prefix. Delivers immediate value by securing any sensitive data.

**Acceptance Scenarios**:

1. **Given** a user visits the encryption page, **When** they paste any plaintext (service account JSON, API key, token, or configuration), **Then** they receive an encrypted string with `RSA-ENCRYPTED:` prefix
2. **Given** a user encrypts Google service account JSON, **When** viewing the result, **Then** metadata (client_email, project_id) is displayed in a collapsible section that's initially expanded
3. **Given** a user encrypts non-Google data (API keys, tokens), **When** viewing the result, **Then** no metadata section is displayed (cleaner result)
4. **Given** a user has encrypted text, **When** they click the copy button, **Then** the encrypted string is copied to their clipboard for easy storage
5. **Given** a user has successfully encrypted text, **When** viewing the result, **Then** they see usage instructions that work for any type of encrypted data

---

### User Story 2 - Understand Provider-Specific Requirements (Priority: P2)

Users encrypting data for specific providers need to know when certain encrypted formats are required, such as using `X-Google-Token` headers for Google Drive endpoints.

**Why this priority**: While the encryption is generic, users need contextual guidance about provider-specific header requirements. This prevents confusion about how to use encrypted data with different APIs.

**Independent Test**: Can be tested by reading the page instructions and verifying that provider-specific requirements (like `X-Google-Token`) are mentioned as informational notes without limiting the generic nature of the tool.

**Acceptance Scenarios**:

1. **Given** a user reads the page instructions, **When** they look for usage guidance, **Then** they see generic examples (environment variables, config files) plus notes about provider-specific requirements
2. **Given** a user needs to use encrypted data with Google endpoints, **When** they review the notes, **Then** they understand that `X-Google-Token` header is required for Google-specific endpoints

---

### User Story 3 - Copy Public Key for Programmatic Encryption (Priority: P3)

Users who want to automate encryption in their build pipelines or scripts need to copy the public key to use it programmatically outside the web interface.

**Why this priority**: Enables advanced users to integrate encryption into their development workflows, but most users will use the web interface directly.

**Independent Test**: Can be tested by clicking the "Copy Public Key" button and successfully using that key in a standalone encryption script. The web interface remains functional independently.

**Acceptance Scenarios**:

1. **Given** a user wants to encrypt locally, **When** they click "Copy Public Key", **Then** they receive the RSA public key in PEM format
2. **Given** a user has the public key, **When** they use it with their own encryption script, **Then** the server successfully decrypts the result (same as web-encrypted data)

---

### User Story 4 - Encrypt Any Text via Terminal (Priority: P3)

Advanced users need to encrypt any sensitive text (API keys, tokens, configuration files, credentials) directly from their terminal using OpenSSL, without opening the web interface.

**Why this priority**: Enables CI/CD automation, build scripts, and power users who prefer command-line workflows. This complements the web interface and supports the generic encryption philosophy.

**Independent Test**: Can be tested by following terminal encryption documentation with any text file (not just Google JSON) and verifying the encrypted output works with the server. No dependency on web interface.

**Acceptance Scenarios**:

1. **Given** a user has the public key file, **When** they encrypt any text file (API keys, tokens, config) using OpenSSL commands from documentation, **Then** the server successfully decrypts the result
2. **Given** a user reviews the encryption documentation, **When** they read the manual encryption section, **Then** they see generic examples (not just Google JSON) showing how to encrypt any text type
3. **Given** a user encrypts a multi-line configuration file via terminal, **When** the server decrypts it, **Then** all formatting and line breaks are preserved

---

### Edge Cases

- What happens when user provides empty text input? (Should display validation error)
- What happens when RSA keys are not configured on server? (Display generic "Service unavailable" message)
- What happens when user tries to encrypt text exceeding size limit? (Display user-friendly error message with size limit - maximum 50KB - before encryption attempt)
- What happens when user pastes invalid characters or binary data? (Should accept any UTF-8 text)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a web page for encrypting arbitrary text without service-specific references (except provider notes)
- **FR-002**: System MUST display generic page title and description (e.g., "Text Encryption" instead of "Google Service Account Encryption")
- **FR-003**: System MUST use generic form labels (e.g., "Text to Encrypt" instead of "Service Account JSON")
- **FR-004**: System MUST accept any text input (API keys, JSON, tokens, configuration data, etc.)
- **FR-005**: System MUST return encrypted strings with `RSA-ENCRYPTED:` prefix regardless of input content
- **FR-006**: System MUST provide copy-to-clipboard functionality for encrypted output
- **FR-007**: System MUST display generic usage examples (environment variables, config files) without service-specific context
- **FR-008**: System MUST include an informational banner above the form mentioning that some endpoints (like Google Drive) require specific header names (e.g., `X-Google-Token`), ensuring it's always visible to users before encryption
- **FR-009**: System MUST maintain backward compatibility with existing encryption endpoints and formats
- **FR-010**: System MUST allow users to copy the public key for programmatic encryption
- **FR-011**: System MUST display a generic "Service unavailable" error message when encryption is unavailable (missing keys)
- **FR-012**: System MUST handle multi-line text and preserve formatting during encryption/decryption
- **FR-013**: System documentation MUST provide instructions for manual terminal-based encryption using OpenSSL for any text type (not limited to Google service accounts)
- **FR-014**: System MUST validate text size on client-side (maximum 50KB) before sending to server, with server-side backup validation for security
- **FR-015**: System MUST display Google service account metadata (client_email, project_id) in a collapsible section (initially expanded) when detected, and hide metadata for non-Google data

### Key Entities

- **Plaintext Input**: Any UTF-8 encoded text string provided by the user (API keys, credentials, configuration)
- **Encrypted Output**: RSA-OAEP encrypted, Base64-encoded string with `RSA-ENCRYPTED:` prefix
- **RSA Key Pair**: Public/private key pair (4096-bit) used for encryption/decryption
- **Encryption Result**: Display object containing encrypted string and usage instructions

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can encrypt any type of text data (not just Google service accounts) within 30 seconds via web interface
- **SC-002**: Page contains no Google-specific terminology in titles, headings, or form labels
- **SC-003**: Users understand provider-specific header requirements through clear informational notes (100% of test users can identify when to use `X-Google-Token`)
- **SC-004**: Encrypted output works with any API endpoint accepting RSA-encrypted headers
- **SC-005**: 95% of users successfully complete encryption workflow without consulting additional documentation
- **SC-006**: Page load time remains under 2 seconds
- **SC-007**: Copy-to-clipboard functionality works in 100% of supported browsers (Chrome, Firefox, Safari, Edge)
- **SC-008**: Advanced users can encrypt any text type via terminal using documented OpenSSL commands within 5 minutes

## Assumptions

- RSA encryption implementation remains unchanged (RSA-OAEP with SHA-256, 4096-bit keys)
- Backend encryption endpoint (`/google-service-encrypt`) already accepts generic text and doesn't need modification
- Users understand basic concepts of encryption and environment variables
- Public key is safe to expose and can be displayed on the page
- Encryption is performed server-side (not client-side in browser)
- All encrypted data uses the same `RSA-ENCRYPTED:` prefix format regardless of content type

## Scope

### In Scope

- Updating page title, description, and all user-facing text to be generic
- Updating form labels and placeholders to accept any text
- Revising usage instructions and examples to be service-agnostic
- Adding informational notes about provider-specific header requirements (e.g., `X-Google-Token`)
- Updating success/result messages to be generic
- Ensuring all UI components refer to "text" or "data" instead of "service account" or "credentials"

### Out of Scope

- Changing backend encryption implementation or algorithms
- Modifying the encryption endpoint URL (`/google-service-encrypt` can remain as-is)
- Adding client-side encryption capabilities
- Creating provider-specific encryption pages
- Implementing decryption functionality in the web interface
- Supporting multiple encryption algorithms or key sizes
- Adding authentication or access control to the encryption page
- Creating REST API documentation for encrypted headers (separate concern)
## Clarifications

### Session 2026-02-05

- Q: When a user attempts to encrypt text that exceeds the practical size limit (">10KB" mentioned in edge cases), what should happen? → A: Display error message with size limit (e.g., "Maximum 50KB") before encryption