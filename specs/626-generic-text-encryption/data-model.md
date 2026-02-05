# Data Model: Generic Text Encryption

**Phase**: 1 - Design & Contracts  
**Date**: February 5, 2026  
**Feature**: [Generic Text Encryption](./spec.md)

## Domain Entities

### EncryptionRequest

Represents user input to the encryption endpoint.

**Attributes**:

- `data` (string, required): Plaintext data to encrypt (any UTF-8 text: JSON, API keys, tokens, configuration)
- Length constraints: 1 - 100,000 characters (enforced by encryption chunking algorithm)

**Validation Rules**:

- MUST NOT be empty string
- MUST be valid UTF-8 encoding
- SHOULD NOT contain null bytes (\\x00)

**State**: Transient (not persisted, processed immediately)

**Example**:

```json
{
  "data": "{\"type\":\"service_account\",\"project_id\":\"my-project\"}"
}
```

---

### EncryptionResponse

Represents encrypted output from the encryption endpoint.

**Attributes**:

- `encrypted` (string, required): RSA-OAEP encrypted data with `RSA-ENCRYPTED:` prefix, Base64-encoded
- Format: Always `RSA-ENCRYPTED:<base64-string>`

**Validation Rules**:

- MUST start with `RSA-ENCRYPTED:` prefix
- MUST contain valid Base64 after prefix
- Length: Variable (depends on input size and RSA chunk size)

**State**: Stateless (no server-side storage, returned immediately)

**Example**:

```json
{
  "encrypted": "RSA-ENCRYPTED:eyJhbGciOiJSU0EtT0FFUCIsInZlcnNpb24iOiIxIn0=..."
}
```

---

### EncryptionMetadata (Optional)

Represents parsed metadata from encrypted JSON data (used for UI display only).

**Attributes**:

- `clientEmail` (string, optional): Extracted from `client_email` field if JSON contains it
- `projectId` (string, optional): Extracted from `project_id` field if JSON contains it
- `type` (string, optional): Extracted from `type` field to detect service account JSON

**Validation Rules**:

- Only populated if input `data` is valid JSON
- Only populated if JSON has `type: "service_account"`
- Never sent to backend (client-side only parsing)

**State**: Transient (exists only in frontend component state during result display)

**Example**:

```typescript
{
  clientEmail: "service@project.iam.gserviceaccount.com",
  projectId: "my-project-123",
  type: "service_account"
}
```

---

### EncryptionStatus

Represents encryption service availability (RSA keys configured or not).

**Attributes**:

- `enabled` (boolean, required): Whether encryption is currently available
- `message` (string, required): Human-readable status message

**Validation Rules**:

- `enabled: true` only if both RSA_PUBLIC_KEY and RSA_PRIVATE_KEY env vars set
- `message` provides actionable guidance if `enabled: false`

**State**: Derived (computed from environment configuration)

**Example**:

```json
{
  "enabled": false,
  "message": "Encryption is not enabled. Configure RSA_PUBLIC_KEY and RSA_PRIVATE_KEY environment variables."
}
```

---

### PublicKeyResponse

Represents the RSA public key for client-side encryption.

**Attributes**:

- `publicKey` (string, required): RSA public key in PEM format (multi-line string)

**Validation Rules**:

- MUST start with `-----BEGIN PUBLIC KEY-----`
- MUST end with `-----END PUBLIC KEY-----`
- MUST be valid RSA-4096 public key

