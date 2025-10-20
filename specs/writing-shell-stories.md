## Writing Shell Stories


I'd like to make a sampling-hook based mcp tool that implements similar
behavior in these prompts: https://github.com/bitovi/ai-enablement-prompts/tree/main/writing-stories/from-figma


It should do something like steps 0-4.  


I'd like you to help me build a plan to do this.  

Here's a rough outline of how the tool should work:

1. Writing shell stories should be called with a Jira epic key.
2. The Jira issue's content will be loaded. Figma links will be scanned for.
3. We create a folder to house our temporary data.  
3. Each figma link's metadata will be loaded.  If it's a type CANVAS (we call a page) then all notes and frames using `get-layers-for-a-page`.  


Ultimately, we are finding FRAMES and creating a yaml file in the temporary data for the Jira issue like:

```
# Screen flow order determined from Figma layout
order: "left-to-right, top-to-bottom"  # or "top-to-bottom, left-to-right"
screens:
  - name: "home-dashboard"
    url: "https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/User-onboarding-designs?node-id=246-3414"
    notes:
      - "https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/User-onboarding-designs?node-id=247-3420"
      - "https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/User-onboarding-designs?node-id=247-3421"
  - name: "user-profile"
    url: "https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/User-onboarding-designs?node-id=246-3415"
    notes: []
  - name: "settings-page"
    url: "https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/User-onboarding-designs?node-id=246-3416"
    notes:
      - "https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/User-onboarding-designs?node-id=247-3422"
# Unassociated notes (if any)
unassociated_notes:
  - "https://www.figma.com/design/yRyWXdNtJ8KwS1GVqRBL1O/User-onboarding-designs?node-id=247-3423"
```

5. Then we will download each image and note.
6. Then we will using a sample hook to get analysis for each sample hook (including note data).
7. Then we will have to figure out a way to provide the analysis files and the shell-story prompt to be able to generate teh final shell stories. How much data can we send via a sampling hook?
8. Then we will have to write out the shell stories into the description of the Epic.  



Other notes:

- We will want to extract some of the MCP services into helper functions.



## Temporary Data Files

For temporary file management, use the `tmp-promise` library:

```bash
npm install tmp-promise
```

```javascript
import { dir } from 'tmp-promise';

// Automatically cleanup on process exit
const { path: tempPath, cleanup } = await dir({ 
  unsafeCleanup: true, // Remove directory even if not empty
  tmpdir: os.tmpdir()
});

// Or with timed cleanup
setTimeout(cleanup, 3600000); // 1 hour
```

## Implementation Plan - Progress Tracker

### ✅ Completed Steps
- **Step 1.0**: Created tool skeleton with all supporting files
  - `server/providers/combined/tools/writing-shell-stories/write-shell-stories.ts` ✅
  - `server/providers/combined/tools/writing-shell-stories/index.ts` ✅
  - `server/providers/combined/index.ts` ✅
  - Import added to `server/mcp-core/server-factory.ts` ✅

### 🔄 Ready to Enable
- **Combined Provider Registration**: Code exists but commented out in `server-factory.ts` (lines 77-82)
  - Waiting to enable when both Atlassian + Figma providers are authenticated
  - Registration logic: `if (authContext.atlassian && authContext.figma) { combinedProvider.registerTools(mcp, authContext); }`

### ⏭️ Next Steps (in order)
1. **Step 2.0**: Install Dependencies (`tmp-promise`, `yaml`)
2. **Step 3.0**: Implement Phase 1 - Fetch epic and extract Figma URLs (inline in main tool)
3. **Step 4.0**: Add temp directory creation to Phase 1 (inline, then extract to helper)
4. **Step 5.0**: Implement Phase 2 - Parse Figma URLs and fetch metadata (inline)
5. **Step 6.0**: Extract Figma URL Parser helper (refactor from Step 5.0)
6. **Step 7.0**: Implement Phase 3 - Analyze screens/notes and generate YAML
7. **Step 8.0**: Extract Screen-Note Analyzer helper (refactor from Step 7.0)

