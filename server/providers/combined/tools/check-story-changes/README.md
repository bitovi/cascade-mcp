# check-story-changes

Quick prompt:

> ```
> MCP call check-story-changes on https://bitovi.atlassian.net/browse/PROJ-456
> ```

## Purpose

The `check-story-changes` tool analyzes divergences between a child Jira story and its parent epic. It identifies conflicts, additions, missing content, and interpretation differences to help teams ensure alignment between high-level goals and implementation details.

**Primary use cases:**
- Verify that story implementation details align with epic intentions
- Identify scope creep or missing requirements in child stories
- Surface conflicts between story specifics and epic goals before development
- Ensure consistent understanding across parent-child work items
- Validate that child stories properly implement parent requirements

**What problem it solves:**
- **Misalignment**: Stories drift from their parent epic's original intent during refinement
- **Scope creep**: Additional features sneak into stories without epic-level approval
- **Lost context**: Implementation details conflict with or contradict high-level requirements
- **Interpretation gaps**: Different team members interpret requirements differently
- **Missing requirements**: Critical context from the epic is overlooked in the story

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `storyKey` | string | ✅ Yes | Jira story key to analyze (e.g., "PROJ-456" from `https://bitovi.atlassian.net/browse/PROJ-456`). The story must have a parent epic. |
| `cloudId` | string | ❌ Optional | The Atlassian cloud ID to specify which Jira site to use. If not provided, will use the first accessible site. |
| `siteName` | string | ❌ Optional | Jira site subdomain (e.g., "bitovi" from `https://bitovi.atlassian.net`). Alternative to `cloudId`. |

### Returns

The tool returns a structured response with:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // Analysis result in markdown format
    }
  ]
}
```

**Success response includes:**
- Summary of overall alignment between story and epic
- Detailed findings categorized by type (✅ Aligned, ⚠️ Conflict, ➕ Addition, ➖ Missing, 🔄 Interpretation)
- Contextual quotes from both story and epic for each finding
- Token usage metadata

**Error response includes:**
- Error message describing the failure
- Authentication errors (missing Atlassian token)
- Jira API errors (issue not found, permission denied)
- Story without parent error (if story has no parent epic)

### Dependencies

**Required MCP capabilities:**
- **Sampling** ⚠️ (REQUIRED): This tool uses AI to compare story and epic descriptions. Without sampling, the tool cannot perform the analysis.
- **Atlassian authentication**: Requires Atlassian OAuth token

**Prerequisites:**
- User must be authenticated with Atlassian
- Story must exist and be accessible by the authenticated user
- Story must have a parent epic

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `check-story-changes` tool:

1. **"Check if story PROJ-456 aligns with its parent epic"**
2. **"Analyze divergences between PROJ-456 and its epic"**
3. **"Compare PROJ-456 to its parent for conflicts"**
4. **"What changed between the epic and story PROJ-456?"**

### Walkthrough: Core Use Case

**Scenario**: You have a child story that was refined from a parent epic, and you want to verify it still aligns with the epic's intent.

#### Step 1: Identify the story

Find the Jira story key you want to analyze (e.g., `PROJ-456`). The story must have a parent epic.

#### Step 2: Call the tool

Ask the AI agent:
```
"Check story changes for PROJ-456"
```

#### Step 3: What happens behind the scenes

The tool orchestrates a 5-phase workflow (typically 30-60 seconds):

1. **Resolve Site** (~1-2 seconds)
   - Determines the Jira cloud ID from the site name or uses default

2. **Fetch Child Story** (~2-3 seconds)
   - Fetches the target story with full description
   - Converts ADF (Atlassian Document Format) to markdown
   - Extracts parent epic key from story metadata

3. **Fetch Parent Epic** (~2-3 seconds)
   - Fetches the parent epic's description
   - Converts ADF to markdown
   - Prepares both descriptions for comparison

4. **Analyze Divergences** (~20-40 seconds)
   - Builds comprehensive prompt with both descriptions
   - Calls LLM to identify alignment and divergences
   - Categories: ✅ Aligned, ⚠️ Conflict, ➕ Addition, ➖ Missing, 🔄 Interpretation
   - Focuses on significant differences, not natural refinement

5. **Return Analysis** (~1 second)
   - Returns structured markdown analysis
   - Includes contextual quotes and categorized findings

#### Step 4: Review the output

**Example: Story with divergences**

```markdown
Summary: Child story adds authentication requirements not mentioned in epic and interprets "user management" differently than intended.

