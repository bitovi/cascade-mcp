# Page Analysis Context - Single Tool Approach

**Date:** March 4, 2026  
**Status:** 📝 Draft - Proposal  
**Supersedes:** [059-context-tools-with-embedded-prompts.md](./059-context-tools-with-embedded-prompts.md)

## Problem Identified

The 059 implementation still requires multiple tool calls in sequence:
1. `figma-get-layers-for-page` - Get all frames
2. `figma-get-frame-analysis-context` - For each frame (parallel)
3. `figma-get-scope-analysis-context` - Combine analyses

This creates orchestration complexity and multiple network round-trips.

## Solution: Single Page Analysis Tool

**One tool call that returns everything needed for the entire workflow:**

```
figma-get-page-analysis-context
```

### What It Does

1. **Loads all data** (comments, notes, frames) internally
2. **Returns structured bundle** with:
   - Manifest of frames to analyze
   - Image + context markdown for each frame
   - Individual frame analysis prompt
   - Scope synthesis prompt

### Tool Response Structure

```typescript
{
  content: [
    // 1. MANIFEST - What's being returned
    {
      type: "text",
      text: JSON.stringify({
        frameCount: 5,
        frames: [
          { id: "123-456", name: "Login Screen", order: 1 },
          { id: "789-012", name: "Dashboard", order: 2 },
          // ...
        ],
        workflow: {
          step1: "Analyze each frame using prompt://frame-analysis",
          step2: "Combine with prompt://scope-synthesis"
        }
      })
    },
    
    // 2. FRAME DATA - Image for frame 1
    {
      type: "resource",
      resource: {
        uri: "image://frame/123-456",
        mimeType: "image/png",
        blob: "<base64-encoded-image>"
      }
    },
    
    // 3. FRAME CONTEXT - Markdown for frame 1
    {
      type: "resource",
      resource: {
        uri: "context://frame/123-456",
        mimeType: "text/markdown",
        text: `# Login Screen (Frame 123-456)

## Comments
- @designer: Use primary button style here
- @pm: This should match the mobile app flow

## Dev Notes
- Requires authentication API
- Form validation on submit

## Related Frames
- Connects to: Dashboard (789-012)
`
      }
    },
    
    // 4. FRAME DATA - Image for frame 2
    {
      type: "resource",
      resource: {
        uri: "image://frame/789-012",
        mimeType: "image/png",
        blob: "<base64-encoded-image>"
      }
    },
    
    // 5. FRAME CONTEXT - Markdown for frame 2
    {
      type: "resource",
      resource: {
        uri: "context://frame/789-012",
        mimeType: "text/markdown",
        text: "# Dashboard (Frame 789-012)..."
      }
    },
    
    // ... repeat for all frames ...
    
    // N-1. INDIVIDUAL FRAME ANALYSIS PROMPT
    {
      type: "resource",
      resource: {
        uri: "prompt://frame-analysis",
        mimeType: "text/markdown",
        text: `# Frame Analysis Instructions

You are analyzing a single UI frame from a design file.

## Input Data
- Frame image: image://frame/{frameId}
- Frame context: context://frame/{frameId}

## Your Task
Analyze the frame and document:
1. **UI Components** - What elements are present
2. **User Interactions** - What actions can users take
3. **Data Requirements** - What data is needed
4. **Technical Notes** - Implementation considerations

## Output Format
Save your analysis as: {frameId}.analysis.md

## Example
\`\`\`markdown
# Login Screen Analysis

## UI Components
- Email input field
- Password input field
- "Sign In" button (primary)
- "Forgot password?" link

## User Interactions
...
\`\`\`
`
      }
    },
    
    // N. SCOPE SYNTHESIS PROMPT
    {
      type: "resource",
      resource: {
        uri: "prompt://scope-synthesis",
        mimeType: "text/markdown",
        text: `# Scope Synthesis Instructions

You are combining individual frame analyses into a comprehensive scope analysis.

## Input Data
- All frame analysis files: *.analysis.md

## Your Task
Synthesize the analyses into:
1. **Feature Overview** - High-level description
2. **User Stories** - Key user journeys
3. **Technical Scope** - APIs, components, data models
4. **Implementation Notes** - Architecture considerations

## Output Format
Save as: scope-analysis.md

## Example
\`\`\`markdown
# Feature Scope: User Authentication

## Feature Overview
Complete user authentication flow...

## User Stories
1. As a user, I can log in with email/password
2. As a user, I can reset my forgotten password
...
\`\`\`
`
      }
    }
  ]
}
```

## Simplified Agent Workflow

**Complete design review in 3 steps:**

```typescript
// Step 1: Get everything in one call
const response = await callTool('figma-get-page-analysis-context', {
  url: 'https://figma.com/design/abc123'
})