### 📋 Remaining Steps After Step 8.0
- YAML Generator helper extraction
- Image Downloader implementation + helper
- AI analysis via sampling
- Jira write-back
- Error handling and polish

---

## Implementation Plan

### Division of Labor: TypeScript vs AI

**TypeScript Functions Handle:**
- ✅ All data fetching (Jira API, Figma API)
- ✅ URL parsing and validation
- ✅ File I/O (reading, writing, downloading images)
- ✅ Data transformation (JSON to YAML, Markdown to ADF)
- ✅ Spatial calculations (distance between frames and notes, sorting by coordinates)
- ✅ Text extraction from structured data (STICKY_NOTE characters field)
- ✅ Temp directory management
- ✅ Error handling and progress reporting

**AI Prompts (via Sampling Hook) Handle:**
- 🤖 **Screen Analysis**: Analyzing UI screenshots + design notes to generate detailed UX documentation
- 🤖 **Shell Story Generation**: Synthesizing multiple screen analyses into prioritized user stories with dependencies

**Key Insight**: TypeScript does all the "mechanical" work (fetch, parse, calculate, save). AI does the "creative" work (analyze designs, write stories).

### Step 1.0: Create Tool Skeleton ✅ COMPLETE

#### Step 1.0: Create write-shell-stories Tool Skeleton ✅ COMPLETE
**What to do:**
- ✅ Create `server/providers/combined/tools/writing-shell-stories/write-shell-stories.ts`
- ✅ Follow pattern from `utility-test-sampling.ts` for tool registration
- ✅ Define input schema with `epicKey` parameter
- ✅ Register tool function: `registerWriteShellStoriesTool(mcp: McpServer)`
- ✅ Export from `server/providers/combined/tools/writing-shell-stories/index.ts`
- ✅ Create combined provider at `server/providers/combined/index.ts`
- ✅ Import combinedProvider in `server/mcp-core/server-factory.ts`
- ⏸️ Enable combined provider registration (commented out, pending both providers being authenticated)

**How to verify:**
- Tool skeleton created with all necessary files
- Combined provider pattern established
- Ready to uncomment registration code when both Atlassian + Figma are authenticated
- Follows console logging conventions

**Next step:** Uncomment the combined provider registration in `server-factory.ts` (lines 77-82) when ready to test

---

### Step 2.0: Install Dependencies ⏭️ NEXT

#### Step 2.0: Install Dependencies
**What to do:**
- Install `tmp-promise` for temporary directory management
- Install `yaml` for YAML file generation and parsing
- Install `node-fetch` if not already available for downloading images

**How to verify:**
- Dependencies appear in `package.json`
- Can import and use `tmp-promise` without errors
- Run `npm install` successfully

---

### Step 3.0: Implement Phase 1 - Fetch Epic and Extract Figma URLs

#### Step 3.0: Implement Phase 1 - Fetch Epic and Extract Figma URLs [TypeScript - Main Tool]
**What to do:**
- Update `write-shell-stories.ts` main tool implementation
- **[TS Logic]** Use `getJiraIssue` helper from `server/providers/atlassian/atlassian-helpers.ts` to fetch epic by key
- **[TS Logic]** Parse epic description to extract Figma URLs (inline implementation using regex)
  - Traverse ADF (Atlassian Document Format) structure
  - Look for `inlineCard.attrs.url`, `text.marks.link.attrs.href`, and plain URLs in text
  - Extract all URLs containing 'figma.com'
- **[TS Logic]** Log all found Figma URLs
- **[TS Logic]** Return progress message with URL count

**How to verify:**
- Tool can fetch epic from Jira when invoked with epicKey
- Extracts all Figma URLs from epic description
- Returns message like: "Found 3 Figma URLs in epic TEST-123"
- Clear error if epic not found
- Clear error if no Figma URLs found

**Output:** Working tool that fetches epics and extracts Figma URLs (no helpers yet, all inline)