Findings:

1. ⚠️ Conflict: Authentication Method
   - Child: "Users must authenticate with OAuth2 and support social login (Google, Facebook, GitHub)"
   - Parent: "Basic email/password authentication" (epic specifies simple auth only)

2. ➕ Addition: Email Verification
   - Child: "System must verify email addresses before account activation"
   - Parent: Not mentioned

3. ✅ Aligned: User Profile Fields
   - Child implements "name, email, avatar" from epic's "basic user profile data"

4. 🔄 Interpretation: User Deletion
   - Child: "Soft delete users with 30-day recovery period"
   - Parent: "Allow users to delete their accounts" (interpretation adds recovery period not specified)

5. ➖ Missing: Admin Role Management
   - Child: Not mentioned
   - Parent: "Admin users can manage other user accounts"
```

**Example: Well-aligned story**

```markdown
Summary: Child story properly implements epic's intent with appropriate technical details.

Findings:

1. ✅ Aligned: User Registration
   - Child implements "email/password signup form" from epic's "user can create account"

2. ✅ Aligned: Validation Rules
   - Child specifies "email format, password strength (8+ chars)" as details of epic's "validate user input"

3. ✅ Aligned: Success Flow
   - Child implements "redirect to dashboard on successful signup" from epic's "user gains access to system"

4. ✅ Aligned: Error Handling
   - Child details "show inline errors for invalid fields" implementing epic's "provide user feedback"
```

### When to Use This Tool

#### Good Use Cases

✅ **After Story Refinement**
- Story was created from a shell story in an epic
- Team refined the story and added implementation details
- Want to verify alignment before sprint planning

✅ **During Code Review**
- Developer implemented based on story
- Reviewer wants to verify story still matches epic intent
- Catch scope drift early

✅ **Epic Updates**
- Epic requirements changed after stories were created
- Need to identify which stories need updates
- Maintain consistency across work items

✅ **Cross-Team Coordination**
- Different teams working on related stories under same epic
- Ensure consistent interpretation of epic goals
- Avoid duplicate or conflicting implementations

#### Poor Use Cases

❌ **Stories Without Parents**
- Tool requires parent epic for comparison
- Use `review-work-item` instead for standalone review

❌ **Identical Content**
- If story is just a copy of epic, there's nothing to analyze
- Tool is designed for implementation details vs. high-level goals

❌ **Multiple Parents**
- Tool only compares to direct parent
- For complex hierarchies, run tool multiple times

### Understanding the Categories

The tool categorizes findings into 5 types:

| Category | Symbol | Meaning | Action Required |
|----------|--------|---------|-----------------|
| **Aligned** | ✅ | Story correctly implements epic intent | None - this is good! |
| **Conflict** | ⚠️ | Story contradicts or opposes epic requirements | **High priority** - resolve conflict |
| **Addition** | ➕ | Story adds features not in epic scope | Review for scope creep - approve or remove |
| **Missing** | ➖ | Epic requirement not addressed in story | Add missing requirement to story |
| **Interpretation** | 🔄 | Story interprets epic differently than intended | Clarify interpretation, update as needed |

**Important Note**: The tool is designed to *ignore* natural refinement. For example:
- Epic says "user can search" → Story says "search with autocomplete, filters, and sorting" = ✅ Aligned (not a divergence)
- Epic says "basic auth" → Story adds "OAuth, social login, 2FA" = ⚠️ Conflict (changes scope)

### REST API Usage

The tool is also available via REST API at `POST /api/check-story-changes`:

```bash
curl -X POST https://cascade.bitovi.com/api/check-story-changes \
  -H "Content-Type: application/json" \
  -H "X-Atlassian-Token: ATATT3xFf..." \
  -H "X-Atlassian-Email: user@example.com" \
  -H "X-Anthropic-Token: sk-ant-..." \
  -d '{
    "storyKey": "PROJ-456",
    "siteName": "bitovi"
  }'