// Step 2: Parse the bundle
const manifest = JSON.parse(response.content[0].text)
const frameAnalysisPrompt = response.content.find(c => 
  c.resource?.uri === 'prompt://frame-analysis'
).resource.text
const scopeSynthesisPrompt = response.content.find(c => 
  c.resource?.uri === 'prompt://scope-synthesis'
).resource.text

// Step 3: Process each frame (can be parallel)
for (const frame of manifest.frames) {
  const image = response.content.find(c => 
    c.resource?.uri === `image://frame/${frame.id}`
  )
  const context = response.content.find(c => 
    c.resource?.uri === `context://frame/${frame.id}`
  )
  
  // Inject frame-specific data into prompt
  const prompt = frameAnalysisPrompt
    .replace(/{frameId}/g, frame.id)
  
  // Send to LLM
  const analysis = await myLLM.generate({
    prompt,
    images: [image.resource.blob],
    context: context.resource.text
  })
  
  // Save result
  await fs.writeFile(`${frame.id}.analysis.md`, analysis)
}

// Step 4: Synthesize scope
const allAnalyses = await Promise.all(
  manifest.frames.map(f => fs.readFile(`${f.id}.analysis.md`))
)
const scopeAnalysis = await myLLM.generate({
  prompt: scopeSynthesisPrompt,
  context: allAnalyses.join('\n\n---\n\n')
})
await fs.writeFile('scope-analysis.md', scopeAnalysis)
```

## Implementation Details

### Tool Signature

```typescript
{
  name: "figma-get-page-analysis-context",
  description: "Get complete context bundle for analyzing all frames in a Figma page",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Figma page URL (can point to specific page or will use first page)"
      }
    },
    required: ["url"]
  }
}
```

### Server-Side Logic

```typescript
export async function figmaGetPageAnalysisContext(
  url: string
) {
  // 1. Parse URL, authenticate
  const { fileKey, nodeId } = parseFigmaUrl(url)
  const client = await createFigmaClient(...)
  
  // 2. Load all data in parallel
  const [file, comments, devResources] = await Promise.all([
    client.getFile(fileKey),
    client.getComments(fileKey),
    client.getDevResources(fileKey)
  ])
  
  // 3. Extract target frames
  const frames = extractFramesFromPage(file, pageId)
  
  // 4. Load images in parallel
  const images = await Promise.all(
    frames.map(f => client.getImage(fileKey, f.id))
  )
  
  // 5. Build content array
  const content: Content[] = []
  
  // Add manifest
  content.push({
    type: "text",
    text: JSON.stringify({
      frameCount: frames.length,
      frames: frames.map(f => ({
        id: f.id,
        name: f.name,
        order: f.order
      })),
      workflow: {
        step1: "Analyze each frame using prompt://frame-analysis",
        step2: "Combine with prompt://scope-synthesis"
      }
    })
  })
  
  // Add frame images + context
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const image = images[i]
    
    // Add image
    content.push({
      type: "resource",
      resource: {
        uri: `image://frame/${frame.id}`,
        mimeType: "image/png",
        blob: image.data
      }
    })
    
    // Add context markdown
    content.push({
      type: "resource",
      resource: {
        uri: `context://frame/${frame.id}`,
        mimeType: "text/markdown",
        text: buildFrameContextMarkdown(frame, comments, devResources)
      }
    })
  }
  
  // Add prompts
  content.push({
    type: "resource",
    resource: {
      uri: "prompt://frame-analysis",
      mimeType: "text/markdown",
      text: FRAME_ANALYSIS_PROMPT
    }
  })
  
  content.push({
    type: "resource",
    resource: {
      uri: "prompt://scope-synthesis",
      mimeType: "text/markdown",
      text: SCOPE_SYNTHESIS_PROMPT
    }
  })
  
  return { content }
}
```

### Helper: Build Frame Context Markdown

```typescript
function buildFrameContextMarkdown(
  frame: FigmaNode,
  comments: Comment[],
  devResources: DevResource[]
): string {
  let md = `# ${frame.name} (Frame ${frame.id})\n\n`
  
  // Add comments for this frame
  const frameComments = comments.filter(c => 
    isCommentOnNode(c, frame.id)
  )
  if (frameComments.length > 0) {
    md += `## Comments\n`
    for (const comment of frameComments) {
      md += `- **@${comment.user.handle}**: ${comment.message}\n`
    }
    md += '\n'
  }
  
  // Add dev notes
  const frameNotes = devResources.filter(r => 
    r.node_id === frame.id
  )
  if (frameNotes.length > 0) {
    md += `## Dev Notes\n`
    for (const note of frameNotes) {
      md += `- ${note.description}\n`
      if (note.external_url) {
        md += `  - Link: ${note.external_url}\n`
      }
    }
    md += '\n'
  }
  
  // Add connections
  const connections = findConnections(frame)
  if (connections.length > 0) {
    md += `## Related Frames\n`
    for (const conn of connections) {
      md += `- Connects to: ${conn.targetName} (${conn.targetId})\n`
    }
    md += '\n'
  }
  
  return md
}
```

## Benefits vs. 059 Approach

| Aspect | 059 (Multi-Tool) | 060 (Super Tool) |
|--------|------------------|------------------|
| **Tool Calls** | 3-5 sequential | 1 |
| **Network Round-Trips** | Multiple | Single |
| **Orchestration Complexity** | Medium | Minimal |
| **Server-Side Optimization** | Limited | Maximum |
| **Caching Opportunity** | Per-tool | Entire bundle |
| **Error Recovery** | Per-step | All-or-nothing |

### Pros
- ✅ **Minimal Agent Complexity** - Just parse and iterate
- ✅ **Optimal Performance** - Single network call, parallel internal fetching
- ✅ **Better Caching** - Can cache entire bundle
- ✅ **Consistent State** - All data from same point in time
- ✅ **Self-Contained** - Everything needed in one response

### Cons
- ⚠️ **Large Payloads** - Returns all frame images at once
- ⚠️ **Memory Usage** - Agent must handle large response
- ⚠️ **Less Flexible** - Can't selectively fetch frames
- ⚠️ **MCP Limits** - May hit protocol size limits for large designs

## Handling Large Designs

For designs with many frames (>10), consider variants:

### Option A: Pagination
```typescript
{
  name: "figma-get-page-analysis-context",
  inputSchema: {
    properties: {
      url: { type: "string" },
      frameLimit: { 
        type: "number", 
        default: 10,
        description: "Max frames per response" 
      },
      cursor: {
        type: "string",
        description: "Pagination cursor for next batch"
      }
    }
  }
}
```

### Option B: Manifest First
Break into two calls:

1. **`figma-get-analysis-manifest`** - Returns frame list only
2. **`figma-get-frame-bundle`** - Returns frames 1-N with prompts

### Option C: Streaming (Future MCP Feature)
Use SSE to stream frames as they're processed.

## Migration from 059

### Remove These Tools
- ❌ `figma-get-frame-analysis-context`
- ❌ `figma-get-scope-analysis-context`
- ❌ `figma-get-questions-context`

### Keep These Tools
- ✅ `figma-get-layers-for-page` (for selective analysis)
- ✅ `figma-post-comment` (for results)
- ✅ `utility-save-analysis` (for results)

### New Tools
- ✅ `figma-get-page-analysis-context` (replaces all context tools)

## File Structure

```
server/providers/figma/tools/
  page-analysis-context/
    index.ts                     # Export registration
    page-analysis-context.ts     # Main tool (MCP wrapper)
    core-logic.ts                # Shared business logic
    frame-context-builder.ts     # buildFrameContextMarkdown()
    prompts/
      frame-analysis.md          # Individual frame prompt
      scope-synthesis.md         # Synthesis prompt