---

### Step 4.0: Add Temp Directory Creation

#### Step 4.0: Add Temp Directory Creation [TypeScript - Main Tool + Helper]
**What to do:**
- Update `write-shell-stories.ts` to create temp directory after finding URLs
- **[TS Logic]** Implement temp directory creation inline first using `tmp-promise`
  - Use `sessionId` (from auth context) and `epicKey` to generate deterministic name
  - Create directory with pattern: `shell-stories-{sessionId}-{epicKey}`
- **[TS Logic]** Test inline implementation works
- **[TS Logic]** Extract to helper: Create `temp-directory-manager.ts`
  - Move logic to `createTempDir(sessionId, epicKey)`
  - Add `getTempDir(sessionId, epicKey)` lookup function
  - Add tracking for `lastAccessed` timestamp
  - Implement 24-hour auto-cleanup (periodic task)
- **[TS Logic]** Update main tool to use the helper
- **[TS Logic]** Log temp directory path

**How to verify:**
- Temp directory created after extracting URLs
- Directory path logged and returned in response
- Directory exists on filesystem
- Can call tool again with same epic and reuses directory (lookup works)
- Helper is reusable by other code

**Output:** Working tool with temp directory management + extracted helper for reuse

---

### Step 5.0: Implement Phase 2 - Parse and Fetch Figma Metadata

#### Step 5.0: Implement Phase 2 - Parse and Fetch Figma Metadata [TypeScript - Main Tool]
**What to do:**
- Update `write-shell-stories.ts` to process Figma URLs
- **[TS Logic]** For each Figma URL, parse fileKey and nodeId (inline regex implementation)
  - Handle format: `https://www.figma.com/design/{fileKey}/{name}?node-id={nodeId}`
  - Handle variations: with/without node-id, different URL formats
- **[TS Logic]** For each parsed URL, fetch Figma metadata using Figma API
  - Use auth token from context: `authInfo.figma.access_token`
  - Call Figma API: `GET https://api.figma.com/v1/files/{fileKey}/nodes?ids={nodeId}`
  - Determine if node is CANVAS (page), FRAME, or STICKY_NOTE
- **[TS Logic]** If CANVAS, fetch all child layers recursively
- **[TS Logic]** Build list of all FRAME and STICKY_NOTE nodes found
- **[TS Logic]** Log progress for each URL processed
- **[TS Logic]** Return count of frames and notes found

**How to verify:**
- Parses Figma URLs correctly from epic
- Fetches metadata from Figma API successfully
- Identifies CANVAS nodes and fetches children
- Collects all FRAMEs and STICKY_NOTEs
- Returns message like: "Processed 2 Figma URLs: found 5 frames, 3 notes"

**Output:** Working tool that fetches and processes Figma design data

---

### Step 6.0: Extract Figma URL Parser Helper

#### Step 6.0: Extract Figma URL Parser Helper [Refactoring]
**What to do:**
- Review URL parsing code from Step 5.0
- **[TS Logic]** Extract to `figma-url-parser.ts` helper
  - Function: `parseFigmaUrl(url: string): { fileKey: string, nodeId?: string }`
  - Handle all URL variations discovered during testing
  - Throw clear errors for invalid URLs
- **[TS Logic]** Update main tool to use the helper
- **[TS Logic]** Add unit tests for edge cases

**How to verify:**
- Main tool still works with extracted helper
- Helper handles all URL formats from testing
- Clear error messages for malformed URLs
- Helper is reusable by other tools

**Output:** Cleaner main tool + reusable Figma URL parser helper

---

### Step 7.0: Implement Phase 3 - Analyze Screens/Notes and Generate YAML

