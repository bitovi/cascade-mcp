# MCP Tool Contract: drive-list-files

**Tool Name**: `drive-list-files`  
**Provider**: `google`  
**Purpose**: List files from authenticated user's Google Drive with filtering, search, and pagination  
**Date**: January 5, 2026

## Tool Registration

```typescript
mcp.registerTool(
  'drive-list-files',
  {
    title: 'List Google Drive Files',
    description: 'List files from the authenticated user\'s Google Drive. Supports filtering by query, pagination, and sorting.',
    inputSchema: {
      query: z.string().optional().describe('Search query using Google Drive query syntax (e.g., "mimeType=\'application/vnd.google-apps.document\'" for Google Docs, "name contains \'project\'" for files with "project" in name)'),
      pageSize: z.number().min(1).max(1000).optional().describe('Number of files to return per page (1-1000, default: 100)'),
      pageToken: z.string().optional().describe('Token for retrieving the next page of results'),
      orderBy: z.string().optional().describe('Sort order (e.g., "modifiedTime desc", "name", "createdTime")'),
    },
  },
  async (args, context) => { /* implementation */ }
);
```

## Input Parameters

```typescript
interface ListFilesParams {
  query?: string;        // Optional: Drive API query syntax
  pageSize?: number;     // Optional: 1-1000, default 100
  pageToken?: string;    // Optional: For pagination
  orderBy?: string;      // Optional: Sort field and direction
}
```

### Parameter Examples

**List all files** (no parameters):

```json
{}
```

**List only Google Docs**:

```json
{
  "query": "mimeType='application/vnd.google-apps.document'"
}
```

**Search by filename**:

```json
{
  "query": "name contains 'requirements'"
}
```

**Combined query**:

```json
{
  "query": "mimeType='application/vnd.google-apps.document' and name contains 'project'",
  "orderBy": "modifiedTime desc",
  "pageSize": 50
}
```

**Get next page**:

```json
{
  "pageToken": "CAESBggDEAEYAQ",
  "pageSize": 50
}
```

## Output Format

### Success Response

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // Formatted markdown list of files
    }
  ]
}
```

**Example Output**:

```markdown
# Google Drive Files (3 found)

1. **Project Requirements.gdoc**
   - ID: 1abc...xyz
   - Type: application/vnd.google-apps.document
   - Modified: 1/5/2026, 2:30:00 PM
   - Size: 24.00 KB
   - Link: https://docs.google.com/document/d/1abc...xyz/edit

2. **Design Specifications.gdoc**
   - ID: 2def...uvw
   - Type: application/vnd.google-apps.document
   - Modified: 1/4/2026, 10:15:00 AM
   - Size: 18.50 KB
   - Link: https://docs.google.com/document/d/2def...uvw/edit

3. **Meeting Notes.gdoc**
   - ID: 3ghi...rst
   - Type: application/vnd.google-apps.document
   - Modified: 1/3/2026, 4:45:00 PM
   - Size: 12.25 KB
   - Link: https://docs.google.com/document/d/3ghi...rst/edit

---
**More results available.** Use pageToken: `CAESBggDEAEYAQ` to get the next page.
```

### Error Responses

**Authentication Error** (401):

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Invalid or expired Google Drive access token. Please re-authenticate."
    }
  ]
}
```

**No Files Found**:

```json
{
  "content": [
    {
      "type": "text",
      "text": "# Google Drive Files (0 found)\n\nNo files match your search criteria."
    }
  ]
}
```

**Invalid Query Syntax** (400):

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error listing Google Drive files: Invalid query syntax. Check your query parameter."
    }
  ]
}
```

**Rate Limit Exceeded** (429):

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error listing Google Drive files: Rate limit exceeded. Please try again in a moment."
    }
  ]
}
```

## Implementation Details

### Authentication

```typescript
// Extract OAuth token from context
const authInfo = getAuthInfoSafe(context, 'drive-list-files');
const token = authInfo?.google?.access_token;

if (!token) {
  return {
    content: [
      {
        type: 'text',
        text: 'Error: No Google Drive access token found in authentication context',
      },
    ],
  };
}
```

### API Call

