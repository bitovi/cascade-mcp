# atlassian-get-sites

Quick prompt:

> ```
> MCP what Jira sites do I have access to?
> ```

## Purpose

The `atlassian-get-sites` tool retrieves a list of all Atlassian/Jira sites that the authenticated user can access. This is useful for discovering available Jira workspaces and their cloud IDs.

**Primary use cases:**
- Discover which Jira sites you have access to
- Get cloud IDs for use with other Jira tools
- Verify authentication and access permissions

**What problem it solves:**
- **Site discovery**: Find all accessible Jira workspaces without manual searching
- **Cloud ID lookup**: Get the cloud IDs needed for multi-site operations
- **Access verification**: Confirm which sites are accessible with current credentials

## API Reference

### Parameters

This tool takes no parameters.

### Returns

The tool returns a list of accessible Atlassian sites:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // List of sites with names, URLs, and cloud IDs
    }
  ]
}
```

**Success response format:**
```
Accessible Jira Sites (3):

- Bitovi (https://bitovi.atlassian.net) - Cloud ID: abc123-def456-ghi789
- Example Corp (https://example.atlassian.net) - Cloud ID: xyz789-uvw456-rst123
- Demo Site (https://demo.atlassian.net) - Cloud ID: mno345-pqr678-stu901
```

**Error response includes:**
- Authentication errors (no valid token)
- Empty site list if no accessible sites found

### Dependencies

**Required:**
- Atlassian OAuth authentication

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `atlassian-get-sites` tool:

1. **"What Jira sites do I have access to?"**
2. **"List my Atlassian sites"**
3. **"Show me available Jira workspaces"**

### Walkthrough: Core Use Case

**Scenario**: You want to know which Jira sites you can access and get their cloud IDs.

#### Step 1: Call the tool

Ask the AI agent:
```
"What Jira sites do I have access to?"
```

#### Step 2: Review the results

The tool returns a list of sites with:
- **Site name**: Human-readable name (e.g., "Bitovi")
- **Site URL**: Full URL (e.g., "https://bitovi.atlassian.net")
- **Cloud ID**: Unique identifier for API calls (e.g., "abc123-def456-ghi789")

#### Step 3: Use cloud IDs with other tools

Copy the cloud ID for use with other Jira tools:
```
"Get issue PROJ-123 from site with cloud ID abc123-def456-ghi789"
```

Or use the site name:
```
"Get issue PROJ-123 from the Bitovi site"
```

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Atlassian (OAuth)
2. **Your Atlassian account** has access to at least one Jira site

### Related Tools

Tools commonly used with `atlassian-get-sites`:

- **`atlassian-get-issue`** - Fetch issue details using cloud IDs discovered by this tool
- **`atlassian-update-issue-description`** - Update issues on specific sites
- **`search`** - Search issues across sites using cloud IDs
- **`write-shell-stories`** - Uses site information to identify the correct Jira workspace

## Debugging & Limitations

### Common User-Facing Errors

#### Authentication Error

**Error**: `"Error: No valid Atlassian access token found in session context."`

**Explanation**: You're not authenticated with Atlassian.

**Solution**: Authenticate with Atlassian through the MCP client (VS Code Copilot). The client will prompt you to log in via OAuth.

---

#### No Sites Found

**Error**: `"No accessible Jira sites found."`

**Explanation**: Your Atlassian account doesn't have access to any Jira sites.

**Solution**:
- Verify you're logged into the correct Atlassian account
- Request access to a Jira site from your organization's admin
- Check that your account is active and not restricted

---

### Known Limitations

#### 1. Cloud-Only Sites

**Limitation**: This tool only works with Atlassian Cloud sites (*.atlassian.net). It does not support:
- Self-hosted Jira instances
- Jira Data Center installations
- Jira Server installations

**Workaround**: Self-hosted instances require different authentication methods not supported by this tool.

---

#### 2. Site Permissions

**Limitation**: The tool only shows sites where you have active user accounts. Sites where you've been removed or deactivated won't appear.

**Workaround**: Contact your Jira administrator to restore access if a site is missing.

---

### Troubleshooting Tips

#### Tip 1: Verify Authentication

If you're not seeing expected sites:
- Log out and log back in to refresh your OAuth session
- Check that you're authenticated with the correct Atlassian account
- Try accessing the sites directly in your browser to confirm access

#### Tip 2: Use Site Names

For easier readability, use site names instead of cloud IDs when calling other tools:
- Instead of: `"Get issue from cloud ID abc123-def456"`
- Use: `"Get issue from Bitovi site"`

The system will automatically resolve site names to cloud IDs.
