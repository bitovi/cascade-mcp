I'd like to incorporate the epic content into the writing-shell-stories tool.

I'd like to load all content that isn't part of the `## Shell Stories` content.

I think we will need to load all the epic content, remove the `## Shell Stories` part
and then pass it as additional context to the `prompt-shell-stories.md`

The content a person could put into their epic could be anything. But we should look for items that:

- influence the priorities of one feature or another
- specify the scope of the epic (it's possible some features are already done or out of scope)

## Key Decisions Summary

### Research Findings

**1. Markdown Formatting for LLMs**
- ✅ Preserve all markdown formatting (bold, italic, links, headers, lists, tables)
- Modern LLMs (GPT-4, Claude) are extensively trained on markdown
- Structure helps AI parse hierarchical information and emphasis
- Links should be preserved as `[text](url)` format for AI parsing

**2. Context Positioning & AI Weighting**
- ✅ Epic context should come BEFORE screen analysis
- **Primacy Effect**: Information presented first gets more weight in decision-making
- Epic context establishes strategic framework (priorities, constraints, scope)
- Screen analysis provides tactical details within that framework
- This order ensures AI prioritizes based on business context, then analyzes screens

**3. Token Limits & Context Length**
- Current system: MCP sampling with Claude (100k-200k token context window)
- Typical usage: ~2k-5k prompt structure + 10k-60k screen analyses
- Epic context at 5k-10k chars (1.25k-2.5k tokens) is easily manageable
- ✅ No truncation needed now - pass entire epic content verbatim
- Future optimization: If needed, add 10k char limit with summarization step

### Architecture Decisions

- **ADF Conversion**: Full markdown with tables, placeholder text for mentions/emojis
- **Error Strategy**: Fallback to plain text if ADF conversion fails (graceful degradation)
- **Multiple Shell Stories Sections**: Return error - user must consolidate
- **Contradiction Handling**: Epic context always takes priority over screen designs
- **Output Enhancement**: Add "## Differences from Design" section for design vs epic mismatches
- **Context Formatting**: Use XML tags `<epic_context>...</epic_context>` for clear AI parsing

## Implementation Plan

### Step 1: Create ADF-to-Markdown converter utility
**Goal**: Convert ADF (Atlassian Document Format) to markdown so we can pass epic content to the AI prompt

**Decisions Applied**:
- ✅ Preserve markdown formatting (bold, italic, links) - LLMs are trained on markdown and use structure for better comprehension
- ✅ Convert tables to markdown table syntax
- ✅ Add placeholder text for unsupported nodes (mentions: `@[username]`, emojis: `:emoji_name:`)
- ✅ Preserve inline cards as markdown links `[text](url)` - AI can parse link structure

**Tasks**:
- Create `convertAdfToMarkdown()` function in `server/providers/atlassian/markdown-converter.ts`
- Handle common ADF node types:
  - Paragraphs → `\n\n`
  - Headings → `# `, `## `, etc. (based on level)
  - Lists (ordered/unordered) → `- ` or `1. `
  - Text marks: bold (`**text**`), italic (`*text*`), links (`[text](url)`)
  - Tables → markdown table syntax (with `|` separators)
  - Code blocks → triple backticks
- Handle special ADF nodes:
  - Inline cards → `[card_text](url)` 
  - Mentions → `@[username]`
  - Emojis → `:emoji_name:`
- Add try/catch with fallback to plain text extraction if conversion fails
- Add unit tests for common ADF structures

**Verification**:
- Write test cases with sample ADF structures (paragraphs, headings, lists, links, tables)
- Verify markdown output is clean and readable
- Test with actual Jira epic ADF content (can fetch from test epic)
- Ensure Figma URLs are preserved as markdown links
- Test fallback behavior when conversion fails
- Verify table structure is preserved in markdown format 

---

### Step 2: Extract epic context (excluding Shell Stories section)
**Goal**: Load the epic description and remove the `## Shell Stories` section to get only user-authored content

**Decisions Applied**:
- ✅ Error if multiple `## Shell Stories` sections exist - warn user to clean up epic
- ✅ Trim leading/trailing whitespace but preserve internal formatting
- ✅ Must have at least one Figma link (already validated in Phase 1)
- ✅ Empty context after removing Shell Stories is acceptable (epic can be just Figma links)

**Tasks**:
- In `write-shell-stories.ts`, after fetching the epic (Phase 1), extract the description ADF
- **First**, scan for multiple `## Shell Stories` headings using helper function `countADFSectionsByHeading()`
  - If count > 1, return error: "Multiple '## Shell Stories' sections found. Please consolidate into one section."
- Use existing `removeADFSectionByHeading(content, 'shell stories')` to remove Shell Stories section
- Convert remaining ADF content to markdown using the new `convertAdfToMarkdown()` function
- Trim whitespace: `epicContext = markdown.trim()`
- Store the markdown in a variable called `epicContext`

**Verification**:
- Fetch an epic that has both user content and a `## Shell Stories` section
- Verify Shell Stories section is completely removed
- Verify remaining content is converted to clean markdown
- Log the `epicContext` to console and manually review it looks correct
- Test with epic that has NO Shell Stories section (should return full description)
- Test with epic that has Shell Stories at the beginning, middle, and end
- **NEW**: Test with epic containing multiple `## Shell Stories` sections (should error)
- **NEW**: Test epic with only Figma links (no other content) - should succeed with empty context
- Verify whitespace trimming works correctly 

---

### Step 3: Pass epic context to shell story prompt
**Goal**: Enhance the shell story generation prompt with epic context to influence prioritization and scope

**Decisions Applied**:
- ✅ Place epic context BEFORE screen analysis (primacy effect - establishes strategic framework first)
- ✅ Use XML-like tags for clear parsing: `<epic_context>...</epic_context>`
- ✅ Epic content always takes priority over screen designs in case of contradiction
- ✅ Pass context verbatim (no summarization for now - token limits are not an issue)

**Tasks**:
- Modify `generateShellStoryPrompt()` in `prompt-shell-stories.ts` to accept optional `epicContext?: string` parameter
- Add epic context section BEFORE screen analysis inputs:
  ```
  **EPIC CONTEXT (from Epic Description):**
  <epic_context>
  ${epicContext}
  </epic_context>
  ```
- Add new prompt instructions in the PROCESS section:
  - "Use epic context to establish priorities, scope, and constraints"
  - "Epic context takes precedence over screen designs when there are contradictions"
  - "If epic explicitly excludes features visible in screens, defer them with reference to epic"

**Verification**:
- Generate shell stories with NO epic context (should work as before, no `<epic_context>` section)
- Generate shell stories WITH epic context that includes:
  - Specific prioritization guidance (e.g., "Mobile experience is highest priority")
  - Scope limitations (e.g., "Don't implement admin features in Phase 1")
  - Business constraints (e.g., "Must support IE11")
- Test contradiction scenario: Epic says "no filtering" but screen shows filters
  - Verify stories defer filtering with reference to epic in deferral bullets
  - Example: `❌ Filtering functionality (excluded per epic scope - Phase 2)`
- Compare outputs to verify epic context influences story order and scope
- Verify the context section is clearly formatted and easy for AI to parse 

---

### Step 4: Wire epic context through the execution flow
**Goal**: Connect all the pieces in the main `write-shell-stories` tool execution

**Decisions Applied**:
- ✅ Don't save epic context to temp directory (no debugging file needed)
- ✅ Fallback to plain text extraction if ADF conversion fails

**Tasks**:
- In `write-shell-stories.ts`, after Phase 1 (fetch epic), extract epic context:
  ```typescript
  // Extract epic context (after Figma URL extraction)
  let epicContext = '';
  try {
    // Check for multiple Shell Stories sections
    const shellStoriesCount = countADFSectionsByHeading(description.content, 'shell stories');
    if (shellStoriesCount > 1) {
      return {
        content: [{
          type: 'text',
          text: `Error: Epic ${epicKey} contains ${shellStoriesCount} "## Shell Stories" sections. Please consolidate into one section.`
        }]
      };
    }
    
    // Remove Shell Stories section
    const contentWithoutShellStories = removeADFSectionByHeading(description.content, 'shell stories');
    
    // Convert to markdown
    epicContext = await convertAdfToMarkdown({
      version: 1,
      type: 'doc',
      content: contentWithoutShellStories
    });
    epicContext = epicContext.trim();
    
    console.log(`  Epic context extracted: ${epicContext.length} characters`);
    if (epicContext) {
      console.log(`    Preview: ${epicContext.substring(0, 200)}...`);
    }
  } catch (error: any) {
    console.log(`  ⚠️ Failed to extract epic context: ${error.message}`);
    console.log('  Continuing without epic context...');
    epicContext = '';
  }
  ```
- Update `generateShellStoriesFromAnalyses()` function signature to accept `epicContext?: string`
- Pass `epicContext` to `generateShellStoryPrompt()` call
- Add logging to show when epic context is being used

**Verification**:
- Run tool with epic that has rich context (priorities, scope, constraints)
- Verify epic context flows through all function calls
- Check console logs confirm context extraction and usage
- Generate stories and manually review if priorities/scope align with epic context
- Test with empty epic description (should gracefully handle missing context)
- Test ADF conversion failure (temporarily break converter) - should log warning and continue
- Verify error message appears if multiple Shell Stories sections detected 

---

### Step 5: Add progress notifications and error handling
**Goal**: Inform users that epic context is being used and handle edge cases gracefully

**Decisions Applied**:
- ✅ No truncation needed for now - MCP sampling supports large contexts (100k+ tokens via Claude)
- ✅ Future limit (if needed): 10k characters (~2.5k tokens) - then add summarization step
- ✅ ADF conversion failures: log warning and continue without epic context (fallback strategy)
- ✅ Empty context is acceptable (epic can be just Figma links)

**Tasks**:
- Add progress notification after Phase 1: `"Extracting epic content..."`
- Add conditional notification based on epic context:
  - If `epicContext.length > 0`: `"✅ Using ${epicContext.length} chars of epic content"`
  - If `epicContext.length === 0`: `"No additional epic content found (only Figma links)"`
- Handle error cases with user-friendly messages:
  - Multiple Shell Stories sections: Clear error with remediation steps
  - ADF conversion failure: Warning logged, continue without context
  - No Figma URLs: Already handled in Phase 1
- Add informational logging (no warning needed) for epic context length:
  - Console log: `"Epic context length: ${epicContext.length} characters"`

**Verification**:
- Run tool and verify progress notifications appear in correct order:
  1. "Phase 1: Fetching epic from Jira..."
  2. "Extracting epic content..."
  3. "✅ Using X chars of epic content" OR "No additional epic content found"
  4. Continue to Phase 2...
- Test with epic that has only Shell Stories section (should show "No additional epic content found")
- Test with normal epic (should show character count)
- Test ADF conversion error path (should log warning but not fail)
- Verify all error messages are user-friendly and actionable
- Test multiple Shell Stories error (should provide clear remediation) 

---

### Step 6: Update documentation
**Goal**: Document the new epic context feature for users and maintainers

**Tasks**:
- Update `server/readme.md` to document the epic context feature
- Add example of how to structure epic content for best results
- Document what types of content influence priorities and scope
- Add notes about character limits and ADF conversion
- Update tool description in `write-shell-stories.ts` to mention epic context usage

**Verification**:
- Review documentation for completeness
- Ask someone unfamiliar with the feature to read docs and give feedback
- Ensure examples are clear and actionable
- Verify all public-facing descriptions mention epic context

---

### Step 7: Create test epic and validate end-to-end
**Goal**: Validate the complete feature with a real-world test case

**Tasks**:
- Create a test epic in Jira with:
  - User priorities (e.g., "Mobile-first approach critical")
  - Scope limitations (e.g., "Phase 1: Read-only, Phase 2: Edit features")
  - Business constraints (e.g., "Must be accessible, WCAG AA compliant")
  - Link to Figma designs
- Run `write-shell-stories` tool on test epic
- Review generated shell stories to verify:
  - Story order reflects stated priorities
  - Deferred features align with scope limitations and reference epic content
  - Questions reference business constraints
- Compare against baseline (same Figma designs, epic WITHOUT context)

**Verification**:
- Generated stories show clear influence of epic context
- Priorities align with epic statements
- Scope decisions reference epic content in deferral bullets
- Story count and quality remain high
- No regressions in existing functionality

---

## Future Enhancements (Not in Current Scope)

### Phase 2: Differences from Design Section
**When**: After epic context is working well and users request better visibility into design vs scope mismatches

**Approach**:
- Add new prompt instruction to create `### Differences from Design` subsection within `## Shell Stories`
- Nested as h3 under the main `## Shell Stories` heading
- Lists features visible in designs but excluded by epic scope
- Format: Brief bullets like "- Filtering UI (visible in filter-view screen, excluded per epic Phase 1 scope)"

**Implementation Changes**:
- Update `removeADFSectionByHeading()` to handle nested sections or use a new approach
- When replacing `## Shell Stories`, preserve any existing `### Differences from Design` subsection
- Or: Simply replace the entire `## Shell Stories` section (including any subsections) each time

**Alternative Approach**:
- Use a separate `## Differences from Design` section (h2, not nested)
- Update epic replacement logic to remove both sections before adding new content
- Modify `write-shell-stories.ts` Phase 6 to remove both headings:
  ```typescript
  let contentWithoutSections = removeADFSectionByHeading(currentDescription.content, 'shell stories');
  contentWithoutSections = removeADFSectionByHeading(contentWithoutSections, 'differences from design');
  ```

### Phase 3: Epic Content Summarization
**When**: If epic contexts regularly exceed 10k characters and cause token limit issues

**Approach**:
- Add separate MCP sampling call before shell story generation
- Prompt: "Extract priorities, scope decisions, and constraints from this epic content"
- Use summarized output instead of verbatim epic content
- Save both full and summarized versions to temp directory for debugging

### Phase 4: Link Content Incorporation
**When**: After basic epic context is working well

**Approach**:
- Parse markdown links from epic context
- Fetch content from reachable URLs (design docs, specs, etc.)
- Include as additional context: `<linked_document url="...">content</linked_document>`
- Handle authentication and access restrictions gracefully

---

## Open Questions for Follow-up

These questions still need answers before implementation (or can be decided during implementation):
**Question**: Should we create a new helper function `countADFSectionsByHeading()` or modify the existing `removeADFSectionByHeading()` to optionally return a count?
- Option A: New function - cleaner separation of concerns
- Option B: Modify existing - fewer functions, but mixed responsibility
- **Your answer**: 

### Step 6: Documentation Location
**Question**: Should epic context documentation go in `server/readme.md` (technical) or a separate user-facing guide?
- Current `server/readme.md` is quite technical (API details)
- Might need user-friendly examples separate from API docs
- **Your answer**:
