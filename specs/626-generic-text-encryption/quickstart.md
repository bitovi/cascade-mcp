# Quick Start: Implementing Generic Text Encryption

**Phase**: 1 - Design & Contracts  
**Date**: February 5, 2026  
**Feature**: [Generic Text Encryption](./spec.md)

## Overview

This guide walks through implementing the generic text encryption UI changes. The backend encryption already supports arbitrary text - we only need to update the frontend UI/UX to reflect this capability.

**Time Estimate**: 2-3 hours

**Complexity**: Low (text changes + conditional rendering)

---

## Prerequisites

- [ ] Node.js 18+ and npm installed
- [ ] Repository cloned and dependencies installed (`npm install`)
- [ ] RSA keys configured (run `./scripts/generate-rsa-keys.sh`)
- [ ] Development server running (`npm run dev`)

---

## Implementation Steps

### Step 1: Update Page Title & Description (5 minutes)

**File**: `client/src/pages/GoogleServiceEncryptPage.tsx`

**Change**:

```diff
 export function GoogleServiceEncryptPage() {
   return (
     <>
       <div className="mb-6">
-        <h1 className="text-3xl font-bold text-gray-800 mb-2">🔐 Google Service Account Encryption</h1>
-        <p className="text-gray-600">Encrypt your Google service account credentials for secure storage</p>
+        <h1 className="text-3xl font-bold text-gray-800 mb-2">🔐 Text Encryption</h1>
+        <p className="text-gray-600">Encrypt sensitive data for secure storage (API keys, credentials, configuration)</p>
       </div>
       <GoogleServiceEncryptionForm />
     </>
   );
 }
```

**Test**: Reload page, verify new title/description appear

---

### Step 2: Update Form Labels & Placeholders (10 minutes)

**File**: `client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionForm.tsx`

**Change 1: Form Label**

```diff
       <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
-        <label htmlFor="serviceAccountJson" className="block font-medium text-gray-700 mb-2">
-          Service Account JSON:
+        <label htmlFor="encryptionData" className="block font-medium text-gray-700 mb-2">
+          Data to Encrypt:
         </label>
         <textarea
-          id="serviceAccountJson"
+          id="encryptionData"
           value={serviceAccountJson}
           onChange={(e) => setServiceAccountJson(e.target.value)}
```

**Change 2: Placeholder Text**

```diff
-          placeholder={`Paste your service account JSON here...
+          placeholder={`Paste any sensitive data here (API keys, JSON, tokens, configuration)...

 Example:
 {
-  "type": "service_account",
-  "project_id": "my-project-123",
-  "private_key_id": "abc123...",
-  "private_key": "-----BEGIN PRIVATE KEY-----\\n...",
-  "client_email": "my-service@my-project.iam.gserviceaccount.com",
-  ...
+  "api_key": "sk-ant-abc123...",
+  "database_url": "postgresql://...",
+  "secret_token": "..."
 }`}
```

**Change 3: Button Text**

```diff
         <button
           type="submit"
           disabled={isEncrypting || !serviceAccountJson.trim() || !encryptionStatus?.enabled}
           className="mt-4 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
         >
-          {isEncrypting ? '🔄 Encrypting...' : '🔒 Encrypt Credentials'}
+          {isEncrypting ? '🔄 Encrypting...' : '🔒 Encrypt Data'}
         </button>
```

**Test**: Verify label, placeholder, and button text updated

---

### Step 3: Update Info Boxes (15 minutes)

**File**: `client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionForm.tsx`

**Change: Blue Info Box**

```diff
         <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
           <p className="text-sm text-blue-900">
-            📝 Paste your Google service account JSON below (typically named <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">google.json</code>). We'll encrypt it and give you a string you can use with Google Doc conversion tools.
+            📝 Paste any sensitive text below (API keys, service account JSON, tokens, configuration strings). The encrypted output is safe to store in environment variables, config files, or version control.
           </p>
         </div>
```

**Test**: Verify info box shows generic message

---

### Step 4: Update Backend Request (10 minutes)

**File**: `client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionForm.tsx`

**Change 1: Request Body**

```diff
       const response = await fetch('/google-service-encrypt', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
-        body: JSON.stringify({ serviceAccountJson }),
+        body: JSON.stringify({ data: serviceAccountJson }),
       });
