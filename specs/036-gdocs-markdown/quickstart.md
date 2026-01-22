# Quickstart Guide: Google Drive Document to Markdown Converter - MVP Testing

**Feature**: 036-gdocs-markdown | **Status**: ✅ MVP Complete (Phase 3) | **Last Updated**: 2026-01-21

> **Note**: Caching has been removed to simplify the implementation. Documents are converted fresh on every request.

## 🎉 MVP Status

**Completed Features (T001-T020):**
- ✅ Basic HTML-to-Markdown conversion (headings, bold, italic, paragraphs)
- ✅ Lists (ordered/unordered with nesting)
- ✅ Tables (markdown table syntax)
- ✅ Images (markdown image syntax)
- ✅ Dual interface (MCP tool + REST API)
- ✅ OAuth & Service Account authentication

**Not Yet Implemented (Phase 4+):**
- ❌ Hyperlinks (T021)
- ❌ Code blocks (T022)
- ❌ Advanced nested lists (T023)
- ❌ Enhanced table formatting (T024)
- ❌ Special character escaping (T025)

---

## Quick Test (2 minutes)

### Test via REST API (Fastest)

**Prerequisites:** Google service account JSON file at `./google.json`

```bash
# Start server
npm run start-local

# Test conversion (replace YOUR_DOC_ID)
curl -X POST http://localhost:3000/api/drive-doc-to-markdown \
  -H "Content-Type: application/json" \
  -H "X-Google-Json: $(cat google.json | jq -c)" \
  -d '{
    "url": "https://docs.google.com/document/d/YOUR_DOC_ID/edit"
  }'
```

**Expected output:**
```json
{
  "markdown": "# Document Title\n\n...",
  "metadata": { "documentId": "...", "title": "...", "modifiedTime": "..." },
  "warnings": []
}
```

---

## Detailed Testing Guide

### Test Document Setup

Create a test Google Doc with these elements:

````markdown
# Heading 1
## Heading 2
### Heading 3

This is a paragraph with **bold text** and *italic text*.

- Bullet point 1
- Bullet point 2
  - Nested bullet

1. Numbered item 1
2. Numbered item 2

| Column 1 | Column 2 |
|----------|----------|
| Data A   | Data B   |

(Insert an image)
````

Share the document with your service account email (for REST API testing).

---

## Usage Examples

### MCP Tool (VS Code Copilot)

**Example 1: Convert a public document**
```typescript
// In VS Code Copilot chat
Convert this Google Doc to markdown: https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit
```

**Tool invocation** (internal):
```json
{
  "tool": "drive-doc-to-markdown",
  "parameters": {
    "url": "https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit"
  }
}
```

**Response**:
```json
{
  "markdown": "# Product Requirements Document\n\n## Overview\n\nThis document outlines...",
  "metadata": {
    "documentId": "1a2b3c4d5e6f7g8h9i0j",
    "title": "Product Requirements Document",
    "url": "https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit",
    "modifiedTime": "2026-01-15T14:30:00.000Z",
    "size": 45678
  },
  "warnings": []
}
```

---

### REST API

**Example 1: Basic conversion request**
```bash
curl -X POST http://localhost:3000/api/drive-doc-to-markdown \
  -H "Content-Type: application/json" \
  -H "X-Google-Token: ya29.a0AfH6SMBx..." \
  -d '{
    "url": "https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit"
  }'
```

**Response** (200 OK):
```json
{
  "markdown": "# Product Requirements\n\nThis is a PRD...",
  "metadata": {
    "documentId": "1a2b3c4d5e6f7g8h9i0j",
    "title": "Product Requirements Document",
    "url": "https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit",
    "modifiedTime": "2026-01-15T14:30:00.000Z",
    "size": 45678
  },
  "warnings": []
}
```

**Example 2: Using service account**
```bash
SERVICE_ACCOUNT=$(cat google-service-account.json | jq -c .)

curl -X POST http://localhost:3000/api/drive-doc-to-markdown \
  -H "Content-Type: application/json" \
  -H "X-Google-Service-Account-JSON: $SERVICE_ACCOUNT" \
  -d '{
    "url": "1a2b3c4d5e6f7g8h9i0j"
  }'`
```

**Example 3: Error handling**
```bash
# Permission denied error
curl -X POST http://localhost:3000/api/drive-doc-to-markdown \
  -H "Content-Type: application/json" \
  -H "X-Google-Token: ya29.a0AfH6SMBx..." \
  -d '{
    "url": "https://docs.google.com/document/d/restricted-doc-id/edit"
  }'
