I want to support ChatGPT.

This PR made this project work with ChatGPT, but made against an older version of the app:

https://github.com/bitovi/jira-mcp-auth-bridge/pull/22/files

I'd like to build a plan to re-apply it to this project.

Can you build fill out an implementation plan with what's needed?

## Implementation Plan

### Overview

The PR adds ChatGPT support by creating simplified "fetch" and "search" tools that follow OpenAI's MCP specification patterns. These tools are registered alongside (not replacing) existing Atlassian tools.

### Key Changes from PR #22

1. **New ChatGPT-specific tools** (`server/jira-mcp/` in old structure):
   - `tool-fetch.ts` - Fetch Jira issue by key (ChatGPT fetch tool pattern)
   - `tool-search.ts` - Search Jira issues with JQL (ChatGPT search tool pattern)
   - `tool-generic-fetch.ts` - Empty file (placeholder?)

2. **Modified server capabilities** (`server/jira-mcp/index.ts`):
   - Added `fetch`, `search`, `actions` capabilities
   - Commented out original tools (get-accessible-sites, get-jira-issue, etc.)
     These shouldn't be commented out.
   - Registered only fetch and search tools
     We should register all of them.

3. **MCP config file** (`mcpconfig.json`):
   - Configuration for ChatGPT client integration
   - Defines server URL, allowed tools, auth type
   - **Note**: Contains hardcoded ngrok URL (needs generalization)
   We don't need these files.

4. **Observability changes** (`server/observability/instruments.ts`):
   - Added logging instrumentation (details TBD)

   I'm not sure why this was done.

### Phase 1: Create ChatGPT-Compatible Tools

**Goal**: Add `fetch` and `search` tools following OpenAI MCP patterns while keeping existing tools

#### Step 1.1: Create Atlassian Fetch Tool
**File**: `server/providers/atlassian/tools/atlassian-fetch.ts`

**What to do**:
- Copy structure from PR's `tool-fetch.ts`
- Follow current `atlassian-get-issue.ts` auth pattern (use `getAuthInfoSafe`)
- Return OpenAI fetch document format:
  ```typescript
  interface FetchDocumentResponse {
    id: string;        // Issue key
    title: string;     // "{key}: {summary}"
    text: string;      // Description (converted from ADF to string)
    url: string;       // Browse URL
    metadata?: {       // Additional issue fields
      status, assignee, priority, etc.
    }
  }
  ```
- Support PAT authentication detection via `getAuthHeader()` helper
- Register tool name as `fetch` (not `atlassian-fetch`)

**Dependencies**: 
- Uses existing `resolveCloudId()`, `getAuthInfoSafe()`, `handleJiraAuthError()`

**How to verify**:
- Tool appears in tools list as `fetch`
- Can fetch issue by key (e.g., "PLAY-38")
- Returns JSON with id, title, text, url, metadata fields
- Works with both OAuth and PAT authentication

---

#### Step 1.2: Create Atlassian Search Tool
**File**: `server/providers/atlassian/tools/atlassian-search.ts`

**What to do**:
- Copy structure from PR's `tool-search.ts`
- Follow current tool auth patterns
- Input: `jql` (string), `maxResults` (number, default 25)
- Return array of search result documents:
  ```typescript
  interface SearchDocumentResponse {
    id: string;
    title: string;
    text: string;
    url: string;
    metadata?: Record<string, any>
  }
  ```
