# Google Drive Document Integration MCP Tools - Research Findings

## 1. Google Drive API v3 File Listing (`/files` endpoint)

### Decision
Use the `/files` endpoint with the `q` parameter for filtering and `fields` parameter for field selection. Implement pagination using `nextPageToken`.

### Rationale
- **Query Syntax**: Supports powerful filtering with operators like `contains`, `=`, `!=`, `and`, `or`, `in`
- **Performance**: `fields` parameter allows requesting only needed data, reducing bandwidth and processing time
- **Flexibility**: Can filter by MIME type, folder location, name patterns, modification dates, and more
- **Pagination**: Built-in pagination with `nextPageToken` handles large result sets efficiently

### Key Parameters & Usage

#### **Query Parameter (`q`)**
```typescript
// Filter for Google Docs only
q: "mimeType='application/vnd.google-apps.document'"

// Filter by name containing search term
q: "name contains 'meeting notes'"

// Combine filters (AND operation)
q: "mimeType='application/vnd.google-apps.document' and name contains 'report'"

// Exclude trashed files (best practice)
q: "trashed=false"

// Filter by folder
q: "'FOLDER_ID' in parents"
```

#### **Fields Parameter**
Default fields returned by `list` without fields parameter: `kind`, `id`, `name`, `mimeType`, `resourceKey`

**Recommended fields for listing:**
```typescript
fields: "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, webViewLink, size, owners)"
```

**Available file fields:**
- `id` - File ID (required for export)
- `name` - File name
- `mimeType` - MIME type (e.g., `application/vnd.google-apps.document`)
- `createdTime` - ISO 8601 timestamp
- `modifiedTime` - ISO 8601 timestamp
- `webViewLink` - URL to view file in browser
- `size` - File size in bytes (not available for Google Docs, only binary files)
- `owners` - Array of owner objects with `displayName`, `emailAddress`, etc.
- `parents` - Array of parent folder IDs
- `trashed` - Boolean indicating if file is in trash
- `starred` - Boolean indicating if file is starred
- `shared` - Boolean indicating if file is shared
- `capabilities` - Object with boolean permissions (e.g., `canDownload`, `canEdit`)

#### **Pagination Parameters**
```typescript
pageSize: 100  // Max 1000, default varies
pageToken: "TOKEN_FROM_PREVIOUS_RESPONSE"
```

**Pagination pattern:**
```typescript
let pageToken: string | undefined = undefined;
do {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?pageSize=100&pageToken=${pageToken || ''}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await response.json();
  // Process data.files
  pageToken = data.nextPageToken;
} while (pageToken);
```

### Query Operators Supported

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Exact match | `mimeType='application/vnd.google-apps.document'` |
| `!=` | Not equal | `mimeType!='application/vnd.google-apps.folder'` |
| `contains` | String contains | `name contains 'report'` |
| `in` | Item in collection | `'FOLDER_ID' in parents` |
| `and` | Logical AND | `trashed=false and starred=true` |
| `or` | Logical OR | `name contains 'draft' or name contains 'WIP'` |
| `not` | Logical NOT | `not name contains 'old'` |
| `<`, `>`, `<=`, `>=` | Date comparisons | `modifiedTime > '2024-01-01T00:00:00'` |

### MIME Type Filtering - Google Docs

**Google Docs MIME type:**
```typescript
const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';
```

**Filter query for Google Docs only:**
```typescript
q: `mimeType='${GOOGLE_DOC_MIME_TYPE}' and trashed=false`
```

**Other Google Workspace MIME types:**
- Spreadsheets: `application/vnd.google-apps.spreadsheet`
- Presentations: `application/vnd.google-apps.presentation`
- Folders: `application/vnd.google-apps.folder`

### Alternatives Considered
- **List all files then filter client-side**: Inefficient, wastes bandwidth
- **Use Drive UI Picker**: Not suitable for programmatic access
- **Search API**: Redirects to same `/files` endpoint with `q` parameter