```

**Change 2: Conditional Metadata Parsing**

```diff
       // Parse JSON response
       const data = await response.json();
       
-      // Parse the service account to get email and project
-      const parsed = JSON.parse(serviceAccountJson);
+      // Try to parse JSON for metadata (optional)
+      let metadata = undefined;
+      try {
+        const parsed = JSON.parse(serviceAccountJson);
+        if (parsed.type === 'service_account') {
+          metadata = {
+            clientEmail: parsed.client_email,
+            projectId: parsed.project_id,
+            type: parsed.type,
+          };
+        }
+      } catch {
+        // Not JSON or doesn't match expected structure - that's OK
+      }
       
       setResult({
         encrypted: data.encrypted,
-        clientEmail: parsed.client_email,
-        projectId: parsed.project_id,
+        metadata,
       });
```

**Test**: Encrypt non-JSON text, verify no errors

---

### Step 5: Update Backend Parameter Name (5 minutes)

**File**: `server/encrypt.ts`

**Change**:

```diff
 export async function handleEncryptionRequest(req: Request, res: Response): Promise<void> {
   try {
     // Check if encryption is enabled
     if (!encryptionManager.isEnabled()) {
       res.status(503).json({ 
         error: 'Encryption is not enabled. ' +
                'Configure RSA_PUBLIC_KEY and RSA_PRIVATE_KEY environment variables. ' +
                'Run ./scripts/generate-rsa-keys.sh to generate keys. ' +
                'See docs/encryption-setup.md for setup instructions.'
       });
       return;
     }

-    const { text } = req.body;
+    const { data } = req.body;

-    if (!text) {
-      res.status(400).json({ error: 'Missing text in request body' });
+    if (!data) {
+      res.status(400).json({ error: 'Missing data in request body' });
       return;
     }

-    if (typeof text !== 'string') {
-      res.status(400).json({ error: 'Text must be a string' });
+    if (typeof data !== 'string') {
+      res.status(400).json({ error: 'Data must be a string' });
       return;
     }

     // Encrypt the text using the encryption manager
-    const encrypted = await encryptionManager.encrypt(text);
+    const encrypted = await encryptionManager.encrypt(data);

     // Return encrypted result
     res.json({ encrypted });
```

**Test**: Frontend and backend now aligned on `data` field

---

### Step 6: Update Result Component Props (10 minutes)

**File**: `client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionForm.tsx`

**Change 1: Interface**

```diff
 interface EncryptionResult {
   encrypted: string;
-  clientEmail: string;
-  projectId: string;
+  metadata?: {
+    clientEmail: string;
+    projectId: string;
+    type: string;
+  };
 }
```

**Change 2: Pass Metadata**

```diff
   if (result) {
     return (
       <GoogleServiceEncryptionResult
         encrypted={result.encrypted}
-        clientEmail={result.clientEmail}
-        projectId={result.projectId}
+        metadata={result.metadata}
         onReset={handleReset}
       />
     );
   }
```

---

### Step 7: Update Result Display (20 minutes)

**File**: `client/src/components/GoogleServiceEncryptionForm/GoogleServiceEncryptionResult.tsx`

**Change 1: Props Interface**

```diff
 interface GoogleServiceEncryptionResultProps {
   encrypted: string;
-  clientEmail: string;
-  projectId: string;
+  metadata?: {
+    clientEmail: string;
+    projectId: string;
+    type: string;
+  };
   onReset: () => void;
 }

 export function GoogleServiceEncryptionResult({ 
   encrypted, 
-  clientEmail, 
-  projectId, 
+  metadata,
   onReset 
 }: GoogleServiceEncryptionResultProps) {
```

**Change 2: Conditional Metadata Display**

```diff
         <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
           <h3 className="text-lg font-semibold text-green-900 mb-2">
             ✅ Encryption Successful!
           </h3>
+          <p className="text-sm text-green-800 mb-2">
+            Your data has been encrypted using RSA-OAEP (SHA-256, 4096-bit key)
+          </p>
+          {metadata && (
           <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
             <span className="font-semibold text-gray-700">Service Account:</span>
-            <span className="text-gray-600 font-mono">{clientEmail}</span>
+            <span className="text-gray-600 font-mono">{metadata.clientEmail}</span>
             <span className="font-semibold text-gray-700">Project ID:</span>
-            <span className="text-gray-600 font-mono">{projectId}</span>
-            <span className="font-semibold text-gray-700">Encryption:</span>
-            <span className="text-gray-600 font-mono">RSA-OAEP with SHA-256 (4096-bit key)</span>
+            <span className="text-gray-600 font-mono">{metadata.projectId}</span>
           </div>
+          )}
         </div>
```

**Change 3: Generic Usage Examples**

```diff
         <div className="bg-gray-50 rounded-md p-5">
           <h4 className="text-base font-semibold text-gray-800 mb-3">💡 How to Use</h4>
           
-          <h5 className="font-semibold text-gray-700 text-sm mt-4 mb-2">Pass in REST API headers</h5>
+          <h5 className="font-semibold text-gray-700 text-sm mb-2">Environment Variable</h5>
           <pre className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-xs">
-{`# Use in Jira automations, scripts, or API calls
-X-Google-Token: RSA-ENCRYPTED:...
+{`# Add to .env or deployment configuration
+ENCRYPTED_DATA=RSA-ENCRYPTED:...`}
+          </pre>
 
-# Example: curl request
-curl -X POST https://your-server.com/api/write-shell-stories \\
-  -H "X-Atlassian-Token: your-jira-token" \\
-  -H "X-Google-Token: RSA-ENCRYPTED:..." \\
-  -H "Content-Type: application/json"`}
+          <h5 className="font-semibold text-gray-700 text-sm mt-4 mb-2">HTTP Header (Generic)</h5>
+          <pre className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-xs">
+{`# Use in API requests
+X-Encrypted-Data: RSA-ENCRYPTED:...
+
+# Example curl request
+curl -X POST https://api.example.com/endpoint \\
+  -H "X-Encrypted-Data: RSA-ENCRYPTED:..." \\
+  -H "Content-Type: application/json"`}
           </pre>
+          
+          <h5 className="font-semibold text-gray-700 text-sm mt-4 mb-2">Configuration File</h5>
+          <pre className="bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto text-xs">
+{`{
+  "encrypted_credentials": "RSA-ENCRYPTED:..."
+}`}
+          </pre>
         </div>
```

**Change 4: Add Provider-Specific Note**

```diff
+        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mt-4">
+          <h4 className="text-base font-semibold text-blue-900 mb-2">📌 Provider-Specific Requirements</h4>
+          <p className="text-sm text-blue-800 mb-2">
+            <strong>Google Drive endpoints:</strong> Use the <code className="bg-blue-100 px-1 py-0.5 rounded text-xs">X-Google-Token</code> header specifically for Google Drive API access.
+          </p>
+          <p className="text-sm text-blue-800">
+            Other APIs may accept encrypted data in different headers or environment variables. Refer to your API documentation.
+          </p>
+        </div>
       </div>
```

**Test**: Verify result shows encrypted data, conditional metadata, generic examples, and provider note

---

### Step 8: Add Tests for Non-JSON Input (15 minutes)

**File**: `test/e2e/google-encryption.test.ts`

**Add New Test**:

```typescript
test('POST /google-service-encrypt with non-JSON text', async () => {
  if (shouldSkip) return;

  const response = await fetch(`${SERVER_URL}/google-service-encrypt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: 'sk-ant-api03-my-test-api-key-abc123xyz456',
    }),
  });

  const responseData = await response.json();

  expect(response.status).toBe(200);
  expect(responseData.encrypted).toMatch(/^RSA-ENCRYPTED:/);
  
  // Should NOT have clientEmail or projectId (non-JSON)
  expect(responseData.clientEmail).toBeUndefined();
  expect(responseData.projectId).toBeUndefined();
});

test('POST /google-service-encrypt with configuration string', async () => {
  if (shouldSkip) return;

  const response = await fetch(`${SERVER_URL}/google-service-encrypt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: 'DATABASE_URL=postgresql://user:pass@localhost:5432/db',
    }),
  });

  const responseData = await response.json();

  expect(response.status).toBe(200);
  expect(responseData.encrypted).toMatch(/^RSA-ENCRYPTED:/);
});
```

**Run Tests**:

```bash
npm test -- test/e2e/encryption.test.ts
```

---

### Step 9: Update Test for Backend Parameter (5 minutes)

**File**: `test/e2e/google-encryption.test.ts`

**Change Existing Test**:

```diff
   test('POST /google-service-encrypt with valid JSON', async () => {
     if (shouldSkip) return;

     const response = await fetch(`${SERVER_URL}/google-service-encrypt`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
-        serviceAccountJson: JSON.stringify(TEST_SERVICE_ACCOUNT),
+        data: JSON.stringify(TEST_SERVICE_ACCOUNT),
       }),
     });

     const data = await response.json();

     expect(response.status).toBe(200);
     expect(data.encrypted).toMatch(/^RSA-ENCRYPTED:/);
-    expect(data.clientEmail).toBe(TEST_SERVICE_ACCOUNT.client_email);
-    expect(data.projectId).toBe(TEST_SERVICE_ACCOUNT.project_id);
+    // Backend no longer returns metadata (frontend parses it)
+    expect(data.encrypted).toBeDefined();
   });
