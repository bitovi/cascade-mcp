# Feature Specification: Static Pre-Generated Encryption Keys

**Feature Branch**: `001-static-encryption-keys`  
**Created**: February 3, 2026  
**Status**: Draft  
**Input**: User description: "Change Google encryption to use pre-generated public/private keys from environment variables (base64-encoded) instead of dynamic generation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Local Development Encryption (Priority: P1)

A developer setting up the project locally needs to configure Google service account encryption using pre-generated keys from environment variables.

**Why this priority**: This is the foundation of the feature - developers must be able to use encryption in local development before any other scenario matters. Without this working, no other functionality is possible.

**Independent Test**: Can be fully tested by following the setup documentation, generating keys using the provided script, adding them to `.env`, starting the server, and verifying encryption/decryption works through the web interface at `/google-service-encrypt`.

**Acceptance Scenarios**:

1. **Given** a fresh project clone, **When** developer runs the key generation script, **Then** public and private PEM files are created with proper permissions (0600 for private key)
2. **Given** generated PEM files exist, **When** developer base64-encodes them and adds to `.env` file as specified in documentation, **Then** the values are stored in `.env` correctly
3. **Given** base64-encoded keys in `.env`, **When** server starts, **Then** keys are successfully loaded and decoded from environment variables
4. **Given** server is running with loaded keys, **When** user accesses `/google-service-encrypt` page, **Then** user can encrypt service account JSON and receive encrypted output
5. **Given** encrypted service account credentials, **When** user stores them in `.env` as `GOOGLE_SERVICE_ACCOUNT_ENCRYPTED`, **Then** system successfully decrypts and uses credentials for Google API operations

---

### User Story 2 - Deploy to Staging with GitHub Secrets (Priority: P2)

A DevOps engineer needs to configure the staging environment with encryption keys stored securely in GitHub Secrets Manager.

**Why this priority**: Staging deployment is critical for testing before production, and GitHub Secrets integration ensures secure key management in CI/CD pipelines. This must work before production deployment.

**Independent Test**: Can be tested by adding base64-encoded keys as GitHub Secrets, deploying to staging environment, and verifying the application successfully loads keys from environment variables injected by GitHub Actions.

**Acceptance Scenarios**:

1. **Given** base64-encoded public and private keys, **When** DevOps engineer adds them to GitHub Secrets Manager as separate secrets, **Then** secrets are stored securely in GitHub
2. **Given** GitHub Secrets configured, **When** GitHub Actions workflow runs, **Then** secrets are injected as environment variables during deployment
3. **Given** staging deployment with keys from GitHub Secrets, **When** staging application starts, **Then** keys are loaded successfully from environment variables
4. **Given** staging environment running, **When** encryption/decryption operations are performed, **Then** operations work identically to local development
5. **Given** different keys for staging vs production, **When** each environment loads its respective keys, **Then** staging and production use separate key pairs without conflict

---

### User Story 3 - Deploy to Production with GitHub Secrets (Priority: P3)

A DevOps engineer needs to configure the production environment with different encryption keys than staging, also stored in GitHub Secrets Manager.

**Why this priority**: Production deployment follows the same pattern as staging but requires separate keys for security isolation. This is the final deployment target after staging validation.

**Independent Test**: Can be tested by configuring production-specific GitHub Secrets with different key values than staging, deploying to production, and verifying key isolation between environments.

**Acceptance Scenarios**:

1. **Given** production environment setup, **When** DevOps engineer generates separate production keys and adds to GitHub Secrets, **Then** production secrets are distinct from staging secrets
2. **Given** production GitHub Secrets configured, **When** production deployment occurs, **Then** production-specific keys are loaded without affecting staging
3. **Given** both staging and production running, **When** each environment operates independently, **Then** each uses its own key pair and can decrypt its own encrypted credentials
4. **Given** production deployment, **When** encryption operations are performed, **Then** operations use production keys exclusively

---

### User Story 4 - Update Documentation for New Workflow (Priority: P4)

A new contributor needs clear documentation explaining how to manually generate encryption keys and configure them in different environments.