```

## Implementation Steps

### Step 1: Create Core Logic
- [ ] `core-logic.ts` - Main execution function
- [ ] `frame-context-builder.ts` - Markdown generation
- [ ] `prompts/frame-analysis.md` - Frame analysis prompt
- [ ] `prompts/scope-synthesis.md` - Synthesis prompt

**Verification:** Unit tests pass, can call `executePageAnalysisContext()` directly

### Step 2: Create MCP Tool
- [ ] `page-analysis-context.ts` - MCP tool wrapper
- [ ] `index.ts` - Registration function
- [ ] Register in `server/providers/figma/index.ts`

**Verification:** Tool appears in MCP tools list, accepts input schema

### Step 3: Handle Edge Cases
- [ ] Empty designs (no frames)
- [ ] Large designs (>10 frames) - Add pagination
- [ ] Missing comments/notes (graceful degradation)
- [ ] Network errors (retry logic)

**Verification:** Error responses are clear, partial failures handled

### Step 4: Documentation
- [ ] Update `server/readme.md`
- [ ] Update `docs/agent-workflow.md`
- [ ] Add example agent implementation

**Verification:** External developer can use tool from docs alone

### Step 5: Deprecate Old Tools
- [ ] Mark 059 tools as deprecated
- [ ] Add migration guide
- [ ] Update existing agents

**Verification:** All agents migrated, old tools can be removed

## Questions

1. **Pagination Strategy:** Should we implement pagination from the start, or wait to see if payload sizes are an issue in practice?

Wait and see. 

2. **Image Format:** Should frame images be base64 in the MCP response, or should we use URLs that the agent can fetch separately? (Trade-off: size vs. round-trips)

images in base64

3. **Prompt Customization:** Should agents be able to override the embedded prompts with their own, or always use server-provided prompts?

For now, use ours. But we shouldn't make the language too strong.


4. **Caching:** Should we cache the entire bundle on the server side, or let agents handle caching? How long should cache TTL be?

No caching for now.

5. **Feature Context:** Should `featureContext` be required or optional? Does it significantly improve the quality of generated prompts?

Optional.

6. **Error Handling:** If loading one frame fails (e.g., image export error), should we return partial results or fail the entire request?

Fail the whole thing.

7. **Questions Generation:** Should questions generation be included in this tool's response?

**Decision:** No. Keep `figma-get-page-analysis-context` focused on scope analysis only (frame analysis + synthesis prompts). Questions generation should be handled by the overarching workflow orchestration (e.g., `review-design` workflow prompt) because:
- **Workflow-specific:** Story-writing doesn't need questions, only design review does
- **Smaller payloads:** Don't bloat the response with prompts that many workflows won't use
- **Clear separation:** Scope analysis → questions generation is a sequential step, not parallel data loading

The workflow orchestration prompt will instruct the agent to generate questions after completing scope analysis, without needing a separate tool call.

8. **MCP Response Size Limits:** Do we know the practical size limits for MCP responses? Should we test with a large design file first?

**Decision:** Test with real designs first before implementing pagination. Start simple and add complexity only if needed.

---

## Spec Review

### ✅ Strengths

1. **Clear motivation**: The problem of multiple sequential tool calls is well-articulated
2. **Good examples**: TypeScript examples show exactly how agents would use the tool
3. **Answered questions**: All design questions have been addressed with decisions
4. **Benefits analysis**: Pros/cons comparison with 059 approach is helpful
5. **Implementation steps**: Clear verification criteria for each step

### ⚠️ Issues Found

#### 1. **Parameter Inconsistency (CRITICAL)**
- **Server-Side Logic section** (line ~296): References `pageId` variable in `extractFramesFromPage(file, pageId)` 
- **Tool Signature section** (line ~247): Function only takes `url` parameter, no `pageId`
- **Fix needed**: Either add `pageId` extraction from URL in the implementation, or document the helper function that does this

#### 2. **Missing Helper Functions (BLOCKER)**
The spec references functions that don't exist in the codebase:
- `extractFramesFromPage(file, pageId)` - Not found
- `findConnections(frame)` - Not found 
- `isCommentOnNode(comment, nodeId)` - Not found

**Existing alternative**: `figma-get-layers-for-page.ts` shows how to extract layers from a page:
```typescript
const topLevelLayers = (targetPage.children || [])
  .filter((layer: any) => layer.visible !== false)
  .filter((layer: any) => layer.type === 'FRAME') // Add this
