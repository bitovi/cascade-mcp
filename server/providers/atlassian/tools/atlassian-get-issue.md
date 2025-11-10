# atlassian-get-issue

Quick prompt:

> ```
> MCP get Jira issue https://bitovi.atlassian.net/browse/PROJ-123
> ```

## Purpose

The `atlassian-get-issue` tool retrieves complete details of a Jira issue including its description, status, attachments, comments, and all field data. This is the primary tool for fetching comprehensive issue information.

**Primary use cases:**
- Read full issue details including description and custom fields
- Review issue status, assignee, and priority
- Access attachment lists and comment counts
- Inspect all issue data for analysis or decision-making

**What problem it solves:**
- **Complete issue visibility**: Get all issue data in one call without manual navigation
- **Automation workflows**: Fetch issue details programmatically for AI analysis
- **Cross-tool integration**: Retrieve issue context needed by other tools

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | string | ✅ Yes | Jira issue key or ID (e.g., "PROJ-123", "USER-10" from `https://bitovi.atlassian.net/browse/PROJ-123`) |
| `cloudId` | string | ❌ Optional | Atlassian cloud ID to specify which Jira site. If not provided, uses the first accessible site. |
| `siteName` | string | ❌ Optional | Jira site name (e.g., "bitovi" from `https://bitovi.atlassian.net`). Alternative to `cloudId`. |
| `fields` | string | ❌ Optional | Comma-separated list of field names to return (e.g., "summary,status,assignee"). If omitted, returns all fields. |

### Returns

The tool returns complete issue data:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // JSON-formatted issue data
    }
  ]
}
```

**Success response includes:**
- Issue ID and key
- Summary and description (in markdown format)
- Status, priority, and issue type
- Assignee, reporter, creator information
- Created, updated, and due dates
- Attachment metadata (IDs, filenames, sizes)
- Comment count and structure
- All custom fields
- Project information

**Error response includes:**
- Authentication errors
- Issue not found (404)
- Permission denied errors

### Dependencies

**Required:**
- Atlassian OAuth authentication
- Read permissions for the specified issue

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `atlassian-get-issue` tool:

1. **"Get Jira issue PROJ-123"**
2. **"Show me the details of issue USER-10"**
3. **"What's in https://bitovi.atlassian.net/browse/TEAM-456?"**

### Walkthrough: Core Use Case

**Scenario**: You want to read the full details of a Jira issue.

#### Step 1: Call the tool

Ask the AI agent:
```
"Get Jira issue PROJ-123"
```

Or provide a full URL:
```
"Show me https://bitovi.atlassian.net/browse/PROJ-123"
```

#### Step 2: Review the results

The tool returns JSON with complete issue data:
```json
{
  "id": "10042",
  "key": "PROJ-123",
  "fields": {
    "summary": "Implement user authentication",
    "description": "# Overview\n\nAdd login functionality...",
    "status": {
      "name": "In Progress"
    },
    "priority": {
      "name": "High"
    },
    "assignee": {
      "displayName": "Jane Developer"
    },
    "attachment": [
      {
        "id": "10001",
        "filename": "mockup.png",
        "size": 45678
      }
    ]
  }
}
```

#### Step 3: Use the data

The AI can now analyze, summarize, or act on the issue data:
- "Summarize the requirements in this issue"
- "What attachments does this issue have?"
- "Update the description based on these requirements"

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Atlassian
2. **You have read permission** for the issue
3. **The issue exists** and is accessible

### Related Tools

Tools commonly used with `atlassian-get-issue`:

- **`atlassian-get-attachments`** - Download attachments listed in the issue
- **`atlassian-update-issue-description`** - Modify the issue description after reviewing
- **`write-epics-next-story`** - Reads epics to extract shell stories
- **`write-shell-stories`** - Reads epic descriptions to find Figma URLs

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

**Error**: `"Error: Could not resolve cloud ID. No sites found matching criteria."`

**Explanation**: The specified site name or cloud ID doesn't match any accessible sites.

**Solution**:
- Run `atlassian-get-sites` to see available sites
- Verify the site name matches exactly (case-sensitive)
- Try omitting `siteName`/`cloudId` to use the first available site

---

#### Permission Denied

**Error**: `403 Forbidden` or `"Insufficient permissions"`

**Explanation**: Your account doesn't have permission to view this issue.

**Solution**:
- Request view permissions from your Jira administrator
- Verify you're logged into the correct Atlassian account
- Check if the issue is in a restricted project

---

### Known Limitations

#### 1. Description Format

**Limitation**: Descriptions are converted from Atlassian Document Format (ADF) to markdown. Some ADF features may not convert perfectly:
- Complex tables
- Nested layouts
- Custom macros

**Workaround**: View the issue directly in Jira if markdown conversion looks incorrect.

---

#### 2. Field Filtering

**Limitation**: The `fields` parameter uses Jira field IDs (e.g., "customfield_10001"), which are site-specific and not human-readable.

**Workaround**: Omit the `fields` parameter to get all fields, then inspect the response to find field IDs you need.

---

#### 3. Large Issues

**Limitation**: Issues with very large descriptions (>100KB) may be truncated in responses.

**Workaround**: For extremely large content, consider breaking the issue into smaller linked issues.

---

### Troubleshooting Tips

#### Tip 1: Use URLs for Clarity

Instead of just issue keys, provide full Jira URLs:
- ✅ `"Get https://bitovi.atlassian.net/browse/PROJ-123"`
- ❌ `"Get PROJ-123"` (ambiguous if you have multiple sites)

This ensures the correct site is targeted.

#### Tip 2: Check Field Data

If you're not seeing expected fields:
- The field might be empty (null values)
- Custom fields have IDs like "customfield_10042"
- Request all fields first, then filter if needed

#### Tip 3: Verify Access

If you can't fetch an issue:
- Try accessing it directly in your browser
- Check the project's permission scheme
- Verify you're in the correct Jira site