#### Step 7.0: Implement Phase 3 - Analyze Screens/Notes and Generate YAML [TypeScript - Main Tool]
**What to do:**
- Update `write-shell-stories.ts` to analyze frame/note relationships
- **[TS Logic]** Distinguish FRAME vs STICKY_NOTE types (check `node.type` field)
- **[TS Logic]** Implement spatial analysis inline
  - Calculate distances between notes and frames using Euclidean distance
  - Associate each note with nearest frame (within threshold, e.g., 500px)
  - Extract text from STICKY_NOTE nodes (read `characters` field)
- **[TS Logic]** Determine screen order from frame positions
  - Sort by Y coordinate (top-to-bottom), then X coordinate (left-to-right)
  - Or reverse if layout suggests different flow
- **[TS Logic]** Generate screens.yaml structure inline
  - Format: `order`, `screens` (with notes), `unassociated_notes`
  - Include Figma URLs for each frame and note
- **[TS Logic]** Write YAML to `{tempDir}/screens.yaml`
- **[TS Logic]** Return file path and summary

**How to verify:**
- Associates notes to correct frames based on proximity
- Handles frames with no notes
- Tracks unassociated notes
- Generates valid YAML file
- Returns message like: "Generated screens.yaml: 5 screens, 3 notes, 1 unassociated"

**Output:** Working tool that produces screens.yaml with design structure

---

### Step 8.0: Extract Screen-Note Analyzer Helper

#### Step 8.0: Extract Screen-Note Analyzer Helper [Refactoring]
**What to do:**
- Review spatial analysis code from Step 7.0
- **[TS Logic]** Extract to `screen-analyzer.ts` helper
  - Function: `analyzeScreens(nodes): { frames, notes, associations }`
  - Spatial distance calculation
  - Text extraction from notes
  - Frame/note grouping logic
- **[TS Logic]** Extract to `yaml-generator.ts` helper
  - Function: `generateScreensYaml(analyzed): yamlString`
  - Screen ordering logic
  - YAML structure generation
- **[TS Logic]** Update main tool to use both helpers
- **[TS Logic]** Add tests for edge cases (overlapping notes, distant notes, etc.)

**How to verify:**
- Main tool still works with extracted helpers
- Helpers handle edge cases from testing
- Code is cleaner and more maintainable
- Helpers are reusable

**Output:** Cleaner main tool + two reusable helpers (screen analyzer, YAML generator)

---

### Step 9.0: Implement Phase 4 - Download Images

#### Step 9.0: Implement Phase 4 - Download Images [TypeScript - Main Tool]
**What to do:**
- Update `write-shell-stories.ts` to download frame images
- **[TS Logic]** For each frame from screens.yaml, get image URL from Figma API
  - Call `GET https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=png`
  - Extract download URL from response
- **[TS Logic]** Download image to temp directory (inline using fetch)
  - Fetch image data from URL
  - Save to `{tempDir}/{screen-name}.png`
- **[TS Logic]** Extract note text and save to `.notes.md` files
  - For each frame with notes, create `{screen-name}.notes.md`
  - Include text from associated STICKY_NOTE nodes
- **[TS Logic]** Log download progress
- **[TS Logic]** Handle download failures gracefully (try/catch per image)

**How to verify:**
- All frame images downloaded to temp directory
- Image files exist with correct names
- Note files created for frames with notes
- Progress logged: "Downloaded 5/5 images, 3 note files created"
- Tool continues if individual download fails

**Output:** Working tool with image and note downloads

---

### Step 10.0: Extract Image Downloader Helper

#### Step 10.0: Extract Image Downloader Helper [Refactoring]
**What to do:**
- Review image download code from Step 9.0
- **[TS Logic]** Extract to `image-downloader.ts` helper
  - Function: `getImageUrl(fileKey, nodeId, token): Promise<string>`
  - Function: `downloadImage(url, outputPath): Promise<void>`
  - Rate limit handling
  - Retry logic for failed downloads
- **[TS Logic]** Update main tool to use the helper
- **[TS Logic]** Add error handling tests

**How to verify:**
- Main tool still works with extracted helper
- Helper handles rate limits gracefully
- Retries failed downloads
- Helper is reusable

