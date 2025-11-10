# atlassian-get-attachments

Quick prompt:

> ```
> MCP get Jira attachments with IDs 10001,10002
> ```

## Purpose

The `atlassian-get-attachments` tool downloads Jira issue attachments by their attachment IDs and returns them as base64-encoded content. This enables AI agents to access and analyze files attached to Jira issues.

**Primary use cases:**
- Download design mockups or screenshots from issues
- Retrieve documents and specifications attached to stories
- Access log files or error reports from bug tickets
- Extract data from spreadsheets attached to issues

**What problem it solves:**
- **Programmatic file access**: Download attachments without manual clicking
- **AI content analysis**: Enables AI to read and analyze attached files
- **Workflow automation**: Fetch attachments for processing in automated workflows

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `attachmentIds` | string[] | ✅ Yes | Array of Jira attachment IDs to download (e.g., ["10001", "10002"]). Get these IDs from `atlassian-get-issue` responses. |
| `cloudId` | string | ❌ Optional | Atlassian cloud ID to specify which Jira site. If not provided, uses the first accessible site. |
| `siteName` | string | ❌ Optional | Jira site name (e.g., "bitovi"). Alternative to `cloudId`. |

### Returns

The tool returns base64-encoded attachment content:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // JSON array of attachment objects
    }
  ]
}
```

**Success response format:**
```json
[
  {
    "id": "10001",
    "encoded": "iVBORw0KGgoAAAANSUhEUgA...",
    "mimeType": "image/png",
    "size": 45678
  },
  {
    "id": "10002",
    "encoded": "JVBERi0xLjQKJeLjz9MKMy...",
    "mimeType": "application/pdf",
    "size": 123456
  }
]
```

**Each attachment includes:**
- **id**: Attachment ID
- **encoded**: Base64-encoded file content
- **mimeType**: File MIME type (e.g., "image/png", "application/pdf")
- **size**: File size in bytes

**Error response includes:**
- Authentication errors
- Attachment not found (404)
- Permission denied errors

### Dependencies

**Required:**
- Atlassian OAuth authentication
- Read permissions for the issues containing the attachments

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `atlassian-get-attachments` tool:

1. **"Get attachment 10001 from Jira"**
2. **"Download attachments 10001 and 10002"**
3. **"Fetch the attachments from issue PROJ-123"** (first calls `atlassian-get-issue` to get IDs)

### Walkthrough: Core Use Case

**Scenario**: You want to download and analyze attachments from a Jira issue.

#### Step 1: Get the issue to find attachment IDs

First, fetch the issue:
```
"Get Jira issue PROJ-123"
```

This returns attachment metadata:
```json
{
  "fields": {
    "attachment": [
      {
        "id": "10001",
        "filename": "mockup.png",
        "size": 45678,
        "mimeType": "image/png"
      }
    ]
  }
}
```

#### Step 2: Download the attachments

Now fetch the attachment content:
```
"Download attachment 10001"
```

The tool returns base64-encoded content that can be:
- Decoded and analyzed by AI vision models
- Saved to disk
- Processed by other tools

#### Step 3: Use the content

For images, the AI can analyze the content:
```
"What does the mockup in attachment 10001 show?"
```

For documents:
```
"Summarize the requirements document in attachment 10002"
```

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Atlassian
2. **You have attachment IDs** from an `atlassian-get-issue` call
3. **You have read permission** for the issues containing the attachments

### Related Tools

Tools commonly used with `atlassian-get-attachments`:

- **`atlassian-get-issue`** - First call to get attachment IDs and metadata
- **`figma-get-image-download`** - Similar tool for Figma design files
- **`write-shell-stories`** - Downloads Figma screens (similar workflow)

## Debugging & Limitations

### Common User-Facing Errors

#### Authentication Error

**Error**: `"Error: No valid Atlassian access token found in session context."`

**Explanation**: You're not authenticated with Atlassian.

**Solution**: Authenticate with Atlassian through the MCP client. The client will prompt you to log in via OAuth.

---

#### Attachment Not Found

**Error**: `"Attachment not found"` or `404 Not Found`

**Explanation**: The attachment ID doesn't exist or you don't have permission to access it.

**Solution**:
- Verify the attachment ID is correct
- Check that the attachment hasn't been deleted
- Ensure you have permission to view the issue containing the attachment
- Get fresh attachment IDs using `atlassian-get-issue`

---

#### Site Resolution Failed

**Error**: `"Error: Could not resolve cloud ID."`

**Explanation**: The specified site doesn't match any accessible sites.

**Solution**:
- Run `atlassian-get-sites` to see available sites
- Use the correct site name or cloud ID
- Try omitting `siteName`/`cloudId` to use the first site

---

#### Permission Denied

**Error**: `403 Forbidden`

**Explanation**: Your account doesn't have permission to access this attachment.

**Solution**:
- Request view permissions for the parent issue
- Verify you're logged into the correct account
- Check if the issue is in a restricted project

---

### Known Limitations

#### 1. Large Files

**Limitation**: Very large attachments (>10MB) may cause timeouts or memory issues when base64-encoding.

**Workaround**: 
- Access large files directly through the Jira web interface
- Break large attachments into smaller files when possible

---

#### 2. Binary File Support

**Limitation**: The tool returns raw base64 content. AI models can analyze:
- Images (PNG, JPG, GIF)
- Text documents (TXT, MD)
- Some structured formats (JSON, XML)

But may have difficulty with:
- Proprietary formats (PSD, AI, SKETCH)
- Encrypted or compressed archives
- Video/audio files

**Workaround**: Convert files to supported formats before attaching to Jira issues.

---

#### 3. Bulk Download Limits

**Limitation**: Downloading many large attachments at once may be slow or hit rate limits.

**Workaround**: Download attachments in smaller batches (5-10 at a time).

---

### Troubleshooting Tips

#### Tip 1: Get Fresh Attachment IDs

Attachment IDs can change if files are deleted and re-uploaded:
- Always fetch the issue first to get current attachment IDs
- Don't cache attachment IDs across sessions

#### Tip 2: Check MIME Types

Before downloading, check the MIME type in the issue response:
- Some file types may not be useful for AI analysis
- Text-based files (JSON, XML, TXT) work best

#### Tip 3: Verify Attachment Exists

If you get a 404 error:
- Refresh the issue details with `atlassian-get-issue`
- Check if the attachment list shows the file
- The attachment may have been deleted