**State**: Static (derived from environment variable, doesn't change at runtime)

**Example**:

```json
{
  "publicKey": "-----BEGIN PUBLIC KEY-----\nMIICIjANBgkqhkiG9w0BAQ...\n-----END PUBLIC KEY-----"
}
```

---

## Entity Relationships

```
┌─────────────────────┐
│ EncryptionRequest   │
│ (Frontend → API)    │
│  - data: string     │
└──────────┬──────────┘
           │
           │ POST /google-service-encrypt
           ▼
┌─────────────────────┐
│ Encryption Service  │
│  - Validates data   │
│  - RSA encrypts     │
└──────────┬──────────┘
           │
           │ Returns
           ▼
┌─────────────────────┐
│ EncryptionResponse  │
│ (API → Frontend)    │
│  - encrypted: str   │
└──────────┬──────────┘
           │
           │ (if JSON detected)
           ▼
┌─────────────────────┐
│ EncryptionMetadata  │ (Optional, client-side only)
│  - clientEmail      │
│  - projectId        │
│  - type             │
└─────────────────────┘
```

**Key Relationships**:

- **EncryptionRequest → EncryptionResponse**: 1:1 (every request produces exactly one response)
- **EncryptionResponse → EncryptionMetadata**: 0:1 (metadata only extracted if input is JSON)
- **PublicKeyResponse**: Singleton (one public key per server instance)
- **EncryptionStatus**: Singleton (one status per server instance)

---

## Data Flow

### Happy Path: Encrypt JSON (Google Service Account)

```
1. User pastes JSON into form
2. Frontend validates non-empty
3. Frontend sends POST { data: "<json-string>" }
4. Backend validates, encrypts
5. Backend returns { encrypted: "RSA-ENCRYPTED:..." }
6. Frontend receives response
7. Frontend parses original JSON to extract metadata
8. Frontend displays encrypted + metadata
```

### Happy Path: Encrypt Non-JSON (API Key)

```
1. User pastes API key into form
2. Frontend validates non-empty
3. Frontend sends POST { data: "sk-ant-..." }
4. Backend validates, encrypts
5. Backend returns { encrypted: "RSA-ENCRYPTED:..." }
6. Frontend receives response
7. Frontend attempts JSON parse → fails
8. Frontend displays encrypted only (no metadata)
```

### Error Path: Encryption Disabled

```
1. User visits page
2. Frontend checks /api/public-key
3. Backend returns 503 { error: "..." }
4. Frontend displays EncryptionNotAvailableWarning
5. Form disabled, user sees setup instructions
```

---

## State Transitions

### EncryptionStatus States

```
[Server Start] → [Check Env Vars]
                      │
       ┌──────────────┴──────────────┐
       │                             │
       ▼                             ▼
[RSA Keys Set]               [RSA Keys Missing]
enabled: true                enabled: false
  │                             │
  │                             │
  ▼                             ▼
[Allow Encryption]        [Block Encryption]
                           (Show warning)
```

### Form States

```
[Page Load] → [Check Status]
                  │
   ┌──────────────┴────────────────┐
   │                               │
   ▼                               ▼
[Enabled]                    [Disabled]
   │                               │
   │ User enters data              │ Show warning
   ▼                               ▼
[Ready]                      [Cannot Submit]
   │
   │ Submit
   ▼
[Encrypting]
   │
   │ Success
   ▼
[Result Display]
   │
   │ Reset
   ▼
[Ready]
```

---

## Data Constraints

### Input Constraints

| Field | Type | Min Length | Max Length | Pattern | Nullable |
|-------|------|------------|------------|---------|----------|
| data | string | 1 | 100,000 | UTF-8 | No |
| encrypted (output) | string | 20 | 200,000 | `^RSA-ENCRYPTED:[A-Za-z0-9+/=]+$` | No |

### Business Rules

1. **Encryption must be idempotent**: Same input + same key = same output
2. **No server-side state**: Encryption request/response is stateless
3. **Metadata is optional**: Frontend gracefully handles non-JSON input
4. **Backward compatibility**: Existing `RSA-ENCRYPTED:` format unchanged
5. **Provider-agnostic storage**: Encrypted data works with any header/env var name

### Security Constraints

1. **Private key never exposed**: Only public key returned via API
2. **No plaintext logging**: Original `data` field never logged
3. **Encrypted data is safe to log**: `RSA-ENCRYPTED:` output can be logged (for debugging)
4. **No decryption endpoint**: UI only encrypts, never decrypts
5. **Server-side encryption only**: Client cannot encrypt (no private key exposure)

---

## Technology-Agnostic Model

All entities defined above are **technology-agnostic**:

- No React, TypeScript, or Express-specific details
- Could be implemented in Python, Go, Java, etc.
- Focus on **what data exists** not **how it's stored**
- Validation rules are business logic, not framework validation syntax

---

## Implementation Notes

**For Phase 2 (Tasks)**:

1. Update `EncryptionRequest` interface to use `data` field (not `serviceAccountJson`)
2. Make `EncryptionMetadata` optional in component props
3. Update backend to accept `data` field (current `text` → `data`)
4. Add conditional logic in result component: show metadata only if present
5. Update tests to cover both JSON and non-JSON inputs