**Output:** Cleaner main tool + reusable image downloader helper

---

### Step 11.0: Implement Phase 5 - Screen Analysis via Sampling

#### Step 11.0: Implement Phase 5 - Screen Analysis via Sampling [TypeScript + AI Sampling]
**What to do:**
- Update `write-shell-stories.ts` to analyze screens using AI
- **[TS Logic]** For each screen, create analysis stub file first
  - Create `{tempDir}/{screen-name}.analysis.md` with template sections
  - Template: UI Elements, Behaviors, Technical Notes
- **[TS Logic]** For each screen, prepare analysis prompt
  - Read screen image from temp directory and encode as base64
  - Read associated notes from `.notes.md` file
  - Build prompt requesting detailed UI/UX analysis
- **[AI PROMPT via Sampling]** Use MCP sampling to request analysis
  - Call `mcp.server.request({ method: 'sampling/createMessage', ... })`
  - Prompt includes: image data, notes content, analysis template
  - AI generates: Comprehensive UI documentation
- **[TS Logic]** Save AI response to analysis file (overwrite stub)
- **[TS Logic]** Handle sampling errors gracefully
- **[TS Logic]** Process screens sequentially to avoid overwhelming AI

**How to verify:**
- Analysis stub files created for all screens
- Sampling requests sent successfully with images
- AI-generated analysis received and saved
- Files contain comprehensive screen documentation
- Returns message: "Analyzed 5 screens successfully"

**Output:** Working tool with AI-powered screen analysis

---

### Step 12.0: Implement Phase 6 - Shell Story Generation via Sampling

#### Step 12.0: Implement Phase 6 - Shell Story Generation via Sampling [TypeScript + AI Sampling]
**What to do:**
- Update `write-shell-stories.ts` to generate shell stories
- **[TS Logic]** After all screen analyses complete, read all analysis files
  - Read all `{tempDir}/*.analysis.md` files
  - Combine into context for story generation
- **[TS Logic]** Prepare shell story generation prompt
  - Include all screen analyses
  - Reference style guide from https://github.com/bitovi/ai-enablement-prompts/tree/main/writing-stories/from-figma
  - Request prioritized user stories with dependencies
- **[AI PROMPT via Sampling]** Request shell story generation
  - Prompt includes: All analyses, format requirements, example stories
  - AI generates: Incremental user stories with priorities
- **[TS Logic]** Save AI response to `{tempDir}/shell-stories.md`
- **[TS Logic]** Return file path and story count

**How to verify:**
- All analysis files read successfully
- Sampling includes complete context
- AI-generated stories in correct format
- Stories include dependencies and scope
- Returns message: "Generated 12 shell stories in {path}"

**Output:** Working tool that produces shell stories from designs

---

### Step 13.0: Implement Phase 7 - Write Stories to Jira

#### Step 13.0: Implement Phase 7 - Write Stories to Jira [TypeScript - Main Tool]
**What to do:**
- Update `write-shell-stories.ts` to write stories back to Jira
- **[TS Logic]** Read generated `shell-stories.md` from temp directory
- **[TS Logic]** Convert markdown to ADF (Atlassian Document Format)
  - Use existing `convertMarkdownToAdf` from `server/providers/atlassian/markdown-converter.ts`
  - Preserve formatting (headers, lists, code blocks)
