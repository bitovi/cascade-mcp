# Quickstart: Google Drive Document MCP Tools

**Feature**: Google Drive File Listing and Document Retrieval  
**Branch**: `002-google-docs-mcp`  
**Prerequisites**: Completed spec 001 (Google Drive OAuth Integration)

## Overview

This feature adds two MCP tools to enable AI agents to discover and retrieve content from Google Drive documents:

1. **`drive-list-files`** - List and search files in user's Drive
2. **`drive-get-document`** - Export Google Docs as plain text

## Quick Setup

### 1. Verify Prerequisites

```bash
# Ensure Google OAuth is configured (from spec 001)
grep -q "GOOGLE_CLIENT_ID" .env || echo "❌ Google OAuth not configured"
grep -q "GOOGLE_CLIENT_SECRET" .env || echo "❌ Google OAuth not configured"
grep -q "GOOGLE_OAUTH_SCOPES" .env || echo "❌ Google OAuth not configured"

# Verify Google provider exists
ls server/providers/google/index.ts &>/dev/null && echo "✅ Google provider found" || echo "❌ Google provider missing"
```

### 2. Implementation Checklist

- [ ] Extend `types.ts` with new interfaces (`DriveFile`, `DriveFileListResponse`, `DriveFileListParams`)
- [ ] Extend `GoogleClient` interface in `google-api-client.ts` with `listFiles()` and `getDocumentContent()`
- [ ] Create `server/providers/google/tools/drive-list-files.ts`
- [ ] Create `server/providers/google/tools/drive-get-document.ts`
- [ ] Update `server/providers/google/tools/index.ts` to register new tools
- [ ] Create `server/api/drive-list-files.ts` REST endpoint
- [ ] Create `server/api/drive-get-document.ts` REST endpoint
- [ ] Update `server/api/index.ts` to register new API routes
- [ ] Write unit tests for API client methods
- [ ] Write integration tests for tools

### 3. Test the Tools

#### Via MCP Client (VS Code Copilot or Claude Desktop)

```typescript
// List all Google Docs
await mcp.callTool('drive-list-files', {
  query: "mimeType='application/vnd.google-apps.document'"
});

// Search for files
await mcp.callTool('drive-list-files', {
  query: "name contains 'requirements'"
});

// Get document content
await mcp.callTool('drive-get-document', {
  fileId: "1abc...xyz"
});
```

#### Via REST API

```bash
# Get OAuth token (from connection hub)
TOKEN="<your_google_oauth_token>"

# List files
curl -X POST http://localhost:3000/api/drive-list-files \
  -H "X-Google-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mimeType='\''application/vnd.google-apps.document'\''"
  }'

# Get document
curl -X POST http://localhost:3000/api/drive-get-document \
  -H "X-Google-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileId": "1abc...xyz"
  }'
```

## Usage Examples

### Example 1: Find Project Requirements

```typescript
// Agent workflow:
// 1. List all Google Docs with "requirements" in name
const files = await callTool('drive-list-files', {
  query: "mimeType='application/vnd.google-apps.document' and name contains 'requirements'",
  orderBy: "modifiedTime desc"
});

// 2. Get the most recent document's content
const content = await callTool('drive-get-document', {
  fileId: files[0].id
});

// 3. Analyze requirements and generate tasks
```

### Example 2: Search Across Multiple Criteria

```typescript
// Find documents modified in last 7 days containing "design"
const recentDesignDocs = await callTool('drive-list-files', {
  query: "mimeType='application/vnd.google-apps.document' and name contains 'design' and modifiedTime > '2026-01-01T00:00:00'",
  pageSize: 50
});
```

### Example 3: Pagination for Large File Sets

```typescript
// First page
const page1 = await callTool('drive-list-files', { pageSize: 100 });

// Next page
const page2 = await callTool('drive-list-files', {
  pageSize: 100,
  pageToken: page1.nextPageToken
});
```

## Architecture

```
server/providers/google/
├── index.ts                    # OAuth provider (existing)
├── google-api-client.ts        # Extended with new methods
├── types.ts                    # Extended with new interfaces
└── tools/
    ├── index.ts                # Registers all tools
    ├── drive-about-user.ts     # Existing
    ├── drive-list-files.ts     # NEW
    └── drive-get-document.ts   # NEW

server/api/
├── index.ts                    # Routes registration
├── drive-about-user.ts         # Existing
├── drive-list-files.ts         # NEW
└── drive-get-document.ts       # NEW
```

## Key Design Decisions

1. **Plain Text Export Only**: Initial implementation exports Google Docs as `text/plain` for simplicity. Markdown export can be added later if needed.

2. **No Caching**: Fetches fresh data on each request. Caching can be added in future iterations if performance requires it.

3. **Reuse OAuth Infrastructure**: Leverages existing Google OAuth setup from spec 001, no new authentication flows needed.

4. **Dual Interface Pattern**: Both MCP tools and REST API endpoints for maximum flexibility.

5. **Google Drive Query Syntax**: Uses native Google Drive query syntax rather than creating a custom query DSL.

## Common Queries

```typescript
// Only Google Docs
query: "mimeType='application/vnd.google-apps.document'"

// Only Google Sheets
query: "mimeType='application/vnd.google-apps.spreadsheet'"

// Files in specific folder
query: "'<folder_id>' in parents"

// Recently modified
query: "modifiedTime > '2026-01-01T00:00:00'"

// Owned by me
query: "'me' in owners"

// Shared with me
query: "sharedWithMe=true"

// Combined
query: "mimeType='application/vnd.google-apps.document' and name contains 'project' and modifiedTime > '2026-01-01T00:00:00'"
```

## Performance Targets

- File listing: <2s for <1000 files
- Document retrieval: <3s for typical documents (<100 pages)
- Supports pagination up to 10,000+ files
- Respects Google API rate limits (1000 requests per 100 seconds)

## Next Steps

1. Review contracts in `specs/002-google-docs-mcp/contracts/`
2. Review data model in `specs/002-google-docs-mcp/data-model.md`
3. Run `/speckit.tasks` to generate implementation tasks
4. Begin implementation following task order

## Troubleshooting

**"No Google Drive access token found"**
- Ensure user has completed OAuth flow from connection hub
- Check that `googleProvider` is registered in server.ts
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in .env

**"Invalid or expired token"**
- Token refresh is automatic via MCP service layer
- If issue persists, re-authenticate through connection hub

**"Rate limit exceeded"**
- Reduce request frequency
- Implement request batching if making many calls
- Google allows 1000 requests per 100 seconds per user

## Reference Documentation

- [Google Drive API v3 Documentation](https://developers.google.com/drive/api/v3/reference)
- [Google Drive Query Syntax](https://developers.google.com/drive/api/v3/search-files)
- [Spec 001: Google Drive OAuth](../001-google-drive-oauth/spec.md)
- [Feature Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Data Model](./data-model.md)
