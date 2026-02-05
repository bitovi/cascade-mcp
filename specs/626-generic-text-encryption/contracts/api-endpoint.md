# API Contract: Encryption Endpoint

**Endpoint**: `POST /google-service-encrypt`  
**Purpose**: Encrypt arbitrary text data using RSA-OAEP  
**Authentication**: None (public endpoint)

## Request

### HTTP Method

`POST`

### Headers

| Header | Value | Required |
|--------|-------|----------|
| Content-Type | application/json | Yes |

### Body Schema

```json
{
  "data": "string"
}
```

**Fields**:

- `data` (string, required): Plain text data to encrypt (UTF-8)
  - Min length: 1 character
  - Max length: 100,000 characters
  - Examples: JSON, API keys, tokens, configuration strings

### Request Examples

**Example 1: Google Service Account JSON**

```http
POST /google-service-encrypt HTTP/1.1
Content-Type: application/json

{
  "data": "{\"type\":\"service_account\",\"project_id\":\"my-project\",\"private_key_id\":\"abc123\",\"private_key\":\"-----BEGIN PRIVATE KEY-----\\n...\"}"
}
```

**Example 2: API Key**

```http
POST /google-service-encrypt HTTP/1.1
Content-Type: application/json

{
  "data": "sk-ant-api03-abc123xyz456"
}
```

**Example 3: Configuration String**

```http
POST /google-service-encrypt HTTP/1.1
Content-Type: application/json

{
  "data": "DATABASE_URL=postgresql://user:pass@host:5432/db"
}
```

---

## Response

### Success Response (200 OK)

**Headers**:

| Header | Value |
|--------|-------|
| Content-Type | application/json |

**Body Schema**:

```json
{
  "encrypted": "string"
}
```

**Fields**:

- `encrypted` (string): RSA-encrypted data with `RSA-ENCRYPTED:` prefix
  - Format: `RSA-ENCRYPTED:<base64-encoded-data>`
  - Length: Variable (depends on input size)

**Example**:

```json
{
  "encrypted": "RSA-ENCRYPTED:eyJhbGciOiJSU0EtT0FFUCIsInZlcnNpb24iOiIxIn0=..."
}
```

### Error Response: Missing Data (400 Bad Request)

```json
{
  "error": "Missing data in request body"
}
```

### Error Response: Invalid Data Type (400 Bad Request)

```json
{
  "error": "Data must be a string"
}
```

### Error Response: Encryption Not Available (503 Service Unavailable)

```json
{
  "error": "Encryption is not enabled. Configure RSA_PUBLIC_KEY and RSA_PRIVATE_KEY environment variables. Run ./scripts/generate-rsa-keys.sh to generate keys. See docs/encryption-setup.md for setup instructions."
}
```

### Error Response: Encryption Failed (500 Internal Server Error)

```json
{
  "error": "Encryption failed"
}
```

---

## Behavior Specification

### Idempotency

**Guarantee**: Same input + same RSA key pair → same encrypted output

**Rationale**: RSA-OAEP encryption is deterministic for a given key pair

### State

**Server-side**: Stateless (no session, no database storage)

**Side effects**: None (encryption only, no decryption endpoint)

### Performance

**Expected latency**:

- Small input (<1KB): <100ms
- Medium input (1-10KB): <300ms
- Large input (10-100KB): <500ms

**Constraints**:

- Server MUST respond within 5 seconds or return timeout error
- Server SHOULD handle concurrent requests (no global locks)

### Security

**Guarantees**:

- Private key never exposed in response
- Plaintext data never logged
- Encrypted output safe to log/store

**Non-guarantees**:

- No authentication (public endpoint)
- No rate limiting (implementation detail)
- No audit trail (implementation detail)

---

## Error Handling

### Client Responsibilities

1. Validate `data` field is non-empty before sending
2. Handle 503 errors (encryption not available)
3. Handle 400 errors (invalid request)
4. Handle 500 errors (server-side failure)
5. Implement timeout (client-side, 10-second recommended)

### Server Responsibilities

1. Validate `data` field presence and type
2. Return 503 if RSA keys not configured
3. Return 500 if encryption algorithm fails
4. Never expose private key or plaintext in error messages

---

## Versioning

**Current Version**: 1.0

**Breaking Changes** (future):

- Changing request body field name (e.g., `data` → `plaintext`)
- Changing encrypted output format (e.g., `RSA-ENCRYPTED:` → different prefix)
- Requiring authentication

**Non-Breaking Changes**:

- Adding optional fields to response (e.g., `algorithm: "RSA-OAEP"`)
- Improving error messages
- Performance optimizations

---

## Contract Tests

### Required Test Cases

1. **Happy Path: JSON Input**
   - Send: `{"data": "{\"key\":\"value\"}"}`
   - Expect: 200, `{"encrypted": "RSA-ENCRYPTED:..."}`
   - Verify: Encrypted string starts with prefix

2. **Happy Path: Non-JSON Input**
   - Send: `{"data": "my-api-key-123"}`
   - Expect: 200, `{"encrypted": "RSA-ENCRYPTED:..."}`
   - Verify: Encrypted string valid

3. **Error: Missing Data**
   - Send: `{}`
   - Expect: 400, `{"error": "Missing data in request body"}`

4. **Error: Empty String**
   - Send: `{"data": ""}`
   - Expect: 400 (or encrypt successfully - implementation choice)

5. **Error: Non-String Data**
   - Send: `{"data": 123}`
   - Expect: 400, `{"error": "Data must be a string"}`

6. **Error: Encryption Disabled**
   - Condition: RSA keys not configured
   - Send: `{"data": "test"}`
   - Expect: 503, `{"error": "Encryption is not enabled..."}`

7. **Idempotency Check**
   - Send same request twice
   - Verify: Both responses have identical `encrypted` value

---

## Usage Examples (Generic)

### Environment Variable

```bash
# .env
ENCRYPTED_DATA=RSA-ENCRYPTED:eyJhbGciOiJSU0EtT0FFUCIsInZlcnNpb24iOiIxIn0=...
```

### Configuration File

```json
{
  "encrypted_credentials": "RSA-ENCRYPTED:..."
}
```

### HTTP Header (Generic)

```http
X-Encrypted-Data: RSA-ENCRYPTED:...
```

### Provider-Specific Headers

**Google Drive Endpoints**:

```http
X-Google-Token: RSA-ENCRYPTED:...
```

*Note: Some provider-specific endpoints require specific header names. Refer to provider documentation for requirements.*

---

## Migration from Previous Format

### Before (Google-Specific)

```json
{
  "serviceAccountJson": "{ ... }"
}
```

**Response**:

```json
{
  "encrypted": "RSA-ENCRYPTED:...",
  "clientEmail": "service@project.iam.gserviceaccount.com",
  "projectId": "my-project"
}
```

### After (Generic)

```json
{
  "data": "{ ... }"
}
```

**Response**:

```json
{
  "encrypted": "RSA-ENCRYPTED:..."
}
```

**Backward Compatibility**: 

- Old frontend sending `serviceAccountJson` will fail (field name changed)
- Solution: Frontend must update to send `data` field
- Backend already accepts `text` field (will be changed to `data` for consistency)
