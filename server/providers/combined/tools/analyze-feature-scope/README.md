# analyze-feature-scope

Quick prompt:

> ```
> MCP call analyze-feature-scope on https://bitovi.atlassian.net/browse/PROJ-123
> ```

## Purpose

The `analyze-feature-scope` tool generates a scope analysis document from Figma designs linked in a Jira epic. Use this tool **before** generating shell stories to establish clear scope boundaries and surface questions.

**Primary use cases:**
- Establish clear scope boundaries early in the planning process
- Identify ambiguities and questions that need clarification before implementation
- Group features logically by user workflow for better planning
- Link features to specific Figma screens for traceability
- Create alignment between stakeholders on what's in vs. out of scope

**What problem it solves:**
- **Unclear scope boundaries**: Teams often start implementation without clear agreement on what's included
- **Late-stage scope creep**: Questions about "what's in scope?" emerge during development
- **Misaligned expectations**: Designers, PMs, and developers have different assumptions about features
- **Missing context**: Implementation starts before understanding which features are existing, new, low priority, or excluded

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `epicKey` | string | ✅ Yes | Jira epic key (e.g., "PROJ-123" from `https://bitovi.atlassian.net/browse/PROJ-123`). Epic description must contain Figma design URLs and may include context about priorities, scope, and constraints. |
| `cloudId` | string | ❌ Optional | The Atlassian cloud ID to specify which Jira site to use. If not provided, will use the first accessible site. |
| `siteName` | string | ❌ Optional | Jira site subdomain (e.g., "bitovi" from `https://bitovi.atlassian.net`). Alternative to `cloudId`. |

### Returns

The tool returns a structured response with:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // Success message with summary and temp directory path
    }
  ]
}
```

**Success response includes:**
- Number of feature areas identified
- Number of screens analyzed
- Path to temporary directory containing analysis artifacts
- Link to updated Jira epic

**Error response includes:**
- Error message describing the failure
- Authentication errors (missing Atlassian or Figma tokens)
- Jira API errors (epic not found, permission denied)

### Dependencies

**Required MCP capabilities:**
- **Sampling** ⚠️ (REQUIRED): This tool uses AI sampling to analyze Figma screens and generate scope analysis. Without sampling, the tool cannot perform screen analysis or feature identification.
- **Multi-provider authentication**: Requires both Atlassian (Jira) and Figma OAuth tokens

**Prerequisites:**
- User must be authenticated with Atlassian
- User must be authenticated with Figma
- Epic must exist and be accessible by the authenticated user
- Epic description must contain at least one valid Figma design URL

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `analyze-feature-scope` tool:

1. **"Analyze feature scope for epic PROJ-123"**
2. **"Identify features in epic USER-456 from Figma designs"**
3. **"Generate scope analysis for TEAM-789"**

### Walkthrough: Core Use Case

**Scenario**: You have a Jira epic with Figma design links and want to establish clear scope boundaries before writing stories.

#### Step 1: Prepare your Jira epic

Create or update a Jira epic with:
- **Figma design URLs** in the description (required)
- **Optional context** about priorities, scope, and constraints

**Understanding Figma Links:**

The tool accepts two types of Figma URLs:

1. **Page URLs** (recommended) - Links to an entire Figma page:
   ```
   https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/Project-Name?node-id=123-456
   ```
   - When you link to a page, the tool automatically processes **all frames (screens)** and **all notes** on that page
   - This is the easiest way to include multiple screens at once

2. **Individual Frame/Note URLs** - Links to specific frames or notes:
   ```
   https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/Project-Name?node-id=789-012
   ```
   - Use this when you want to include only specific screens or notes
   - You can mix page URLs and individual URLs in the same epic

**What are Figma Notes?**

Notes are Figma component instances with the name "Note" (type: INSTANCE). In the tool's context:
- The tool looks for any component instance named exactly "Note" 
- These are typically used in design systems to add annotations or context to designs
- The tool extracts text content from these note components

The tool:
- Extracts text from all note components on included pages
- Associates each note with its **nearest screen** (within 500px)
- Uses note content to enhance AI analysis of screen behavior and purpose

**Note Association:**
- Notes are automatically linked to the closest frame/screen based on spatial distance
- If a note is too far from any screen (>500px), it's listed as "unassociated" but still available for context
- Add notes near screens in Figma to explain interactions, business logic, or design intent

**Using Confluence for Additional Context:**

The tool automatically extracts and processes Confluence page links from your epic description. This provides additional requirements context beyond what's in Figma designs.

**How it works:**
1. Add Confluence page URLs anywhere in your epic description
2. The tool automatically fetches and processes linked pages
3. Each page is scored for relevance to scope analysis
4. Relevant documents are included as context for AI analysis

**Supported Confluence URL formats:**
```
# Full page URLs
https://yoursite.atlassian.net/wiki/spaces/SPACE/pages/123456/Page+Title