### Implementation Pattern
```typescript
interface ListFilesParams {
  query?: string;              // Query string (e.g., "name contains 'report'")
  mimeType?: string;           // Filter by MIME type
  folderId?: string;           // Filter by parent folder
  pageSize?: number;           // Max 1000
  pageToken?: string;          // For pagination
  fields?: string;             // Field selection
  orderBy?: string;            // Sort order (e.g., "modifiedTime desc")
}

async function listFiles(params: ListFilesParams): Promise<FileListResponse> {
  const queryParts: string[] = [];
  
  if (params.mimeType) {
    queryParts.push(`mimeType='${params.mimeType}'`);
  }
  
  if (params.folderId) {
    queryParts.push(`'${params.folderId}' in parents`);
  }
  
  if (params.query) {
    queryParts.push(params.query);
  }
  
  // Always exclude trashed files unless explicitly requested
  queryParts.push('trashed=false');
  
  const q = queryParts.join(' and ');
  
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', q);
  url.searchParams.set('pageSize', String(params.pageSize || 100));
  
  if (params.pageToken) {
    url.searchParams.set('pageToken', params.pageToken);
  }
  
  url.searchParams.set('fields', params.fields || 
    'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, webViewLink)'
  );
  
  if (params.orderBy) {
    url.searchParams.set('orderBy', params.orderBy);
  }
  
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  return response.json();
}
```

---

## 2. Google Drive API v3 Document Export (`/files/{id}/export` endpoint)

### Decision
Export Google Docs to `text/plain` MIME type for basic content extraction. Use `text/markdown` when structure preservation is needed.

### Rationale
- **Plain Text**: Simplest format, guaranteed compatibility, good for content analysis
- **Markdown**: Preserves basic structure (headings, lists, links) while remaining human-readable
- **Size Limit**: 10 MB export limit is reasonable for most documents
- **No Auth Complexity**: Same OAuth scope as file listing (`drive.readonly` or `drive`)

### Export MIME Types for Google Docs

| Format | MIME Type | Extension | Use Case |
|--------|-----------|-----------|----------|
| **Plain Text** | `text/plain` | `.txt` | Simple content extraction, search indexing |
| **Markdown** | `text/markdown` | `.md` | Structure preservation, documentation |
| Microsoft Word | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `.docx` | Full formatting preservation |
| PDF | `application/pdf` | `.pdf` | Print-ready, locked formatting |
| Rich Text | `application/rtf` | `.rtf` | Cross-platform with basic formatting |
| OpenDocument | `application/vnd.oasis.opendocument.text` | `.odt` | Open standard format |
| HTML (zipped) | `application/zip` | `.zip` | Web publishing |
| EPUB | `application/epub+zip` | `.epub` | E-book format |

### Size Limitations
- **10 MB export limit**: Enforced by Google Drive API
- **No explicit file size check needed**: API returns error if limit exceeded
- **Best Practice**: Warn users about potential size issues for very large documents

### Recommended Export Format Hierarchy
1. **Primary**: `text/markdown` - Best balance of structure and readability
2. **Fallback**: `text/plain` - Maximum compatibility
3. **Advanced**: `application/pdf` or `.docx` - When full formatting is critical

### Implementation Pattern
```typescript
interface ExportDocumentParams {
  fileId: string;
  mimeType?: string;  // Default: 'text/markdown'
}

async function exportDocument(params: ExportDocumentParams): Promise<string> {
  const mimeType = params.mimeType || 'text/markdown';
  
  const url = `https://www.googleapis.com/drive/v3/files/${params.fileId}/export?mimeType=${encodeURIComponent(mimeType)}`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: mimeType,
    }
  });
  
  if (!response.ok) {
    throw new Error(`Export failed: ${response.status} ${response.statusText}`);
  }
  
  // For text formats, return as string
  return response.text();
}
```

### Error Handling for Export
```typescript
// Check if file is a Google Doc before exporting
if (file.mimeType !== 'application/vnd.google-apps.document') {
  // Use /files/{id}?alt=media for binary files
  // OR return error for non-Google Docs
  throw new Error('File is not a Google Doc. Use download endpoint for binary files.');
}

// Handle export size limit
if (response.status === 403 && errorReason === 'exportSizeLimitExceeded') {
  throw new Error('Document exceeds 10 MB export limit');
}
```

### Alternatives Considered
- **HTML Export**: Requires unzipping, more complex parsing
- **DOCX Export**: Binary format, requires parsing library
- **PDF Export**: Not text-extractable without OCR
- **Direct API content**: Not available for Google Docs (only metadata)

---

## 3. Error Handling Patterns

### Decision
Implement structured error handling with specific handlers for common HTTP status codes. Use exponential backoff for rate limiting (429, 5xx).

### HTTP Status Codes & Meanings

| Status | Reason | Meaning | Action |
|--------|--------|---------|--------|
| **200** | OK | Success | Process response normally |
| **400** | Bad Request | Invalid parameters | Check query syntax, fields parameter |
| **401** | Unauthorized | Invalid/expired token | Trigger re-authentication flow |
| **403** | Forbidden | Permission denied or rate limit | Check specific error reason |
| **404** | Not Found | File doesn't exist or no access | Inform user, check file ID |
| **429** | Too Many Requests | Rate limit exceeded | Exponential backoff retry |
| **500-504** | Server Error | Google backend issue | Exponential backoff retry |

### Rate Limiting (429 Status)

**Error Response:**
```json
{
  "error": {
    "errors": [
      {
        "domain": "usageLimits",
        "reason": "rateLimitExceeded",
        "message": "Rate Limit Exceeded"
      }
    ],
    "code": 429,
    "message": "Rate Limit Exceeded"
  }
}
```

**Handling Pattern:**
```typescript
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Max retries exceeded. Last status: ${response.status}`);
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Unexpected retry loop exit');
}
```