```typescript
// Create client and make request
const client = createGoogleClient(token);
const params: DriveFileListParams = {
  query,
  pageSize,
  pageToken,
  orderBy,
};

const result = await client.listFiles(params);
```

### Output Formatting

```typescript
// Format files as markdown list
const fileList = result.files.map((file, index) => {
  const lines = [
    `${index + 1}. **${file.name}**`,
    `   - ID: ${file.id}`,
    `   - Type: ${file.mimeType}`,
  ];
  
  if (file.modifiedTime) {
    lines.push(`   - Modified: ${new Date(file.modifiedTime).toLocaleString()}`);
  }
  if (file.size) {
    const sizeInKB = parseInt(file.size) / 1024;
    lines.push(`   - Size: ${sizeInKB.toFixed(2)} KB`);
  }
  if (file.webViewLink) {
    lines.push(`   - Link: ${file.webViewLink}`);
  }
  
  return lines.join('\n');
}).join('\n\n');
```

### Logging

```typescript
console.log('drive-list-files called');
console.log('  Calling Google Drive API /files endpoint...');
console.log(`  Retrieved ${result.files.length} files`);

logger.info('drive-list-files completed', {
  fileCount: result.files.length,
  hasNextPage: !!result.nextPageToken,
});
```

## Google Drive API Integration

**Endpoint**: `GET https://www.googleapis.com/drive/v3/files`

**Query Parameters**:

- `q` - Search query
- `pageSize` - Results per page (max 1000)
- `pageToken` - Pagination token
- `orderBy` - Sort order
- `fields` - Fields to include in response

**Default Fields**:

```
files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,owners),nextPageToken
```

**Headers**:

```
Authorization: Bearer {access_token}
Accept: application/json
```

## Error Handling

| Error Type | Detection | Handling |
|------------|-----------|----------|
| No auth token | `!token` | Return clear error message |
| Invalid/expired token | `response.status === 401` | Return re-authentication message |
| Invalid query | `response.status === 400` | Return syntax error with details |
| Rate limit | `response.status === 429` | Return rate limit message |
| Server error | `response.status >= 500` | Log error, return generic message |

## Testing

### Unit Tests

```typescript
describe('drive-list-files tool', () => {
  it('should list files with valid auth token', async () => {
    const mockClient = {
      listFiles: jest.fn().mockResolvedValue({
        files: [
          { id: '1', name: 'Test.gdoc', mimeType: 'application/vnd.google-apps.document' }
        ],
        nextPageToken: null,
      }),
    };
    
    // Test implementation
  });
  
  it('should handle pagination', async () => {
    // Test with pageToken
  });
  
  it('should filter by MIME type', async () => {
    // Test query parameter
  });
});
```

### Integration Tests

```typescript
describe('drive-list-files integration', () => {
  it('should retrieve actual files from Google Drive', async () => {
    // Real API call with test credentials
  });
  
  it('should handle rate limiting gracefully', async () => {
    // Test rate limit behavior
  });
});
```

## Performance Considerations

- **Response Time**: Target <2s for <1000 files
- **Pagination**: Use reasonable page size (default 100) to balance response time vs number of requests
- **Field Selection**: Request only needed fields to minimize payload size
- **Rate Limiting**: Respect Google's 1000 requests per 100 seconds limit

## Security

- **OAuth Token**: Never log or expose access token in responses
- **User Data**: Only return files accessible to authenticated user
- **Query Injection**: Google API handles query validation and sanitization
- **Token Refresh**: Handled by MCP service layer (not tool responsibility)

## Compliance

- ✅ Follows constitution principle I (Modular Architecture)
- ✅ Follows constitution principle II (Type Safety with Zod)
- ✅ Follows constitution principle III (Test Coverage Planned)
- ✅ Follows constitution principle IV (Consistent Error Handling)
- ✅ Follows constitution principle V (Structured Logging)
- ✅ MCP Protocol compliant (proper tool registration and response format)
- ✅ OAuth 2.0 compliant (Bearer token authentication)

## Related Contracts

- [drive-get-document](./mcp-tool-drive-get-document.md) - Get document content
- [REST API: drive-list-files](./rest-api-drive-list-files.md) - REST endpoint
- [Google API Client Extension](./google-api-client-extension.md) - Client interface