```

---

### Step 10: Update Manual Encryption Documentation (10 minutes)

The encryption documentation needs to reflect that manual terminal encryption works for ANY text, not just Google service account JSON.

**File**: `docs/encryption-setup.md`

**Verify Section Exists**: "Manual Terminal Encryption"

This section should already be updated with:
- Generic extraction of public key (from server or environment variable)
- OpenSSL encryption examples for ANY text file
- Examples showing API keys, configuration files, and Google JSON
- Generic usage instructions (environment variables, API headers, config files)
- Security notes about safe storage

**Action**: Review the section and ensure all examples are generic:

```bash
# ✅ GOOD: Generic examples
openssl pkeyutl -encrypt -pubin -inkey public_key.pem \
  -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 \
  -in your-sensitive-data.txt | base64 | tr -d '\n' | sed 's/^/RSA-ENCRYPTED:/'

# Examples for different data types:
# - google.json (service account)
# - api-keys.txt (API keys)
# - config.yaml (configuration files)

# ❌ BAD: Google-only examples
# Only showing google.json without other examples
```

**File**: `docs/google-drive-setup.md` (already has manual encryption, should remain Google-focused)

This file should keep its Google-specific focus but can reference the generic guide:
- Keep "Option 2: Manual Encryption (Advanced)" focused on Google service accounts
- Consider adding a note: "For encrypting other types of data, see [encryption-setup.md](./encryption-setup.md#manual-terminal-encryption)"

**Test**: Read both docs, verify clear guidance for encrypting any text type

---

### Step 11: Manual Testing Checklist (10 minutes)

**Test Cases**:

1. **Encrypt API Key**:
   - [ ] Paste: `sk-ant-api03-abc123`
   - [ ] Click "Encrypt Data"
   - [ ] Verify: Encrypted output appears
   - [ ] Verify: No metadata section (clientEmail, projectId)
   - [ ] Verify: Generic usage examples shown
   - [ ] Verify: Provider-specific note shown

2. **Encrypt JSON (Service Account)**:
   - [ ] Paste valid service account JSON
   - [ ] Click "Encrypt Data"
   - [ ] Verify: Encrypted output appears
   - [ ] Verify: Metadata section shows (clientEmail, projectId)
   - [ ] Verify: Generic usage examples shown
   - [ ] Verify: Provider-specific note shown

3. **Encrypt Configuration String**:
   - [ ] Paste: `DATABASE_URL=postgres://...`
   - [ ] Click "Encrypt Data"
   - [ ] Verify: Encrypted output appears
   - [ ] Verify: No metadata section
   - [ ] Verify: Generic usage examples shown