### Permission Errors (403)

**Common 403 error reasons:**
- `insufficientFilePermissions` - User lacks write/read access
- `rateLimitExceeded` - Per-user rate limit (different from 429)
- `userRateLimitExceeded` - Per-user quota exceeded
- `dailyLimitExceeded` - Daily API quota reached
- `domainPolicy` - Domain admin has disabled Drive apps

**Handling Pattern:**
```typescript
async function handleDriveError(response: Response): Promise<never> {
  const errorData = await response.json();
  const reason = errorData.error?.errors?.[0]?.reason;
  const message = errorData.error?.message || 'Unknown error';
  
  switch (response.status) {
    case 401:
      // Trigger OAuth re-authentication
      throw new Error('Invalid or expired access token. Please re-authenticate.');
      
    case 403:
      if (reason === 'insufficientFilePermissions') {
        throw new Error('You do not have permission to access this file.');
      } else if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (reason === 'dailyLimitExceeded') {
        throw new Error('Daily API quota exceeded. Please try again tomorrow.');
      }
      throw new Error(`Permission denied: ${message}`);
      
    case 404:
      throw new Error('File not found or you do not have access to it.');
      
    case 429:
      throw new Error('Too many requests. Please retry after a delay.');
      
    default:
      throw new Error(`Drive API error (${response.status}): ${message}`);
  }
}
```

### Wrong File Type Error

**Scenario**: Attempting to export a non-Google Doc
```typescript
{
  "error": {
    "errors": [
      {
        "domain": "global",
        "reason": "fileNotDownloadable",
        "message": "Only files with binary content can be downloaded. Use Export with Docs Editors files."
      }
    ],
    "code": 403,
    "message": "Only files with binary content can be downloaded. Use Export with Docs Editors files."
  }
}
```

**Prevention:**
```typescript
// Check MIME type before calling export endpoint
if (file.mimeType === 'application/vnd.google-apps.document') {
  // Use /files/{id}/export
  return exportDocument(file.id, 'text/markdown');
} else {
  // Use /files/{id}?alt=media for binary files
  return downloadFile(file.id);
}
```

### Rationale for Error Handling Approach
- **Exponential Backoff**: Standard practice for rate limiting, recommended by Google
- **Specific Error Messages**: Better user experience than generic "API error"
- **Automatic Retries**: Handles transient errors without user intervention
- **Re-authentication Flow**: OAuth tokens expire, need seamless refresh

### Alternatives Considered
- **Immediate Failure on 429**: Poor UX, automatic retry is better
- **Linear Backoff**: Less efficient than exponential
- **Client-side Error Handling Only**: Should handle at API client level for consistency

---

## 4. Best Practices from Existing Implementation

### Analysis of `drive-about-user.ts`

**Key Patterns:**

1. **Auth Token Retrieval**
```typescript
const authInfo = getAuthInfoSafe(context, 'drive-about-user');
const token = authInfo?.google?.access_token;

if (!token) {
  return {
    content: [{
      type: 'text',
      text: 'Error: No Google Drive access token found in authentication context',
    }],
  };
}
```

**Decision**: Use `getAuthInfoSafe()` for consistent auth handling across tools.

2. **Console Logging Pattern**
```typescript
console.log('drive-about-user called');
// ... later
console.log('  Google Drive user info retrieved successfully: ${user.emailAddress}');
```

**Decision**: Follow first-log-no-indent, subsequent-logs-with-2-spaces pattern per project conventions.

3. **Error Handling with Structured Logger**
```typescript
logger.error('Google Drive API error', {
  status: response.status,
  statusText: response.statusText,
  body: errorText,
});
```

**Decision**: Use `logger` from `observability/logger.js` for structured logging, console for user-facing progress.

4. **401 Specific Handling**
```typescript
if (response.status === 401) {
  return {
    content: [{
      type: 'text',
      text: 'Error: Invalid or expired Google Drive access token. Please re-authenticate.',
    }],
  };
}
```