- **[TS Logic]** Update epic description via Jira API
  - Use existing Jira API helpers
  - Append shell stories to existing description (don't replace)
  - Add separator section (e.g., "## Generated Shell Stories")
- **[TS Logic]** Return success message with epic URL

**How to verify:**
- Shell stories appended to epic description in Jira
- Formatting appears correctly in Jira UI
- Existing content preserved
- Returns message: "Updated epic TEST-123 with 12 shell stories: {jira-url}"

**Output:** Complete working tool that writes stories back to Jira!

---

### Step 14.0: Add Comprehensive Error Handling

#### Step 14.0: Add Comprehensive Error Handling [Polish]
**What to do:**
- Review all phases for error scenarios
- **[TS Logic]** Wrap each phase in try-catch blocks
- **[TS Logic]** Provide clear error messages at each step
  - "Epic TEST-123 not found - please check the key"
  - "No Figma URLs found in epic description"
  - "Failed to fetch Figma metadata: rate limit exceeded (retry in 60s)"
- **[TS Logic]** Handle auth errors using `getAuthInfoSafe` pattern
  - Throws `InvalidTokenError` to trigger re-authentication
- **[TS Logic]** Cleanup temp directory on fatal errors
- **[TS Logic]** Preserve partial progress where possible
  - If 3/5 images downloaded before error, save state to resume later

**How to verify:**
- Clear, actionable error messages for common failures
- Auth errors trigger OAuth re-authentication flow
- Temp directory cleaned up on fatal errors
- Partial work preserved for debugging

**Output:** Robust tool with excellent error handling

---

### Step 15.0: Add Progress Reporting

#### Step 15.0: Add Progress Reporting [Polish]
**What to do:**
- Review user experience during long operations
- **[TS Logic]** Return progress messages after each major step
  - "Fetching epic TEST-123..."
  - "Found 3 Figma URLs in epic description"
  - "Processing Figma URL 1/3..."
  - "Downloaded 5/5 images"
  - "Analyzing screen 3/5..."
  - "Generating shell stories..."
  - "Updating epic in Jira..."
- **[TS Logic]** Include counts and summaries throughout
- **[TS Logic]** Final summary includes all key info
  - "✅ Success! Generated 12 shell stories from 5 screens (3 Figma URLs). Updated epic TEST-123."

**How to verify:**
- User sees progress throughout operation
- Progress messages are clear and informative
- Final summary comprehensive
- No long periods of silence

**Output:** Tool with excellent user experience

---

### Step 16.0: Add Cleanup and Resource Management

#### Step 16.0: Add Cleanup and Resource Management [Polish]
**What to do:**
- Review resource usage patterns
- **[TS Logic]** Implement graceful temp directory cleanup
  - On successful completion: keep directory for 24 hours (for debugging)
  - On user request: add `--cleanup` option to delete immediately
  - On fatal error: preserve directory with error details
- **[TS Logic]** Track all file handles and close properly
  - Ensure all file operations use proper cleanup
  - Use try/finally blocks
- **[TS Logic]** Add timeout protection for long operations
  - Set reasonable timeouts for API calls
  - Provide option to increase timeout if needed
- **[TS Logic]** Verify 24-hour auto-cleanup task is running
  - From Step 4.0's temp directory manager

**How to verify:**
- Temp directories cleaned up after 24 hours
- No file handle leaks
- Operations timeout with clear message
- Resources properly released on errors

**Output:** Production-ready tool with proper resource management!

---

## Questions

1. **Sampling Limits**: How much data can we send via a sampling hook? Should we send all analysis files at once or break them into chunks?

2. **Image Handling**: Should we embed images in the Jira description or just reference the Figma URLs?

3. **Epic Update Strategy**: Should the tool append to existing epic description or replace it entirely? Should there be an option?

4. **Authentication**: Do we need to handle both Figma AND Atlassian authentication in the same tool, or can we assume both are already authenticated?

5. **Screen Ordering**: Should we allow manual override of screen ordering, or always use spatial layout?

6. **Note Association**: What distance threshold should we use for associating notes with frames? Should it be configurable?

7. **Error Recovery**: If analysis fails for one screen, should we continue with others or fail completely?

8. **Parallel Processing**: Should we download images in parallel or sequentially to avoid rate limits?

9. **Tool Naming**: Should this be `utility-write-shell-stories` or should it be under a different provider (like `atlassian-write-shell-stories` since it updates Jira)?

10. **Multi-Provider Authentication**: Since this tool needs both Figma and Atlassian access, how should we structure the auth context retrieval? Do we need to enhance `getAuthInfoSafe` to handle multiple providers?