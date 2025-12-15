# review-work-item

Quick prompt:

> ```
> MCP call review-work-item on https://bitovi.atlassian.net/browse/PROJ-123
> ```

## Purpose

The `review-work-item` tool reviews a Jira work item (story, task, bug, etc.) and generates comprehensive questions identifying gaps, ambiguities, and missing information. The review is posted as a Jira comment to facilitate team discussion before development begins.

**Primary use cases:**
- Identify missing acceptance criteria, edge cases, and unclear requirements
- Surface questions before development begins to reduce rework
- Ensure stories meet your team's Definition of Ready
- Gather context from parent items, linked Confluence docs, and Figma designs
- Provide structured, actionable feedback grouped by feature area

**What problem it solves:**
- **Unclear requirements**: Questions emerge during development that could have been addressed earlier
- **Missing context**: Developers start work without understanding the full picture (parent goals, related docs)
- **Inconsistent quality gates**: Stories don't consistently meet Definition of Ready standards
- **Late-stage rework**: Gaps discovered during code review or QA that require going back to requirements

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKey` | string | ✅ Yes | Jira issue key to review (e.g., "PROJ-123" from `https://bitovi.atlassian.net/browse/PROJ-123`). |
| `cloudId` | string | ❌ Optional | The Atlassian cloud ID to specify which Jira site to use. If not provided, will use the first accessible site. |
| `siteName` | string | ❌ Optional | Jira site subdomain (e.g., "bitovi" from `https://bitovi.atlassian.net`). Alternative to `cloudId`. |
| `maxDepth` | number | ❌ Optional | Maximum depth for parent hierarchy traversal (default: 5). Set to 0 to skip parent fetching. |

### Returns

The tool returns a structured response with:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // Success message with review details
    }
  ]
}
```

**Success response includes:**
- Number of questions identified (❓ count)
- Status indicator (well-defined or needs clarification)
- Full review content posted to Jira
- Comment ID for reference

**Error response includes:**
- Error message describing the failure
- Authentication errors (missing Atlassian token)
- Jira API errors (issue not found, permission denied)

### Dependencies

**Required MCP capabilities:**
- **Sampling** ⚠️ (REQUIRED): This tool uses AI sampling to analyze the work item and generate review questions. Without sampling, the tool cannot produce meaningful reviews.
- **Atlassian authentication**: Requires Atlassian OAuth token

**Optional capabilities:**
- **Figma authentication**: If authenticated, Figma screens are fully analyzed with AI to compare designs against requirements

**Prerequisites:**
- User must be authenticated with Atlassian
- Issue must exist and be accessible by the authenticated user

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `review-work-item` tool:

1. **"Review story PROJ-123 for gaps and missing information"**
2. **"Check if PROJ-456 is ready for development"**
3. **"Identify questions for work item TEAM-789"**
4. **"Does USER-123 meet Definition of Ready?"**

### Walkthrough: Core Use Case

**Scenario**: You have a Jira story that's been written and want to ensure it's ready for development.

#### Step 1: Identify the work item

Find the Jira issue key you want to review (e.g., `PROJ-123`).

#### Step 2: Call the tool

Ask the AI agent:
```
"Review story PROJ-123 for gaps and questions"
```

#### Step 3: What happens behind the scenes

The tool orchestrates a 6-phase workflow (typically 1-3 minutes):

1. **Resolve Site** (~1-2 seconds)
   - Determines the Jira cloud ID from the site name or uses default

2. **Fetch Issue Hierarchy** (~3-10 seconds)
   - Fetches the target work item with full details
   - Recursively fetches parent items (story → epic → initiative) up to `maxDepth`
   - Fetches blocking and blocked-by issues
   - Fetches project description for context

3. **Extract Links** (~1 second)
   - Extracts Confluence page URLs from descriptions and comments
   - Extracts Figma file URLs
   - Extracts references to other Jira issues

4. **Load Context** (~5-60 seconds, depending on linked resources)
   - Fetches and caches Confluence documents
   - Downloads Figma images and runs AI analysis on each screen
   - Identifies Definition of Ready document (if linked)
   - Fetches additional referenced Jira issues

5. **Generate Review** (~30-60 seconds)
   - Builds comprehensive prompt with all context
   - Calls LLM to analyze and generate questions
   - Groups questions by feature/functionality area

6. **Post Comment** (~1-2 seconds)
   - Posts the review as a Jira comment on the work item
   - Returns the comment ID and content

#### Step 4: Review the output

The tool posts a comment to the Jira issue like:

```markdown
# Work Item Review: PROJ-123

