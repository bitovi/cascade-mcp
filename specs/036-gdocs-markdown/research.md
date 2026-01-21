# Research Document: Google Drive Document to Markdown Converter

**Feature**: 036-gdocs-markdown | **Date**: 2026-01-15 | **Phase**: 0 (Research & Unknowns Resolution)

## Purpose

Resolve all technical unknowns identified in [plan.md](./plan.md) Technical Context section. Each research task provides a decision, rationale, and alternatives considered to guide Phase 1 implementation.

---

## R1: HTML/DOCX to Markdown Library Evaluation

⚠️ **SUPERSEDED 2026-01-19** - This research evaluated DOCX conversion libraries. **Current approach uses HTML export (see R2)** per clarifications session.

<details>
<summary><b>Original DOCX Research (Historical Context - Click to expand)</b></summary>

**Original Decision**: Use **mammoth.js** for DOCX to markdown conversion

**Original Rationale** (DOCX approach - not implemented):

- ✅ **Battle-tested**: 2.5k+ GitHub stars, 400k+ weekly npm downloads, mature project (since 2014)
- ✅ **Node.js native**: Pure JavaScript, no CLI dependencies (unlike pandoc), works in Docker without additional setup
- ✅ **Formatting preservation**: Strong support for headings, bold, italic, lists, tables, links, images
- ✅ **Customizable**: Style mapping API allows custom handling of Word styles to markdown formats
- ✅ **Streaming-friendly**: Can process large documents without loading entire file into memory
- ✅ **TypeScript support**: Official type definitions available (`@types/mammoth`)
- ✅ **Error handling**: Provides warnings for unsupported styles rather than failing

**Alternatives Considered**:

| Library | Pros | Cons | Verdict |
|---------|------|------|---------|
| **pandoc** | Universal document converter, excellent quality | Requires CLI binary (system dependency), harder to deploy in Docker, synchronous execution blocks Node.js | ❌ Rejected |
| **docx** | Native DOCX parsing, good for programmatic manipulation | Requires manual traversal and markdown generation, more code to maintain | ❌ Rejected |
| **docx2md** | Simple API | Less mature (3k downloads/week vs 400k), limited formatting support | ❌ Rejected |
| **officegen** | DOCX generation library | Not designed for parsing/conversion | ❌ Not applicable |

**Implementation Pattern** (from mammoth.js docs):
```typescript
import mammoth from 'mammoth';

// Basic conversion (DOCX buffer → HTML)
const result = await mammoth.convertToHtml({ buffer: docxBuffer });
const html = result.value; // HTML string
const warnings = result.messages; // Conversion warnings

// Custom style mapping (for markdown-like output)
const options = {
  styleMap: [
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "r[style-name='Strong'] => strong"
  ]
};
const customResult = await mammoth.convertToHtml({ buffer: docxBuffer }, options);
```

**Notes**:

- mammoth.js outputs HTML by default, not pure markdown
- We'll need post-processing to convert HTML → markdown (can use turndown.js or manual parsing)
- Alternative approach: Use mammoth's extractRawText() for simpler conversion, but loses formatting

</details>

---

## R2: Google Drive API Export Format Selection

**Decision**: Export documents as **HTML format** (`text/html`) ✨ **UPDATED 2026-01-19**

> **NOTE**: Original research (2026-01-15) recommended DOCX export with mammoth.js conversion. Clarifications session (2026-01-19) determined HTML export is simpler - no external conversion library needed, native string parsing sufficient. Original research preserved below for historical context.

**Rationale** (HTML export):

