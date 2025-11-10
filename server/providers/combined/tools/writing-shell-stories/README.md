# write-shell-stories

Quick prompt:

> ```
> MCP call write-shell-stories on https://bitovi.atlassian.net/browse/PLAY-38 
> ```

## Purpose

The `write-shell-stories` tool generates prioritized shell stories from Figma designs linked in a Jira epic. Shell stories are lightweight, rough outlines that describe scope and surface risks before creating full tickets.

**Primary use cases:**
- Generate user stories from Figma design mockups automatically
- Analyze UI screens and create evidence-based story breakdowns
- Prioritize features based on customer value and dependencies
- Surface technical questions and risks early in the planning process

**What problem it solves:**
- **Manual story writing is time-consuming**: Converting Figma designs to Jira stories manually takes hours
- **Inconsistent story quality**: Human-written stories often miss details or make unjustified assumptions
- **Lack of traceability**: Stories don't always link back to the designs they implement
- **Over-scoping**: Stories often try to implement too much at once instead of incremental value delivery

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
- Number of shell stories generated
- Number of screens analyzed
- Path to temporary directory containing analysis artifacts
- Link to updated Jira epic

**Error response includes:**
- Error message describing the failure
- Authentication errors (missing Atlassian or Figma tokens)
- Jira API errors (epic not found, permission denied)

### Dependencies

**Required MCP capabilities:**
- **Sampling** ⚠️ (REQUIRED): This tool uses AI sampling to analyze Figma screens and generate shell stories. Without sampling, the tool cannot perform screen analysis or story generation.
- **Multi-provider authentication**: Requires both Atlassian (Jira) and Figma OAuth tokens

**Prerequisites:**
- User must be authenticated with Atlassian
- User must be authenticated with Figma
- Epic must exist and be accessible by the authenticated user
- Epic description must contain at least one valid Figma design URL

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `write-shell-stories` tool:

1. **"Generate shell stories from the Figma designs in epic USER-123"**
2. **"Write shell stories for epic PROJ-456 based on the Figma mockups"**
3. **"Create user stories from the Figma links in TEAM-789"**

### Walkthrough: Core Use Case

**Scenario**: You have a Jira epic with Figma design links and want to generate prioritized user stories.

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

Example epic description:
```markdown
# User Onboarding Flow

Design: https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/User-onboarding-designs?node-id=246-3414

## Context
- Priority: Focus on basic sign-up flow first
- Out of scope: Social login integrations (defer to Phase 2)
- Constraint: Must work on mobile devices
```

#### Step 2: Call the tool

Ask the AI agent:
```
"Generate shell stories from the Figma designs in epic PROJ-123"
```

#### Step 3: What happens behind the scenes

The tool orchestrates a 6-phase workflow (typically 10-15 minutes total):

1. **Preparation** (~2-3 minutes)
   1. Fetches your epic and extracts Figma URLs
   2. Downloads screen designs and associated notes from Figma
   3. Organizes screens in the order they appear in your design

2. **AI Screen Analysis** (~5-10 minutes for 5-10 screens)
   1. Analyzes each screen's UI elements, interactions, and purpose using AI vision models
   2. Reads any notes you've added in Figma to understand context
   3. [View screen analysis prompt →](./prompt-screen-analysis.ts)