**Why this priority**: Documentation is essential for team scalability but can be completed after core functionality works. Poor documentation slows adoption but doesn't block technical functionality.

**Independent Test**: Can be tested by having a new developer (unfamiliar with the codebase) follow only the documentation to set up local development and successfully encrypt/decrypt service accounts.

**Acceptance Scenarios**:

1. **Given** updated contributing.md, **When** new developer reads the local setup section, **Then** developer understands how to generate keys, base64-encode them, and add to `.env`
2. **Given** updated documentation, **When** developer follows key generation steps, **Then** developer successfully creates valid PEM files without errors
3. **Given** documentation on base64 encoding, **When** developer encodes multi-line PEM files, **Then** developer produces valid base64 strings suitable for environment variables
4. **Given** updated Google encryption documentation, **When** developer reads about the new workflow, **Then** developer understands that keys are pre-generated (not dynamic) and must be manually created
5. **Given** updated documentation, **When** DevOps engineer reads deployment sections, **Then** engineer understands how to configure GitHub Secrets for staging and production

---

### Edge Cases

- What happens when environment variables for keys are missing or empty? (System should continue working with Google features disabled)
- What happens when base64-encoded keys in environment variables are malformed or invalid?
- What happens when decoded PEM files have incorrect format or are corrupted?
- What happens when a developer tries to use the encryption page before configuring keys? (Should show helpful error/instructions)
- What happens when a user tries to use Google-dependent tools without encryption keys configured? (Should show clear error about missing setup)
- What happens when staging and production accidentally use the same keys?
- How does the system handle key rotation without downtime?
- What happens when private key permissions are too open (not 0600)?
- What happens if code accidentally tries to send the private key to the client?
- How does the system prevent logging or exposing the private key in error messages?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST load RSA public key from environment variable `GOOGLE_RSA_PUBLIC_KEY` (base64-encoded PEM format)
- **FR-002**: System MUST load RSA private key from environment variable `GOOGLE_RSA_PRIVATE_KEY` (base64-encoded PEM format)
- **FR-003**: System MUST decode base64-encoded keys from environment variables before using them for encryption/decryption operations
- **FR-004**: System MUST gracefully handle missing encryption keys by disabling Google service account features without breaking other functionality
- **FR-005**: System MUST log a clear informational message when encryption keys are not configured, explaining which features are unavailable
- **FR-006**: System MUST provide a manual script for generating RSA-4096 key pairs in PEM format
- **FR-007**: Key generation script MUST set private key file permissions to 0600 (owner read/write only)
- **FR-008**: Key generation script MUST output public and private keys as separate PEM files
- **FR-009**: Documentation MUST explain how to base64-encode multi-line PEM files for environment variable storage
- **FR-010**: Documentation MUST provide instructions for local development setup using `.env` file
- **FR-011**: Documentation MUST provide instructions for staging/production setup using GitHub Secrets Manager
- **FR-012**: Documentation MUST clarify that keys are pre-generated and not dynamically created by the application
- **FR-013**: Documentation MUST clarify that Google encryption setup is optional and system works without it
- **FR-014**: System MUST remove all dynamic key generation code from the application
- **FR-015**: System MUST remove web-based key generation functionality (if any exists)
- **FR-016**: Simplified key manager code MUST only handle loading keys from environment and performing encryption/decryption
- **FR-017**: System MUST support different keys for different environments (dev, staging, production)
- **FR-018**: System MUST maintain backward compatibility with existing encrypted service account credentials (same RSA-ENCRYPTED format)
- **FR-019**: `contributing.md` MUST be updated with step-by-step local encryption setup instructions
- **FR-020**: Google service account encryption documentation MUST be updated to reflect new manual key generation workflow
- **FR-021**: System MUST continue to use RSA-OAEP encryption with SHA-256 padding
- **FR-022**: System MUST continue to use 4096-bit RSA keys for encryption operations
- **FR-023**: System MUST NEVER expose the private key to the client (browser, API responses, or any network transmission)
- **FR-024**: Encryption web page MUST only use the public key for client-side operations
- **FR-025**: Decryption operations MUST only occur server-side, never in the browser
- **FR-026**: API responses MUST NOT include the private key or any base64-encoded representation of it
- **FR-027**: System MUST log a warning if private key is accessed for any operation other than decryption

