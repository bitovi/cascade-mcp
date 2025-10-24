# Write Next Story Tool - Implementation Plan

## Overview

This tool writes the next Jira story from a list of shell stories in an epic. It ensures dependencies are up-to-date before writing, and marks completed stories with Jira links and timestamps.

## Tool Specification

**Tool Name**: `write-epics-next-story`

**Required Arguments**:
- `epicKey` - The Jira epic key (e.g., "PROJ-123")

**Optional Arguments**:
- `siteName` - Name of the Jira site
- `cloudId` - Cloud ID of the Jira site

## High-Level Workflow

1. **Fetch Epic** - Get epic description containing shell stories
2. **Find Next Story** - Identify first unwritten shell story
3. **Validate Dependencies** - Ensure dependency stories are current
4. **Generate Story** - Create full Jira story using AI
5. **Create Jira Issue** - Post story as new Jira issue
6. **Update Epic** - Mark shell story as completed with link and timestamp

## Detailed Implementation Steps

### Step 1: Create Tool Registration

**What to do**: 
- Create new file `server/providers/combined/tools/writing-shell-stories/write-next-story.ts`
- Follow the pattern from `write-shell-stories.ts` and `atlassian-get-issue.ts`
- Register tool with MCP server similar to other tools

**Files to reference**:
- `server/providers/combined/tools/writing-shell-stories/write-shell-stories.ts` (lines 127+)
- `server/providers/atlassian/tools/atlassian-get-issue.ts` (lines 43+)

**How to verify**:
- Run `npm run start-local`
- Tool appears in MCP tool list
- Can call tool with epicKey parameter (even if not fully implemented)

### Step 2: Fetch Epic and Extract Shell Stories

**What to do**:
- Use `getAuthInfoSafe()` to get Atlassian token
- Use `resolveCloudId()` to get cloud ID
- Use `getJiraIssue()` to fetch epic (with `expand=changelog` to support future dependency validation)
- Use `convertAdfToMarkdown()` to convert epic description to markdown
- Parse markdown to extract Shell Stories section

**Required utilities** (already exist):
- `getAuthInfoSafe()` from `mcp-core/auth-helpers.ts`
- `resolveCloudId()` from `atlassian-helpers.ts`
- `getJiraIssue()` from `atlassian-helpers.ts` - Note: Will need to pass `expand=changelog` in fields parameter
- `convertAdfToMarkdown()` from `markdown-converter.ts`

**How to verify**:
- Log the epic description markdown
- Confirm Shell Stories section is present
- Parse and log shell story titles as array
- Verify changelog data is available (for future use in Step 5)

### Step 3: Parse Shell Stories Structure

**What to do**:
- Create parser function to extract individual shell stories from markdown
- Each story has format: `` `st001` **[Title](url)** – Description _timestamp_ ``
- Extract: story ID, title, Jira URL (if present), timestamp (if present)
- Parse sub-bullets: SCREENS, DEPENDENCIES, ✅, ❌, ❓

**Data structure to create**:
```typescript
interface ParsedShellStory {
  id: string;              // "st001"
  title: string;           // Story title
  description: string;     // One-sentence description
  jiraUrl?: string;        // URL if already written
  timestamp?: string;      // ISO 8601 timestamp if written
  screens: string[];       // Figma URLs
  dependencies: string[];  // Array of story IDs
  included: string[];      // ✅ bullets
  excluded: string[];      // ❌ bullets
  questions: string[];     // ❓ bullets
  rawContent: string;      // Full markdown for this story
}
```

**How to verify**:
- Parse test epic with multiple stories
- Log parsed structure for each story
- Verify all fields are correctly extracted
- Test with stories that have Jira URLs and without

### Step 4: Find Next Unwritten Story

**What to do**:
- Iterate through parsed shell stories
- Find first story where `jiraUrl` is undefined/empty
- This becomes `storyToWrite`

**Edge cases to handle**:
- All stories already written → return message "All stories complete"
- No shell stories found → return error
- Epic missing Shell Stories section → return error

**How to verify**:
- Create test epic with mix of written/unwritten stories
- Confirm correct story is identified
- Test edge cases above

### Step 5: Validate and Update Dependencies

**What to do**:
For each dependency story ID in `storyToWrite.dependencies`:
1. Find the dependency in parsed stories array
2. If dependency not yet written (no `jiraUrl`) → return error
3. If dependency has `jiraUrl`:
   - Fetch the Jira issue using `getJiraIssue()` with `expand=changelog` parameter
   - Extract the most recent update timestamp from changelog
   - Compare with dependency's `timestamp` in shell story
   - If Jira issue updated more recently → mark for regeneration

**Fetching changelog**:
- Use `getJiraIssue()` with fields parameter including changelog
- URL format: `/rest/api/3/issue/${issueKey}?expand=changelog`
- Response includes `changelog.histories[]` array with updates
- Get most recent: `changelog.histories[0].created` (sorted newest first)
- Each history has: `id`, `created` (ISO timestamp), `items[]` (changes)

