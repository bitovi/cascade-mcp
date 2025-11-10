# fetch (Jira Issue)

Quick prompt:

> ```
> MCP fetch issue PROJ-123
> ```

## Purpose

The `fetch` tool retrieves detailed information about a specific Jira issue by its key or ID and returns it in a standardized document format. This tool is specifically designed for ChatGPT and other MCP clients that expect consistent document structures.

**Primary use cases:**
- Get comprehensive issue details in a standardized format
- Fetch issues for ChatGPT analysis and summarization
- Retrieve issue data for cross-tool workflows
- Access issue information in a predictable structure

**What problem it solves:**
- **Standardized output**: Returns consistent document format across different MCP clients (especially ChatGPT)
- **Single-call convenience**: Get all essential issue data in one request
- **Format compatibility**: Optimized for ChatGPT's document processing
- **Simplified integration**: Easier to parse than raw Jira API responses

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | string | ✅ Yes | Jira issue key or ID (e.g., "PROJ-123", "USER-10") to fetch details for |
| `cloudId` | string | ❌ Optional | Atlassian cloud ID to specify which Jira site. If not provided, uses the first accessible site. |
| `siteName` | string | ❌ Optional | Jira site name (e.g., "bitovi"). Alternative to `cloudId`. |

### Returns

The tool returns a standardized document format:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // JSON document object
    }
  ]
}
```

**Success response format:**
```json
{
  "id": "10042",
  "title": "PROJ-123: Implement user authentication",
  "text": "# PROJ-123: Implement user authentication\n\n## Description\n\nAdd login functionality with email and password...\n\n## Details\n- Status: In Progress\n- Priority: High\n- Assignee: Jane Developer\n- Reporter: John Manager\n- Created: 2025-01-15T10:30:00Z\n- Updated: 2025-01-20T14:45:00Z",
  "url": "https://bitovi.atlassian.net/browse/PROJ-123",
  "metadata": {
    "issueKey": "PROJ-123",
    "issueType": "Story",
    "status": "In Progress",
    "priority": "High",
    "assignee": "Jane Developer",
    "reporter": "John Manager",
    "project": "PROJ"
  }
}
```

**Document includes:**
- **id**: Jira issue internal ID
- **title**: Issue key and summary
- **text**: Formatted markdown with description and details
- **url**: Direct link to the issue in Jira
- **metadata**: Structured key-value pairs (status, assignee, priority, etc.)

**Error response includes:**
- Authentication errors
- Issue not found (404)
- Permission denied errors

### Dependencies

**Required:**
- Atlassian OAuth authentication
- Read permissions for the specified issue

**Note:** This is the ChatGPT-compatible version of `atlassian-get-issue`. The main differences:
- `fetch` returns standardized document format (for ChatGPT)
- `atlassian-get-issue` returns raw Jira API response (for detailed field access)

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `fetch` tool:

1. **"Fetch issue PROJ-123"**
2. **"Get details for PROJ-123"** (may trigger either `fetch` or `atlassian-get-issue`)
3. **"Show me PROJ-123"**

### Walkthrough: Core Use Case

**Scenario**: You want ChatGPT to analyze a Jira issue's requirements.

#### Step 1: Call the tool

Ask ChatGPT:
```
"Analyze the requirements in Jira issue PROJ-123"
```

ChatGPT automatically calls the `fetch` tool to retrieve the issue.

#### Step 2: Review the document

The tool returns a structured document:
```markdown
# PROJ-123: Implement user authentication

## Description

Add email and password login functionality to the application.

Requirements:
- Email validation
- Password strength requirements
- Session management
- Remember me checkbox

## Details
- Status: In Progress
- Priority: High
- Assignee: Jane Developer
- Created: 2025-01-15
```

#### Step 3: AI analyzes the content

ChatGPT can now:
- Summarize the requirements
- Identify missing details
- Suggest acceptance criteria
- Answer questions about the issue

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Atlassian
2. **You have read permission** for the issue
3. **The issue exists** and is accessible

### Related Tools

Tools commonly used with `fetch`:

- **`search`** - Find issues first, then fetch details for specific ones
- **`atlassian-get-issue`** - Alternative tool with raw Jira API response format
- **`atlassian-update-issue-description`** - Update issues after fetching
- **`atlassian-get-attachments`** - Download attachments mentioned in the issue

## Debugging & Limitations

### Common User-Facing Errors

#### Authentication Error

**Error**: `"Error: No valid Atlassian access token found in session context."`

**Explanation**: You're not authenticated with Atlassian.

**Solution**: Authenticate with Atlassian through the MCP client. The client will prompt you to log in via OAuth.

---

#### Issue Not Found

**Error**: `"⚠️ Issue PROJ-123 not found"` or `404 Not Found`

**Explanation**: The issue doesn't exist or you don't have permission to view it.

**Solution**:
- Verify the issue key is correct (case-sensitive)
- Check that you're connected to the right Jira site
- Ensure you have permission to view the issue
- Confirm the issue hasn't been deleted

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

**Explanation**: Your account doesn't have permission to view this issue.

**Solution**:
- Request view permissions from your Jira administrator
- Verify you're logged into the correct account
- Check if the issue is in a restricted project

---

### Known Limitations

#### 1. Document Format vs Raw Data

**Limitation**: Returns standardized document format optimized for ChatGPT. Some detailed Jira fields may be simplified or omitted.

**Workaround**: Use `atlassian-get-issue` if you need raw Jira API response with all fields.

---

#### 2. Description Formatting

**Limitation**: Issue descriptions are converted from ADF (Atlassian Document Format) to markdown. Complex formatting may not convert perfectly.

**Workaround**: View issues directly in Jira for exact formatting.

---

#### 3. Attachment Content

**Limitation**: Returns attachment metadata (filenames, IDs) but not the actual file content.

**Workaround**: Use `atlassian-get-attachments` to download actual attachment files.

---

#### 4. Comments and History

**Limitation**: Does not include issue comments or change history in the document.

**Workaround**: Use `atlassian-get-issue` for full comment data, or view in Jira web interface.

---

### Troubleshooting Tips

#### Tip 1: Choose the Right Tool

- **Use `fetch`** when: Working with ChatGPT, need consistent document format
- **Use `atlassian-get-issue`** when: Need all raw field data, custom fields, attachments list

#### Tip 2: Handle Large Descriptions

If descriptions are very long:
- The tool includes the full description in the `text` field
- ChatGPT may summarize automatically
- Ask specific questions to focus on relevant parts

#### Tip 3: Verify Site Context

If you have multiple Jira sites:
- Provide the full Jira URL: `"Fetch https://bitovi.atlassian.net/browse/PROJ-123"`
- Or specify site: `"Fetch PROJ-123 from Bitovi site"`