# Short links (automatically resolved)
https://yoursite.atlassian.net/wiki/x/AbCdEf
```

**What Confluence documents are used for:**
- **Requirements documents (PRDs)** - Feature specifications, acceptance criteria, business rules
- **Technical architecture docs** - Implementation constraints, API references, system design
- **Definition of Done** - Quality gates, testing requirements, compliance standards
- **General context** - Background information, stakeholder decisions, prior research

**How documents are prioritized:**
- Documents are automatically classified by type (requirements, technical, context, dod)
- Each document receives a relevance score for scope analysis
- Only documents meeting a relevance threshold are included in the prompt
- Epic description always takes precedence when there's a conflict with Confluence content

**Best practices for Confluence links:**
- Link PRDs that define detailed feature requirements
- Link technical specs that constrain implementation options
- Link Definition of Done if your team has specific quality gates
- Avoid linking large wiki pages with unrelated content (they dilute relevance)

**Note**: Confluence pages are cached for 7 days with version-based invalidation. If you update a Confluence page, the tool will fetch the latest version on the next run.

Example epic description:
```markdown
# User Dashboard Enhancement

Design: https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/Dashboard-redesign?node-id=246-3414

Requirements: https://bitovi.atlassian.net/wiki/spaces/PROJ/pages/123456/Dashboard+PRD
Technical Spec: https://bitovi.atlassian.net/wiki/x/AbCdEf

## Context
- Priority: Focus on core dashboard widgets first
- Out of scope: Advanced analytics (separate epic planned)
- Existing: We already have basic user authentication and navigation
- Low priority: Implement export functionality at the end
- Constraint: Must support mobile devices
```

#### Step 2: Call the tool

Ask the AI agent:
```
"Analyze feature scope for epic PROJ-123"
```

#### Step 3: What happens behind the scenes

The tool orchestrates a 6-phase workflow (typically 8-12 minutes total):

1. **Preparation** (~2-3 minutes)
   1. Fetches your epic and extracts Figma URLs
   2. Downloads screen designs and associated notes from Figma
   3. Organizes screens in the order they appear in your design

2. **AI Screen Analysis** (~5-10 minutes for 5-10 screens)
   1. Analyzes each screen's UI elements, interactions, and purpose using AI vision models
   2. Reads any notes you've added in Figma to understand context
   3. [View screen analysis prompt →](../writing-shell-stories/prompt-screen-analysis.ts)

3. **Scope Analysis Generation** (~2-3 minutes)
   1. Synthesizes all screen analyses into feature areas
   2. Categorizes features based on epic context and screen analysis
   3. Groups features by user workflow and functional areas
   4. [View scope analysis prompt →](./strategies/prompt-scope-analysis-2.ts)

4. **Jira Update** (~1-2 seconds)
   1. Writes generated scope analysis back to your epic under a "## Scope Analysis" section
   2. Preserves all existing epic content

#### Step 4: Review the results

The tool updates your Jira epic with a scope analysis like:

```markdown
## Scope Analysis

### Dashboard Widget Display

[Dashboard Main](figma-url) [Widget Config](figma-url)

- ☐ Display user statistics in card format
- ☐ Real-time data refresh for widgets
- ⏬ Export dashboard data to CSV (low priority - delay until end per epic)
- ✅ Basic navigation and user authentication
- ❌ Advanced analytics dashboard (separate epic)
- ❓ Should widgets be customizable by users?
- ❓ What is the refresh interval for real-time data?

### Widget Interaction

[Widget Details](figma-url)

- ☐ Click to expand widget details
- ☐ Hover state for interactive elements
- ⏬ Drag-and-drop widget reordering (low priority - delay until end per epic)
- ❌ Widget marketplace (future epic)
- ❓ Should expanded widgets overlay or push content down?

### Remaining Questions

