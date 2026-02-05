# Component Contracts: Generic Encryption UI

**Phase**: 1 - Design & Contracts  
**Date**: February 5, 2026  
**Feature**: [Generic Text Encryption](../spec.md)

## Component Architecture

```
TextEncryptPage (Page)
├── TextEncryptionForm (Form)
│   ├── EncryptionStatusCheck (Internal)
│   ├── SecurityWarning (Info Box)
│   ├── UsageInstructions (Info Box)
│   ├── PublicKeySection (Optional)
│   └── DataInput (Textarea)
└── TextEncryptionResult (Result Display)
    ├── SuccessMessage
    ├── EncryptedDataDisplay
    ├── MetadataDisplay (Conditional)
    ├── GenericUsageExamples
    └── ProviderSpecificNotes
```

---

## Component: TextEncryptPage

**File**: `client/src/pages/GoogleServiceEncryptPage.tsx` (name unchanged for backward compat)

**Purpose**: Page wrapper for encryption interface

**Props**: None (top-level route)

**Render**: Page title + description + EncryptionForm component

### Interface

```typescript
export function GoogleServiceEncryptPage(): JSX.Element
```

### Content Changes

**Before**:

- Title: "🔐 Google Service Account Encryption"
- Description: "Encrypt your Google service account credentials for secure storage"

**After**:

- Title: "🔐 Text Encryption"
- Description: "Encrypt sensitive data for secure storage (API keys, credentials, configuration)"

---

## Component: TextEncryptionForm

**File**: `client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionForm.tsx`

**Purpose**: Main form for inputting data and triggering encryption

**State**:

```typescript
interface FormState {
  data: string;                           // User input (any text)
  isEncrypting: boolean;                  // Loading state
  result: EncryptionResult | null;        // Success result
  error: string | null;                   // Error message
  encryptionStatus: EncryptionStatus | null;  // Service availability
  isCheckingStatus: boolean;              // Initial loading
  publicKey: string | null;               // RSA public key for advanced users
}
```

### Props Interface

```typescript
export function GoogleServiceEncryptionForm(): JSX.Element
```

### Request/Response Types

```typescript
// Request to backend
interface EncryptionRequest {
  data: string;  // Changed from serviceAccountJson
}

// Response from backend
interface EncryptionAPIResponse {
  encrypted: string;  // No clientEmail, projectId
}

// Frontend result state (includes optional metadata)
interface EncryptionResult {
  encrypted: string;
  metadata?: {
    clientEmail: string;
    projectId: string;
    type: string;
  };
}
```

### Behavior Changes

**Before**:

- Always tries to parse input as JSON
- Always extracts `client_email` and `project_id`
- Shows error if JSON invalid

**After**:

- Accepts any text (JSON or not)
- Optionally parses JSON if valid AND has `type: "service_account"`
- Shows encrypted result for all inputs (metadata is bonus)

### Label Changes

| Element | Before | After |
|---------|--------|-------|
| Form label | "Service Account JSON:" | "Data to Encrypt:" |
| Placeholder | "Paste your service account JSON here..." | "Paste any sensitive data here (API keys, JSON, tokens, configuration)..." |
| Submit button | "🔒 Encrypt Credentials" | "🔒 Encrypt Data" |
| Info box | References "google.json" and "Google Doc conversion tools" | Generic: "Paste any sensitive text. Encrypted output is safe to store." |

---

## Component: TextEncryptionResult

**File**: `client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionResult.tsx`

**Purpose**: Display encrypted output and usage instructions

### Props Interface

```typescript
interface TextEncryptionResultProps {
  encrypted: string;
  metadata?: {                  // Made optional
    clientEmail: string;
    projectId: string;
    type: string;
  };
  onReset: () => void;
}
```

### Content Sections

#### 1. Success Message (Generic)

```tsx
<h3>✅ Encryption Successful!</h3>
<p>Your data has been encrypted using RSA-OAEP (SHA-256, 4096-bit key)</p>
```

#### 2. Metadata Display (Conditional)

**Show only if**: `metadata` prop is provided

```tsx
{metadata && (
  <div>
    <span>Service Account: {metadata.clientEmail}</span>
    <span>Project ID: {metadata.projectId}</span>
  </div>
)}
```

#### 3. Encrypted Data Display

```tsx
<h4>📋 Encrypted Data</h4>
<p>Copy this encrypted string:</p>
<textarea value={encrypted} readOnly />
<button onClick={handleCopy}>📋 Copy to Clipboard</button>
<button onClick={onReset}>🔒 Encrypt Another</button>
```

#### 4. Generic Usage Examples

**Before** (Google-specific):

```bash
X-Google-Token: RSA-ENCRYPTED:...
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:...
```

**After** (Generic with provider note):

```bash
# Environment variable
ENCRYPTED_DATA=RSA-ENCRYPTED:...

# HTTP header (generic)
X-Encrypted-Data: RSA-ENCRYPTED:...

# Configuration file
{
  "encrypted_credentials": "RSA-ENCRYPTED:..."
}
```