**Decision**: Handle 401 explicitly to trigger OAuth refresh flow.

### Analysis of `google-api-client.ts`

**Key Patterns:**

1. **Client Factory Pattern**
```typescript
export function createGoogleClient(accessToken: string): GoogleClient {
  return {
    async fetchAboutUser(): Promise<DriveAboutResponse> {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive API error (${response.status}): ${errorText}`);
      }
      
      return response.json();
    }
  };
}
```

**Decision**: Extend `GoogleClient` interface with new methods for listing and exporting.

**Proposed Extensions:**
```typescript
export interface GoogleClient {
  fetchAboutUser(): Promise<DriveAboutResponse>;
  
  // NEW METHODS
  listFiles(params: {
    query?: string;
    mimeType?: string;
    folderId?: string;
    pageSize?: number;
    pageToken?: string;
    fields?: string;
    orderBy?: string;
  }): Promise<{
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      createdTime?: string;
      modifiedTime?: string;
      webViewLink?: string;
      size?: string;
      owners?: Array<{ displayName: string; emailAddress: string }>;
    }>;
    nextPageToken?: string;
    incompleteSearch?: boolean;
  }>;
  
  exportDocument(fileId: string, mimeType: string): Promise<string>;
}
```

2. **Error Throwing in Client**
```typescript
if (!response.ok) {
  const errorText = await response.text();
  throw new Error(`Drive API error (${response.status}): ${errorText}`);
}
```

**Decision**: Client methods should throw errors, tools should catch and format for MCP response.

3. **PAT Note**
```typescript
// TODO: Does not make sense. Google does not support PAT. This is using OAuth token as PAT.
export function createGoogleClientWithPAT(token: string): GoogleClient {
  return createGoogleClient(token);
}
```

**Decision**: Keep this for API consistency with other providers, even though Google only uses OAuth.

### Rationale
- **Consistency**: Match existing patterns for maintainability
- **Separation of Concerns**: Client handles API calls, tools handle MCP protocol
- **Error Propagation**: Throw in client, catch and format in tool
- **Type Safety**: Strong typing for all API responses

---

## 5. Atlassian Tool Patterns from `atlassian-get-issue.ts`

### Analysis of Parameter Handling

**Optional Parameters Pattern:**
```typescript
interface GetJiraIssueParams {
  issueKey: string;
  cloudId?: string;
  siteName?: string;
  fields?: string;
}
```

**Resolution Logic:**
```typescript
const client = createAtlassianClient(token);

let siteInfo;
try {
  siteInfo = await resolveCloudId(client, cloudId, siteName);
} catch (error: any) {
  logger.error('Failed to resolve cloud ID:', error);
  return { 
    content: [{ 
      type: 'text', 
      text: `Error: ${error.message}` 
    }] 
  };
}

const targetCloudId = siteInfo.cloudId;
```

**Decision for Google Drive Tools:**
Google Drive doesn't have a multi-tenancy concept like Atlassian's cloudId/siteName. Parameters should be simpler:
- No site resolution needed
- Focus on file/folder IDs directly
- Optional query filters (MIME type, name, etc.)

### Structured Output Formatting

**Atlassian Pattern:**
```typescript
logger.info('Issue fetched successfully', {
  issueKey: issue.key,
  issueId: issue.id,
  summary: issue.fields?.summary,
  status: issue.fields?.status?.name,
  hasDescription: !!issue.fields?.description,
  attachmentCount: issue.fields?.attachment?.length || 0,
  commentCount: issue.fields?.comment?.total || 0
});

return {
  content: [{
    type: 'text',
    text: JSON.stringify(issue, null, 2),
  }],
};
```

**Decision for Google Drive Tools:**
```typescript
// For list-files tool
logger.info('Files listed successfully', {
  fileCount: files.length,
  hasNextPage: !!nextPageToken,
  mimeTypeFilter: mimeType,
  queryUsed: queryString
});

return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      files,
      nextPageToken,
      count: files.length,
      hasMore: !!nextPageToken
    }, null, 2),
  }],
};

// For export-document tool
logger.info('Document exported successfully', {
  fileId,
  fileName: file.name,
  mimeType: exportMimeType,
  contentLength: content.length
});

