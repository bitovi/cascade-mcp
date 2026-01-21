# Data Model: Google Drive Document to Markdown Converter

**Feature**: 036-gdocs-markdown | **Date**: 2026-01-15 | **Phase**: 1 (Design & Contracts)

## Purpose

Define all entities, their relationships, validation rules, and state transitions for the Google Drive to Markdown conversion feature. This document serves as the source of truth for TypeScript type definitions and database schemas (if applicable).

---

## Entity Diagram

```
┌─────────────────────────┐
│  ConversionRequest      │
│  (Input)                │
├─────────────────────────┤
│ + url: string           │
│ + authContext: Auth     │
│ + forceRefresh?: bool   │
└──────────┬──────────────┘
           │
           │ fetches
           ▼
┌─────────────────────────┐        ┌──────────────────────────┐
│  DriveDocument          │◄───────┤  CachedMetadata          │
│  (Domain Entity)        │  uses  │  (Persistence)           │
├─────────────────────────┤        ├──────────────────────────┤
│ + documentId: string    │        │ + documentId: string     │
│ + title: string         │        │ + title: string          │
│ + url: string           │        │ + mimeType: string       │
│ + mimeType: string      │        │ + modifiedTime: string   │
│ + modifiedTime: string  │        │ + cachedAt: string       │
│ + size: number          │        │ + conversionTimestamp    │
│ + buffer: ArrayBuffer   │        │ + url: string            │
└──────────┬──────────────┘        │ + size: number           │
           │                        └──────────────────────────┘
           │ converts to
           ▼
┌─────────────────────────┐        ┌──────────────────────────┐
│  MarkdownContent        │◄───────┤  CachedContent           │
│  (Output Entity)        │  uses  │  (Persistence)           │
├─────────────────────────┤        ├──────────────────────────┤
│ + content: string       │        │ Stored as: content.md    │
│ + metadata: DocMetadata │        │ (plain markdown text)    │
│ + conversionTimestamp   │        └──────────────────────────┘
│ + warnings: string[]    │
└─────────────────────────┘
           │
           │ returns
           ▼
┌─────────────────────────┐
│  ConversionResult       │
│  (Response)             │
├─────────────────────────┤
│ + markdown: string      │
│ + metadata: Metadata    │
│ + cacheHit: boolean     │
│ + warnings: string[]    │
└─────────────────────────┘
```

---

## E1: ConversionRequest (Input Entity)

**Purpose**: Represents a user's request to convert a Google Drive document to markdown

**TypeScript Definition**:
```typescript
export interface ConversionRequest {
  /**
   * Google Drive document URL or document ID
   * Supports formats:
   * - https://docs.google.com/document/d/{id}/edit
   * - https://docs.google.com/document/u/0/d/{id}/mobilebasic
   * - {documentId} (bare ID)
   */
  url: string;
  
  /**
   * Authentication context (OAuth token or service account)
   * For MCP: Extracted from JWT via getAuthInfoSafe()
   * For REST API: Extracted from X-Google-Token header or X-Google-Service-Account-JSON
   */
  authContext: GoogleAuthContext;
  
  /**
   * Force cache refresh even if cache is valid
   * @default false
   */
  forceRefresh?: boolean;
}

export interface GoogleAuthContext {
  /**
   * OAuth access token (for user-delegated access)
   */
  accessToken?: string;
  
  /**
   * Service account credentials (for server-to-server access)
   */
  serviceAccountCredentials?: GoogleServiceAccountCredentials;
}
```

**Validation Rules**:
- `url`: MUST match one of the 3 supported URL patterns (see research.md R3)
- `url`: MUST NOT be empty or only whitespace
- `authContext`: MUST have either `accessToken` OR `serviceAccountCredentials` (not both)
- `forceRefresh`: MUST be boolean (defaults to false if omitted)

**Error Scenarios**:
- Invalid URL format → 400 Bad Request with format examples
- Missing auth context → 401 Unauthorized
- Both auth methods provided → 400 Bad Request "Provide either accessToken or serviceAccountCredentials, not both"

---

## E2: DriveDocument (Domain Entity)

**Purpose**: Represents a Google Drive document with metadata fetched from Drive API

