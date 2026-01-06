# Data Model: Google Drive Document MCP Tools

**Feature**: Google Drive Document Integration for MCP  
**Date**: January 5, 2026  
**Branch**: `002-google-docs-mcp`

## Overview

This document defines the data entities involved in the Google Drive document integration features. These tools extend the existing Google provider (spec 001) to enable file discovery and document content retrieval.

## Entity Definitions

### 1. DriveFile

Represents metadata for a single file in Google Drive.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique file identifier used for API operations |
| `name` | string | Yes | Display name of the file |
| `mimeType` | string | Yes | MIME type (e.g., `application/vnd.google-apps.document` for Google Docs) |
| `kind` | string | Yes | Always `"drive#file"` (API identifier) |
| `createdTime` | string (ISO 8601) | No | File creation timestamp |
| `modifiedTime` | string (ISO 8601) | No | Last modification timestamp |
| `size` | string | No | File size in bytes (string format from API) |
| `webViewLink` | string (URL) | No | Link to open file in Google Drive web interface |
| `owners` | DriveOwner[] | No | Array of file owners |

**TypeScript Interface**:

```typescript
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  kind: 'drive#file';
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  owners?: DriveOwner[];
}
```

**Example**:

```json
{
  "id": "1abc...xyz",
  "name": "Project Requirements.gdoc",
  "mimeType": "application/vnd.google-apps.document",
  "kind": "drive#file",
  "createdTime": "2026-01-01T10:00:00.000Z",
  "modifiedTime": "2026-01-05T14:30:00.000Z",
  "size": "24576",
  "webViewLink": "https://docs.google.com/document/d/1abc...xyz/edit",
  "owners": [
    {
      "displayName": "John Doe",
      "emailAddress": "john@example.com",
      "permissionId": "12345"
    }
  ]
}
```

**Validation Rules**:

- `id` must be non-empty string
- `mimeType` must be a valid MIME type string
- `size` is numeric string (bytes) from API
- `webViewLink` must be valid HTTPS URL when present
- Timestamps must be ISO 8601 format

**Lifecycle**:

- Created: When listed via `/files` API endpoint
- Retrieved: On each file listing operation
- Not Cached: Fresh data fetched each time
- Modified: Never (read-only)

---

### 2. DriveOwner

Represents ownership information for a Drive file.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `displayName` | string | Yes | Owner's display name |
| `emailAddress` | string | Yes | Owner's email address |
| `permissionId` | string | Yes | Unique permission identifier |

**TypeScript Interface**:

```typescript
export interface DriveOwner {
  displayName: string;
  emailAddress: string;
  permissionId: string;
}
```

**Relationship**: Embedded within `DriveFile.owners[]` array

---

### 3. DriveFileListResponse

Represents a paginated list of files from Google Drive API.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `kind` | string | Yes | Always `"drive#fileList"` (API identifier) |
| `files` | DriveFile[] | Yes | Array of file metadata objects |
| `nextPageToken` | string | No | Token for retrieving next page of results |
| `incompleteSearch` | boolean | No | Indicates if search results are incomplete |

**TypeScript Interface**:

```typescript
export interface DriveFileListResponse {
  kind: 'drive#fileList';
  files: DriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}
```

**Example**:

```json
{
  "kind": "drive#fileList",
  "files": [
    { "id": "1abc", "name": "Doc 1", "mimeType": "application/vnd.google-apps.document" },
    { "id": "2def", "name": "Doc 2", "mimeType": "application/vnd.google-apps.document" }
  ],
  "nextPageToken": "CAESBggDEAEYAQ"
}
```

**Validation Rules**:

- `files` array can be empty (0 results)
- `nextPageToken` presence indicates more results available
- Maximum `files.length` is determined by `pageSize` parameter (default 100, max 1000)

**Lifecycle**:

- Created: On each `/files` API call
- Consumed: By MCP tool to format output
- Ephemeral: Not persisted

---

### 4. DriveFileListParams

Request parameters for listing files from Google Drive.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `query` | string | No | Search query using Google Drive query syntax |
| `pageSize` | number | No | Number of results per page (1-1000, default: 100) |
| `pageToken` | string | No | Token for retrieving specific page |
| `orderBy` | string | No | Sort order (e.g., `"modifiedTime desc"`, `"name"`) |
| `fields` | string | No | Comma-separated list of fields to return |

**TypeScript Interface**:

```typescript
export interface DriveFileListParams {
  query?: string;
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
  fields?: string;
}
```

**Example Queries**:

```typescript
// List all Google Docs
{ query: "mimeType='application/vnd.google-apps.document'" }

// Search by name
{ query: "name contains 'requirements'" }

// Combined criteria
{ query: "mimeType='application/vnd.google-apps.document' and name contains 'project'" }

// Pagination
{ pageSize: 50, pageToken: "CAESBggDEAEYAQ" }

// Sort by modification date
{ orderBy: "modifiedTime desc" }
```

**Validation Rules**:

- `pageSize` must be between 1 and 1000
- `query` must use valid Drive query syntax
- `orderBy` must reference valid sortable fields
- `fields` must reference valid file properties

**Defaults**:

- `pageSize`: 100
- `fields`: `"files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,owners),nextPageToken"`

---