#### 5. Provider-Specific Requirements (New Section)

```tsx
<div className="bg-blue-50 border-l-4 border-blue-500 p-4">
  <h4>📌 Provider-Specific Requirements</h4>
  <p>
    <strong>Google Drive endpoints:</strong> Use the <code>X-Google-Token</code> header specifically for Google Drive API access.
  </p>
  <p>
    Other APIs may accept encrypted data in different headers or environment variables. Refer to your API documentation.
  </p>
</div>
```

---

## Component: EncryptionNotAvailableWarning

**File**: `client/src/components/GoogleServiceEncryptionForm/EncryptionNotAvailableWarning.tsx`

**Purpose**: Warning when RSA keys not configured

**Changes**: None (already generic)

### Props Interface

```typescript
interface EncryptionNotAvailableWarningProps {
  message: string;
}

export function EncryptionNotAvailableWarning({ message }: EncryptionNotAvailableWarningProps): JSX.Element
```

---

## Component Interaction Flow

### Happy Path: Encrypt Generic Text

```
1. User visits /google-service-encrypt
2. TextEncryptPage renders
3. TextEncryptionForm checks encryption status
   → GET /api/public-key
   ← 200 { publicKey: "..." }
4. Form enabled, user types API key: "sk-ant-abc123"
5. User clicks "🔒 Encrypt Data"
6. Form sends POST /google-service-encrypt
   { data: "sk-ant-abc123" }
7. Backend returns:
   { encrypted: "RSA-ENCRYPTED:..." }
8. Frontend attempts JSON parse → fails (not JSON)
9. Frontend sets result: { encrypted, metadata: undefined }
10. TextEncryptionResult renders:
    - Encrypted data ✅
    - Metadata section hidden ✅
    - Generic usage examples ✅
    - Provider notes ✅
```

### Happy Path: Encrypt JSON with Metadata

```
1-6. Same as above, but user pastes JSON:
   {"type":"service_account","client_email":"...","project_id":"..."}
7. Backend returns:
   { encrypted: "RSA-ENCRYPTED:..." }
8. Frontend parses JSON → success
9. Frontend detects type === "service_account"
10. Frontend sets result:
    { encrypted, metadata: { clientEmail, projectId, type } }
11. TextEncryptionResult renders:
    - Encrypted data ✅
    - Metadata section visible ✅
    - Generic usage examples ✅
    - Provider notes ✅
```

---

## Testing Contracts

### Unit Tests (Components)

**TextEncryptPage**:

- Renders generic title "Text Encryption"
- Renders generic description without "Google"

**TextEncryptionForm**:

- Label says "Data to Encrypt:"
- Placeholder shows generic text
- Button says "Encrypt Data"
- Accepts non-JSON input without error
- Parses JSON for metadata only if service account

**TextEncryptionResult**:

- Shows encrypted data for all inputs
- Shows metadata only when provided
- Shows generic usage examples
- Shows provider-specific callout

### Integration Tests (E2E)

1. **Encrypt API Key**: Paste `sk-ant-123` → get encrypted → no metadata
2. **Encrypt JSON**: Paste service account → get encrypted → show metadata
3. **Encrypt Config**: Paste `KEY=value` → get encrypted → no metadata
4. **Copy to Clipboard**: Click copy → verify clipboard content

---

## Accessibility Requirements

**ARIA Labels**:

- Form: `aria-label="Encrypt sensitive data"`
- Textarea: `aria-label="Data to encrypt"`
- Submit button: `aria-label="Encrypt data"`
- Result textarea: `aria-readonly="true"` `aria-label="Encrypted result"`

**Keyboard Navigation**:

- Tab order: form input → submit → result → copy button → reset button

**Screen Reader**:

- Success message announced when encryption completes
- Error message announced if encryption fails

---

## Performance Requirements

**Component Rendering**:

- Initial page load: <2s
- Form submission: <500ms (optimistic UI)
- Result display: <100ms (immediate after API response)

**Bundle Size**:

- No new dependencies
- Text changes only: 0 KB impact
- TypeScript interfaces: 0 KB (compile-time only)

---

## Migration Checklist

- [ ] Update TextEncryptPage title and description
- [ ] Update TextEncryptionForm label "Data to Encrypt:"
- [ ] Update TextEncryptionForm placeholder text (generic)
- [ ] Update TextEncryptionForm button text "Encrypt Data"
- [ ] Update TextEncryptionForm info box (remove Google references)
- [ ] Change request body field `serviceAccountJson` → `data`
- [ ] Make `metadata` optional in result state
- [ ] Add conditional rendering for metadata display in TextEncryptionResult
- [ ] Update TextEncryptionResult usage examples (generic first)
- [ ] Add provider-specific callout section in TextEncryptionResult
- [ ] Update tests to cover non-JSON inputs
- [ ] Update snapshots for changed text
