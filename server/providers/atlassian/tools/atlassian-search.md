# search (Jira Issues)

Quick prompt:

> ```
> MCP search Jira for "project = PROJ AND status = 'In Progress'"
> ```

## Purpose

The `search` tool searches Jira issues using JQL (Jira Query Language) and returns results in a standardized document format. This tool is specifically designed for ChatGPT and other MCP clients that need structured search results.

**Primary use cases:**
- Find issues matching specific criteria (status, assignee, labels, etc.)
- Search across projects using JQL queries
- Discover related issues for analysis or planning
- Filter issues by custom fields and dates

**What problem it solves:**
- **Powerful querying**: Leverage Jira's full JQL syntax for complex searches
- **Standardized output**: Returns consistent document format across different MCP clients
- **Bulk discovery**: Find multiple issues at once for batch operations
- **Dynamic filtering**: Search based on current state, not static lists

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jql` | string | ✅ Yes | JQL (Jira Query Language) query string. Examples: `"project = PROJ AND status = 'In Progress'"` or `"assignee = currentUser() ORDER BY created DESC"` |
| `maxResults` | number | ❌ Optional | Maximum number of results to return (default: 25). Use for pagination or limiting large result sets. |
| `cloudId` | string | ❌ Optional | Atlassian cloud ID to specify which Jira site. If not provided, uses the first accessible site. |
| `siteName` | string | ❌ Optional | Jira site name (e.g., "bitovi"). Alternative to `cloudId`. |

### Returns

The tool returns a standardized document format:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // JSON array of search result documents
    }
  ]
}
```

**Success response format:**
```json
[
  {
    "id": "10042",
    "title": "PROJ-123: Implement user authentication",
    "text": "Summary: Implement user authentication\nStatus: In Progress\nAssignee: Jane Developer\nPriority: High\nCreated: 2025-01-15",
    "url": "https://bitovi.atlassian.net/browse/PROJ-123",
    "metadata": {
      "issueKey": "PROJ-123",
      "status": "In Progress",
      "priority": "High"
    }
  }
]
```

**Each result includes:**
- **id**: Jira issue ID
- **title**: Issue key and summary
- **text**: Formatted issue details (summary, status, assignee, etc.)
- **url**: Direct link to the issue
- **metadata**: Structured data (issue key, status, priority, etc.)

**Error response includes:**
- Authentication errors
- Invalid JQL syntax errors
- Permission denied errors

### Dependencies

**Required:**
- Atlassian OAuth authentication
- Read permissions for searched projects