### 5. DocumentContent

Represents plain text content exported from a Google Doc.

**Properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `content` | string | Yes | Plain text content of the document |
| `fileId` | string | Yes | Source file identifier |
| `exportFormat` | string | Yes | MIME type used for export (e.g., `"text/plain"`) |

**TypeScript Interface**:

```typescript
export interface DocumentContent {
  content: string;
  fileId: string;
  exportFormat: 'text/plain' | 'text/markdown';
}
```

**Validation Rules**:

- `content` can be empty string (for empty documents)
- Maximum size: 10 MB (Google Drive API limit)
- `exportFormat` must be a supported export MIME type

**Lifecycle**:

- Created: On-demand via `/files/{id}/export` API call
- Ephemeral: Not cached or persisted
- Consumed: By MCP tool to return to user

---

## Data Flow Diagrams

### File Listing Flow

```
User Request (MCP or REST)
    ↓
Tool/Endpoint Handler
    ↓
getAuthInfoSafe() → Extract access_token
    ↓
createGoogleClient(token)
    ↓
client.listFiles(params: DriveFileListParams)
    ↓
Google Drive API: GET /files?[queryParams]
    ↓
DriveFileListResponse
    ↓
Format output (markdown for MCP, JSON for REST)
    ↓
Return to user
```

### Document Retrieval Flow

```
User Request with fileId (MCP or REST)
    ↓
Tool/Endpoint Handler
    ↓
getAuthInfoSafe() → Extract access_token
    ↓
createGoogleClient(token)
    ↓
client.getDocumentContent(fileId: string)
    ↓
Google Drive API: GET /files/{fileId}/export?mimeType=text/plain
    ↓
Plain text content (string)
    ↓
Return to user
```

---

## API Client Interface Extension

The existing `GoogleClient` interface will be extended with two new methods:

```typescript
export interface GoogleClient {
  // Existing method
  fetchAboutUser(): Promise<DriveAboutResponse>;
  
  // NEW methods
  listFiles(params?: DriveFileListParams): Promise<DriveFileListResponse>;
  getDocumentContent(fileId: string): Promise<string>;
}
```

---

## Constants

```typescript
// Google Doc MIME type
export const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

// Export format preferences
export const EXPORT_MIME_TYPES = {
  PLAIN_TEXT: 'text/plain',
  MARKDOWN: 'text/markdown',
} as const;

// API constraints
export const DRIVE_API_LIMITS = {
  MAX_PAGE_SIZE: 1000,
  DEFAULT_PAGE_SIZE: 100,
  MAX_EXPORT_SIZE_MB: 10,
  RATE_LIMIT_PER_100_SECONDS: 1000,
} as const;

// Default fields for file listing
export const DEFAULT_FILE_FIELDS =
  'files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,owners),nextPageToken';
```

---

## State Management

**No Persistent State**: This feature is stateless and read-only.

- No database tables
- No cached data
- No session state beyond OAuth tokens (managed by existing auth infrastructure)
- Each request fetches fresh data from Google Drive API

**OAuth Token Management**: Handled by existing infrastructure (spec 001)

- Access tokens stored in session context
- Token refresh handled by MCP service layer
- No changes needed to auth flow

---

## Error Scenarios

| Scenario | HTTP Status | Error Handling |
|----------|-------------|----------------|
| Invalid or expired OAuth token | 401 | Return clear re-auth message to user |
| File not found or deleted | 404 | Return "File not found" error |
| Insufficient permissions | 403 | Return "Access denied" error with details |
| Rate limit exceeded | 429 | Implement exponential backoff, retry |
| Invalid parameters | 400 | Return validation error with parameter details |
| Server error | 500-504 | Log error, return generic server error message |
| File is not a Google Doc (for export) | 400 | Return "Unsupported file type" error |
| Document exceeds 10MB export limit | 400 | Return size limit error |

---

## Relationships to Existing Entities

```
GoogleOAuthCredentials (from spec 001)
    ↓ (used by)
GoogleClient
    ├─ fetchAboutUser() → DriveAboutResponse (existing)
    ├─ listFiles() → DriveFileListResponse (NEW)
    └─ getDocumentContent() → string (NEW)

DriveFileListResponse
    └─ contains []
        └─ may contain []
```

---

## Schema Validation

Using Zod schemas for MCP tool input validation:

```typescript
// drive-list-files tool input schema
const DriveListFilesSchema = {
  query: z.string().optional(),
  pageSize: z.number().min(1).max(1000).optional(),
  pageToken: z.string().optional(),
  orderBy: z.string().optional(),
};

// drive-get-document tool input schema
const DriveGetDocumentSchema = {
  fileId: z.string().min(1).describe('Google Drive file ID'),
};
```

---

## Summary

This data model extends the existing Google provider with minimal new entities:

- **Core Entities**: `DriveFile`, `DriveFileListResponse`, `DriveFileListParams`, `DocumentContent`
- **Supporting**: `DriveOwner` (embedded)
- **Constants**: MIME types, API limits
- **No Persistence**: Entirely read-only, stateless operations
- **Reuses**: Existing OAuth infrastructure, logging patterns, error handling

All entities are designed for type safety (TypeScript interfaces) and follow established patterns from Atlassian and Figma providers.