- ❓ What is the overall error handling strategy?
- ❓ Are there any accessibility requirements (WCAG level)?
- ❓ What browsers need to be supported?
```

#### Step 5: Answer questions and refine scope

**⚠️ Important: The scope analysis is meant to be reviewed and refined before generating shell stories.**

The generated scope analysis is a starting point. You should:

1. **Answer open questions** (❓) by adding clarifications to the epic description:
   ```markdown
   # Before in epic:
   ## Scope Analysis
   - ❓ Should widgets be customizable by users?
   
   # After - add answer to Context section:
   ## Context
   - Widget customization: Yes, users can show/hide individual widgets
   
   ## Scope Analysis
   - ☐ Widget customization (show/hide individual widgets)
   ```

2. **Adjust categorization** if the AI misinterpreted your epic context:
   ```markdown
   # If AI marked something wrong, edit directly in the Scope Analysis section:
   # Before:
   - ❌ User preferences (future epic)
   
   # After (if this should be in-scope):
   - ☐ User preferences for dashboard layout
   ```

3. **Add missing features** if you identify gaps:
   - Add them to the appropriate feature area
   - Use the same format with appropriate emoji (☐ ✅ ⏬ ❌ ❓)

4. **Clarify epic context** if you notice the AI had trouble categorizing features:
   - Update your Context section to be more explicit about scope
   - Re-run the tool to regenerate with better context

Once refined, this scope analysis becomes the foundation for the [`write-shell-stories`](../writing-shell-stories/README.md) tool to create detailed implementation stories.

### Setup Requirements

Before using this tool, ensure:

1. **Jira Epic exists** with Figma design links in the description
2. **Figma designs are accessible** by your authenticated Figma account
3. **Authentication is complete** for both Atlassian and Figma providers
4. **Epic context (recommended)** includes priorities, scope constraints, existing features, and low-priority features to guide analysis

### Related Tools

Tools commonly used with `analyze-feature-scope`:

- **`write-shell-stories`** - After establishing scope, use this tool to generate detailed implementation stories
- **`atlassian-get-issue`** - Fetch the epic to review current content before analysis
- **`atlassian-update-issue-description`** - Manually update epic descriptions if needed
- **`figma-get-metadata-for-layer`** - Inspect individual Figma layers if you need more design detail
- **`figma-get-image-download`** - Download specific Figma screens independently

## Feature Categorization

The tool uses five categories to classify features based on epic context and screen analysis:

### ☐ In-Scope
- Features explicitly listed as in-scope in epic context AND not listed as existing/out-of-scope/low-priority
- Only marks features ☐ if they are new capabilities being added at normal priority
- If visible in screens but not mentioned in epic, assumes ☐ In-Scope
- **Verbosity**: Concise for obvious features ("Email/password login"), detailed for complex features ("Multi-step form with validation, error handling, and progress indicators")

### ✅ Already Done
- Existing functionality mentioned in epic context that provides context but isn't new work
- These features are visible in screens but explicitly stated as already implemented
- **Verbosity**: Keep brief since they're not part of new work ("Checkbox interaction to toggle task status")

### ⏬ Low Priority
- Features explicitly mentioned in epic to implement later/at the end (in scope but lower priority)
- Epic says "delay until end", "do at the end", "implement last", "lower priority"
- These WILL be implemented in this epic, just after core features
- **Verbosity**: Same detail level as ☐ In-Scope, plus timing note ("Status filters with dropdown for Active/Pending/Complete (low priority - delay until end per epic)")

### ❌ Out-of-Scope
- Features explicitly excluded from epic OR marked for future epics
- Epic says "out of scope", "not included", "future epic", "exclude", "won't implement"
- These will NOT be implemented in this epic
- **Verbosity**: Keep brief ("OAuth authentication (future epic)")

### ❓ Questions
- Ambiguous behaviors, unclear requirements, missing information
- Marks ambiguous features as questions rather than guessing
- Includes enough context for the question ("Should filters persist across sessions?")

**Key principle**: Epic context is the primary source of truth and overrides screen analysis interpretations.

## Feature Grouping

Features are organized by **user workflow**, not UI location or technical architecture:

**Good grouping (workflow-based):**
- "Authentication Flow" - How users log in and sign up
- "Dashboard Interaction" - How users view and interact with their dashboard
- "Settings Management" - How users configure their preferences

**Avoid (UI-based):**
- "Header Components"
- "Sidebar Elements"
- "Footer Links"

**Splitting criteria** - Features should be separate areas if:
- Different user interactions (typing vs clicking, selecting vs toggling)
- Different technical implementations (client-side vs server-side, different API calls)
- Could be developed by different developers in parallel
- Could be completed in different iterations

## Debugging & Limitations

### Common User-Facing Errors

#### 1. Authentication Errors

**Error**: `"Error: No valid Atlassian access token found. Please authenticate with Atlassian first."`

**Explanation**: The tool requires an active Atlassian OAuth session.

**Solution**: Authenticate with Atlassian through the MCP client (VS Code Copilot). The client will prompt you to log in via OAuth.

---

**Error**: `"Error: No valid Figma access token found. Please authenticate with Figma first."`

**Explanation**: The tool requires an active Figma OAuth session.

**Solution**: Authenticate with Figma through the MCP client. You'll be prompted to authorize access to your Figma account.

---

#### 2. Epic Not Found

**Error**: `"⚠️ Epic PROJ-123 not found"`

**Explanation**: The specified epic key doesn't exist or you don't have permission to view it.

**Solution**:
- Verify the epic key is correct (case-sensitive)
- Ensure your Atlassian account has permission to view the epic
- Check that you're connected to the correct Jira site (use `cloudId` or `siteName` parameter)

---

#### 3. No Figma URLs Found

**Error**: `"No Figma URLs found in epic description"`

**Explanation**: The tool couldn't locate any Figma design links in the epic's description.

**Solution**:
- Add Figma design URLs to the epic description (e.g., `https://www.figma.com/design/...`)
- Ensure URLs are properly formatted (must include `figma.com/design/`)
- Verify the epic description is not empty