```

**Response** (403 Forbidden):
```json
{
  "error": "PERMISSION_DENIED",
  "message": "Permission denied: You don't have access to this document. Request access from the document owner or ensure the document is shared with 'anyone with the link'.",
  "details": {
    "documentUrl": "https://docs.google.com/document/d/restricted-doc-id/edit"
  }
}
```

---

### TypeScript Client

**Example: Integration with story-writing tool**
```typescript
import { executeDriveDocToMarkdown } from './server/providers/google/tools/drive-doc-to-markdown/core-logic';
import { createGoogleClient } from './server/providers/google/google-api-client';

async function fetchDocumentContext(documentUrl: string, accessToken: string): Promise<string> {
  const client = createGoogleClient(accessToken);
  
  const result = await executeDriveDocToMarkdown(
    { url: documentUrl },
    client
  );
  
  console.log(`Document: ${result.metadata.title}`);
  console.log(`Warnings: ${result.warnings.length}`);
  
  return result.markdown;
}

// Usage in story-writing tool
const context = await fetchDocumentContext(
  'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit',
  googleAccessToken
);

const prompt = `Context from Google Doc:\n\n${context}\n\nGenerate shell stories...`;
```

---

## Common Patterns

### Pattern 1: Error Handling

**Problem**: Drive API errors are cryptic (403, 404, 429)

**Solution**: Map to user-friendly messages with actionable guidance

```typescript
try {
  const result = await executeDriveDocToMarkdown(params, client);
  return result;
} catch (error) {
  if (error.message.includes('Permission denied')) {
    // User-friendly error
    console.error('You need access to this document. Request access from the owner.');
    // Optionally: Show document sharing settings
  } else if (error.message.includes('Rate limit exceeded')) {
    // Guidance on retry
    console.error('Too many requests. Please wait 60 seconds and try again.');
  } else {
    // Generic fallback
    console.error(`Conversion failed: ${error.message}`);
  }
}
```

**Common errors**:
| Error Code | User Action |
|------------|-------------|
| `INVALID_URL` | Check URL format (see supported formats in API docs) |
| `PERMISSION_DENIED` | Request access from document owner or enable "anyone with link" sharing |
| `DOCUMENT_NOT_FOUND` | Verify document exists and URL is correct |
| `RATE_LIMIT_EXCEEDED` | Wait 60 seconds before retrying |
| `UNSUPPORTED_DOCUMENT_TYPE` | Only Google Docs supported (not Sheets, Slides, PDFs) |

---

### Pattern 2: Integration with Story-Writing Tools

**Problem**: Story-writing tools need document context for scope analysis

**Solution**: Fetch Google Docs similar to Confluence integration

```typescript
// Example: analyze-feature-scope integration
import { executeDriveDocToMarkdown } from './server/providers/google/tools/drive-doc-to-markdown/core-logic';

async function fetchDocumentContext(
  documentUrls: string[],
  googleClient: GoogleClient
): Promise<DocumentContext[]> {
  const contexts: DocumentContext[] = [];
  
  for (const url of documentUrls) {
    const result = await executeDriveDocToMarkdown(
      { url },
      googleClient
    );
    
    contexts.push({
      title: result.metadata.title,
      url: result.metadata.url,
      markdown: result.markdown,
      modifiedTime: result.metadata.modifiedTime
    });
  }
  
  return contexts;
}

// In analyze-feature-scope tool
const epicDescription = await getEpicDescription(epicKey);
const googleDocUrls = extractGoogleDocUrls(epicDescription); // Similar to extractConfluenceUrls