- Use JQL search endpoint: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/search`
- Register tool name as `search` (not `atlassian-search`)

**Dependencies**:
- Uses existing helper functions

**How to verify**:
- Tool appears as `search`
- Can search with JQL (e.g., "project = PLAY")
- Returns array of documents
- Respects maxResults parameter

---

#### Step 1.3: Register ChatGPT Tools
**File**: `server/providers/atlassian/tools/index.ts`

**What to do**:
- Import `registerAtlassianFetchTool` and `registerAtlassianSearchTool`
- Add conditional registration logic:
  ```typescript
  export function registerAtlassianTools(mcp: McpServer, authContext: any): void {
    console.log('Registering Atlassian tools...');
    
    // Existing tools (always register)
    registerAtlassianGetSitesTool(mcp);
    registerAtlassianGetIssueTool(mcp);
    registerAtlassianGetAttachmentsTool(mcp);
    registerAtlassianUpdateIssueDescriptionTool(mcp);
    
    // ChatGPT-compatible tools (register based on env var?)
    if (process.env.ENABLE_CHATGPT_TOOLS !== 'false') {
      registerAtlassianFetchTool(mcp);
      registerAtlassianSearchTool(mcp);
    }
    
    console.log('  All Atlassian tools registered');
  }
  ```

**How to verify**:
- Both `fetch` and `search` tools appear alongside existing tools
- Can toggle with environment variable

---

### Phase 2: Update Server Capabilities

**File**: `server/mcp-core/server-factory.ts`

**What to do**:
- Add `fetch` and `search` capabilities to MCP server creation:
  ```typescript
  const mcp = new McpServer(
    {
      name: 'jira-tool-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
        sampling: {},
        // Add ChatGPT-compatible capabilities
        fetch: true,
        search: true,
        actions: true,  // For future action tools
      },
    },
  );
  ```

**How to verify**:
- MCP server advertises fetch/search capabilities
- ChatGPT client can discover these capabilities

---

### Phase 3: Add MCP Configuration File (Optional)

**File**: `mcpconfig.json` (root directory)

**What to do**:
- Create configuration file for ChatGPT desktop client
- Generalize server URL (don't hardcode ngrok):
  ```json
  {
    "name": "bitovi-jira",
    "display_name": "Bitovi JIRA",
    "description": "MCP connector for accessing JIRA issues, projects, and related data",
    "version": "1.0.0",
    "capabilities": {
      "actions": true,
      "search": true,
      "fetch": true
    },
    "servers": [
      {
        "url": "${MCP_SERVER_URL}",
        "type": "mcp",
        "allowed_tools": ["search", "fetch"],
        "require_approval": "never"
      }
    ],
    "auth": {
      "type": "bearer",
      "description": "JIRA API token authentication",
      "fields": {
        "token": {
          "type": "string",
          "description": "Personal API token for JIRA"
        }
      }
    }
  }
  ```

**Note**: This file is only needed for ChatGPT desktop client. May not be necessary for our use case.

**How to verify**:
- File exists and is valid JSON
- Can be used by ChatGPT desktop client (if applicable)

---

### Phase 4: Documentation Updates

**File**: `server/readme.md`

**What to do**:
- Document new `fetch` and `search` tools
- Add section on ChatGPT compatibility
- Explain difference between standard tools and ChatGPT-compatible tools
- Document environment variable for toggling ChatGPT tools

**How to verify**:
- Documentation is clear and accurate
- Examples provided for both tool types

---

### Phase 5: Testing

**What to do**:
- Test `fetch` tool with various issue keys
- Test `search` tool with different JQL queries
- Verify both tools work with OAuth
- Verify both tools work with PAT (if applicable)
- Test with ChatGPT desktop client (if available)
- Verify existing tools still work

**Test cases**:
1. Fetch existing issue: `fetch({ issueKey: "PLAY-38" })`
2. Fetch non-existent issue: `fetch({ issueKey: "PLAY-9999" })`
3. Search by project: `search({ jql: "project = PLAY" })`
4. Search with maxResults: `search({ jql: "project = PLAY", maxResults: 5 })`
5. Search with complex JQL: `search({ jql: "project = PLAY AND status = 'In Progress'" })`

**How to verify**:
- All test cases pass
- No regressions in existing tools

---

### Implementation Checklist

- [x] **Phase 1.1**: Create `atlassian-fetch.ts` tool
- [x] **Phase 1.2**: Create `atlassian-search.ts` tool  
- [x] **Phase 1.3**: Register ChatGPT tools in `tools/index.ts`
- [x] **Phase 2**: Update server capabilities in `server-factory.ts`
- [ ] **Phase 3**: ~~Create `mcpconfig.json`~~ (not needed - skipped)
- [x] **Phase 4**: Update documentation
- [ ] **Phase 5**: Test all functionality (ready for user testing)

---

## Implementation Summary

✅ **Completed** - ChatGPT support has been successfully added to the MCP bridge server.

### What Was Implemented

**1. New Tools Created:**
- `server/providers/atlassian/tools/atlassian-fetch.ts` - Fetch Jira issues in document format
- `server/providers/atlassian/tools/atlassian-search.ts` - Search Jira with JQL

**2. Files Modified:**
- `server/providers/atlassian/tools/index.ts` - Registered fetch/search tools alongside existing tools
- `server/mcp-core/server-factory.ts` - Added fetch/search/actions capabilities
- `server/readme.md` - Documented new tools and ChatGPT compatibility

**3. Key Features:**
- ✅ Fetch tool returns standardized document format (`id`, `title`, `text`, `url`, `metadata`)
- ✅ ADF descriptions automatically converted to markdown
- ✅ Search tool returns summaries with status, assignee, due dates
- ✅ Both tools use existing OAuth authentication pattern
- ✅ Both tools support PAT authentication in test mode (`TEST_USE_MOCK_ATLASSIAN`)
- ✅ All existing tools remain available (no tools commented out)
- ✅ No environment variable needed - tools always registered

**4. Testing:**
- ✅ TypeScript compilation passes with no errors
- ⏳ Functional testing - user will test with ChatGPT client

### How to Use

**Fetch a Jira issue:**
```json
{
  "name": "fetch",
  "arguments": {
    "issueKey": "PLAY-38"
  }
}
```

**Search Jira issues:**
```json
{
  "name": "search",
  "arguments": {
    "jql": "project = PLAY AND status = 'In Progress'",
    "maxResults": 10
  }
}
```

### Next Steps

1. **User Testing**: Test with ChatGPT desktop client to verify compatibility
2. **Monitor**: Watch for any ChatGPT-specific issues or edge cases
3. **Iterate**: Adjust response format if ChatGPT has specific requirements

---

## Questions

### Authentication

**Q1**: Should ChatGPT tools use Personal Access Tokens (PAT) instead of OAuth?
- The PR includes `getAuthHeader()` logic that detects test mode and uses Basic auth
- Real ChatGPT client may expect different auth pattern
- **Decision needed**: OAuth-only, PAT-only, or both?

What does the atlassian tools do currently? We should follow that pattern.

**Q2**: Do we need the `TEST_USE_MOCK_ATLASSIAN` environment variable check in production code?
- PR uses this to toggle between Bearer and Basic auth
- Should this be removed or kept for flexibility?

Are we using this already in other atlassian code?

### Tool Registration

**Q3**: Should ChatGPT tools replace or supplement existing tools?
- **PR approach**: Commented out existing tools, registered only fetch/search
- **Recommended**: Keep both, use env var to control registration
- **Decision needed**: Which approach?

**Q4**: Should tool names be prefixed?
- Existing tools: `atlassian-get-issue`, `atlassian-get-sites`, etc.
- ChatGPT tools in PR: `fetch`, `search` (no prefix)
- **Decision needed**: Keep unprefixed for ChatGPT compatibility or add prefix for consistency?

### Response Format

**Q5**: How should we handle ADF-to-text conversion for description field?
- Jira descriptions are in ADF (Atlassian Document Format)
- ChatGPT tools need plain text
- **Decision needed**: Simple JSON.stringify() or proper markdown conversion?

Yes.

**Q6**: What metadata fields should be included in fetch/search results?
- PR includes: status, assignee, reporter, priority, issueType, created, updated, project
- **Decision needed**: Keep these or add/remove fields?

Keep these. They are useful context.

### Server Capabilities

**Q7**: What does the `actions` capability mean and do we need it?
- PR adds `actions: true` to capabilities
- Not clear what this enables
- **Decision needed**: Include or omit?

Include.  Add a note that we aren't certain why it's needed.  Please do some research, maybe you can figure it out. 

### Configuration

**Q8**: Is the `mcpconfig.json` file necessary?
- PR includes it but may be specific to ChatGPT desktop client
- Our users connect via VS Code Copilot
- **Decision needed**: Include this file or skip it?

It's not necessary.

**Q9**: How should users specify the server URL?
- PR hardcodes ngrok URL
- **Decision needed**: Environment variable? Config file? Documentation only?

Don't worry about this.  Eventually we will host this at a domain.

### Observability

**Q10**: What logging changes are needed from `instruments.ts`?
- PR modified this file but details not visible in diff
- **Decision needed**: Review PR's actual code changes to understand what's needed

### Tool Behavior

**Q11**: Should `fetch` tool handle attachments like `atlassian-get-issue` does?
- Current `atlassian-get-issue` returns attachment metadata
- **Decision needed**: Include in fetch tool or keep separate?

Keep separate.

**Q12**: Should search results include full issue details or summaries?
- Trade-off between completeness and response size
- **Decision needed**: What level of detail in search results?

Summaries and issue keys for now.  If it's easy to add, status and assignee and due dates.

### Environment Variables

**Q13**: What environment variables should control ChatGPT integration?
- Proposed: `ENABLE_CHATGPT_TOOLS` (true/false)
- **Decision needed**: Naming and default value?

We don't need an environment variable. 

### Testing

**Q14**: Do we have access to ChatGPT desktop client for testing?
- Integration testing may require actual ChatGPT client
- **Decision needed**: How to verify ChatGPT compatibility without client?

I will test it.

### Future Considerations

**Q15**: Should we create a separate "chatgpt provider" instead of adding to atlassian provider?
- Could mirror structure: `server/providers/chatgpt/`
- Would separate concerns and make toggling easier
- **Decision needed**: Current structure or new provider?


We are still providing Jira MCP tools.