**Regeneration logic** (if dependency changed):
- Need to re-analyze the screens for that dependency
- Generate new shell story content for that dependency only
- Update the dependency's entry in epic's Shell Stories section
- Update timestamp to match Jira's latest update

**How to verify**:
- Test with story that has dependencies
- Log comparison of timestamps
- Verify changelog is returned from `getJiraIssue()`
- Manually update a dependency story in Jira
- Verify regeneration is triggered
- Confirm epic is updated with new content and latest timestamp

### Step 6: Generate Full Story Content

**What to do**:
- Create prompt for AI to generate full Jira story
- Use story writing guidelines from Bitovi
- Include context from: shell story content, dependency stories, screen analysis files

**Loading screen analysis files and images**:
- Extract screen names from SCREENS bullets (use link text as analysis file identifier)
- Check temp folder for existing `.analysis.md` files (from previous `write-shell-stories` run)
- If analysis files missing → regenerate them using shared helper (see Considerations)
- Check temp folder for Figma image downloads
- If images missing → re-download them
- Reusable helper should support both this tool and other future tools

**Prompt should include**:
- Shell story details (✅ ❌ ❓ bullets)
- Dependency story summaries (for context) - just shell story content, not full Jira descriptions
- Screen analysis files referenced in SCREENS bullets
- Figma images (if available and deemed useful - see Considerations)
- Story writing format requirements
- Nested Gherkin format for acceptance criteria

**Required sections** (per spec):
1. User Story (As a … I want … so that …)
2. Supporting Artifacts
3. Out of Scope
4. Non-Functional Requirements
5. Developer Notes
6. Acceptance Criteria (nested Gherkin with Figma images)

**How to verify**:
- Generate story for simple test case
- Check all required sections present
- Verify Figma images embedded in acceptance criteria
- Validate Gherkin format (**GIVEN**, **WHEN**, **THEN** bolded)
- Confirm no speculative features added
- Test with missing analysis files to verify regeneration works
- Test with cached analysis files to verify reuse works

### Step 7: Create Jira Issue

**What to do**:
- Convert generated markdown story to ADF using `convertMarkdownToAdf()`
- Validate ADF using `validateAdf()`
- Create new Jira issue as subtask of epic
- Use Jira REST API: `POST /rest/api/3/issue`
- After creation, add blocker links for all immediate dependencies

**Issue payload structure**:
```typescript
{
  fields: {
    project: { key: "..." },
    parent: { key: epicKey },
    summary: storyToWrite.title,
    description: adfDocument,
    issuetype: { name: "Story" }
  }
}
```

**Adding blocker relationships**:
- After issue is created, iterate through `storyToWrite.dependencies`
- For each dependency that has a `jiraUrl`, extract the issue key
- Create "is blocked by" link using: `POST /rest/api/3/issueLink`
- Link payload structure:
```typescript
{
  type: {
    name: "Blocks"  // This creates "dependency blocks new story" relationship
  },
  inwardIssue: {
    key: newStoryKey  // The story we just created
  },
  outwardIssue: {
    key: dependencyKey  // The dependency story
  }
}
```

**How to verify**:
- Create test issue in Jira
- Verify it appears as subtask of epic
- Check description renders correctly
- Confirm all formatting preserved
- Verify blocker links created for all dependencies
- Check that blocking relationships display correctly in Jira UI
- Confirm link direction is correct (dependencies block the new story)

### Step 8: Update Epic with Completion Marker

**What to do**:
- Get current epic description (ADF format) from Step 2
- Traverse ADF to find the Shell Stories section
- Within that section, find the specific shell story list item by story ID (`` `st001` ``)
- Update the ADF nodes to add Jira link and timestamp
- Update epic using Jira API directly with modified ADF

**ADF Update Strategy** (avoid markdown conversion):
- Work directly with ADF document structure
- Shell story entries are list items (`bulletList` → `listItem` nodes)
- Find list item containing the story ID as inline code (`` `st001` ``)
- Update text nodes to wrap title in link mark
- Add timestamp as text node with emphasis mark
- Pattern: `inlineCard` or `text` with `link` mark for URL

**Alternative approach** (if ADF manipulation is complex):
- Extract just the Shell Stories section to markdown using `convertAdfToMarkdown()`
- Update the markdown for that one story entry
- Convert updated section back to ADF using `convertMarkdownToAdf()`
- Replace the Shell Stories section in the original ADF
- This limits conversion scope to just the section being modified

**Timestamp format**:
- Use ISO 8601 with timezone: `new Date().toISOString()`
- Example: `2025-10-23T14:30:00Z`
- Wrap in emphasis/italic: `_2025-10-23T14:30:00Z_`

**How to verify**:
- Check epic description updated in Jira
- Verify link is clickable and points to new story
- Confirm timestamp is parsable by JS: `new Date(timestamp)`
- Verify other stories in the list remain unchanged
- Test with multiple updates to ensure no corruption