---

#### 4. Insufficient Permissions

**Error**: `"⚠️ Insufficient permissions to update epic PROJ-123"`

**Explanation**: Your Atlassian account doesn't have edit permissions for the epic.

**Solution**:
- Request edit permissions from your Jira administrator
- Verify you're logged into the correct Atlassian account
- Check if the epic is in a locked or archived state

---

#### 5. Figma Access Denied

**Error**: `"Figma API error: 403 Forbidden"`

**Explanation**: The Figma file is private and your account doesn't have access.

**Solution**:
- Request access to the Figma file from the file owner
- Verify you're logged into the correct Figma account
- Check if the Figma file has been deleted or moved

---

### Known Limitations

#### 1. Figma File Scope

**Limitation**: The tool only processes CANVAS-type pages (standard Figma pages). It does not process:
- Figma prototypes or flows
- Embedded videos or external content
- Component libraries (unless they're placed as frames in a canvas)

**Workaround**: Ensure your designs are organized as regular Figma pages with frames and notes.

---

#### 2. Screen Analysis Accuracy

**Limitation**: AI analysis quality depends on:
- Image clarity and resolution
- Presence of explanatory notes in Figma
- Complexity of the UI design
- Clarity of epic context about scope

**Workaround**: 
- Add detailed notes in Figma explaining interactive behaviors
- Use clear, high-contrast designs for better OCR/vision model accuracy
- Provide explicit epic context about priorities, existing features, and out-of-scope items
- Review generated analysis files in the temp directory and regenerate if needed

---

#### 3. Token Limits

**Limitation**: Very large Figma files (50+ screens) may exceed AI token limits or take a long time to process.

**Workaround**:
- Break large projects into multiple epics
- Link to specific Figma pages instead of entire files
- Focus each epic on a specific feature area

---

#### 4. Evidence-Based Feature Identification

**Limitation**: The tool strictly follows an "evidence-based" approach - it only identifies features for functionality explicitly shown in Figma screens or mentioned in epic context. This means:
- No assumed or implied features
- No "standard" behaviors unless documented
- UI elements without described behaviors become questions (❓)

**Workaround**: This is intentional behavior. Add detailed notes in Figma and epic context to document expected behaviors, interactions, and business logic.

---

### Troubleshooting Tips

#### Tip 1: Improving Analysis Quality

To get better scope analysis:
- **Add explicit epic context** in a "Context" section:
  - Priorities (e.g., "Priority: Mobile-first experience")
  - Existing features (e.g., "Existing: User authentication and navigation")
  - Out-of-scope features (e.g., "Out of scope: Admin features - separate epic")
  - Low-priority features (e.g., "Low priority: Export functionality - implement at end")
  - Constraints (e.g., "Constraint: Must work offline")
- **Add Figma notes** near your screens explaining behaviors, interactions, and business logic
- **Be explicit** - the more context you provide, the more accurate the categorization

#### Tip 2: Try Again

If the generated scope analysis isn't quite right:
1. Update your epic context with clearer scope statements
2. Re-run the tool - it will be faster the second time (reuses screen analysis from previous run within 24 hours)
3. Each run may produce slightly different results due to AI variability

#### Tip 3: Check Your Figma Links

If the tool can't find your screens:
- Verify the Figma URLs in your epic description are accessible
- Make sure you're logged into the correct Figma account
- Try copying the URL directly from your browser's address bar while viewing the design

#### Tip 4: Start Simple

If you're getting confusing categorizations:
- Start with a smaller epic focused on one feature area
- Link to specific Figma pages instead of entire files
- Use fewer screens initially (5-10 is ideal for first attempts)
- Provide very explicit epic context about what's in/out of scope

## Comparison with Write-Shell-Stories

| Tool | Purpose | Output | When to Use |
|------|---------|--------|-------------|
| `analyze-feature-scope` | Scope definition | Feature areas with ☐ ✅ ⏬ ❌ ❓ | Beginning of project, scope questions exist |
| `write-shell-stories` | Implementation planning | Numbered shell stories with dependencies | After scope is clear, ready to create tickets |

**Typical workflow:**
1. Run `analyze-feature-scope` to establish scope boundaries
2. Review scope analysis and answer questions
3. Update epic context with clarifications
4. Run `write-shell-stories` to generate implementation stories
5. Shell stories automatically respect scope boundaries established in analysis