3. **Shell Story Generation** (~2-3 minutes)
   1. Synthesizes all screen analyses into prioritized user stories
   2. Follows evidence-based principles (only documents what's visible in designs)
   3. Breaks features into incremental, deliverable stories with dependencies
   4. [View shell story generation prompt →](./prompt-shell-stories.ts)

4. **Jira Update** (~1-2 seconds)
   1. Writes generated shell stories back to your epic under a "## Shell Stories" section
   2. Preserves all existing epic content

#### Step 4: Review the results

The tool updates your Jira epic with generated stories like:

```markdown
## Shell Stories

- `st001` **User Registration Form (Basic)** ⟩ Allow new users to create an account with email and password
  * SCREENS: [signup-form](https://www.figma.com/design/.../node-id=123-456), [signup-success](https://www.figma.com/design/.../node-id=123-457)
  * DEPENDENCIES: none
  * ✅ Email and password input fields
  * ✅ Submit button with loading state
  * ✅ Success confirmation screen
  * ❌ Password strength indicator (defer to st003)
  * ❌ Social login buttons (out of scope per epic context)
  * ❓ What email validation rules should we enforce?

- `st002` **Email Verification Flow** ⟩ Send verification email and allow users to confirm their account
  * SCREENS: [email-sent](https://www.figma.com/design/.../node-id=123-458), [email-verified](https://www.figma.com/design/.../node-id=123-459)
  * DEPENDENCIES: st001
  * ✅ Verification email sent automatically after signup
  * ✅ Verification link handling
  * ✅ Confirmation screen after successful verification
  * ❌ Resend verification email (defer to st004)
  * ❓ How long should verification links remain valid?

- `st003` **Password Strength Indicator** ⟩ Show real-time password strength feedback during registration
  * SCREENS: [signup-form](https://www.figma.com/design/.../node-id=123-456)
  * DEPENDENCIES: st001
  * ✅ Visual strength meter (weak/medium/strong)
  * ✅ Real-time validation as user types
  * ❌ Password requirements tooltip (defer to st005)
  * ❓ What criteria define weak/medium/strong passwords?
```

#### Step 5: Review and refine the shell stories

**⚠️ Important: Shell stories are meant to be reviewed and edited before creating actual Jira stories.**

The generated shell stories are a starting point. You should:

1. **Adjust scope** by moving items between included (✅) and deferred (❌) bullets:
   ```markdown
   # Before:
   * ✅ Advanced filtering with multiple criteria
   * ❌ Basic status filter
   
   # After (if you want to start simpler):
   * ✅ Basic status filter
   * ❌ Advanced filtering with multiple criteria (defer to st008)
   ```

2. **Answer open questions** (❓) inline by converting them to implementation notes or deferring them:
   ```markdown
   # Before:
   * ❓ What email validation rules should we enforce?
   
   # After:
   * ✅ Email validation (RFC 5322 format, no disposable domains)
   # Or defer:
   * ❌ Email validation rules (defer until backend API is defined)
   ```

3. **Add new shell stories** if you identify missing functionality:
   - Follow the same format: `` `st###` **Title** ⟩ Description ``
   - Use the next available story number (e.g., `st004`, `st005`)
   - Include all required sections: SCREENS, DEPENDENCIES, ✅, ❌, ❓

4. **Reorder stories** to match your preferred implementation sequence

5. **Update dependencies** if you change story order or scope

**Format to maintain:**
```markdown
- `st001` **Story Title** ⟩ One-sentence description
  * SCREENS: [screen-name](figma-url)
  * DEPENDENCIES: st002, st003 (or "none")
  * ✅ Included functionality
  * ❌ Deferred functionality (defer to st###)
  * ❓ Open questions
```

Once refined, these shell stories become the input for the [`write-epics-next-story`](../write-next-story/README.md) tool to create detailed Jira stories.

### Setup Requirements

Before using this tool, ensure:

1. **Jira Epic exists** with Figma design links in the description
2. **Figma designs are accessible** by your authenticated Figma account
3. **Authentication is complete** for both Atlassian and Figma providers
4. **Epic context (optional)** includes priorities, scope constraints, or deferred features to guide story generation

### Related Tools

Tools commonly used with `write-shell-stories`:

- **`write-epics-next-story`** - After generating shell stories, use this tool to convert individual shell stories into full Jira stories
- **`atlassian-get-issue`** - Fetch the epic to review current content before generating stories
- **`atlassian-update-issue-description`** - Manually update epic descriptions if needed
- **`figma-get-metadata-for-layer`** - Inspect individual Figma layers if you need more design detail
- **`figma-get-image-download`** - Download specific Figma screens independently

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

**Workaround**: 
- Add detailed notes in Figma explaining interactive behaviors
- Use clear, high-contrast designs for better OCR/vision model accuracy
- Review generated analysis files in the temp directory and regenerate if needed

---

#### 3. Token Limits

**Limitation**: Very large Figma files (50+ screens) may exceed AI token limits or take a long time to process.

**Workaround**:
- Break large projects into multiple epics
- Link to specific Figma pages instead of entire files
- Focus each epic on a specific feature area

---

#### 4. Evidence-Based Story Generation

**Limitation**: The tool strictly follows an "evidence-based" approach - it only creates stories for functionality explicitly shown in Figma screens. This means:
- No assumed or implied features
- No "standard" behaviors unless documented
- UI elements without described behaviors become questions (❓)

**Workaround**: This is intentional behavior. Add detailed notes in Figma to document expected behaviors, interactions, and business logic.


### Troubleshooting Tips

#### Tip 1: Improving Story Quality

To get better shell stories:
- **Add Figma notes** near your screens explaining behaviors, interactions, and business logic
- **Add context to your epic description** with a "Context" section that mentions:
  - Priorities (e.g., "Priority: Mobile-first experience")
  - Out-of-scope features (e.g., "Out of scope: Admin features")
  - Constraints (e.g., "Constraint: Must work offline")

The AI will use this information to prioritize stories, defer out-of-scope features, and ask better questions.

#### Tip 2: Try Again

If the generated stories aren't quite right:
1. Re-run the tool - it will be faster the second time (reuses previous work within 24 hours)
2. Each run may produce slightly different results due to AI variability

#### Tip 3: Check Your Figma Links

If the tool can't find your screens:
- Verify the Figma URLs in your epic description are accessible
- Make sure you're logged into the correct Figma account
- Try copying the URL directly from your browser's address bar while viewing the design

#### Tip 4: Start Simple

If you're getting too many or too complex stories:
- Start with a smaller epic focused on one feature area
- Link to specific Figma pages instead of entire files
- Use fewer screens initially (5-10 is ideal for first attempts)

## Architecture Notes

### Workflow Phases

The tool implements a 6-phase workflow:

1. **Phase 1**: Fetch epic and extract Figma URLs
2. **Phase 2**: Parse Figma URLs and fetch metadata
3. **Phase 3**: Generate screens.yaml with spatial analysis
4. **Phase 4**: Download images and analyze screens with AI
5. **Phase 5**: Generate shell stories from analyses
6. **Phase 6**: Update Jira epic with shell stories

### Temporary Storage

The tool uses deterministic temporary directories:
- **Pattern**: `shell-stories-{sessionId}-{epicKey}`
- **Lifecycle**: 24-hour automatic cleanup
- **Reuse**: Existing directories are reused for the same session/epic

### AI Sampling

The tool uses MCP sampling capabilities to:
- Analyze individual screens (Claude vision models)
- Generate comprehensive shell stories (Claude text models)

Sampling allows the AI agent to make sub-requests to AI models while maintaining context and authentication.

### Evidence-Based Story Generation

The tool follows strict principles:
- **No speculation**: Only document what's visible in designs
- **Progressive enhancement**: Start simple, defer complexity
- **Incremental value**: Stories represent smallest useful functionality
- **Traceability**: Every story links back to Figma screens

This approach reduces over-engineering and ensures stories are grounded in actual designs.