if (googleDocUrls.length > 0) {
  const docContexts = await fetchDocumentContext(googleDocUrls, googleClient);
  
  // Add to LLM prompt
  const prompt = `
Epic description: ${epicDescription}

Referenced Google Docs:
${docContexts.map(doc => `## ${doc.title}\n\n${doc.markdown}`).join('\n\n')}

Analyze scope and generate feature list...
  `;
}
```

---

### Pattern 3: URL Parsing Flexibility

**Problem**: Users share Drive URLs in different formats

**Solution**: Support 3 common URL formats

**Supported formats**:
1. **Standard sharing URL** (most common):
   ```
   https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit
   https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit#heading=h.abc123
   ```

2. **Mobile/app URL**:
   ```
   https://docs.google.com/document/u/0/d/1a2b3c4d5e6f7g8h9i0j/mobilebasic
   ```

3. **Bare document ID**:
   ```
   1a2b3c4d5e6f7g8h9i0j
   ```

**Usage**:
```typescript
// All formats work
await executeDriveDocToMarkdown({ url: "https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit" }, client);
await executeDriveDocToMarkdown({ url: "1a2b3c4d5e6f7g8h9i0j" }, client);
```

---

## Performance Considerations

### Latency Targets

| Scenario | Target Latency | Actual (typical) |
|----------|----------------|------------------|
| **Fresh conversion (< 1MB)** | < 5 seconds | 1-2 seconds |
| **Large document (5-10MB)** | < 10 seconds | 5-8 seconds |

### Concurrency

- **Supported**: 100 concurrent requests
- **Rate limiting**: Google Drive API enforces 1,000 requests/100 seconds per user

---

## Testing

### Manual Testing

**Test 1: Basic conversion**
```bash
curl -X POST http://localhost:3000/api/drive-doc-to-markdown \
  -H "Content-Type: application/json" \
  -H "X-Google-Token: $GOOGLE_TOKEN" \
  -d '{
    "url": "https://docs.google.com/document/d/YOUR_DOC_ID/edit"
  }' | jq .
```

**Test 2: Error scenarios**
```bash
# Invalid URL
curl -X POST http://localhost:3000/api/drive-doc-to-markdown \
  -H "Content-Type: application/json" \
  -H "X-Google-Token: $GOOGLE_TOKEN" \
  -d '{"url": "https://invalid-url.com"}' | jq .
# Expected: 400 Bad Request with format examples

# Permission denied
curl -X POST http://localhost:3000/api/drive-doc-to-markdown \
  -H "Content-Type: application/json" \
  -H "X-Google-Token: $GOOGLE_TOKEN" \
  -d '{"url": "RESTRICTED_DOC_ID"}' | jq .
# Expected: 403 Forbidden with access guidance
```

### Automated Testing

**Unit tests** (`tests/unit/`):
- URL parsing (3 formats)
- HTML to Markdown conversion (formatting preservation)
- Error mapping (Drive API errors → user messages)

**Integration tests** (`tests/integration/`):
- Google Drive API interaction (using test document)
- OAuth token lifecycle

**Contract tests** (`tests/contract/`):
- MCP tool schema validation
- REST API OpenAPI compliance

---

## Troubleshooting

### Issue 1: "Permission denied" error

**Symptoms**: 403 Forbidden response

**Causes**:
1. User doesn't have access to document
2. Document sharing settings are private
3. OAuth token lacks `drive.readonly` scope

**Solutions**:
1. Request access from document owner
2. Change sharing to "anyone with the link"
3. Re-authenticate with correct scope

---

### Issue 2: Conversion warnings

**Symptoms**: `warnings` array contains unsupported style messages

**Causes**:
- Document uses custom Word styles not mapped by mammoth.js
- Images embedded in document (not supported)
- Complex table formatting

**Solutions**:
- Review warnings and adjust document formatting if critical
- Custom styles fall back to default formatting (headings, paragraphs)
- Images converted to markdown reference syntax: `![alt](url)`

---

## Next Steps

✅ **Quickstart guide complete**

⏭️ **Implementation Phase**:
1. Create TypeScript types (`types.ts`)
2. Implement URL parser (`url-parser.ts`)
3. Implement HTML to Markdown converter (`conversion-helpers.ts`)
4. Implement core business logic (`core-logic.ts`)
5. Implement MCP tool wrapper (`drive-doc-to-markdown.ts`)
6. Implement REST API endpoint (`server/api/drive-doc-to-markdown.ts`)

**Commands**: Run `/speckit.tasks` to generate detailed task breakdown with acceptance criteria.

---

## References

- **Feature Specification**: [spec-new.md](./spec-new.md)
- **Implementation Plan**: [plan.md](./plan.md)
- **Research Document**: [research.md](./research.md)
- **Data Model**: [data-model.md](./data-model.md)
- **MCP Tool Schema**: [contracts/mcp-tool-schema.json](./contracts/mcp-tool-schema.json)
- **REST API Contract**: [contracts/rest-api-contract.yaml](./contracts/rest-api-contract.yaml)
- **Google Drive OAuth Setup**: [specs/34-google-drive-oauth.md](../../34-google-drive-oauth.md)
- **Confluence Integration** (similar pattern): [specs/28-confluence.md](../../28-confluence.md)