return {
  content: [{
    type: 'text',
    text: content,  // Return raw text/markdown content
  }],
};
```

### Error Logging Pattern

**Atlassian Pattern:**
```typescript
logger.error('Error fetching Jira issue:', err);
return { 
  content: [{ 
    type: 'text', 
    text: `Error fetching Jira issue: ${err.message}` 
  }] 
};
```

**Decision**: Match this pattern for consistency:
```typescript
logger.error('Error listing Drive files:', err);
return {
  content: [{
    type: 'text',
    text: `Error listing Drive files: ${err.message}`
  }]
};
```

### Tool Registration Pattern

**Atlassian Pattern:**
```typescript
export function registerAtlassianGetIssueTool(mcp: McpServer): void {
  mcp.registerTool(
    'atlassian-get-issue',
    {
      title: 'Get Jira Issue',
      description: 'Retrieve complete details of a Jira issue...',
      inputSchema: {
        issueKey: z.string().describe('The Jira issue key or ID...'),
        cloudId: z.string().optional().describe('The cloud ID...'),
        siteName: z.string().optional().describe('The name of the Jira site...'),
        fields: z.string().optional().describe('Comma-separated list of fields...'),
      },
    },
    async ({ issueKey, cloudId, siteName, fields }, context) => {
      // Implementation
    }
  );
}
```

**Decision for Google Drive Tools:**
```typescript
export function registerDriveListFilesTool(mcp: McpServer): void {
  mcp.registerTool(
    'drive-list-files',
    {
      title: 'List Google Drive Files',
      description: 'List files from Google Drive with optional filtering by name, MIME type, or folder.',
      inputSchema: {
        query: z.string().optional().describe('Search query (e.g., "name contains \'report\'")'),
        mimeType: z.string().optional().describe('Filter by MIME type (e.g., "application/vnd.google-apps.document" for Google Docs)'),
        folderId: z.string().optional().describe('Filter by parent folder ID'),
        pageSize: z.number().optional().describe('Number of files per page (max 1000, default 100)'),
        pageToken: z.string().optional().describe('Page token for pagination'),
        orderBy: z.string().optional().describe('Sort order (e.g., "modifiedTime desc")'),
      },
    },
    async ({ query, mimeType, folderId, pageSize, pageToken, orderBy }, context) => {
      console.log('drive-list-files called');
      // Implementation
    }
  );
}

export function registerDriveExportDocumentTool(mcp: McpServer): void {
  mcp.registerTool(
    'drive-export-document',
    {
      title: 'Export Google Doc Content',
      description: 'Export a Google Doc to plain text or markdown format.',
      inputSchema: {
        fileId: z.string().describe('The Google Drive file ID to export'),
        format: z.enum(['text', 'markdown']).optional().describe('Export format (default: markdown)'),
      },
    },
    async ({ fileId, format }, context) => {
      console.log('drive-export-document called');
      // Implementation
    }
  );
}
```

### Rationale for Pattern Adoption
1. **Consistency**: Easier for developers familiar with other tools
2. **Type Safety**: Zod schema validation catches parameter errors early
3. **Error Handling**: Structured, user-friendly error messages
4. **Logging**: Separation between structured logs (logger) and user feedback (console)
5. **MCP Protocol**: Proper content array responses

### Alternatives Considered
- **Different Parameter Names**: Considered Drive-specific names but chose consistency
- **Inline Tool Registration**: Registration functions provide better organization
- **Different Response Format**: JSON.stringify for consistency with other tools

---

## Summary of Key Decisions

1. **File Listing**: Use `/files` endpoint with `q` and `fields` parameters, paginate with `nextPageToken`
2. **Document Export**: Export to `text/markdown` (primary) or `text/plain` (fallback), 10 MB limit
3. **Error Handling**: Structured error handling with exponential backoff for 429/5xx, specific handling for 401/403/404
4. **Existing Patterns**: 
   - Use `getAuthInfoSafe()` for auth
   - Extend `GoogleClient` interface
   - Follow console logging conventions (first log no indent, subsequent +2 spaces)
   - Use `logger` for structured logs
   - Match Atlassian tool patterns for consistency (parameter handling, error messages, tool registration)

## Implementation Checklist

- [ ] Extend `GoogleClient` interface with `listFiles()` and `exportDocument()` methods
- [ ] Create `registerDriveListFilesTool()` in `server/providers/google/tools/drive-list-files.ts`
- [ ] Create `registerDriveExportDocumentTool()` in `server/providers/google/tools/drive-export-document.ts`
- [ ] Implement exponential backoff retry logic in client methods
- [ ] Add structured error handling for all HTTP status codes
- [ ] Add comprehensive logging (console + logger)
- [ ] Update type definitions in `server/providers/google/types.ts`
- [ ] Add tests for pagination, error handling, and MIME type filtering
- [ ] Update documentation in `server/readme.md`

---

**Research Completed**: January 5, 2026
**Next Steps**: Begin implementation of `drive-list-files` and `drive-export-document` tools following the patterns documented above.