### Step 9: Error Handling and Edge Cases

**What to do**:
- Handle missing dependencies gracefully
- Validate shell story format before processing
- Handle Jira API errors (auth, network, validation)
- Provide clear error messages for each failure mode

**Error scenarios to handle**:
- Epic not found
- Epic has no Shell Stories section
- No unwritten stories found
- Dependency not found
- Dependency not yet written
- Failed to fetch dependency from Jira
- Failed to create Jira issue
- Failed to update epic

**How to verify**:
- Test each error scenario
- Confirm meaningful error messages returned
- Verify partial operations don't corrupt epic

### Step 10: Integration Testing

**What to do**:
- Create end-to-end test with real epic
- Run full workflow from fetch to epic update
- Verify second run picks up next story
- Test dependency validation with updated Jira issues

**Test scenarios**:
1. Write first story (no dependencies)
2. Write second story (depends on first)
3. Update first story in Jira, write third story (depends on first)
4. Verify regeneration triggered

**How to verify**:
- All stories created successfully
- Epic properly updated after each story
- Dependencies validated correctly
- Regeneration works when needed

## Questions

**Q1**: Should we regenerate dependency stories automatically, or ask the user first?

Automatically.  There is no way to ask the user. 

**Q2**: When regenerating a dependency's shell story content, should we only update the content in the epic's Shell Stories section, or also update the actual Jira issue description?

Update the description too if it has changed.

**Q3**: If a dependency story has changed in Jira but the changes don't affect our current story, should we still regenerate? Or should we do a smart diff?

Always regenerate if the timestamp doesn't match. We can't know if changes affect the current story without doing the full analysis anyway. The dependency relationship exists because it's a blocker - any changes to blockers should be reflected in dependent stories. Simpler to always regenerate than to try to determine impact.

**Q4**: What should happen if screen analysis files referenced in SCREENS bullets don't exist or can't be loaded?

We should error and let people know the problem.

**Q5**: Should the tool support creating the Jira issue as a "Story" or should the issue type be configurable?

Story for now.  Configurable later.


**Q6**: For the story generation prompt, should we load ALL dependency stories' full content, or just their summaries? (Could be a lot of tokens)

Just the shell story summaries. 

**Q7**: For changelog comparison, should we look at ANY update to the Jira issue, or only specific field changes (like description updates)? The changelog includes all changes (status, assignee, comments, etc.)

Is it harder to look for just description and summary updates?

**Q8**: When using `getJiraIssue()` with `expand=changelog`, should we also specify which fields to return to optimize the response size, or fetch all fields?

If we can specify description and summary, that's all we need I believe.

**Q9**: For Step 8 (updating epic with completion marker), should we work directly with ADF structure or use the hybrid approach (convert just Shell Stories section to markdown, update, convert back)? Direct ADF manipulation is more efficient but more complex. The hybrid approach is safer but does roundtrip conversion.

Which is easier?  Lets start with whatever is easier to accomplish. 

## Story Writing Format Requirements

Stories must follow guidelines from:
- https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/401113200/Story+Writing
- https://bitovi.atlassian.net/wiki/spaces/BITAPP/pages/472580235

**Required sections**:
1. User Story (As a … I want … so that …)
2. Supporting Artifacts (Figma links, analysis files)
3. Out of Scope (❌ bullets from shell story)
4. Non-Functional Requirements
5. Developer Notes (technical dependencies)
6. Acceptance Criteria (nested Gherkin format)

**Nested Gherkin Format**:
```markdown
**GIVEN** [initial state or context]:

![Description of initial state](https://www.figma.com/design/...)

- **WHEN** [user action], **THEN**
  - [expected result 1]
  - [expected result 2]
    
    ![Description of intermediate state](https://www.figma.com/design/...)

  - **WHEN** [subsequent action], **THEN**
    - [expected result]

      ![Description of final state](https://www.figma.com/design/...)
```

**Critical constraints**:
- Base acceptance criteria ONLY on visible designs and analysis files
- Do NOT add speculative features
- AVOID generic styling criteria (spacing, fonts, contrast) - developers will match designs
- Include Figma images inline with relevant acceptance criteria
- Bold all Gherkin keywords: **GIVEN**, **WHEN**, **THEN**


## Considerations

- For now, we should link to the figma screen that best shows the state of the application. Later, I'd like to be able to go within the screens contents and focus on the particular elements that need to be implement.  

- We might not have the screen analysis files to send to the writing stories prompt.  We should check if they are in the temporary folder, but if they are not, we will need to regenerate.  We should make the re-download and build analysis helper in such a way that multiple tools can use it.  We should be able to identify the name of the analysis file from the title of the link in the `SCREENS:` section.

- Besides the screen analysis, should we also provide the images as context to the AI when writing the stories?  If yes, I'd like to check if the temporary folder still has them, if not, we will need to redownload and send them too.  

## Implementation

## Plan

## Questions