4. **Encrypt Non-Service-Account JSON**:
   - [ ] Paste: `{"api_key": "abc123", "secret": "xyz"}`
   - [ ] Click "Encrypt Data"
   - [ ] Verify: Encrypted output appears
   - [ ] Verify: No metadata section (type !== "service_account")

5. **Copy to Clipboard**:
   - [ ] Click "📋 Copy to Clipboard"
   - [ ] Paste elsewhere
   - [ ] Verify: Encrypted string copied correctly

6. **Encrypt Another**:
   - [ ] Click "🔒 Encrypt Another"
   - [ ] Verify: Form resets, ready for new input

---

## Verification

### Visual Verification

1. Page title: "🔐 Text Encryption"
2. Page description: "Encrypt sensitive data..." (no "Google")
3. Form label: "Data to Encrypt:"
4. Placeholder: Shows generic examples
5. Button: "🔒 Encrypt Data"
6. Result: Shows encrypted data + conditional metadata
7. Examples: Generic (env var, header, config file)
8. Provider note: Blue callout with Google-specific info

### Functional Verification

- [ ] Non-JSON text encrypts successfully
- [ ] JSON with service account shows metadata
- [ ] Non-service-account JSON doesn't show metadata
- [ ] Backend accepts `data` field (not `text` or `serviceAccountJson`)
- [ ] All tests pass: `npm test`