```

**Response:**

```json
{
  "success": true,
  "analysis": "Summary: Child story properly implements...\n\nFindings:\n...",
  "metadata": {
    "parentKey": "PROJ-123",
    "childKey": "PROJ-456",
    "tokensUsed": 3842
  }
}
```

See the [REST API documentation](../../../../docs/rest-api.md) for complete details.

### Related Tools

Tools commonly used with `check-story-changes`:

- **`write-shell-stories`** - Generate shell stories from epic, then check alignment after refinement
- **`write-epics-next-story`** - Create detailed stories, then verify they align with epic
- **`review-work-item`** - Review story for completeness (different from checking alignment)
- **`atlassian-get-issue`** - Fetch issue details before analyzing
- **`atlassian-update-issue-description`** - Update story after identifying conflicts

## Debugging & Limitations

### Common User-Facing Errors

#### 1. Authentication Errors

**Error**: `"Error: No valid Atlassian access token found in session context."`

**Explanation**: The tool requires an active Atlassian OAuth session.

**Solution**: Authenticate with Atlassian through the MCP client (VS Code Copilot). The client will prompt you to log in via OAuth.

---

#### 2. Story Has No Parent

**Error**: `"Story PROJ-456 has no parent epic"`

**Explanation**: The specified story doesn't have a parent epic to compare against.

**Solution**:
- Verify the story is linked to a parent epic in Jira
- Use `review-work-item` instead if you want to review a standalone story
- Check if you meant to analyze a different story

---

#### 3. Issue Not Found

**Error**: `"Error fetching issue PROJ-456: 404 Not Found"`

**Explanation**: The specified story key doesn't exist or you don't have permission to view it.

**Solution**:
- Verify the story key is correct (case-sensitive)
- Ensure your Atlassian account has permission to view both the story and its parent epic
- Check that you're connected to the correct Jira site (use `cloudId` or `siteName` parameter)

---

#### 4. LLM Sampling Failed

**Error**: `"Error: Sampling failed..."`

**Explanation**: The AI model couldn't generate a response (rate limiting, timeout, etc.)

**Solution**:
- Wait a moment and try again
- Check if your MCP client supports sampling
- Verify the LLM provider is configured correctly

---

### Known Limitations

#### 1. Direct Parent Only

**Limitation**: The tool only compares story to its immediate parent, not the full hierarchy.

**Example**: Story → Epic → Initiative (tool only compares Story vs. Epic)

**Workaround**: Run the tool multiple times to check different levels of hierarchy.

---

#### 2. Text Comparison Only

**Limitation**: The tool only analyzes description text, not:
- Acceptance criteria formatting (Gherkin vs. bullet points)
- Jira fields (labels, components, fix versions)
- Linked issues or attachments
- Comments or change history

**Workaround**: Use `review-work-item` for comprehensive story analysis including all metadata.

---

#### 3. Subjective Interpretation

**Limitation**: The AI determines what constitutes a "conflict" vs. "natural refinement" based on training, which may not match your team's standards.

**Example**: Epic says "fast performance" → Story says "< 200ms response time" might be flagged as an interpretation when it's actually good refinement.

**Workaround**: Review findings with your team and establish patterns for what level of detail is appropriate.

---

#### 4. English Only

**Limitation**: The analysis prompts and output are optimized for English-language work items.

**Workaround**: For non-English work items, the tool will still work but analysis quality may vary.

---

### Troubleshooting Tips

#### Tip 1: Keep Epic Descriptions Updated

The tool compares against the current epic description. If the epic was updated after the story was created, findings may show divergences that were actually original alignment.

**Best Practice**: Update epic description first, then check all child stories.

---

#### Tip 2: Run After Refinement Sessions

The best time to use this tool is:
- After team refinement when stories get detailed
- Before sprint planning to catch issues early
- After epic scope changes to identify impact

---

#### Tip 3: Focus on High-Priority Findings

The analysis includes all differences, but focus on:
- ⚠️ **Conflicts** (highest priority - must resolve)
- ➕ **Additions** (check for scope creep)
- ➖ **Missing** (ensure completeness)

✅ **Aligned** items are informational - no action needed.

---

#### Tip 4: Use with Shell Stories Workflow

This tool is designed to work with the shell stories workflow:

1. `write-shell-stories` - Generate high-level stories from epic
2. Team refines shell stories with implementation details
3. `check-story-changes` - Verify refinement aligns with epic
4. `write-epics-next-story` - Create detailed Jira stories
5. `check-story-changes` again - Final verification before development

---

## Architecture Notes

### Workflow Phases

The tool implements a 5-phase workflow:

1. **Resolve Site**: Determine Jira cloud ID from parameters
2. **Fetch Child Story**: Get story description, convert ADF to markdown, extract parent key
3. **Fetch Parent Epic**: Get epic description, convert ADF to markdown
4. **Analyze Divergences**: Compare descriptions using LLM, categorize findings
5. **Return Analysis**: Format results as markdown with categorized findings

### Analysis Strategy

The LLM is instructed to:

1. **Recognize Natural Refinement**: Implementation details that expand on high-level requirements are ✅ Aligned
2. **Flag True Divergences**: Only mark as conflict/addition when there's actual scope change
3. **Provide Context**: Include brief quotes (1-2 sentences) from both story and epic
4. **Categorize Clearly**: Use 5 categories (✅⚠️➕➖🔄) for easy prioritization
5. **Keep Output Concise**: Fit within Jira comment size limits (~8KB markdown max)

### File Organization

```
check-story-changes/
├── README.md                       # This file
├── index.ts                        # Exports registerCheckStoryChangesTool
├── check-story-changes.ts          # MCP tool registration
├── core-logic.ts                   # Main workflow orchestration
└── strategies/
    └── prompt-check-story-changes.ts  # System prompt and prompt generation