**TypeScript Definition**:
```typescript
export interface DriveDocument {
  /**
   * Document ID (extracted from URL)
   * Format: 25-44 alphanumeric characters with underscores/hyphens
   * Example: "1a2b3c4d5e6f7g8h9i0j-K_L"
   */
  documentId: string;
  
  /**
   * Document title (from Drive API metadata)
   * Example: "Product Requirements Document"
   */
  title: string;
  
  /**
   * Original Drive URL (normalized)
   * Example: "https://docs.google.com/document/d/{id}/edit"
   */
  url: string;
  
  /**
   * MIME type from Drive API
   * Expected: "application/vnd.google-apps.document"
   * Validation: Reject non-Google Docs types (Sheets, Slides, PDFs)
   */
  mimeType: string;
  
  /**
   * Last modified timestamp (ISO 8601 from Drive API)
   * Used for cache invalidation
   * Example: "2026-01-15T14:30:00.000Z"
   */
  modifiedTime: string;
  
  /**
   * Document size in bytes (from Drive API)
   * Used for size limit enforcement (10MB default)
   */
  size: number;
  
  /**
   * DOCX binary data (exported from Drive API)
   * Format: ArrayBuffer of DOCX file
   * Used for conversion to markdown
   */
  buffer: ArrayBuffer;
}
```

**Validation Rules**:
- `documentId`: MUST be 25-44 characters, alphanumeric + `-_`
- `title`: MUST NOT be empty (fallback to "Untitled Document" if missing)
- `url`: MUST be valid HTTPS URL starting with `https://docs.google.com/document/`
- `mimeType`: MUST be `application/vnd.google-apps.document` (reject others)
- `modifiedTime`: MUST be valid ISO 8601 timestamp
- `size`: MUST be positive integer, MAX 10485760 bytes (10MB)
- `buffer`: MUST be non-empty ArrayBuffer

**State Transitions**:
1. **Created** → Document metadata fetched from Drive API (no buffer yet)
2. **Downloaded** → DOCX buffer added after export API call
3. **Converted** → Passed to mammoth.js for markdown conversion

**Error Scenarios**:
- `mimeType` not Google Docs → "Unsupported document type: {mimeType}. Only Google Docs documents are supported."
- `size` exceeds limit → "Document size ({size}MB) exceeds limit (10MB)"
- Empty `buffer` → "Failed to download document: empty response from Drive API"

---

## E3: MarkdownContent (Output Entity)

**Purpose**: Represents the converted markdown content with metadata and warnings

**TypeScript Definition**:
```typescript
export interface MarkdownContent {
  /**
   * Markdown text content
   * Generated by mammoth.js → turndown conversion
   */
  content: string;
  
  /**
   * Document metadata (from Drive API)
   * Includes title, modifiedTime, size for reference
   */
  metadata: DocumentMetadata;
  
  /**
   * Conversion timestamp (Unix timestamp in milliseconds)
   * Used for cache age calculation
   */
  conversionTimestamp: number;
  
  /**
   * Conversion warnings from mammoth.js
   * Examples:
   * - "Unsupported style: StrongEmphasis"
   * - "Image not found: image1.png"
   */
  warnings: string[];
}

export interface DocumentMetadata {
  documentId: string;
  title: string;
  url: string;
  modifiedTime: string;
  size: number;
}
```

**Validation Rules**:
- `content`: MUST NOT be null (can be empty string for blank documents)
- `metadata`: MUST include all fields (documentId, title, url, modifiedTime, size)
- `conversionTimestamp`: MUST be valid Unix timestamp (Date.now())
- `warnings`: MUST be array (can be empty)

**Processing Notes**:
- If mammoth.js emits warnings, include in `warnings` array
- Content preservation: Headings, bold, italic, lists, tables, links
- Content losses: Custom fonts, inline images (converted to image references)

---

## E4: CachedMetadata (Persistence Entity)

**Purpose**: Stored in `cache/google-docs/{documentId}/metadata.json` for cache validation

**TypeScript Definition**:
```typescript
export interface CachedDocumentMetadata {
  /**
   * Document ID (cache folder name)
   */
  documentId: string;
  
  /**
   * Document title (from Drive API at cache time)
   */
  title: string;
  
  /**
   * MIME type (should always be "application/vnd.google-apps.document")
   */
  mimeType: string;
  
  /**
   * Last modified timestamp from Drive API (ISO 8601)
   * KEY FIELD: Used for cache invalidation
   */
  modifiedTime: string;
  
  /**
   * When this cache entry was created (ISO 8601)
   */
  cachedAt: string;
  
  /**
   * Conversion timestamp (Unix timestamp in milliseconds)
   * Used for cache age calculation
   */
  conversionTimestamp: number;
  
  /**
   * Original Drive URL
   */
  url: string;
  
  /**
   * Document size in bytes (at cache time)
   */
  size: number;
  
  /**
   * Cache version (for future schema migrations)
   * @default 1
   */
  version?: number;
}
```

