# Story to Shell Story Back Propagation

**Jira Issue**: [FE-625](https://bitovi.atlassian.net/browse/FE-625)  
**Parent Epic**: [FE-526 - Cascading v3: Writing Stories Prompts](https://bitovi.atlassian.net/browse/FE-526)

## Overview

When a user writes a detailed Jira story from a shell story and makes modifications during development, those changes need to be reflected back into the parent epic's shell stories. This tool analyzes a completed story, summarizes it in shell story format, updates the corresponding shell story in the parent epic, and determines if other shell stories need updating based on the changes.

## Context

### Current Workflow
1. User generates shell stories in an epic using `write-shell-stories` tool
2. User generates the first full story using `write-epics-next-story` tool  
3. User modifies details in the full story during implementation
4. **Gap**: Changes are not propagated back to shell stories

### Desired Workflow
1. User generates shell stories in an epic
2. User generates and implements stories sequentially
3. When a story is completed/modified, user runs `update-shell-stories-from-story` tool
4. Tool analyzes the full story and updates shell stories accordingly

### Use Case Example
**Scenario**: Second story after modifications
- Epic has shell stories for a feature
- First story (`st001`) was generated and written
- During implementation, developer added new error handling functionality
- Developer runs the tool on `st001`
- Tool should:
  * Extract current story description and implementation details
  * Summarize story into shell story format (with ☐/⏬/❌/❓ categorization)
  * Replace the original `st001` shell story with updated version
  * Analyze if changes impact other shell stories (e.g., if new shared components were added)
  * Update other shell stories if needed

## Technical Background

### Shell Story Format

Shell stories use a specific markdown format with emoji-based categorization:

```markdown
- `st001` **Story Title** ⟩ One sentence description
  * SCREENS: [Screen Name](figma-url), [Another Screen](figma-url)
  * DEPENDENCIES: st002, st003 (or none)
  * ☐ Included features (what's implemented in this story)
  * ⏬ Low priority features (deferred to later stories - reference with "see st005")
  * ❌ Excluded features (explicitly out of scope)
  * ❓ Open questions about implementation
```

**Key characteristics**:
- Stories are sequential: `st001`, `st002`, etc.
- Each story is incremental and delivers user value
- Stories reference each other via dependencies and deferrals
- Stories map to Figma screens and scope analysis

### Related Tools & Architecture

**Similar tools to reference**:
- `analyze-feature-scope` - Multi-step analysis tool with epic context
- `write-shell-stories` - Generates shell stories from Figma analysis
- `write-epics-next-story` - Creates full Jira stories from shell stories

**Code organization pattern** (from copilot-instructions.md):
```
server/providers/combined/tools/update-shell-stories-from-story/
├── index.ts                           # Export registration function
├── update-shell-stories.ts            # Main tool + workflow step functions
├── story-to-shell-summarizer.ts       # Helper: Summarize story to shell format
└── shell-story-updater.ts             # Helper: Update shell stories in epic
```

## Implementation Plan

### Phase 1: Create Tool Structure

**Create folder structure**:
```
server/providers/combined/tools/update-shell-stories-from-story/
```

**Create core files**:
1. `index.ts` - Export the tool registration function
2. `update-shell-stories.ts` - Main tool handler with MCP registration
3. `core-logic.ts` - Pure business logic (framework-agnostic)

**Validation**: Tool is registered and can be called (even if it returns placeholder message)

### Phase 2: Implement Story Fetching

**Reuse existing helpers** from `atlassian-helpers.ts` and `figma-screen-setup.ts`:

**In `core-logic.ts`**, create function to fetch story and parent context:

```typescript
async function fetchStoryAndParentContext(
  storyKey: string,
  atlassianClient: AtlassianClient,
  cloudId?: string,
  siteName?: string
): Promise<StoryAndParentContext>
```

**This function should**:
1. Use `resolveCloudId()` from `atlassian-helpers.ts` to resolve cloudId
2. Use `getJiraIssue()` from `atlassian-helpers.ts` to fetch story
3. Use `convertAdfToMarkdown()` to convert story description
4. Extract parent epic key from `issue.fields.parent.key`
5. Use `getJiraIssue()` again to fetch parent epic
6. Use `convertAdfToMarkdown()` to convert epic description
7. Return object with:
   ```typescript
   interface StoryAndParentContext {
     storyKey: string;
     storyDescription: string;      // Markdown format
     parentEpicKey: string;
     parentEpicDescription: string; // Markdown format
     cloudId: string;
     projectKey: string;
   }
   ```

**Existing helpers to use**:
- `resolveCloudId(client, cloudId?, siteName?)` - Returns `{ cloudId, siteName, siteUrl }`
- `getJiraIssue(client, cloudId, issueKey, fields?)` - Returns Response
- `handleJiraAuthError(response, operation)` - Throws on auth/permission errors
- `convertAdfToMarkdown(adf)` - Converts ADF to markdown string

**Validation**: 
- Call with test story key `FE-641`
- Verify it returns story description and parent epic `FE-625` description
- Console log should show extracted markdown data
- Verify parent extraction works (check `issue.fields.parent.key`)

### Phase 3: Extract Shell Stories from Epic

**Reuse existing parser**:
- Import `parseShellStories` from `../write-next-story/shell-story-parser.js`
- Extract "## Shell Stories" section from epic description
- Parse into array of `ParsedShellStory` objects

**In `core-logic.ts`**, create function:
```typescript
async function extractShellStoriesFromEpic(
  epicDescription: string
): Promise<ParsedShellStory[]>
```

**This function should**:
1. Find "## Shell Stories" section in epic description
2. Extract markdown content from that section
3. Use `parseShellStories()` to parse shell stories
4. Return parsed array

**Validation**:
- Run on parent epic FE-526
- Verify it extracts shell stories (even if none exist yet)
- Should throw clear error if "## Shell Stories" section not found

### Phase 4: Create Story Summarization Prompt

**Create new file**: `prompt-story-to-shell.ts`

**This file should export**:
```typescript
export const STORY_TO_SHELL_SYSTEM_PROMPT: string;
export const STORY_TO_SHELL_MAX_TOKENS: number;
export function generateStoryToShellPrompt(
  storyDescription: string,
  originalShellStory: ParsedShellStory | null
): string;
```

**Prompt requirements**:
- Analyze the full story description
- Extract key features implemented
- Categorize features using ☐/⏬/❌/❓ format
- Generate shell story format output
- If original shell story exists, maintain SCREENS and update bullets
- Focus on what was actually implemented (not speculative)

**Prompt structure** (similar to existing prompts):
```typescript
export const STORY_TO_SHELL_SYSTEM_PROMPT = `You are an expert at summarizing detailed Jira stories into concise shell story format.

Shell stories use this format:
- \`stXXX\` **Title** ⟩ One sentence description
  * SCREENS: [Screen Name](url)
  * DEPENDENCIES: stXXX
  * ☐ Implemented features
  * ⏬ Features deferred to other stories
  * ❌ Features explicitly excluded
  * ❓ Open questions

Your task: Analyze the full story and create a shell story that accurately reflects what was implemented.`;

export function generateStoryToShellPrompt(
  storyDescription: string,
  originalShellStory: ParsedShellStory | null
): string {
  return `
## FULL STORY DESCRIPTION

${storyDescription}

${originalShellStory ? `
## ORIGINAL SHELL STORY

${originalShellStory.rawMarkdown}
` : ''}

## YOUR TASK

Analyze the full story and generate a shell story in the correct format.

${originalShellStory ? `
- Preserve SCREENS and DEPENDENCIES from original
- Update ☐/⏬/❌/❓ bullets to reflect actual implementation
- Update title if scope changed significantly
` : `
- Determine appropriate title and description
- Create SCREENS and DEPENDENCIES as "unknown" (will need manual review)
- Categorize features into ☐/⏬/❌/❓
`}

OUTPUT ONLY the shell story in markdown format. No explanations.
`;
}
```

**Validation**:
- Create test story description
- Generate prompt
- Verify prompt structure is clear

### Phase 5: Implement Story-to-Shell Summarization

**Create helper file**: `story-to-shell-summarizer.ts`

```typescript
export async function summarizeStoryToShell(
  storyDescription: string,
  originalShellStory: ParsedShellStory | null,
  generateText: GenerateTextFn
): Promise<string>
```

**This function should**:
1. Generate prompt using `generateStoryToShellPrompt()`
2. Call LLM via `generateText()`:
   ```typescript
   const response = await generateText({
     model: 'claude-3-7-sonnet-20250219',
     system: STORY_TO_SHELL_SYSTEM_PROMPT,
     messages: [{
       role: 'user',
       content: prompt
     }],
     max_tokens: STORY_TO_SHELL_MAX_TOKENS
   });
   ```
3. Extract markdown response
4. Parse response to verify it's valid shell story format
5. Return shell story markdown

**Validation**:
- Test with actual story description from FE-641
- Verify output is valid shell story format
- Check categorization makes sense

### Phase 6: Implement Shell Story Update Logic

**Create helper file**: `shell-story-updater.ts`

```typescript
export async function updateShellStoryInEpic(
  epicDescription: string,
  storyId: string,
  newShellStory: string
): Promise<string>
```

**This function should**:
1. Parse shell stories from epic using `parseShellStories()`
2. Find shell story matching `storyId` (e.g., "st001")
3. Replace that shell story's raw markdown with `newShellStory`
4. Reconstruct epic description with updated shell story
5. Return updated epic description

**Edge cases to handle**:
- Story ID not found → throw descriptive error
- Multiple shell story sections → throw error
- Preserve formatting/spacing around shell stories section

**Validation**:
- Create test epic description with multiple shell stories
- Update one story
- Verify only that story changed
- Verify rest of epic description unchanged

### Phase 7: Implement Impact Analysis (Future Enhancement)

**For initial version**: Skip this step. Just update the current story's shell story.

**For future enhancement**, create function:
```typescript
async function analyzeImpactOnOtherStories(
  updatedShellStory: ParsedShellStory,
  allShellStories: ParsedShellStory[],
  generateText: GenerateTextFn
): Promise<ShellStoryUpdate[]>
```

This would:
- Compare updated story with others
- Identify shared components introduced
- Identify dependencies created/removed
- Suggest updates to other shell stories

### Phase 8: Integrate into Main Tool

**In `core-logic.ts`**, create main execution function:

```typescript
export async function executeUpdateShellStoriesFromStory(
  params: UpdateShellStoriesParams,
  deps: ToolDependencies
): Promise<UpdateShellStoriesResult>
```

**Orchestration steps**:
1. Fetch story and parent epic context
2. Extract shell stories from epic
3. Find matching shell story for the current story
4. Summarize current story to shell format
5. Update shell story in epic description
6. Save updated epic description back to Jira
7. Return success with details

**Progress notifications** (similar to other tools):
```typescript
await notify('Fetching story and parent epic...');
await notify('Extracting shell stories from epic...');
await notify('Summarizing story to shell format...');
await notify('Updating epic description...');
```

**Validation**:
- Run full workflow with test story
- Verify epic is updated in Jira
- Check shell story reflects actual story content

### Phase 9: MCP Tool Registration

**In `update-shell-stories.ts`**, implement MCP handler:

```typescript
export function registerUpdateShellStoriesFromStoryTool(mcp: McpServer): void {
  mcp.registerTool(
    'update-shell-stories-from-story',
    {
      title: 'Update Shell Stories from Completed Story',
      description: 'Analyzes a completed Jira story and updates the corresponding shell story in the parent epic. Summarizes the story in shell format and updates other shell stories if changes impact them.',
      inputSchema: {
        storyKey: z.string()
          .describe('Jira story key (e.g., "PROJ-123"). Must be a child of an epic with shell stories.'),
        cloudId: z.string().optional()
          .describe('The cloud ID to specify the Jira site. If not provided, will use the first accessible site.'),
        siteName: z.string().optional()
          .describe('Jira site subdomain (e.g., "bitovi"). Alternative to cloudId.'),
      },
    },
    async ({ storyKey, cloudId, siteName }, context) => {
      // Get auth info
      const authInfo = getAuthInfoSafe(context, 'update-shell-stories-from-story');
      const atlassianToken = authInfo?.atlassian?.access_token;
      
      if (!atlassianToken) {
        return {
          content: [{
            type: 'text',
            text: 'Error: No valid Atlassian access token found.',
          }],
        };
      }
      
      // Create clients
      const atlassianClient = createAtlassianClient(atlassianToken);
      const generateText = createMcpLLMClient(context);
      const notify = createProgressNotifier(context, 4);
      
      // Execute
      const result = await executeUpdateShellStoriesFromStory(
        { storyKey, cloudId, siteName },
        { atlassianClient, figmaClient: null, generateText, notify }
      );
      
      return {
        content: [{
          type: 'text',
          text: `✅ Updated shell story in epic ${result.epicKey}\n\n**Story**: ${result.storyKey}\n**Shell Story ID**: ${result.shellStoryId}\n\nThe parent epic's shell stories have been updated to reflect changes from the completed story.`,
        }],
      };
    }
  );
}
```

**Register in provider index**:
- Add to `server/providers/combined/index.ts`
- Import and call registration function

**Validation**:
- Tool appears in MCP tool list
- Can be called from VS Code Copilot
- Returns success message

### Phase 10: Add REST API Endpoint

**In `server/api/index.ts`**, add endpoint:

```typescript
app.post('/api/update-shell-stories', async (req, res) => {
  try {
    const { storyKey, cloudId, siteName } = req.body;
    
    // Create clients with API credentials
    const atlassianToken = getAtlassianTokenFromRequest(req);
    const atlassianClient = createAtlassianClient(atlassianToken);
    const generateText = createApiLLMClient();
    const notify = createApiProgressNotifier(res);
    
    const result = await executeUpdateShellStoriesFromStory(
      { storyKey, cloudId, siteName },
      { atlassianClient, figmaClient: null, generateText, notify }
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Validation**:
- Endpoint responds to POST requests
- Returns JSON result
- Error handling works

### Phase 11: Create Test Script

**In `scripts/api/`**, create `update-shell-stories.ts`:

```typescript
import { executeUpdateShellStoriesFromStory } from '../../server/providers/combined/tools/update-shell-stories-from-story/core-logic.js';

async function main() {
  const storyKey = process.argv[2] || 'FE-641';
  
  console.log(`Updating shell stories from story: ${storyKey}`);
  
  // Create clients using PAT
  const atlassianClient = createAtlassianClient(process.env.ATLASSIAN_PAT);
  const generateText = createScriptLLMClient();
  const notify = async (msg) => console.log(`  ${msg}`);
  
  const result = await executeUpdateShellStoriesFromStory(
    { storyKey },
    { atlassianClient, figmaClient: null, generateText, notify }
  );
  
  console.log('\n✅ Success:', result);
}

main().catch(console.error);
```

**Add to package.json**:
```json
{
  "scripts": {
    "api:update-shell-stories": "tsx scripts/api/update-shell-stories.ts"
  }
}
```

**Validation**:
- Script runs successfully
- Updates test epic
- Console output shows progress

### Phase 12: Documentation

**Update `server/readme.md`** with:
- New tool description
- Usage examples
- API endpoint documentation

**Create tool README**: `server/providers/combined/tools/update-shell-stories-from-story/README.md`

Document:
- Tool purpose
- Parameters
- Expected format
- Examples
- Error scenarios

**Validation**:
- Documentation is clear
- Examples work
- Screenshots/outputs included

### Phase 13: Testing & Validation

**Manual testing**:
1. Create test epic with shell stories
2. Create test story from shell story
3. Modify test story significantly
4. Run tool on modified story
5. Verify shell story is updated correctly
6. Verify other shell stories unchanged

**Test with FE-625/FE-641**:
1. Use actual Jira issues
2. Run tool on FE-641
3. Verify FE-625 epic is updated
4. Check shell story reflects FE-641 content

**Edge cases to test**:
- Story without parent epic → clear error
- Epic without shell stories section → clear error
- Story ID not matching any shell story → clear error
- Very long story descriptions → handle gracefully
- Story with no description → handle gracefully

**Validation**:
- All test cases pass
- Error messages are helpful
- No data loss in epic descriptions

### Phase 14: Jira Automation (Future)

**For future implementation**, create Jira automation rule:
- Trigger: When story transitions to "Done" or "Ready for Review"
- Action: Call REST API endpoint
- Payload: Story key from trigger

**Configuration needed**:
- API authentication token
- Server URL
- Error handling in automation

## Questions

1. **Should the tool automatically determine which story in the shell stories matches the current story, or should the user specify the shell story ID (e.g., `st001`) as a parameter?**

yes. the shell story will have a link to the story.  We can identify the shell story with the link that points to the story that was updated.

2. **When a story introduces new shared components not in the original shell story, should the tool:**
   - Just update the current story's shell story?
   - Analyze and suggest updates to other stories that might use the component?
   - Create a report of potential impacts without updating?

3. **How should the tool handle stories that significantly diverge from their original shell story (e.g., scope changed by 50%)?**
   - Update the shell story to match?
   - Flag for manual review?
   - Create a "changes report" instead of auto-updating?

4. **Should the tool preserve the original shell story as a "before" snapshot (e.g., in comments or a special section) for comparison purposes?**

5. **What should happen if the story description is empty or minimal? Should the tool:**
   - Error out?
   - Use story comments/attachments as additional context?
   - Create a minimal shell story with placeholders?

6. **Should the tool analyze story subtasks and include their implementation details in the shell story summary?**

7. **For dependencies, if the full story reveals new dependencies not in the original shell story, should the tool:**
   - Automatically add them to DEPENDENCIES?
   - List them separately for review?
   - Analyze if they conflict with existing dependency chains?

8. **What's the priority for the "analyze impact on other stories" feature (Phase 7)? Should it be:**
   - Part of initial MVP?
   - Deferred to future iteration?
   - Implemented as separate tool?

9. **Should the tool support batch updates (multiple stories at once), or is single-story updates sufficient?**

10. **What format should the success message include? Should it show:**
    - Full updated shell story?
    - Just confirmation message?
    - Diff/comparison of before/after?
    - Link to updated epic?




