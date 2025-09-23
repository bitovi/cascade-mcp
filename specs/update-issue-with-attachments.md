# Update Issue Description with Attachments

## Overview

This document outlines a plan to implement functionality that allows MCP clients (like VS Code Copilot) to update Jira issue descriptions while simultaneously uploading attachments. This feature would enable users to provide both textual updates and visual content (images, files) in a single operation.

## Research Findings

### MCP Protocol Capabilities

Based on analysis of the existing codebase and MCP implementation:

**✅ MCP CAN handle binary content:**
- The `get-jira-attachments` tool already demonstrates MCP's ability to return binary content
- MCP supports content types including:
  - `text` - For text content
  - `image` - For image content with `mimeType` and base64-encoded `data` 
- Images are transmitted as base64-encoded data in the MCP response format:
  ```typescript
  {
    type: 'image',
    mimeType: 'image/jpeg',
    data: '<base64-encoded-data>'
  }
  ```

**✅ MCP supports receiving binary content:**
- MCP tools can accept binary data as base64-encoded strings in their input parameters
- The framework supports flexible parameter schemas using Zod validation
- File data can be passed as string parameters with appropriate encoding

### Jira REST API Analysis

**Attachment Upload Endpoint:**
```
POST /rest/api/3/issue/{issueIdOrKey}/attachments
```

**Key Requirements:**
- Uses `multipart/form-data` encoding
- Requires `X-Atlassian-Token: no-check` header for CSRF protection
- File parameter must be named `file`
- Returns array of attachment objects with metadata including attachment IDs
- Supports OAuth 2.0 Bearer token authentication
- Required scopes: `write:attachment:jira`, `read:attachment:jira`, `read:user:jira`, etc.

**API Response Format:**
```json
[
  {
    "id": "10001",
    "filename": "picture.jpg",
    "mimeType": "image/jpeg",
    "size": 23123,
    "content": "https://your-domain.atlassian.net/rest/api/3/attachment/content/10000",
    "thumbnail": "https://your-domain.atlassian.net/rest/api/3/attachment/thumbnail/10000"
  }
]
```

**Integration with Issue Description:**
- After uploading attachments, their URLs can be referenced in issue descriptions
- ADF (Atlassian Document Format) supports media nodes for embedding images
- Attachment references can be included in markdown that gets converted to ADF

## User Experience

**How it works for users:**

1. **Write standard markdown** with image references:
   ```markdown
   ## Bug Report
   
   Found an issue with the login page:
   
   ![Login Error](./screenshots/login-error.png)
   
   The error occurs when:
   - User enters invalid credentials
   - ![Flow Diagram](../docs/user-flow.jpg)
   ```

2. **MCP client automatically:**
   - Detects image references in the markdown
   - Loads `./screenshots/login-error.png` and `../docs/user-flow.jpg` 
   - Converts images to base64
   - Sends both markdown text and image data to the tool

3. **Tool automatically:**
   - Uploads images to Jira
   - Updates markdown with Jira URLs
   - Converts to ADF format
   - Updates the issue description

4. **Result in Jira:**
   ```markdown
   ## Bug Report
   
   Found an issue with the login page:
   
   ![Login Error](https://api.atlassian.com/ex/jira/abc123/rest/api/3/attachment/content/12345)
   
   The error occurs when:
   - User enters invalid credentials  
   - ![Flow Diagram](https://api.atlassian.com/ex/jira/abc123/rest/api/3/attachment/content/12346)
   ```

**Key Benefits:**
- ✅ **Natural workflow** - Users write normal markdown
- ✅ **No manual uploads** - Client handles image loading automatically  
- ✅ **Atomic operation** - Description and images updated together
- ✅ **Proper image embedding** - Images display inline in Jira

## Implementation Approach

### Enhance Existing Tool

Enhance the existing `update-issue-description` tool with optional attachment support

**Workflow:**
1. **User writes standard markdown** with image references: `![Screenshot](./screenshot.png)`
2. **MCP client extracts image references** from the markdown
3. **Client loads and base64-encodes images** before sending to tool
4. **Tool uploads images to Jira** and updates markdown with Jira URLs

