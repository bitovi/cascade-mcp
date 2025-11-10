# write-epics-next-story

Quick prompt:

> ```
> MCP call write-epics-next-story on https://bitovi.atlassian.net/browse/PLAY-38
> ```

## Purpose

The `write-epics-next-story` tool converts shell stories into fully-detailed Jira stories with comprehensive acceptance criteria, developer notes, and Figma design links. It automates the transition from high-level planning (shell stories) to implementation-ready work items.

**Primary use cases:**
- Convert shell stories into detailed, developer-ready Jira stories
- Ensure all dependencies are completed before starting new work
- Maintain traceability from design to implementation
- Automate story writing with evidence-based acceptance criteria

**What problem it solves:**
- **Time-consuming story writing**: Manually writing detailed stories with proper format takes 15-30 minutes per story
- **Inconsistent story quality**: Human-written stories vary in detail, structure, and clarity
- **Dependency tracking**: Easy to accidentally start stories before their dependencies are complete
- **Design-to-code gap**: Stories often lack direct links back to the specific design screens they implement

## API Reference

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `epicKey` | string | ✅ Yes | Jira epic key (e.g., "PROJ-123" from `https://bitovi.atlassian.net/browse/PROJ-123`). Epic description must contain a "## Shell Stories" section with parsed shell stories. |
| `cloudId` | string | ❌ Optional | The Atlassian cloud ID to specify which Jira site to use. If not provided, will use the first accessible site. |
| `siteName` | string | ❌ Optional | Jira site subdomain (e.g., "bitovi" from `https://bitovi.atlassian.net`). Alternative to `cloudId`. |

### Returns

The tool returns a structured response with:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // Success message with Jira story details
    }
  ]
}
```

**Success response includes:**
- Jira issue key (e.g., "PROJ-124")
- Story title
- Direct link to the created Jira story
- Confirmation that the epic was updated with the completion marker

**Error response includes:**
- Error message describing the failure
- Authentication errors (missing Atlassian or Figma tokens)
- Validation errors (missing shell stories, incomplete dependencies)
- Jira API errors (permission denied, epic not found)

### Dependencies

**Required MCP capabilities:**
- **Sampling** ⚠️ (REQUIRED): This tool uses AI sampling to generate detailed story content from shell stories and screen analyses. Without sampling, the tool cannot create acceptance criteria or developer notes.
- **Multi-provider authentication**: Requires both Atlassian (Jira) and Figma OAuth tokens

**Prerequisites:**
- Epic must contain a "## Shell Stories" section (created by `write-shell-stories` tool)
- At least one shell story must be unwritten (not have a Jira URL)
- All dependencies of the next story must already be written
- Screen analysis files must exist for referenced Figma screens (automatically regenerated if missing)

## Usage Examples

### Natural Language Prompts

These prompts will reliably trigger the `write-epics-next-story` tool:

1. **"Write the next story for epic USER-123"**
2. **"Create the next Jira story from epic PROJ-456"**
3. **"Generate the next story in TEAM-789"**

### Walkthrough: Core Use Case

**Scenario**: You have an epic with shell stories (created by `write-shell-stories`) and want to create the next detailed Jira story.

#### Step 1: Verify prerequisites

Ensure your epic has shell stories in this format:

```markdown
## Shell Stories