**Validation Rules**:
- `modifiedTime`: MUST match format from Drive API (ISO 8601)
- `cachedAt`: MUST be valid ISO 8601 timestamp
- `conversionTimestamp`: MUST be Unix timestamp
- `version`: MUST be positive integer (default: 1)

**Cache Invalidation Logic**:
```typescript
function isCacheValid(
  cached: CachedDocumentMetadata,
  current: DriveDocument
): boolean {
  // Primary check: modifiedTime comparison
  if (cached.modifiedTime !== current.modifiedTime) {
    return false; // Document changed
  }
  
  // Optional: Age-based invalidation (stale cache cleanup)
  const cacheAge = Date.now() - cached.conversionTimestamp;
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  if (cacheAge > maxAge) {
    return false; // Cache too old
  }
  
  return true; // Cache valid
}
```

---

## E5: CachedContent (Persistence Entity)

**Purpose**: Stored in `cache/google-docs/{documentId}/content.md` as plain markdown text

**Storage Format**:
```markdown
# Document Title

This is the converted markdown content...

## Headings preserved
- Lists preserved
- **Bold** and *italic* preserved
- [Links](https://example.com) preserved

Tables:
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
```

**File Operations**:
```typescript
// Write cache
async function writeCachedContent(
  documentId: string,
  content: string
): Promise<void> {
  const contentPath = `cache/google-docs/${documentId}/content.md`;
  await fs.promises.writeFile(contentPath, content, 'utf-8');
}

// Read cache
async function readCachedContent(
  documentId: string
): Promise<string> {
  const contentPath = `cache/google-docs/${documentId}/content.md`;
  return await fs.promises.readFile(contentPath, 'utf-8');
}
```

**Validation Rules**:
- File encoding: MUST be UTF-8
- File size: MUST match `metadata.json` size (approximately, within 10% for conversion overhead)
- File existence: MUST exist if `metadata.json` exists (orphaned metadata = cache corruption)

---

## E6: ConversionResult (Response Entity)

**Purpose**: Returned to MCP tool or REST API caller with conversion results

**TypeScript Definition**:
```typescript
export interface ConversionResult {
  /**
   * Converted markdown content
   */
  markdown: string;
  
  /**
   * Document metadata
   */
  metadata: DocumentMetadata;
  
  /**
   * Cache status (true = served from cache, false = fresh conversion)
   */
  cacheHit: boolean;
  
  /**
   * Conversion warnings (if any)
   */
  warnings: string[];
  
  /**
   * Processing time in milliseconds (for debugging)
   */
  processingTimeMs?: number;
}
```

**Response Examples**:

**Success (cache hit)**:
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
  "cacheHit": true,
  "warnings": [],
  "processingTimeMs": 15
}
```

**Success (fresh conversion with warnings)**:
```json
{
  "markdown": "# Technical Spec\n\n...",
  "metadata": { ... },
  "cacheHit": false,
  "warnings": [
    "Unsupported style: CustomHeading (using default heading format)",
    "Image reference preserved as link: image1.png"
  ],
  "processingTimeMs": 1234
}
```

---

## Relationships

### ConversionRequest → DriveDocument
- **1:1** - Each request maps to exactly one Drive document
- **Process**: Parse URL → Extract documentId → Fetch metadata from Drive API

### DriveDocument → MarkdownContent
- **1:1** - Each document converts to exactly one markdown output
- **Process**: Export DOCX → mammoth.js conversion → turndown post-processing

### DriveDocument ↔ CachedMetadata
- **1:0..1** - Each document may have cached metadata (if previously converted)
- **Validation**: Compare `modifiedTime` for cache invalidation

### MarkdownContent ↔ CachedContent
- **1:0..1** - Each markdown output may be cached (if cache write succeeds)
- **Storage**: Separate files (metadata.json + content.md)

---

## State Transitions

### Conversion Workflow State Machine

```
┌─────────────┐
│   START     │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│ PARSING_URL          │ ← Extract documentId from URL
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ CHECKING_CACHE       │ ← Read metadata.json, compare modifiedTime
└──────┬───────────────┘
       │
       ├─ Cache valid ────────────────────────┐
       │                                       │
       │ Cache invalid/missing                 │
       ▼                                       ▼