**Enhanced Input Parameters:**
```typescript
interface UpdateIssueDescriptionParams {
  issueKey: string;
  description: string; // Standard markdown with ![alt](path) references
  cloudId?: string;
  siteName?: string;
  notifyUsers?: boolean;
  // NEW: Optional attachment support
  attachments?: Array<{
    filename: string;
    content: string; // base64-encoded image data
    mimeType: string;
    markdownRef: string; // Original markdown reference like "./screenshot.png"
  }>;
}
```

**Enhanced Implementation Flow:**
1. Validate input parameters
2. Authenticate and resolve cloud ID
3. **Check for attachments** (new step)
   - If no attachments: proceed directly to step 6 (existing behavior)
   - If attachments provided: continue to step 4
4. **Upload attachments** (new functionality)
   - Convert base64 data to Buffer/Blob
   - Create multipart/form-data requests
   - Upload each attachment via Jira API
   - Collect attachment metadata (IDs, URLs)
5. **Update markdown with Jira URLs** (new functionality)
   - Replace original image references with Jira attachment URLs
   - Example: `![Screenshot](./screenshot.png)` → `![Screenshot](https://jira.atlassian.net/attachment/12345)`
6. **Convert markdown to ADF** (existing, potentially enhanced)
   - Process the markdown (now with Jira URLs if attachments were uploaded)
   - Convert to Atlassian Document Format
7. **Update issue description** (existing)
   - Use existing issue update API
   - Include processed ADF description
8. **Return comprehensive result** (enhanced)
   - Success/failure status
   - Uploaded attachment details (if any)
   - Updated description confirmation

## Technical Implementation Details

### Required Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "form-data": "^4.0.0"  // Already available as transitive dependency
  }
}
```

### Core Implementation Components

**1. Enhanced `tool-update-issue-description.ts`:**
```typescript
// Add optional attachments parameter to existing tool
async ({ 
  issueKey, 
  description, 
  cloudId, 
  siteName, 
  notifyUsers = true,
  attachments = [] // NEW: optional parameter
}: UpdateIssueDescriptionParams, context) => {
  // Existing auth and validation logic...
  
  // NEW: Handle attachments if provided
  let processedDescription = description;
  if (attachments && attachments.length > 0) {
    const uploadedAttachments = await uploadAttachments(token, targetCloudId, issueKey, attachments);
    processedDescription = replaceImageReferences(description, uploadedAttachments, attachments);
  }
  
  // Existing ADF conversion and update logic...
  const adf = await convertMarkdownToAdf(processedDescription);
  // ... rest of existing implementation
}
```

**2. New Helper Functions:**
```typescript
async function uploadAttachments(
  token: string, 
  cloudId: string, 
  issueKey: string, 
  attachments: AttachmentInput[]
): Promise<AttachmentResponse[]>

