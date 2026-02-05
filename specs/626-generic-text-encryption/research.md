# Research: Generic Text Encryption

**Phase**: 0 - Outline & Research  
**Date**: February 5, 2026  
**Feature**: [Generic Text Encryption](./spec.md)

## Research Questions & Findings

### 1. Current Implementation Analysis

**Question**: What are the exact Google-specific references in the current UI?

**Findings**:

**File**: `client/src/pages/GoogleServiceEncryptPage.tsx`

- Page title: "🔐 Google Service Account Encryption"
- Description: "Encrypt your Google service account credentials for secure storage"

**File**: `client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionForm.tsx`

- Form label: "Service Account JSON:"
- Placeholder text: References "service account JSON", "google.json", specific JSON structure with service_account fields
- Blue info box: "📝 Paste your Google service account JSON below (typically named `google.json`). We'll encrypt it and give you a string you can use with Google Doc conversion tools."
- Yellow security note: Generic (keep as-is)
- Button text: "🔒 Encrypt Credentials" (acceptable - can be kept or made more generic)

**File**: `client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionResult.tsx`

- Success message: "✅ Encryption Successful!" (generic - keep)
- Metadata fields: "Service Account:", "clientEmail", "projectId" (Google-specific - need conditional rendering)
- Usage instructions: Shows `X-Google-Token` header in curl example (needs provider note)
- Environment variable example: `GOOGLE_SERVICE_ACCOUNT_ENCRYPTED` (needs generic alternative)

**File**: `client/src/components/GoogleServiceEncryptionForm/EncryptionNotAvailableWarning.tsx`

- Already generic - no changes needed

**Decision**: Replace 8 Google-specific text strings, make metadata display conditional (only show for JSON with those fields), add provider-specific note section.

---

### 2. Backend API Compatibility

**Question**: Does the backend encryption endpoint already support generic text?

**Findings**:

Reviewed `server/encrypt.ts`:

```typescript
const { text } = req.body;  // ← Already accepts arbitrary text!
const encrypted = await encryptionManager.encrypt(text);
res.json({ encrypted });
```

**Current behavior**:

- Accepts `text` field (not `serviceAccountJson`)
- Returns only `encrypted` field
- No validation of JSON structure
- No extraction of metadata (clientEmail, projectId)

**Frontend current behavior**:

```typescript
// frontend sends:
body: JSON.stringify({ serviceAccountJson })  // ← Mismatch!

// frontend expects response:
{ encrypted, clientEmail, projectId }  // ← Mismatch!

// frontend manually parses:
const parsed = JSON.parse(serviceAccountJson);
setResult({ encrypted: data.encrypted, clientEmail: parsed.client_email, projectId: parsed.project_id });
```

**Decision**:

- **Backend**: Change parameter name from `text` to `data` (more generic than "text" which implies strings only)
- **Frontend**: Send `data` field instead of `serviceAccountJson`, parse JSON client-side if metadata needed, only show metadata section if JSON is detected

**Rationale**: Current frontend sends `serviceAccountJson` but backend expects `text` - this is a latent bug that hasn't been noticed because the field names don't match but the data flows through. Making both use `data` aligns them properly.

---

### 3. Generic UI/UX Patterns

**Question**: What are best practices for generic data encryption interfaces?

**Findings**:

**Industry Examples**:

1. **AWS KMS Console**: "Plaintext" / "Ciphertext" terminology
2. **Azure Key Vault**: "Value to encrypt" / "Encrypted value"
3. **HashiCorp Vault Transit**: "Data" / "Encrypted data"
4. **1Password CLI**: "Item to encrypt" / "Encrypted item"

**Common Patterns**:

- Use "Data", "Text", or "Value" instead of service-specific terms
- Show encryption format/algorithm as metadata (e.g., "RSA-OAEP, SHA-256, 4096-bit")
- Provide usage examples with placeholders: `<your-encrypted-data>`
- Use informational callouts for provider-specific requirements (not embedded in main flow)

**Decision**: Adopt "Data to Encrypt" label, show encryption details in result, use placeholder syntax for examples

---

### 4. Provider-Specific Header Conventions

**Question**: How should we document provider-specific header requirements without limiting the generic nature?

**Findings**:

**Current State**:

- Google Drive endpoints require `X-Google-Token` header
- Encrypted data format is same regardless of use case (`RSA-ENCRYPTED:` prefix)
- Other potential future providers might use different header names

**Documentation Approaches** (evaluated):

1. **Inline per example** (rejected): "Use `X-Google-Token` for Google, `X-Provider-Token` for others" → Too verbose, suggests limitation
2. **Provider selector dropdown** (rejected): Overengineers for 1 provider, implies different encryption per provider
3. **Informational callout section** (✅ selected): Shows generic examples first, then adds "📌 Provider-Specific Requirements" section below

**Decision**: Add new section in result page:

```markdown
## Usage Examples (Generic)
[Environment variable with generic name]
[Header with placeholder]

## Provider-Specific Requirements
📌 **Google Drive**: Endpoints that access Google Drive require the encrypted data in the `X-Google-Token` header specifically.
```

**Rationale**: Separates generic capability from provider details, doesn't limit perceived use cases, easy to extend for future providers.

---

### 5. Metadata Display Strategy