```

### Key Functions

**`executeCheckStoryChanges(params, deps)`** - Core business logic
- Parameters: `{ storyKey, cloudId?, siteName? }`
- Dependencies: `{ atlassianClient, generateText, notify }`
- Returns: `{ success, analysis, metadata }`

**`convertDescriptionToText(description)`** - Helper function
- Converts Jira ADF (Atlassian Document Format) to markdown text
- Handles both string descriptions and ADF objects
- Used for both story and epic descriptions

**`CHECK_STORY_CHANGES_SYSTEM_PROMPT`** - System instructions
- Instructs LLM to recognize natural refinement vs. true divergences
- Defines 5 finding categories with clear semantics
- Emphasizes concise output for Jira comment compatibility

**`generateCheckWhatChangedPrompt(parentKey, storyKey, parentDesc, childDesc)`**
- Generates user prompt with both descriptions
- Includes clear instructions for categorization
- Provides examples of what to flag vs. ignore

### Design Decisions

#### Why Not Post Comment Automatically?

Unlike `review-work-item`, this tool returns the analysis without posting it to Jira. This is intentional:

- **Review First**: Teams should review findings before cluttering Jira with comments
- **Multiple Stories**: When checking many stories under one epic, you don't want dozens of comments
- **Integration**: API users may want to aggregate results before posting

**Future Enhancement**: Could add optional `postComment: boolean` parameter.

#### Why Only Direct Parent?

Comparing to the full hierarchy (story → epic → initiative → theme) would:
- Increase complexity significantly
- Make findings harder to interpret (which level caused the divergence?)
- Slow down the tool (multiple API calls)

The direct parent comparison is most actionable - if story conflicts with epic, that's the immediate issue.

#### Why ADF to Markdown Conversion?

Jira stores descriptions in ADF (Atlassian Document Format), but LLMs work better with markdown:
- Cleaner text representation
- Better token efficiency
- Easier for LLM to parse and compare

The tool converts both descriptions to markdown before sending to the LLM.