function replaceImageReferences(
  markdown: string, 
  uploadedAttachments: AttachmentResponse[],
  originalAttachments: AttachmentInput[]
): string {
  // Match uploaded attachments to original markdown references
  // Replace ![alt](./local/path.png) with ![alt](https://jira.../content/123)
}
```

**3. Enhanced Zod Schema:**
```typescript
// Add to existing inputSchema in tool registration
inputSchema: {
  issueKey: z.string().describe('The Jira issue key or ID (e.g., "PROJ-123", "USER-10")'),
  description: z.string().describe('Issue description in markdown format (will be converted to ADF)'),
  cloudId: z.string().optional().describe('The cloud ID to specify the Jira site...'),
  siteName: z.string().optional().describe('The name of the Jira site to use...'),
  notifyUsers: z.boolean().optional().default(true).describe('Whether to send notifications...'),
  // NEW: Optional attachments
  attachments: z.array(z.object({
    filename: z.string().describe('Original filename (e.g., "screenshot.png")'),
    content: z.string().describe('Base64-encoded file content'),
    mimeType: z.string().describe('MIME type (e.g., "image/png")'),
    markdownRef: z.string().describe('Original markdown reference path (e.g., "./screenshot.png")')
  })).optional().describe('Optional array of image attachments referenced in markdown')
}
```

## Tool Interface Documentation

**Tool Name:** `update-issue-description` (enhanced)

**Description:** 
> Updates a Jira issue description with markdown content. Supports optional image attachments by automatically uploading referenced images.
> 
> **Usage:** Write standard markdown with optional image references like `![Screenshot](./image.png)`. If images are referenced, the MCP client will automatically extract, load, and send image data. The tool uploads images to Jira and updates the description with proper image embedding.
>
> **Backward Compatibility:** Existing usage without attachments continues to work unchanged.

**Parameters:**
- `issueKey` (required) - Jira issue key (e.g., "PROJ-123")
- `description` (required) - Markdown content with optional image references `![alt](path)`
- `cloudId` (optional) - Jira cloud ID (auto-resolved if not provided)
- `siteName` (optional) - Jira site name (alternative to cloudId)
- `notifyUsers` (optional) - Whether to notify users of the update (default: true)
- `attachments` (optional) - Array of image data extracted from markdown references

**Attachment Format:**
```typescript
{
  filename: string;        // e.g., "screenshot.png"
  content: string;         // base64-encoded image data
  mimeType: string;        // e.g., "image/png"
  markdownRef: string;     // Original reference: "./screenshot.png"
}
```

**Behavior:**
- **No attachments provided:** Works exactly as before - just updates description
- **Attachments provided:** Uploads images first, updates markdown with Jira URLs, then updates description

### Authentication & Authorization

**Current Scope Coverage:**
- The existing `VITE_JIRA_SCOPE` should be verified to include attachment permissions
- Required scopes: `write:attachment:jira`, `read:attachment:jira`

**Implementation Pattern:**
- Follow existing auth pattern from `tool-update-issue-description.ts`
- Use `getAuthInfoSafe()` for proper error handling and re-auth flow
- Use `handleJiraAuthError()` for standardized error responses

### Error Handling Strategy

**Partial Failure Scenarios:**
1. **Attachments upload fails, description succeeds** - Return partial success
2. **Attachments succeed, description update fails** - Consider rollback options
3. **Individual attachment failures** - Continue with successful uploads

**Error Response Format:**
```typescript
{
  success: boolean;
  attachments: {
    successful: AttachmentResponse[];
    failed: Array<{ filename: string; error: string }>;
  };
  description: {
    updated: boolean;
    error?: string;
  };
}
```

### File Size and Type Constraints

**Jira Limits:**
- Maximum attachment size: Retrieved via `/rest/api/3/attachment/meta`
- Supported file types: Usually permissive, but should validate common types
- Recommended client-side validation before sending to MCP tool

**Implementation:**
```typescript
async function validateAttachmentConstraints(
  token: string, 
  cloudId: string, 
  attachments: AttachmentInput[]
): Promise<ValidationResult>
```

## Testing Strategy

### Unit Tests
- Upload functionality with mock Jira responses
- ADF conversion with attachment references
- Error handling for various failure scenarios
- Authentication/authorization edge cases

### Integration Tests
- End-to-end flow with test Jira instance
- Large file upload scenarios
- Multiple attachment types (images, documents, etc.)
- Combined operations (description + attachments)

### Load Testing
- Multiple concurrent uploads
- Large attachment sizes
- Base64 encoding/decoding performance

## Migration and Rollout

### Backward Compatibility
- Existing `update-issue-description` tool remains unchanged
- New tool is additive, no breaking changes
- Graceful degradation if attachment features unavailable

### Feature Flags
- Consider environment variable to enable/disable attachment features
- Allows gradual rollout and quick disable if issues arise

### Documentation Updates
- Update `server/readme.md` with new tool documentation
- Include usage examples and parameter descriptions
- Document error responses and troubleshooting guide

## Implementation Decisions

**Confirmed Approach:**
- ✅ **Client-side image extraction** - MCP client parses markdown, loads files, sends base64 data
- ✅ **Replace with Jira content URLs** - `![alt](./image.png)` → `![alt](https://jira.../content/123)`
- ✅ **Images via markdown only** - Other file types handled separately if needed
- ✅ **Partial success handling** - Leave uploaded attachments if description update fails
- ✅ **Follow Jira size limits** - Query `/rest/api/3/attachment/meta` for current limits
- ✅ **Allow all file types** - No restrictions beyond what Jira accepts
- ✅ **Parallel uploads** - Upload all attachments simultaneously
- ✅ **Handle permission errors** - Attempt operations and provide clear error messages

## Questions

### Size Limitations - Client-side Warnings
You asked: "I'm not sure what you mean about client-side warnings."

**Answer:** This referred to the MCP client (VS Code Copilot) potentially warning users before sending large files to avoid long upload times. Since you chose Option A (follow Jira limits exactly), the tool will simply respect whatever Jira's current size limits are without any additional warnings.

### Authentication Permission Errors
You asked: "What permission errors can there be?"

**Answer:** Potential permission errors include:
- **403 Forbidden** - User lacks `Create attachments` project permission
- **403 Forbidden** - User lacks `Browse Projects` permission for the issue's project  
- **403 Forbidden** - Issue has security restrictions the user can't access
- **401 Unauthorized** - OAuth token expired/invalid (handled by existing re-auth flow)
- **429 Rate Limited** - Too many requests (retry logic needed)

The existing `handleJiraAuthError()` function already handles most of these, so we'll follow the same pattern.

## Implementation Details

### Error Handling
- **Partial failures:** Leave uploaded attachments attached to issue and report partial success
- **Permission errors:** Use existing `handleJiraAuthError()` pattern with clear error messages
- **Individual attachment failures:** Continue processing remaining attachments

### File Constraints
- **Size limits:** Query Jira's `/rest/api/3/attachment/meta` endpoint for current limits
- **File type validation:** Accept any file type that Jira accepts
- **Upload strategy:** Parallel uploads for all attachments simultaneously

### Key Functions to Implement

```typescript
// Upload all attachments in parallel
async function uploadAttachments(
  token: string,
  cloudId: string, 
  issueKey: string,
  attachments: AttachmentInput[]
): Promise<AttachmentResponse[]> {
  const uploadPromises = attachments.map(attachment => 
    uploadSingleAttachment(token, cloudId, issueKey, attachment)
  );
  return Promise.all(uploadPromises);
}

// Replace markdown image references with Jira URLs
function replaceImageReferences(
  markdown: string,
  uploadedAttachments: AttachmentResponse[],
  originalAttachments: AttachmentInput[]
): string {
  let processedMarkdown = markdown;
  
  originalAttachments.forEach((original, index) => {
    const uploaded = uploadedAttachments[index];
    if (uploaded) {
      // Replace ![alt](./image.png) with ![alt](https://jira.../content/123)
      processedMarkdown = processedMarkdown.replace(
        original.markdownRef,
        uploaded.content
      );
    }
  });
  
  return processedMarkdown;
}
```

## Success Criteria

### Functional Requirements
- ✅ Successfully upload multiple attachments to Jira issues
- ✅ Update issue description with markdown content
- ✅ Handle authentication and authorization properly
- ✅ Provide comprehensive error handling and reporting
- ✅ Support various file types and sizes within Jira limits

### Performance Requirements
- ✅ Handle attachments up to Jira's maximum size limit
- ✅ Complete operations within reasonable timeframes (< 30s for typical use)
- ✅ Efficient base64 encoding/decoding for large files

### Reliability Requirements
- ✅ Graceful handling of partial failures
- ✅ Proper cleanup and error recovery
- ✅ Consistent behavior across different file types and sizes

### Usability Requirements
- ✅ Clear parameter validation and error messages
- ✅ Intuitive parameter structure for MCP clients
- ✅ Comprehensive documentation and examples