- ✅ **Simpler pipeline**: Native HTML export requires no external conversion libraries (mammoth.js, turndown)
- ✅ **Direct conversion**: HTML → Markdown using native DOM parsing (Node.js DOMParser via jsdom or similar) with custom markdown generation functions
- ✅ **No additional dependencies**: Minimal external dependencies (may use lightweight HTML parser if needed)
- ✅ **Implementation approach**: Parse HTML into DOM tree → Traverse nodes → Generate markdown syntax per element type (h1-h6, p, strong, em, ul, ol, table, a, img)
- ✅ **Drive API support**: All Google Docs can export to HTML format (universal availability)
- ✅ **Offline processing**: Downloaded file can be cached and re-processed without additional API calls
- ✅ **Formatting fidelity**: HTML preserves all formatting (headings, bold, italic, lists, tables, links)

**Alternatives Considered**:

| Format | MimeType | Pros | Cons | Verdict |
|--------|----------|------|------|---------|
| **HTML** | `text/html` | Pre-formatted, no libraries needed, native parsing | Inline styles need cleanup, Google-specific markup | ✅ **CHOSEN** (2026-01-19) |
| **DOCX** | `application/vnd...wordprocessingml.document` | Best formatting, mammoth.js support, cacheable | Requires mammoth.js + turndown libraries | ❌ Rejected (over-engineered) |
| **Plain Text** | `text/plain` | Simple, no parsing needed | Loses ALL formatting (headings, lists, bold) | ❌ Rejected |
| **Native Google Docs** | N/A | Original format | No export API, requires Docs API (different auth scope) | ❌ Not viable |

**API Usage**:

```typescript
// Get file metadata first (check permissions, get modifiedTime)
const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,size`;

// Export as HTML (UPDATED approach)
const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/html`;
const response = await client.fetch(exportUrl);
const htmlContent = await response.text(); // String, not buffer
```

**Edge Cases**:

- Non-Google Docs files (e.g., uploaded HTML): Use `/files/{fileId}?alt=media` instead of `/export`
- Binary formats (PDF, Sheets, Slides): Return error "Unsupported document type"
- Permission denied (403): Check file sharing settings before export

---

## R3: Google Drive URL Parsing Patterns

**Decision**: Support **3 URL formats** with regex-based extraction

**Rationale**:
- ✅ **Cover common sharing methods**: Direct links, shortened links, embed URLs
- ✅ **Flexible validation**: Allow trailing slashes, query parameters, URL fragments
- ✅ **Clear error messages**: Identify which format user attempted, provide helpful guidance

**Supported Formats**:

1. **Standard sharing URL** (most common):
   ```
   https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit
   https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit#heading=h.abc123
   https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit?usp=sharing
   ```
   Pattern: `/document/d/{documentId}/`
   
2. **Mobile/app URL**:
   ```
   https://docs.google.com/document/u/0/d/1a2b3c4d5e6f7g8h9i0j/mobilebasic
   ```
   Pattern: `/document/u/{userId}/d/{documentId}/`
   
3. **Bare document ID** (fallback):
   ```
   1a2b3c4d5e6f7g8h9i0j
   ```
   Pattern: Direct ID (44 alphanumeric characters with underscores/hyphens)

**Implementation** (similar to Confluence URL parsing):
```typescript
export function parseGoogleDriveUrl(input: string): { documentId: string } {
  // Remove whitespace
  const trimmed = input.trim();
  
  // Pattern 1: Standard sharing URL
  let match = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return { documentId: match[1] };
  }
  
  // Pattern 2: Mobile/app URL
  match = trimmed.match(/\/document\/u\/\d+\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return { documentId: match[1] };
  }
  
  // Pattern 3: Bare document ID
  if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) {
    return { documentId: trimmed };
  }
  
  throw new Error(
    `Invalid Google Drive URL format. Expected formats:\n` +
    `  - https://docs.google.com/document/d/{id}/edit\n` +
    `  - https://docs.google.com/document/u/0/d/{id}/mobilebasic\n` +
    `  - {documentId} (bare ID)\n` +
    `Received: ${trimmed.substring(0, 100)}...`
  );
}
```

**Validation**:
- Document ID length: 25-44 characters (Google's current format)
- Character set: alphanumeric + underscore + hyphen
- No spaces or special characters

**References**:
- Pattern inspired by `confluence-helpers.ts` → `parseConfluenceUrl()`
- Error message format follows user-friendly standards from Constitution principle III

---

## R4: Caching Strategy (Version-Based Invalidation)

**Decision**: Use **file-based cache with metadata** (mirrors Confluence implementation)

**Rationale**:
- ✅ **Simple deployment**: No Redis/database dependency, works immediately in Docker
- ✅ **Easy debugging**: Inspect cache files directly (metadata.json, content.md)
- ✅ **Version tracking**: Invalidate cache when document `modifiedTime` changes
- ✅ **Proven pattern**: Confluence implementation (`confluence-setup.ts`) demonstrates effectiveness
- ✅ **Separation of concerns**: Metadata separate from content (enables partial updates)

**Cache Structure** (from plan.md):
```text
cache/google-docs/
└── {documentId}/
    ├── metadata.json     # Document metadata + cache info
    └── content.md        # Converted markdown content