┌──────────────────────┐              ┌──────────────────┐
│ FETCHING_METADATA    │              │ READING_CACHE    │
└──────┬───────────────┘              └──────┬───────────┘
       │                                       │
       ▼                                       │
┌──────────────────────┐                      │
│ DOWNLOADING_DOCX     │                      │
└──────┬───────────────┘                      │
       │                                       │
       ▼                                       │
┌──────────────────────┐                      │
│ CONVERTING_MARKDOWN  │                      │
└──────┬───────────────┘                      │
       │                                       │
       ▼                                       │
┌──────────────────────┐                      │
│ WRITING_CACHE        │                      │
└──────┬───────────────┘                      │
       │                                       │
       └───────────────┬───────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │   COMPLETE     │ ← Return ConversionResult
              └────────────────┘
```

### Error States

Each state can transition to **ERROR** state with specific error codes:

- **PARSING_URL** → ERROR: Invalid URL format (400)
- **CHECKING_CACHE** → ERROR: File I/O error (500)
- **FETCHING_METADATA** → ERROR: Permission denied (403), not found (404), auth failure (401)
- **DOWNLOADING_DOCX** → ERROR: Rate limit (429), server error (500)
- **CONVERTING_MARKDOWN** → ERROR: Conversion failure (500)
- **WRITING_CACHE** → ERROR: Disk full, permission denied (500, non-fatal - continue with result)

---

## Validation Rules Summary

### Input Validation (ConversionRequest)
✅ URL format matches one of 3 patterns  
✅ Auth context has exactly one auth method  
✅ forceRefresh is boolean or undefined

### Drive API Validation (DriveDocument)
✅ documentId is 25-44 characters, alphanumeric + `-_`  
✅ mimeType is `application/vnd.google-apps.document`  
✅ size ≤ 10MB (configurable)  
✅ modifiedTime is valid ISO 8601

### Cache Validation (CachedMetadata)
✅ modifiedTime matches Drive API format  
✅ cachedAt is valid ISO 8601  
✅ content.md file exists alongside metadata.json

### Output Validation (ConversionResult)
✅ markdown content is string (not null)  
✅ metadata has all required fields  
✅ warnings is array (can be empty)

---

## Cache Directory Structure

```
cache/google-docs/
├── 1a2b3c4d5e6f7g8h9i0j/          # Document ID
│   ├── metadata.json               # CachedDocumentMetadata
│   └── content.md                  # Markdown content
├── 2b3c4d5e6f7g8h9i0j1k/
│   ├── metadata.json
│   └── content.md
└── ...
```

### Cache Cleanup Strategy

**Trigger**: Scheduled task (daily cron) or manual API call

**Logic**:
1. Scan `cache/google-docs/` directory
2. For each document folder:
   - Read `metadata.json`
   - Calculate cache age: `Date.now() - conversionTimestamp`
   - If age > 30 days (configurable): Delete folder
3. Log cleanup results

**Implementation**:
```typescript
async function cleanupStaleCache(maxAgeDays: number = 30): Promise<void> {
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const cacheDir = 'cache/google-docs';
  
  const folders = await fs.promises.readdir(cacheDir);
  let deletedCount = 0;
  
  for (const folder of folders) {
    const metadataPath = `${cacheDir}/${folder}/metadata.json`;
    const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf-8'));
    
    const age = Date.now() - metadata.conversionTimestamp;
    if (age > maxAgeMs) {
      await fs.promises.rm(`${cacheDir}/${folder}`, { recursive: true });
      deletedCount++;
    }
  }
  
  logger.info('Cache cleanup complete', { deletedCount, maxAgeDays });
}
```

---

## Next Steps

✅ **Data model complete** - All entities defined with validation rules

⏭️ **Phase 1 continued**:
1. Create `/contracts/` with MCP tool schema and REST API OpenAPI spec
2. Write `quickstart.md` with usage examples
3. Update agent context with mammoth.js and turndown

**Reference**: Use this data model when generating TypeScript `types.ts` file in implementation phase.