## Feature Area: User Authentication

❓ What happens if the user enters an email that's already registered? (no error handling specified)

❓ Are there password strength requirements? (not mentioned in acceptance criteria)

❓ Should the "Remember me" checkbox be checked by default? (design shows it unchecked, but no explicit requirement)

## Feature Area: Form Validation

❓ When should validation occur - on blur, on submit, or real-time? (acceptance criteria says "validates" but doesn't specify timing)

❓ What's the maximum length for the email field? (no character limits specified)

## Definition of Ready Gaps

❓ Missing "Out of Scope" section - what explicitly won't be implemented?

❓ No acceptance criteria in Gherkin format - consider adding GIVEN/WHEN/THEN structure

## Remaining Questions

❓ Is this blocked by any other work? (no dependencies listed)

❓ Are there any performance requirements for form submission?

---

*Review generated by review-work-item tool. Discuss these questions with your team before starting development.*
```

If the story is well-defined:

```markdown
# Work Item Review: PROJ-123

✨ **This work item is well-defined!**

The acceptance criteria are clear, edge cases are addressed, and dependencies are properly documented. A few minor observations:

- Consider adding explicit error messages for validation failures
- The Figma link provides good visual context

No blocking questions identified. Ready for development!

---

*Review generated by review-work-item tool.*
```

### Context Gathering

The tool gathers comprehensive context before generating questions:

#### Jira Hierarchy
- **Target issue**: Full description, acceptance criteria, comments
- **Parent chain**: Epic → Initiative → Theme (if they exist)
- **Blockers**: Issues blocking or blocked by the target
- **Project description**: General project context and standards

#### Confluence Documents
- Automatically extracts Confluence URLs from descriptions/comments
- Fetches and caches document content
- **Special handling for Definition of Ready**: If a DoR document is linked, the review specifically checks compliance

#### Figma Designs
- Extracts Figma URLs from the work item and parent items
- Downloads and analyzes each screen with AI vision
- Generates detailed analysis of UI elements, interactions, and states
- Compares designs against requirements to identify discrepancies

### Related Tools

Tools commonly used with `review-work-item`:

- **`write-shell-stories`** - Generate shell stories for an epic, then review each one
- **`write-epics-next-story`** - Create detailed stories, then review them before development
- **`atlassian-get-issue`** - Fetch issue details before reviewing
- **`confluence-analyze-page`** - Debug Confluence document processing

## Debugging & Limitations

### Common User-Facing Errors

#### 1. Authentication Errors

**Error**: `"Error: No valid Atlassian access token found. Please authenticate with Atlassian first."`

**Explanation**: The tool requires an active Atlassian OAuth session.

**Solution**: Authenticate with Atlassian through the MCP client (VS Code Copilot). The client will prompt you to log in via OAuth.

---

#### 2. Issue Not Found

**Error**: `"Error: Issue PROJ-123 not found"`

**Explanation**: The specified issue key doesn't exist or you don't have permission to view it.

**Solution**:
- Verify the issue key is correct (case-sensitive)
- Ensure your Atlassian account has permission to view the issue
- Check that you're connected to the correct Jira site (use `cloudId` or `siteName` parameter)

---

#### 3. LLM Sampling Failed

**Error**: `"Error: Sampling failed..."`

**Explanation**: The AI model couldn't generate a response (rate limiting, timeout, etc.)

**Solution**:
- Wait a moment and try again
- Check if your MCP client supports sampling
- Verify the LLM provider is configured correctly

---

### Known Limitations

#### 1. Read-Only Review

**Limitation**: The tool only posts a comment with questions - it doesn't modify the work item itself.

**Workaround**: Use the generated questions to manually update the work item, then re-run the review to verify improvements.

---

#### 2. Confluence Documents Only

**Limitation**: The tool only fetches Confluence documents, not Google Docs, Notion, or other documentation platforms.

**Workaround**: Copy relevant context from other platforms into the Jira description or link Confluence pages that summarize external docs.

---

#### 3. English Only

**Limitation**: The review prompts and output are optimized for English-language work items.

**Workaround**: For non-English work items, the tool will still work but question quality may vary.

---

### Troubleshooting Tips

#### Tip 1: Check Definition of Ready Linking

For best results, link your team's Definition of Ready document in:
- The project description
- The epic description
- Or directly in the story

The tool will identify DoR documents and specifically check compliance.

#### Tip 2: Include Context in Parents

The tool traverses parent items for context. If your epics contain:
- Project goals and constraints
- Links to PRDs or technical docs
- Scope boundaries

...the review will be more comprehensive.

#### Tip 3: Use Comments for Clarifications

If the work item has evolved through discussion, the tool reads the last 5 comments. Keep clarifications in comments rather than only in separate documents.

#### Tip 4: Re-run After Updates

After addressing review questions:
- Update the work item with clarifications
- Re-run `review-work-item` to verify improvements
- Iterate until the story is well-defined

## Architecture Notes

### Workflow Phases

The tool implements a 6-phase workflow:

1. **Resolve Site**: Determine Jira cloud ID from parameters
2. **Fetch Hierarchy**: Get target issue, parents, blockers, project
3. **Extract Links**: Parse URLs from descriptions and comments
4. **Load Context**: Fetch Confluence docs, identify DoR, load related Jira issues
5. **Generate Review**: Build prompt, call LLM, parse response
6. **Post Comment**: Add review as Jira comment

### Context Sources

The tool synthesizes context from multiple sources:

| Source | What's Extracted | Priority |
|--------|------------------|----------|
| Target Issue | Description, acceptance criteria, comments | Highest |
| Parent Issues | Goals, constraints, scope boundaries | High |
| Blockers | Dependency context | Medium |
| Confluence Docs | Requirements, DoR, technical specs | High |
| Project Description | Team standards, general context | Medium |
| Figma Screens | Full AI analysis of UI elements, interactions, states | High |

### Question Generation

The LLM is prompted to generate questions in these categories:
- **Acceptance Criteria** - Are success conditions measurable?
- **Scope Boundaries** - What's in/out of scope?
- **Edge Cases** - Error states, empty states, boundaries?
- **Dependencies** - Are all blockers identified?
- **User Experience** - Loading states, error messages?
- **Technical Considerations** - APIs, data models, performance?
- **Testing Strategy** - How will this be verified?

Questions are grouped by feature area and ordered by importance within each group.

### Definition of Ready Integration

When a DoR document is linked:
1. Tool identifies it by document type classification (`dod`)
2. DoR content is prominently included in the prompt
3. LLM specifically checks each DoR requirement
4. Missing or incomplete sections are flagged

### File Organization

```
review-work-item/
├── README.md                    # This file
├── index.ts                     # Exports registerReviewWorkItemTool
├── review-work-item.ts          # MCP tool registration
├── core-logic.ts                # Main workflow orchestration
├── jira-hierarchy-fetcher.ts    # Fetch issue hierarchy
├── link-extractor.ts            # Extract URLs from content
├── context-loader.ts            # Load Confluence, Figma, Jira resources
└── prompt-work-item-review.ts   # System prompt and prompt generation
```