### Performance Verification

- [ ] Page loads in <2s
- [ ] Encryption completes in <500ms
- [ ] No console errors

---

## Troubleshooting

### Issue: "Missing data in request body" error

**Cause**: Frontend still sending `serviceAccountJson` field

**Fix**: Update Step 4, ensure request body uses `{ data: ... }`

### Issue: Metadata always shows even for non-JSON

**Cause**: JSON parsing not wrapped in try-catch

**Fix**: Update Step 4, ensure metadata parsing has try-catch

### Issue: Tests fail with "serviceAccountJson is not defined"

**Cause**: Test still using old field name

**Fix**: Update Step 9, change test to use `data` field

### Issue: Backend returns 400 "Missing text in request body"

**Cause**: Backend not updated to accept `data` field

**Fix**: Update Step 5, change backend parameter from `text` to `data`

---

## Rollback Plan

If issues arise, revert commits:

```bash
git log --oneline  # Find commit hash
git revert <commit-hash>
```

Or reset to before changes:

```bash
git reset --hard <pre-implementation-commit-hash>
```

---

## Post-Implementation

### Documentation Updates

- [ ] Update `docs/encryption-setup.md` with generic examples
- [ ] Update `docs/google-drive-setup.md` to reference provider-specific note
- [ ] Update README.md encryption section (if exists)

### Deployment Notes

- No database migrations required
- No environment variable changes required
- No breaking API changes (backend change is internal)
- Frontend assets require rebuild: `npm run build`

---

## Success Criteria

✅ All user stories from spec.md pass acceptance scenarios:

1. **P1 - Encrypt Arbitrary Text**: Users can encrypt any text (API keys, JSON, config)
2. **P2 - Provider Requirements**: Users see generic examples + provider-specific note
3. **P3 - Copy Public Key**: Users can copy public key for programmatic use

✅ All technical requirements met:

- FR-001 to FR-012 implemented
- SC-001 to SC-007 measurable outcomes achieved
- Constitution compliance maintained (Code Quality, TDD, UX Consistency, Performance)

---

## Estimated Time Breakdown

| Step | Time | Cumulative |
|------|------|------------|
| Step 1: Page title | 5 min | 5 min |
| Step 2: Form labels | 10 min | 15 min |
| Step 3: Info boxes | 15 min | 30 min |
| Step 4: Backend request | 10 min | 40 min |
| Step 5: Backend param | 5 min | 45 min |
| Step 6: Result props | 10 min | 55 min |
| Step 7: Result display | 20 min | 75 min |
| Step 8: Add tests | 15 min | 90 min |
| Step 9: Update tests | 5 min | 95 min |
| Step 10: Update docs | 10 min | 105 min |
| Step 11: Manual testing | 10 min | 115 min |

**Total**: ~2 hours (implementation)

**Additional time**: +30 minutes buffer for troubleshooting

**Grand Total**: 2.5-3 hours