### Key Entities

- **RSA Key Pair**: A public/private key pair in PEM format, base64-encoded and stored in environment variables
  - Public Key: Used for encryption operations, safe to share with clients, can be transmitted over network
  - Private Key: Used for decryption operations, MUST remain server-side only, NEVER transmitted to clients or exposed in any API response
  - Both keys stored as base64-encoded strings in environment variables (handles multi-line PEM format)
  - Private key access restricted to server-side decryption operations only
  
- **Environment Configuration**: Different sets of encryption keys for different deployment environments
  - Development: Keys stored in `.env` file (git-ignored)
  - Staging: Keys stored in GitHub Secrets Manager, injected at deployment time
  - Production: Separate keys stored in GitHub Secrets Manager, isolated from staging

- **Encrypted Service Account Credential**: Google service account JSON encrypted with public key, stored with `RSA-ENCRYPTED:` prefix
  - Format remains unchanged from current implementation
  - Can be decrypted using corresponding private key from environment

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can set up local encryption in under 10 minutes following documentation alone
- **SC-002**: 100% of encryption operations successfully load keys from environment variables without falling back to dynamic generation
- **SC-003**: Code complexity of key manager reduced by at least 40% (measured by lines of code or cyclomatic complexity)
- **SC-004**: Zero security incidents related to accidental key exposure in version control after implementing environment-based key management
- **SC-005**: 100% of existing encrypted service account credentials continue to work without re-encryption (backward compatibility verified)
- **SC-006**: Documentation completeness verified by having 3 new contributors successfully set up encryption without asking questions
- **SC-007**: Staging and production deployments successfully use separate key pairs with zero cross-environment key usage
- **SC-008**: Key rotation process can be completed in under 30 minutes per environment with zero downtime
- **SC-009**: 100% of code reviews confirm zero instances of private key exposure to clients (network transmission, API responses, or browser access)
- **SC-010**: Security audit confirms private key is never logged, never transmitted over network, and never accessible from client-side code

## Assumptions

- **Optional encryption setup**: Google service account encryption is optional; users who don't need Google Drive/Docs features can skip this setup entirely
- **Partial feature degradation acceptable**: When encryption keys are not configured, only Google-specific tools are affected; all other system functionality remains operational
- **Base64 encoding standard**: Using standard base64 encoding (not URL-safe variant) is acceptable for environment variables
- **GitHub Secrets as secrets manager**: GitHub Secrets Manager is the primary secrets management solution for CI/CD; alternative solutions (AWS Secrets Manager, HashiCorp Vault) are out of scope for initial implementation
- **Single key pair per environment**: Each environment uses exactly one public/private key pair; key rotation is a manual process requiring new keys and re-encryption of stored credentials
- **PEM format**: RSA keys are stored in PEM format (RFC 7468), which is the standard format for OpenSSL and Node.js crypto operations
- **4096-bit key size**: RSA-4096 is sufficient security level and will not be changed; larger key sizes (8192-bit) are not required
- **Same encryption format**: The `RSA-ENCRYPTED:` prefix and base64-encoded encrypted data format remains unchanged to maintain backward compatibility
- **Node.js crypto module**: Built-in Node.js crypto module provides all necessary RSA encryption/decryption capabilities; no external libraries needed
- **Owner-only private key access**: File permission 0600 for private keys is sufficient security for development; production keys are managed by GitHub Secrets
- **Manual key generation**: Automated key generation and distribution is out of scope; keys are generated manually using provided script
- **Documentation review process**: New documentation will be reviewed by at least one team member before merging to ensure accuracy and completeness
- **Client-side encryption only**: The web encryption page only performs encryption (using public key); all decryption happens server-side to protect the private key
- **Private key isolation**: Private key never leaves the server environment and is never transmitted over the network or exposed in logs/responses