```

#### 3. **Dev Resources API Missing (BLOCKER)**
- Spec shows `client.getDevResources(fileKey)` but this doesn't exist in `FigmaClient` interface
- **Figma API docs**: Dev resources endpoint is `/v1/files/{file_key}/dev_resources`
- **Action needed**: Add this method to FigmaClient or remove from spec

#### 4. **Image Format Mismatch**
- **Tool Response Structure** (line ~59): Shows `blob: "<base64-encoded-image>"`
- **Question 2 answer**: "images in base64"
- **Existing code**: `downloadImage()` in figma-get-frame-analysis-context.ts returns `{ base64: string, mimeType: string }`
- **Standardize**: Use `text` field with base64 string (MCP resources don't have `blob` field)

```typescript
{
  type: "resource",
  resource: {
    uri: `image://frame/${frame.id}`,
    mimeType: "image/png",
    text: image.base64  // Not "blob"
  }
}
```

#### 5. **Migration Path Contradicts Existing Tools**
- **"Remove These Tools"** lists `figma-get-frame-analysis-context`
- **Problem**: This tool exists and is from 059 implementation, but serves **different purpose**:
  - Existing: Single frame analysis (takes `nodeId`)
  - New tool: All frames on a page (takes `url`)
- **Question**: Should we deprecate or keep both? Story-writing might want single-frame analysis.

#### 6. **Prompt Source Unclear**
- Spec shows example prompts inline but doesn't specify source
- **Existing prompts**: `SCREEN_ANALYSIS_SYSTEM_PROMPT` in `screen-analyses-workflow/screen-analyzer.ts`
- **Existing scope prompt**: In `figma-get-scope-analysis-context.ts` uses `FEATURE_IDENTIFICATION_SYSTEM_PROMPT`
- **Clarify**: Should new prompts be created or reuse existing ones?

#### 7. **File Structure vs. Existing Pattern**
- **Spec proposes**: `page-analysis-context/` folder with multiple files
- **Existing tools**: Single-file pattern (e.g., `figma-get-frame-analysis-context.ts` is 341 lines, single file)
- **Inconsistency**: Per .github/copilot-instructions.md:
  > "Complex MCP tools should have their own folder... Simple single-step tools can remain as single files"
- **Question**: Is this tool complex enough for folder structure? It's mostly data fetching + formatting.

#### 8. **Comments Caching**
- Existing `figma-get-frame-analysis-context.ts` has 30-second comment cache
- New tool will fetch comments for entire file - should reuse same cache
- **Missing**: Spec doesn't mention comment caching strategy

### 🔍 Redundancy Check

The spec has some repetition that could be streamlined:

1. **Example prompts appear twice**:
   - Full text in "Tool Response Structure" section
   - Referenced again in embedded prompt resources
   - **Suggestion**: Show abbreviated versions in structure, link to actual files

2. **Pagination discussion**:
   - Appears in "Handling Large Designs" section
   - Mentioned again in Question 1 answer
   - **Minor**: These reinforce each other, acceptable redundancy

### ✅ Implementation Readiness

**Blockers resolved:**
- [ ] Define `extractFramesFromPage()` helper or reuse layer extraction logic
- [ ] Define `findConnections()` helper or remove this feature
- [ ] Define `isCommentOnNode()` helper (likely exists in comment-utils)
- [ ] Add `getDevResources()` to FigmaClient or remove from spec
- [ ] Fix image format (use `text` not `blob`)
- [ ] Clarify migration path for existing `figma-get-frame-analysis-context`
- [ ] Specify which prompts to use (new vs. existing)

**Once resolved, spec is implementable with:**
- Existing Figma API client ✅
- Existing comment fetching utilities ✅
- Existing semantic XML generator ✅
- Existing embedded-prompt-builder ✅
- Existing screen analysis prompts ✅

## Additional Questions

9. **Frame Filtering:** Should the tool return ALL top-level layers, or only layers of type `FRAME`?

**Recommendation: Only `FRAME` type (+ expand `SECTION` containers).** The codebase already has two patterns: `figma-get-layers-for-page` returns ALL visible layers, but every analysis workflow filters to `type === 'FRAME'` only. Specifically:
- `getFramesAndNotesForNode()` in [figma-helpers.ts](server/providers/figma/figma-helpers.ts) filters `child.type === 'FRAME'`
- `expandCanvasNode()` in [frame-expander.ts](server/providers/figma/screen-analyses-workflow/frame-expander.ts) uses the same filter
- `SECTION` nodes are expanded (recursed into), not returned directly
- `INSTANCE` nodes named "Note" are sticky notes — extracted for annotation context but not analyzed as frames

Reuse `getFramesAndNotesForNode()` or `expandNode()`/`expandNodes()` from frame-expander.ts.

10. **Page Selection Logic:** If user provides a file URL (not page-specific), what should happen?

**Recommendation: First-page fallback, matching `figma-get-layers-for-page.ts` pattern.**
1. If URL has `node-id` → find the page containing that node via `findPageContainingNode()`
2. If no `node-id` → use the **first page** (`pages[0]`)
3. Include **all page names/IDs** in the manifest so agents can make a follow-up call for a different page if needed

This is the established convention in the codebase. Analyzing ALL pages would be overwhelming (many Figma files have dozens). The selected page should be clearly indicated in the manifest.
    
11. **Semantic XML:** Should the new tool include semantic XML in the frame context?

**Recommendation: Yes, include it.** It's essential for quality analysis. Research shows:
- The existing `figma-get-frame-analysis-context.ts` generates semantic XML for every frame
- `generateSemanticXml()` produces compact XML (~99% reduction from raw JSON, typically 5-20KB per frame)
- The screen analysis prompt (`buildAnalysisPrompt()`) explicitly references and relies on semantic XML for component variants, interaction patterns, and component names
- Since the tool already fetches the full file data to discover frames, the node tree is already available — no additional API calls needed

Include it as a separate resource block per frame (alongside image and context markdown).

12. **Helper Function Location:** Where should `buildFrameContextMarkdown()` live?

**Recommendation: Option A — Own folder (`page-analysis-context/frame-context-builder.ts`).** Research confirms this tool qualifies as "complex" per copilot-instructions.md:
- Loads data from multiple sources (comments, frames, images, semantic XML, notes)
- Has shared business logic (core-logic.ts for dual MCP+REST interfaces)
- `buildFrameContextMarkdown()` is a "semi-specific helper" per the instructions → belongs in separate module

Follow the `figma-review-design/` folder pattern. The only other folder-based Figma tool is `figma-review-design/` which has `core-logic.ts`, helper files, and a README.

```
server/providers/figma/tools/page-analysis-context/
├── index.ts                     # export { registerPageAnalysisContextTool }
├── page-analysis-context.ts     # MCP wrapper (orchestration only)
├── core-logic.ts                # Shared logic (MCP + REST)
└── frame-context-builder.ts     # buildFrameContextMarkdown() + findConnections()
```

13. **Dev Resources vs. Dev Mode Comments:** Which should "Dev Notes" include?

**Recommendation: Include comments + sticky notes only. Remove Dev Resources from spec.** Research found:
- `getDevResources()` does NOT exist in `FigmaClient` — zero references in codebase
- The Figma Dev Resources API returns **external URL links** (docs, GitHub issues, Storybook) — low-value for AI analysis
- The codebase already handles two annotation types well:
  - **Figma comments** — via `fetchCommentsForFile()` → `filterCommentsForNode()` → `formatCommentsForContext()`
  - **Sticky notes** — via `getFramesAndNotesForNode()` → `associateNotesWithFrames()` (spatial proximity, 500px threshold)
- Figma's newer "Dev Mode annotations" (badge-style) exist as `node.annotations` but aren't extracted yet

**Action:** Remove `devResources` from the parallel fetch and `buildFrameContextMarkdown()`. Rename "Dev Notes" to "Notes" (covering sticky notes). Dev Resources/annotations can be a future enhancement.

14. **Connection Detection:** How should `findConnections()` work?

**Recommendation: Parse Figma prototype connections from `reactions` data on child nodes.** Research shows:
- `isInteractive()` in semantic-xml-generator.ts already checks `node.reactions` but only as a boolean flag — doesn't extract destinations
- The `reactions` array contains prototype data: `{ action: { type: "NODE", destinationId: "123:456" }, trigger: { type: "ON_CLICK" } }`
- No connection detection exists anywhere in the codebase yet
- The `reactions` data is already included in file/node API responses — no additional API call needed

Implementation approach:
```typescript
function findConnections(
  frameNode: any,
  allFrames: Array<{ id: string; name: string }>
): Array<{ targetId: string; targetName: string; trigger: string }> {
  const connections: Array<...>[] = [];
  const seenTargets = new Set<string>();
  // Recursively walk children looking for reactions with type: "NODE"
  // Deduplicate by targetId (multiple buttons may go to same destination)
  function walk(node: any) { ... }
  walk(frameNode);
  return connections;
}
```

Place in `frame-context-builder.ts`. Only parse `type: "NODE"` actions (skip `URL`, `BACK`).

15. **Error Handling Detail:** How should "fail the whole thing" work?

**Recommendation: Collect all frame errors, then return a single `buildErrorResponse()` with detailed error listing.** Research shows:
- Context tools use `buildErrorResponse()` → `{ content: [{type: 'text', text: JSON.stringify({error})}], isError: true }`
- The analysis orchestrator does the opposite (absorbs per-frame failures, returns partial results) — we don't want that
- But collecting errors is cheap and dramatically more useful than failing on first error

Pattern:
```typescript
const errors: { nodeId: string; name: string; error: string }[] = [];
for (const frame of frames) {
  try { results.push(await processFrame(frame)); }
  catch (e) { errors.push({ nodeId: frame.id, name: frame.name, error: e.message }); }
}
if (errors.length > 0) {
  return buildErrorResponse(`Failed ${errors.length}/${frames.length} frames:\n${errorDetails}`);
}
```

16. **Workflow Metadata:** Should this tool include it?

**Decision: No.** The existing context tools use `workflow://metadata` because they are individual steps in a multi-tool choreographed workflow — the metadata tells the agent "you're at step X, do Y next, this is parallelizable." This tool replaces that entire choreography with a single call, and the manifest already contains the orchestration info (frame list, workflow steps, prompt URIs). Adding a separate `workflow://metadata` resource would duplicate what the manifest provides.