```

**Metadata Schema**:
```typescript
interface CachedDocumentMetadata {
  documentId: string;
  title: string;
  mimeType: string; // 'application/vnd.google-apps.document'
  modifiedTime: string; // ISO 8601 timestamp from Drive API
  cachedAt: string; // ISO 8601 timestamp (when cached)
  conversionTimestamp: number; // Unix timestamp (for cache age calculation)
  url: string; // Original Drive URL
  size: number; // File size in bytes (from Drive API)
}
```

**Cache Workflow** (from Confluence pattern):
```typescript
// 1. Check cache
const cachedMetadata = await getCachedMetadata(documentId);
if (cachedMetadata) {
  // 2. Fetch current Drive metadata
  const currentMetadata = await getDriveFileMetadata(client, documentId);
  
  // 3. Compare modifiedTime
  if (cachedMetadata.modifiedTime === currentMetadata.modifiedTime) {
    // Cache valid - read content.md
    const markdown = await readCachedMarkdown(documentId);
    return { markdown, metadata: cachedMetadata, cacheHit: true };
  }
}

// 4. Cache miss or stale - fetch and convert
const docxBuffer = await exportDocumentAsDOCX(client, documentId);
const markdown = await convertDOCXToMarkdown(docxBuffer);

// 5. Save to cache
await saveToCahce(documentId, markdown, metadata);
```

**Cache Invalidation Triggers**:
- Document `modifiedTime` change (version mismatch)
- Manual cache clear (API endpoint or CLI command)
- Stale cache cleanup (documents not accessed in >30 days)

**Alternatives Considered**:

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| **File-based (CHOSEN)** | Simple, no dependencies, easy debugging | Not suitable for multi-instance | ✅ Production ready for MVP |
| **Redis** | Multi-instance support, TTL built-in | Requires infrastructure, more complexity | ⏳ Future enhancement |
| **Database (PostgreSQL)** | Queryable, relational data | Overkill for cache, slower than file/Redis | ❌ Rejected |
| **In-memory Map** | Fastest | Lost on restart, memory bloat | ❌ Not persistent |

**Notes**:
- For multi-instance deployments (future): Migrate to Redis with minimal code changes (replace file I/O with Redis commands)
- Cache directory excluded from git (`.gitignore` entry required)

---

## R5: Error Handling Patterns (User-Friendly Messages)

**Decision**: Map Drive API errors to **actionable user messages** (follows Constitution principle III)

**Rationale**:
- ✅ **User empowerment**: Clear guidance on how to resolve issues
- ✅ **Debugging context**: Include relevant identifiers (document ID, URL) in error messages
- ✅ **Consistent pattern**: Mirrors Atlassian error handling (403 → permission guidance)
- ✅ **HTTP status mapping**: Preserve original status codes for REST API responses

**Error Mapping Table**:

| Drive API Error | HTTP Status | User Message | Additional Context |
|----------------|-------------|--------------|-------------------|
| **403 Forbidden** | 403 | Permission denied: You don't have access to this document. Request access from the document owner or ensure the document is shared with "anyone with the link". | Include document URL for easy sharing |
| **404 Not Found** | 404 | Document not found: The document may have been deleted or the URL is invalid. Check the URL and try again. | Suggest URL validation |
| **429 Too Many Requests** | 429 | Rate limit exceeded: You've made too many requests. Try again in {retry-after} seconds. | Parse `Retry-After` header |
| **401 Unauthorized** | 401 | Authentication failed: Your Google Drive access token is invalid or expired. Re-authenticate and try again. | Trigger OAuth re-auth flow |
| **400 Bad Request** | 400 | Invalid request: {Drive API error message} | Pass through API message |
| **500 Internal Server Error** | 500 | Google Drive service error: The service is temporarily unavailable. Try again later. | Log full error for debugging |

**Implementation Pattern** (from `confluence-setup.ts` inspiration):
```typescript
function mapDriveApiError(error: any, documentUrl: string): Error {
  const status = error.response?.status;
  const apiMessage = error.response?.data?.error?.message;
  
  switch (status) {
    case 403:
      return new Error(
        `Permission denied: You don't have access to this document. ` +
        `Request access from the document owner or ensure the document is ` +
        `shared with "anyone with the link".\n\nDocument: ${documentUrl}`
      );
    
    case 404:
      return new Error(
        `Document not found: The document may have been deleted or the URL is invalid. ` +
        `Check the URL and try again.\n\nURL: ${documentUrl}`
      );
    
    case 429:
      const retryAfter = error.response?.headers['retry-after'] || '60';
      return new Error(
        `Rate limit exceeded: You've made too many requests. ` +
        `Try again in ${retryAfter} seconds.`
      );
    
    case 401:
      // Special case: Trigger OAuth re-auth
      throw new InvalidTokenError('Google Drive authentication failed');
    
    default:
      logger.error('Drive API error', { status, apiMessage, url: documentUrl });
      return new Error(
        `Failed to fetch document: ${apiMessage || 'Unknown error'}. ` +
        `If the problem persists, check your permissions and try again.`
      );
  }
}
```

**Validation Error Messages**:
- Invalid URL format → Include format examples (see R3)
- Unsupported document type → "Only Google Docs documents are supported. Received: {mimeType}"
- Document too large → "Document size ({size}MB) exceeds limit (10MB). Export smaller documents only."

**References**:
- Constitution principle III: "Error messages: User-friendly errors with actionable guidance"
- Existing pattern: `getAuthInfoSafe()` throws `InvalidTokenError` for OAuth re-authentication

---

## R6: Rate Limiting Strategy (Google Drive API Quotas)

**Decision**: Implement **exponential backoff with 429 detection** + **cache-first approach**

**Rationale**:
- ✅ **Quota preservation**: Cached documents don't count toward API quota (10,000 requests/day)
- ✅ **Graceful degradation**: Automatic retry with exponential backoff prevents cascade failures
- ✅ **User transparency**: Clear error messages when quota exhausted (see R5)
- ✅ **Proven pattern**: Standard HTTP client retry logic

**Google Drive API Quotas** (from Google Cloud Console):
- **Per-project**: 10,000 requests/day (default free tier)
- **Per-user**: 1,000 requests/100 seconds (enforced)
- **Burst protection**: 10 requests/second per user

**Implementation**:

1. **Cache-First Strategy** (primary defense):
   ```typescript
   // ALWAYS check cache before API call
   const cached = await getCachedDocument(documentId);
   if (cached && !isCacheStale(cached.metadata)) {
     return { ...cached, cacheHit: true };
   }
   // Only fetch from API if cache miss/stale
   ```

2. **Exponential Backoff** (for 429 errors):
   ```typescript
   async function fetchWithRetry(
     fn: () => Promise<Response>,
     maxRetries = 3,
     initialDelay = 1000
   ): Promise<Response> {
     for (let attempt = 0; attempt <= maxRetries; attempt++) {
       try {
         const response = await fn();
         if (response.status === 429) {
           const retryAfter = response.headers.get('retry-after');
           const delay = retryAfter 
             ? parseInt(retryAfter) * 1000 
             : initialDelay * Math.pow(2, attempt);
           
           logger.warn('Rate limit hit, retrying', { attempt, delay });
           await sleep(delay);
           continue;
         }
         return response;
       } catch (error) {
         if (attempt === maxRetries) throw error;
         await sleep(initialDelay * Math.pow(2, attempt));
       }
     }
     throw new Error('Max retries exceeded');
   }
   ```

3. **Quota Monitoring** (logging):
   ```typescript
   logger.info('Drive API request', {
     endpoint: 'files.export',
     documentId,
     cacheStatus: 'miss',
     quotaUsageEstimate: currentDayRequestCount
   });
   ```

**Quota Management Best Practices**:
- ✅ **Batch operations**: Fetch metadata + export in single session (reduce round trips)
- ✅ **Cache aggressively**: Only invalidate on `modifiedTime` change, not time-based expiry
- ✅ **User guidance**: When quota exhausted, inform user to wait or use cached results
- ✅ **Monitoring**: Log quota usage for admin visibility (future: dashboard)

**Alternatives Considered**:

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Cache-first + backoff (CHOSEN)** | Balances performance and resilience | Requires careful cache invalidation | ✅ Production ready |
| **Queue + rate limiter** | Fine-grained control | Complex, requires state management | ⏳ Future for high-traffic |
| **User-level quotas** | Fair usage | Requires auth tracking | ❌ Overkill for MVP |
| **Pre-fetch on sharing** | Proactive caching | Unpredictable usage, wasted quota | ❌ Not applicable |

**Notes**:
- Google Cloud Console allows quota increase requests (up to 100,000 requests/day)
- For production: Monitor quota usage via Google Cloud Monitoring API

---

## Technology Stack Summary

Based on research, the final technology stack for this feature:

**Core Libraries**:
- `mammoth` (v1.6.0+): DOCX to HTML conversion
- `turndown` (v7.1.2+): HTML to markdown conversion (post-process mammoth output)
- `@types/mammoth`: TypeScript definitions

**Existing Infrastructure** (no changes):
- `google-api-client.ts`: OAuth + Service Account client factory
- `google-helpers.ts`: Drive API wrapper functions
- `markdown-converter.ts`: Text processing utilities (reusable patterns)

**Testing Dependencies**:
- Jest test fixtures: Sample DOCX files (various formatting)
- Mock Drive API responses: metadata, export buffer, error scenarios

**Configuration**:
- Cache directory: `cache/google-docs/` (gitignored)
- Document size limit: 10MB (configurable via env var `GOOGLE_DOCS_SIZE_LIMIT_MB`)
- Cache age threshold: 30 days (configurable via env var `GOOGLE_DOCS_CACHE_MAX_AGE_DAYS`)

---

## Resolved Technical Unknowns

All "NEEDS CLARIFICATION" items from plan.md Technical Context now resolved:

✅ **R1: DOCX Conversion Library** → mammoth.js + turndown  
✅ **R2: Export Format** → DOCX (`application/vnd.openxmlformats...`)  
✅ **R3: URL Parsing** → 3 supported formats with regex extraction  
✅ **R4: Caching Strategy** → File-based with version-based invalidation  
✅ **R5: Error Handling** → User-friendly messages mapping Drive API errors  
✅ **R6: Rate Limiting** → Cache-first + exponential backoff

## Next Steps

✅ **Phase 0 Complete** - All research tasks resolved

⏭️ **Phase 1: Design & Contracts**
1. Generate `data-model.md` with entities (DriveDocument, MarkdownContent, ConversionRequest)
2. Create `/contracts/` with MCP tool schema and REST API OpenAPI spec
3. Write `quickstart.md` with usage examples
4. Update agent context with mammoth.js and turndown

**Commands**: Continue with Phase 1 workflow to create data models and contracts.
