# atlassian-update-issue-description

Quick prompt:

> ```
> MCP update issue PROJ-123 description with "# New Requirements\n\nUpdated scope..."
> ```

## Purpose

The `atlassian-update-issue-description` tool updates a Jira issue's description field with markdown content that is automatically converted to Atlassian Document Format (ADF). This enables programmatic updates to issue descriptions while maintaining formatting.

**Primary use cases:**
- Update issue descriptions with AI-generated content
- Add structured information to existing issues
- Automate documentation updates in Jira
- Append shell stories or acceptance criteria to epics

**What problem it solves:**
- **Markdown-to-Jira conversion**: Write in markdown, automatically get proper Jira formatting
- **Bulk updates**: Update multiple issue descriptions programmatically
- **AI content integration**: Let AI generate and update issue descriptions
- **Consistency**: Maintain consistent formatting across issue descriptions

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | string | ✅ Yes | Jira issue key or ID (e.g., "PROJ-123", "USER-10") |
| `description` | string | ✅ Yes | New description content in markdown format. Will be converted to Atlassian Document Format (ADF) automatically. |
| `cloudId` | string | ❌ Optional | Atlassian cloud ID to specify which Jira site. If not provided, uses the first accessible site. |
| `siteName` | string | ❌ Optional | Jira site name (e.g., "bitovi"). Alternative to `cloudId`. |
| `notifyUsers` | boolean | ❌ Optional | Whether to send notifications to watchers and assignees (default: true). |

### Returns

The tool returns a success or error message:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // Success confirmation or error message
    }
  ]
}
```

**Success response:**
```
Successfully updated issue PROJ-123 description.
```

**Error response includes:**
- Authentication errors
- Issue not found
- Permission denied
- ADF conversion errors

### Dependencies

**Required:**
- Atlassian OAuth authentication
- Edit permissions for the specified issue

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `atlassian-update-issue-description` tool:

1. **"Update issue PROJ-123 description with 'New requirements here'"**
2. **"Change the description of USER-10 to include acceptance criteria"**
3. **"Add shell stories to epic TEAM-456"**

### Walkthrough: Core Use Case

**Scenario**: You want to update a Jira issue description with new content.

#### Step 1: Prepare markdown content

The tool accepts markdown formatting:
```markdown
# Overview

This epic covers the user authentication feature.

## Requirements

- Email/password login
- Session management
- Password reset flow

## Figma Designs

- [Login Screen](https://figma.com/...)
- [Password Reset](https://figma.com/...)
```

#### Step 2: Call the tool

Ask the AI agent:
```
"Update issue PROJ-123 description with the requirements above"
```

Or be more explicit:
```
Update PROJ-123 description:
# Overview
This epic covers authentication...
```

#### Step 3: Verify the update

The tool confirms success:
```
Successfully updated issue PROJ-123 description.
```

View the issue in Jira to see the formatted content with proper headings, lists, and links.

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Atlassian
2. **You have edit permission** for the issue
3. **The issue exists** and is accessible
4. **Content is in markdown format** (the tool converts to ADF)

### Related Tools

Tools commonly used with `atlassian-update-issue-description`:

- **`atlassian-get-issue`** - Fetch current description before updating
- **`write-shell-stories`** - Generates shell stories and updates epic descriptions
- **`write-epics-next-story`** - Updates epics with Jira links after creating stories

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
- Ensure the issue hasn't been deleted

---

#### Permission Denied

**Error**: `"⚠️ Insufficient permissions to update issue PROJ-123"` or `403 Forbidden`

**Explanation**: Your account doesn't have edit permissions for this issue.

**Solution**:
- Request edit permissions from your Jira administrator
- Verify you're logged into the correct account
- Check if the issue is locked or in a restricted state

---

#### Empty Description Error

**Error**: `"Error: Description is required and must be a string."`

**Explanation**: The description parameter was empty or invalid.

**Solution**: Provide valid markdown content for the description field.

---

#### ADF Conversion Error

**Error**: `"Failed to convert markdown to ADF"` or `"ADF validation failed"`

**Explanation**: The markdown content couldn't be converted to Atlassian Document Format.

**Solution**:
- Simplify complex markdown structures
- Remove unsupported markdown features (nested tables, custom HTML)
- Try breaking content into simpler sections

---

### Known Limitations

#### 1. Markdown Conversion

**Limitation**: Not all markdown features convert perfectly to ADF:
- ✅ **Supported**: Headings, lists, bold, italic, links, code blocks, tables
- ❌ **Limited**: Nested tables, complex HTML, custom CSS
- ❌ **Not supported**: Markdown extensions, custom macros

**Workaround**: Stick to standard markdown syntax for best results.

---

#### 2. Description Overwrites

**Limitation**: This tool **replaces** the entire description. It does not append or merge content.

**Workaround**: 
- Fetch the current description with `atlassian-get-issue` first
- Merge old and new content manually
- Then update with the combined content

---

#### 3. Large Descriptions

**Limitation**: Extremely large descriptions (>100,000 characters) may fail or be truncated.

**Workaround**: Break large content into multiple linked issues or use Confluence pages for detailed documentation.

---

#### 4. User Notifications

**Limitation**: Setting `notifyUsers: false` prevents all notifications. You cannot selectively notify specific users.

**Workaround**: Use default behavior (notify all) or manually notify specific users after update.

---

### Troubleshooting Tips

#### Tip 1: Preserve Existing Content

To add content without losing existing description:
1. First: `"Get issue PROJ-123"`
2. Copy the current description
3. Append your new content
4. Update with the combined content

#### Tip 2: Test Markdown Conversion

If formatting looks wrong:
- Start with simple markdown (headings, lists, bold)
- Gradually add complexity
- View in Jira after each update to verify formatting

#### Tip 3: Use Standard Markdown

Avoid Jira-specific or extended markdown:
- ✅ Use: `# Heading`, `**bold**`, `- list item`
- ❌ Avoid: Jira macros, custom panels, color syntax

#### Tip 4: Check Permissions Early

Before updating many issues:
- Test with a single issue update
- Verify permissions work correctly
- Then proceed with batch updates