**JQL Knowledge:**
- Basic understanding of Jira Query Language
- See [Atlassian JQL documentation](https://support.atlassian.com/jira-service-management-cloud/docs/use-advanced-search-with-jira-query-language-jql/)

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `search` tool:

1. **"Search Jira for all issues assigned to me"**
2. **"Find issues in project PROJ with status 'To Do'"**
3. **"Show me high-priority bugs created this week"**

### Walkthrough: Core Use Case

**Scenario**: You want to find all in-progress issues in a project.

#### Step 1: Construct the JQL query

Basic JQL syntax:
- **Project filter**: `project = PROJ`
- **Status filter**: `status = 'In Progress'`
- **Assignee filter**: `assignee = currentUser()`
- **Date filter**: `created >= -7d` (last 7 days)
- **Sorting**: `ORDER BY priority DESC`

Combine with AND/OR:
```
project = PROJ AND status = 'In Progress' ORDER BY created DESC
```

#### Step 2: Call the tool

Ask the AI agent:
```
"Search Jira for issues in project PROJ that are in progress"
```

The AI translates this to JQL and calls the tool:
```
search(jql: "project = PROJ AND status = 'In Progress'")
```

#### Step 3: Review results

The tool returns a list of matching issues:
```
Found 5 issues:

1. PROJ-123: Implement user authentication
   Status: In Progress | Assignee: Jane Developer | Priority: High
   https://bitovi.atlassian.net/browse/PROJ-123

2. PROJ-124: Add password reset flow
   Status: In Progress | Assignee: John Smith | Priority: Medium
   https://bitovi.atlassian.net/browse/PROJ-124

...
```

#### Step 4: Take action

Use the results for further operations:
- "Summarize the requirements in PROJ-123"
- "Update PROJ-124 description with acceptance criteria"
- "How many issues are assigned to Jane?"

### Common JQL Examples

**Assigned to me:**
```jql
assignee = currentUser() ORDER BY priority DESC
```

**Recent issues:**
```jql
project = PROJ AND created >= -7d
```

**High-priority bugs:**
```jql
project = PROJ AND priority = High AND type = Bug
```

**Issues with specific label:**
```jql
project = PROJ AND labels = "frontend"
```

**Blocked issues:**
```jql
project = PROJ AND status = Blocked
```

### Setup Requirements

Before using this tool, ensure:
1. **Authentication is complete** with Atlassian
2. **You have read permission** for the projects you're searching
3. **You understand basic JQL syntax** (or let the AI construct queries)

### Related Tools

Tools commonly used with `search`:

- **`fetch`** - Get full details for specific issues found by search
- **`atlassian-get-issue`** - Fetch complete issue data for search results
- **`atlassian-update-issue-description`** - Update issues found in search results
- **`atlassian-get-sites`** - Find cloud IDs for multi-site searches

## Debugging & Limitations

### Common User-Facing Errors

#### Authentication Error

**Error**: `"Error: No valid Atlassian access token found in session context."`

**Explanation**: You're not authenticated with Atlassian.

**Solution**: Authenticate with Atlassian through the MCP client. The client will prompt you to log in via OAuth.

---

#### Invalid JQL Syntax

**Error**: `"Error parsing JQL query"` or `"Invalid JQL syntax"`

**Explanation**: The JQL query has syntax errors.

**Solution**:
- Check for typos in field names (case-sensitive)
- Use quotes around values with spaces: `status = 'In Progress'`
- Verify operator usage: `=`, `!=`, `>`, `<`, `~` (contains)
- Test queries in Jira's advanced search first

**Common JQL mistakes:**
- ❌ `status = In Progress` (missing quotes)
- ✅ `status = 'In Progress'`
- ❌ `project = PROJ and status = Done` (lowercase 'and')
- ✅ `project = PROJ AND status = Done`

---

#### No Results Found

**Error**: No error, but empty results: `[]`

**Explanation**: No issues match your query criteria.

**Solution**:
- Verify the project key exists and is correct
- Check if status values match exactly (case-sensitive)
- Try a simpler query to test: `project = PROJ`
- Confirm you have permission to view issues in the project

---

#### Permission Denied

**Error**: `403 Forbidden` or `"You do not have permission to view this project"`

**Explanation**: Your account doesn't have access to the searched projects.

**Solution**:
- Request view permissions from your Jira administrator
- Verify you're logged into the correct account
- Check if the project is restricted or private

---

### Known Limitations

#### 1. Result Limits

**Limitation**: Maximum 25 results by default. Large searches may return incomplete results.

**Workaround**: 
- Use `maxResults` parameter for more results (up to 100)
- Add more specific filters to narrow results
- Use pagination with JQL offset (advanced)

---

#### 2. JQL Complexity

**Limitation**: Very complex JQL with multiple nested conditions can be slow or timeout.

**Workaround**: Break complex queries into multiple simpler searches.

---

#### 3. Field Availability

**Limitation**: Only returns standard fields (summary, status, assignee, priority, etc.). Custom fields may not appear in the standardized output.

**Workaround**: Use `atlassian-get-issue` to fetch full field data for specific issues.

---

#### 4. Real-Time Data

**Limitation**: Search results reflect current state when the query runs. Data may change immediately after search completes.

**Workaround**: Re-run searches before critical operations to ensure freshness.

---

### Troubleshooting Tips

#### Tip 1: Test JQL in Jira First

Before using in MCP:
- Go to Jira web interface
- Use "Filters" → "Advanced issue search"
- Test and refine your JQL query
- Copy the working query to MCP

#### Tip 2: Start Simple

If your search isn't working:
1. Start with: `project = PROJ`
2. Add one filter at a time: `project = PROJ AND status = Done`
3. Gradually add complexity

#### Tip 3: Use currentUser()

For user-specific searches:
- ✅ `assignee = currentUser()` (works for any user)
- ❌ `assignee = jane.developer` (requires knowing exact username)

#### Tip 4: Check Field Names

Common field name issues:
- Status values: Match exactly (e.g., "In Progress" not "in progress")
- Issue type: Use "Story", "Bug", "Epic" (capitalized)
- Priority: Usually "High", "Medium", "Low" (check your Jira config)