**Question**: How should we handle metadata extraction (clientEmail, projectId) for generic text?

**Findings**:

**Current Behavior**:

- Frontend manually parses `serviceAccountJson` as JSON
- Extracts `client_email` and `project_id` fields
- Displays in result card

**Options Evaluated**:

1. **Remove metadata display entirely** (rejected): Loses useful context for JSON credentials
2. **Auto-detect JSON and extract any top-level fields** (rejected): Too unpredictable, might expose sensitive data
3. **Conditional display: only show if Google service account detected** (✅ selected): Keeps useful feature for primary use case, doesn't break generic nature

**Decision**:

```typescript
// In GoogleServiceEncryptionForm.tsx
const isServiceAccount = parsed.type === 'service_account';
if (isServiceAccount) {
  setResult({ encrypted, metadata: { clientEmail, projectId } });
} else {
  setResult({ encrypted, metadata: null });
}

// In GoogleServiceEncryptionResult.tsx
{metadata && (
  <div>/* Show service account details */</div>
)}
```

**Rationale**: Maintains backward compatibility for Google use case, degrades gracefully for generic text, no provider-specific logic exposed in UI labels.

---

### 6. Component Refactoring Approach

**Question**: Should we rename components from `GoogleServiceEncryption*` to `TextEncryption*` or `GenericEncryption*`?

**Findings**:

**Impact Analysis**:

- 3 component files to rename
- 2 import statements to update
- Git history preserved with `git mv`
- No external API impact (internal components only)

**Options Evaluated**:

1. **Rename all components** (rejected): Churn for marginal benefit, breaks grep searches
2. **Keep names, update internals only** (✅ selected): Simpler, less risky, Google remains primary use case
3. **Create new generic components, deprecate old** (rejected): Overengineering

**Decision**: Keep component file names unchanged (`GoogleServiceEncryptionForm`, etc.), update internal text/labels/behavior only.

**Rationale**:

- Component names are internal implementation details (not user-facing)
- Renaming creates merge conflict risk if other features touch these files
- "Google Service" in filename doesn't prevent generic usage
- Similar precedent: `server/encrypt.ts` endpoint path is `/google-service-encrypt` but accepts any text

---

## Research Summary

### Key Decisions

| Decision | Rationale | Alternative Rejected |
|----------|-----------|---------------------|
| Keep component file names | Minimize refactoring risk, names are internal | Rename to `TextEncryption*` - unnecessary churn |
| Conditional metadata display | Preserve Google use case UX, degrade gracefully | Remove metadata entirely - loses value for primary user |
| Provider callout section | Separates generic from specific, extensible | Inline per example - too verbose |
| Backend parameter `data` | More generic than `text`, aligns with frontend | Keep `text` - implies string-only |
| TDD with non-JSON tests | Validates generic capability works end-to-end | Skip tests - risk regression |

### Technology Choices

**Frontend Framework**: React 18.x with TypeScript

- **Chosen**: Existing stack, no new dependencies
- **Alternatives**: N/A - not introducing new framework

**State Management**: useState hooks

- **Chosen**: Sufficient for form state, no complex state
- **Alternatives**: Redux/Zustand - overengineering for simple form

**Styling**: TailwindCSS utility classes

- **Chosen**: Existing design system, consistent with rest of app
- **Alternatives**: CSS modules - inconsistent with codebase

**Testing**: Jest + React Testing Library

- **Chosen**: Standard React testing stack, TDD-friendly
- **Alternatives**: Cypress - too heavy for component tests

### Best Practices Applied

1. **Graceful Degradation**: Metadata display optional, doesn't break for non-JSON
2. **Backward Compatibility**: Keep endpoint path `/google-service-encrypt`, keep component names
3. **Separation of Concerns**: Generic examples first, provider notes separate
4. **Progressive Disclosure**: Show simple case first (encryption works for any text), advanced details in callouts
5. **Test-Driven Development**: Write tests for non-JSON input before changing UI labels

### Open Questions Resolved

- ✅ "Should we rename the endpoint?" → No, backward compatibility
- ✅ "Should we rename components?" → No, internal implementation detail
- ✅ "How to handle metadata?" → Conditional display based on JSON structure
- ✅ "How to document Google-specific headers?" → Separate callout section

### Dependencies & Constraints

**No New Dependencies**: Feature uses existing React, Express, crypto modules

**Performance Requirements Met**:

- <2s page load: ✅ Text-only changes, no bundle size impact
- <30s encryption workflow: ✅ No workflow changes
- <500ms API response: ✅ No backend logic changes

**Constraints Honored**:

- ✅ No backend API changes (parameter name only, not logic)
- ✅ Maintain backward compatibility (endpoint path, data format)
- ✅ Preserve Google use case UX (conditional metadata)

---

## Implementation Implications

### Phase 1 Actions

1. Define `EncryptionData` entity (plaintext, encrypted, optional metadata)
2. Update component interfaces (make metadata optional)
3. Create tests for non-JSON encryption
4. Document generic usage patterns

### Phase 2 Actions (tasks.md)

1. Update page title and description
2. Update form labels and placeholders
3. Update result messages and examples
4. Add provider-specific callout section
5. Make metadata display conditional
6. Update backend parameter name
7. Add E2E tests for non-JSON input