Note: `workflow://metadata` is a codebase-internal convention (not part of the MCP spec). The MCP spec's `structuredContent` field serves a similar purpose in a spec-standard way. If machine-readable metadata is needed in the future, `structuredContent` would be the preferred approach.

17. **Prompt Parameterization:** What dynamic values should the prompts include?

**Recommendation: Parameterize `pageName`, `frameCount`, `frameManifest`, and optional `featureContext`.** Research shows existing prompts use:
- `buildAnalysisPrompt()` accepts `frameName`, `url`, `order + totalFrames`, `annotations`, `sectionName`, `contextMarkdown`, `semanticXml`
- `buildEmbeddedPrompt()` accepts `nodeName`, `featureContext`, `screenOrder`
- All use `${}` template literal interpolation and conditional sections (`${value ? `## Section\n${value}` : ''}`)

Don't duplicate data already in the JSON manifest — the prompt should reference it ("Analyze the frames listed in the manifest above") rather than re-embedding.

18. **REST API Response Format:** Match MCP or use custom structure?

**Decision: No REST endpoint needed.** Only tools that run long-duration E2E workflows need a REST API. This tool is a data-fetching context tool — it returns a bundle of frames, images, and prompts. It doesn't orchestrate LLM calls or run multi-step workflows. MCP-only is sufficient.

19. **Relationship to `figma-get-questions-context`:** Where does questions generation happen after deprecation?

**Recommendation: Add a "Questions Workflow" subsection to the migration section.** Research found the questions flow already exists in multiple layers:
1. **Prompt builder** — `generateFigmaQuestionsPrompt()` in [prompt-figma-questions.ts](server/providers/figma/tools/figma-review-design/prompt-figma-questions.ts)
2. **MCP Prompt** — `prompt-generate-questions` in [prompt-generate-questions.ts](server/mcp-prompts/prompt-generate-questions.ts)
3. **Orchestration** — `prompt-review-design` Step 5 instructs agents to call `prompt-generate-questions` after scope analysis

Post-deprecation flow:
1. Agent calls `figma-get-page-analysis-context` → frames + prompts
2. Agent analyzes frames → synthesizes scope
3. Agent calls `prompt-generate-questions` MCP prompt with completed analyses
4. Agent's LLM generates questions → `figma-post-comment` to post

The context tool is redundant because the MCP prompt already provides the same prompt text, and the agent already has the input data from step 2.

20. **Frame Order Logic:** How should `order` be determined?

**Recommendation: Reuse `calculateFrameOrder()` from [types.ts](server/providers/figma/screen-analyses-workflow/types.ts).** This existing function:
- Sorts frames by **visual position**: top-to-bottom, left-to-right (reading order)
- Uses 50px `ROW_TOLERANCE_PX` for horizontal row alignment
- Handles frames without `absoluteBoundingBox` (appended at end)
- Is already well-tested and used in the analysis orchestrator

The Figma API returns children in **layer order** (bottom-to-top in layers panel), which is NOT spatial. The codebase already solved this with `calculateFrameOrder()`.

Steps:
1. Populate each frame's `position` from `absoluteBoundingBox`
2. Call `calculateFrameOrder(frames)` to get spatially-ordered frames
3. Use this order in the manifest