- `st001` **User Registration Form** ⟩ Allow users to create an account with email/password
  * SCREENS: [signup-form](https://figma.com/...)
  * DEPENDENCIES: none
  * ✅ Email and password input fields
  * ✅ Submit button with loading state
  * ❌ Social login (defer to st003)
  * ❓ What email validation rules?

- `st002` **Email Verification** ⟩ Send verification email after signup
  * SCREENS: [email-sent](https://figma.com/...)
  * DEPENDENCIES: st001
  * ✅ Verification email sent automatically
  * ✅ Verification link handling
  * ❌ Resend verification (defer to st004)
```

#### Step 2: Call the tool

Ask the AI agent:
```
"Write the next story for epic PROJ-123"
```

#### Step 3: What happens behind the scenes

The tool orchestrates an 8-phase workflow (typically 3-5 minutes):

1. **Setup** (~30 seconds)
   - Fetches the epic from Jira
   - Parses shell stories from the "## Shell Stories" section
   - Identifies which screens are referenced

2. **Find Next Story** (~1 second)
   - Scans shell stories in order to find the first one without a Jira URL
   - In the example above, this would be `st001`

3. **Validate Dependencies** (~1-2 seconds)
   - Checks if all dependencies have Jira URLs (indicating completion)
   - Recursively validates dependencies of dependencies
   - Fails fast if any dependency is incomplete

4. **Regenerate Missing Analyses** (~0-5 minutes, if needed)
   - Checks if analysis files exist for all referenced screens
   - Automatically regenerates any missing `.analysis.md` files using AI vision models
   - Reuses cached analyses if available (within 24 hours)

5. **Generate Story Content** (~1-2 minutes)
   - Reads shell story details and screen analysis files
   - Uses AI to generate comprehensive story following Bitovi's story writing guidelines
   - Creates acceptance criteria in Gherkin format with Figma links
   - Includes developer notes, out-of-scope items, and non-functional requirements
   - [View story generation prompt →](./prompt-story-generation.ts)

6. **Create Jira Issue** (~1-2 seconds)
   - Creates a new Jira story as a subtask of the epic
   - Sets story type, summary, and description
   - Links to dependency stories with "is blocked by" relationships

7. **Update Epic** (~1-2 seconds)
   - Adds Jira URL and timestamp to the shell story in the epic description
   - Preserves all other epic content

8. **Return Result**
   - Reports the created Jira issue key and link

#### Step 4: Review the created Jira story

The tool creates a detailed Jira story like:

**PROJ-124: User Registration Form**

```markdown
As a shopper, 
- __I want__ to create an account with email and password, 
- __so that__ I can access personalized features and save my preferences.

## Supporting Artifacts

- [Signup Form Design](https://www.figma.com/design/.../signup-form)
- [Screen Analysis: Signup Form](./signup-form.analysis.md)

## Out of Scope

- Social login integration (deferred to st003)
- Password strength requirements (to be defined based on security policy)

## Non-Functional Requirements

- Form submission should complete within 2 seconds
- Password must be encrypted before transmission
- Account data must persist across sessions

## Developer Notes

- Email validation should follow RFC 5322 format
- Password field should mask input characters
- Submit button should show loading spinner during API call
- Error messages should appear inline below the relevant field

## Acceptance Criteria

**GIVEN** the user is on the signup page:

[View signup form in Figma](https://www.figma.com/design/.../signup-form)

- **WHEN** the user enters a valid email and password, **THEN**
  - The email field validates format in real-time
  - The password field masks characters as they are typed
  - The submit button is enabled when both fields are valid
  
- **WHEN** the user clicks the submit button with valid data, **THEN**
  - A loading spinner appears on the button
  - The form fields are disabled during submission
  - Upon success, the user is redirected to the email verification page
  
- **WHEN** the user clicks the submit button with invalid data, **THEN**
  - An error message appears below the invalid field
  - The submit button remains enabled to allow correction
  - The form does not submit to the server

- **WHEN** the server returns an error (e.g., email already exists), **THEN**
  - An error message appears: "An account with this email already exists"
  - The form remains populated with the user's input
  - The submit button is re-enabled
```

The epic is also updated with the Jira link:

```markdown
- `st001` **[User Registration Form](https://bitovi.atlassian.net/browse/PROJ-124)** ⟩ Allow users to create an account _(2025-11-09T10:30:00Z)_
```

#### Step 5: Continue with remaining stories

To write the next story (`st002`), simply run the tool again:

```
"Write the next story for epic PROJ-123"
```

The tool will automatically:
- Find `st002` (the next unwritten story)
- Validate that `st001` is complete (has a Jira URL)
- Generate and create the story

### Setup Requirements

Before using this tool, ensure:

1. **Shell stories exist** in the epic under a "## Shell Stories" section (created by `write-shell-stories` tool)
2. **Shell stories follow the expected format**:
   - Start with `` `st###` **Title** ⟩ Description ``
   - Include `SCREENS`, `DEPENDENCIES`, ✅, ❌, ❓ bullets
3. **Dependencies are complete** for the story you want to write
4. **Authentication is complete** for both Atlassian and Figma providers
5. **Figma designs are accessible** (for screen analysis regeneration if needed)

### Related Tools

Tools commonly used with `write-epics-next-story`:

- **`write-shell-stories`** - Use this tool first to generate the shell stories that `write-epics-next-story` converts into full Jira stories
- **`atlassian-get-issue`** - Fetch the epic to review shell stories before writing
- **`atlassian-update-issue-description`** - Manually update epic if you need to adjust shell story content
- **`figma-get-metadata-for-layer`** - Inspect Figma layers if you need more design detail for story writing

## Debugging & Limitations

### Common User-Facing Errors

#### 1. Authentication Errors

**Error**: `"Error: No valid Atlassian access token found in session context."`

**Explanation**: The tool requires an active Atlassian OAuth session.

**Solution**: Authenticate with Atlassian through the MCP client (VS Code Copilot). The client will prompt you to log in via OAuth.

---

**Error**: `"Error: No valid Figma access token found. Please authenticate with Figma."`

**Explanation**: The tool requires an active Figma OAuth session (for regenerating screen analyses if needed).

**Solution**: Authenticate with Figma through the MCP client. You'll be prompted to authorize access to your Figma account.

---

#### 2. No Shell Stories Found

**Error**: `"Epic PROJ-123 does not contain a '## Shell Stories' section."`

**Explanation**: The epic doesn't have shell stories, which are required input for this tool.

**Solution**:
- First run the `write-shell-stories` tool on this epic to generate shell stories
- Verify the epic description contains a "## Shell Stories" heading

---

**Error**: `"No shell stories found in epic PROJ-123."`

**Explanation**: The "## Shell Stories" section exists but is empty or improperly formatted.

**Solution**:
- Re-run the `write-shell-stories` tool to regenerate shell stories
- Manually verify shell stories follow the format: `` `st001` **Title** ⟩ Description ``

---

#### 3. All Stories Complete

**Error**: `"All stories in epic PROJ-123 have been written! 🎉 Total stories: 5"`

**Explanation**: Every shell story in the epic already has a Jira URL (completion marker).

**Solution**: This is success! All planned stories are complete. If you need more stories:
- Add new shell stories manually to the epic
- Or create a new epic for the next feature set

---

#### 4. Incomplete Dependencies

**Error**: `"Dependency st001 must be written before st002. Please write story st001 first."`

**Explanation**: The next unwritten story depends on another story that hasn't been completed yet.

**Solution**:
- Write the dependency story first by running the tool again (it will automatically pick up st001)
- Or, if the dependency is incorrect, manually edit the epic to update the DEPENDENCIES line

---

**Error**: `"Dependency st003 not found in shell stories for st002."`

**Explanation**: A dependency ID doesn't match any shell story in the epic.

**Solution**: Manually edit the epic to fix the dependency reference (check for typos like `st3` vs `st003`)

---

#### 5. Epic Not Found

**Error**: `"⚠️ Epic PROJ-123 not found"`

**Explanation**: The specified epic key doesn't exist or you don't have permission to view it.

**Solution**:
- Verify the epic key is correct (case-sensitive)
- Ensure your Atlassian account has permission to view the epic
- Check that you're connected to the correct Jira site (use `cloudId` or `siteName` parameter)

---

#### 6. Insufficient Permissions

**Error**: `"⚠️ Insufficient permissions to create issues in project PROJ"`

**Explanation**: Your Atlassian account doesn't have permission to create stories in this project.

**Solution**:
- Request "Create Issues" permission from your Jira administrator
- Verify you're logged into the correct Atlassian account

---

### Known Limitations

#### 1. Sequential Story Creation

**Limitation**: The tool only writes one story at a time, always choosing the first unwritten story with satisfied dependencies.

**Workaround**: If you want to write stories out of order:
- Manually add a Jira URL to shell stories you want to skip
- Use a placeholder URL like `https://bitovi.atlassian.net/browse/SKIP-1`
- The tool will skip stories with URLs

---

#### 2. Story Format Constraints

**Limitation**: Generated stories follow Bitovi's specific story writing format, which may not match your organization's standards.

**Workaround**: 
- Edit the generated Jira stories after creation to match your format
- Or fork the codebase and customize `story-writing-guidelines.md`

---

#### 3. Evidence-Based Content Only

**Limitation**: The AI strictly follows an "evidence-based" approach - it only includes details from:
- Shell story content (✅ included items)
- Screen analysis files
- Dependency story context

This means it will NOT add:
- Assumed or generic behaviors
- Standard UX patterns not shown in designs
- Implementation details not mentioned in analyses

**Workaround**: This is intentional to prevent over-engineering. To get more detailed stories:
- Add more detail to Figma notes before running `write-shell-stories`
- Manually edit shell stories to include more ✅ bullets
- Accept that some implementation details will be filled in during development

---

#### 4. Regeneration Overhead

**Limitation**: If screen analysis files are missing (e.g., temp directory cleared), the tool will regenerate them, which adds 1-2 minutes per screen.

**Workaround**: 
- Run the tool within 24 hours of running `write-shell-stories` to reuse cached analyses
- For large epics, write multiple stories in the same session to avoid regeneration

---

### Troubleshooting Tips

#### Tip 1: Check Shell Story Format

If the tool can't find or parse shell stories:
- View your epic in Jira and verify the "## Shell Stories" section exists
- Check that story IDs are in backticks: `` `st001` `` not just `st001`
- Verify the separator between title and description is ⟩ (right angle quotation mark)

Copy-paste this template if needed:
```markdown
## Shell Stories

- `st001` **Story Title** ⟩ One-sentence description
  * SCREENS: [screen-name](figma-url)
  * DEPENDENCIES: none
  * ✅ Included functionality
  * ❌ Excluded functionality
  * ❓ Open questions
```

#### Tip 2: Review Generated Stories

After the tool creates a story:
- Review the Jira story for accuracy
- Check that acceptance criteria match your expectations
- Verify Figma links are correct
- Edit the story directly in Jira if needed

The AI generates high-quality content but may occasionally need human refinement.

#### Tip 3: Handle Dependency Errors

If you get a dependency error:
- Check if the dependency ID exists in the shell stories list
- Verify the dependency story has been written (has a Jira URL)
- If needed, temporarily remove the dependency from the shell story to unblock

#### Tip 4: Write Stories in Batches

For efficiency:
- Run the tool multiple times in succession (within 24 hours)
- This reuses cached screen analyses and temp directories
- Typical pace: 3-5 minutes per story when cached, 5-10 minutes with regeneration

## Architecture Notes

### Workflow Phases

The tool implements an 8-phase workflow:

1. **Setup**: Fetch epic, parse Figma URLs, identify screens
2. **Extract Shell Stories**: Parse "## Shell Stories" section
3. **Find Next Story**: Identify first unwritten story
4. **Validate Dependencies**: Check all dependencies are complete
5. **Regenerate Analyses**: Create missing screen analysis files
6. **Generate Content**: Use AI to create full story with acceptance criteria
7. **Create Jira Issue**: Create subtask with blocker links
8. **Update Epic**: Add Jira URL and timestamp to shell story

### Evidence-Based Story Generation

The tool follows strict principles:
- **No speculation**: Only document what's in shell stories and screen analyses
- **Traceability**: Every detail links back to designs or dependencies
- **Gherkin format**: All acceptance criteria use GIVEN/WHEN/THEN structure
- **Figma links**: Direct links to design screens in acceptance criteria

This approach ensures stories are grounded in actual requirements and designs.

### Story Writing Guidelines

The AI uses Bitovi's internal story writing guidelines, which specify:
- User story format: "As a [role], I want [goal], so that [benefit]"
- Required sections: Supporting Artifacts, Out of Scope, Non-Functional Requirements, Developer Notes, Acceptance Criteria
- Gherkin keywords in bold: **GIVEN**, **WHEN**, **THEN**
- Figma links embedded directly in acceptance criteria

See [`story-writing-guidelines.md`](./story-writing-guidelines.md) for the complete format.

### Temporary Storage

The tool reuses temporary directories created by `write-shell-stories`:
- **Pattern**: `shell-stories-{sessionId}-{epicKey}`
- **Lifecycle**: 24-hour automatic cleanup
- **Reuse**: Existing screen analyses are reused to avoid regeneration
- **Regeneration**: Missing analyses are automatically recreated
