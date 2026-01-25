# Add Semantic Figma Structure to Screen Analysis

## Overview

Enhance screen analysis by providing AI with semantic Figma component structure alongside images. This will help the AI identify interaction states, component variants, and functional relationships that are difficult to detect from images alone.

## Problem Statement

Current screen analysis uses only images, which can miss important semantic information:

1. **Missed Interaction States**: AI couldn't identify that "Alex Morgan" in screen 1199-79138 was in a hover tooltip (Hover-Card component) showing voters, not a mention tag
2. **Component Variants Lost**: Different states of the same component (State="Count" vs State="Hover") aren't distinguishable from static images
3. **Semantic Relationships**: Component hierarchy and purpose (e.g., Reaction-Statistics > Hover-Card > Text-Listing) provide context about functionality
4. **Interactive Elements**: Components marked as `interactive="true"` indicate clickable/hoverable elements

## Solution

Generate lightweight semantic XML from Figma node data and include it in the screen analysis prompt.

### Example: Comment Reaction States

**Image shows**: Two similar comment components with vote counts

**Semantic XML reveals**:
```xml
<Comment-2 Property1="Original">
  <Reaction-Statistics State="Count" interactive="true">
    <Icon-thumbs-up />
    1
    <Icon-thumbs-down />
    1
  </Reaction-Statistics>
</Comment-2>

<Comment-1 Property1="Original">
  <Reaction-Statistics State="Hover" interactive="true">
    <Icon-thumbs-up />
    1
    <Icon-thumbs-down />
    1
    <Hover-Card>
      <Slot>
        <Text-Listing>Alex Morgan</Text-Listing>
      </Slot>
    </Hover-Card>
  </Reaction-Statistics>
</Comment-1>
```

**Insight**: The XML makes it explicit that "Alex Morgan" appears in a Hover-Card within the Reaction-Statistics component, indicating it's a voter tooltip, not a mention.

## Current Architecture

### Screen Analysis Flow

1. **Fetch Figma node data** (`fetchFigmaNode` or `fetchFigmaNodesBatch`) - Downloads complete node tree with children
2. **Extract frames/notes** (`getFramesAndNotesForNode`) - Identifies which nodes to analyze
3. **Download images** (`downloadFigmaImagesBatch`) - Gets PNG renderings
4. **Generate analysis** (`regenerateScreenAnalyses`) - Sends image + prompt to LLM
5. **Save analysis** - Writes `.analysis.md` files

**Node data is currently discarded after step 2** - we only keep metadata (id, name, type, bounds).

### Key Files

- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts` - Main regeneration logic
- `server/providers/combined/tools/writing-shell-stories/prompt-screen-analysis.ts` - Analysis prompt generator
- `server/providers/figma/figma-helpers.ts` - API calls (`fetchFigmaNode`, `fetchFigmaNodesBatch`)
- `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts` - Fetches node data for screens

## Implementation Plan

### Step 1: Create Semantic XML Generator Module

**Goal**: Convert Figma node JSON to lightweight semantic XML

**Location**: `server/providers/figma/semantic-xml-generator.ts`

**New function**: `generateSemanticXml(nodeData: any): string`

**Implementation**:
```typescript
/**
 * Generate semantic XML representation of Figma node tree
 * 
 * Strategy:
 * - Use component/instance names as XML tags
 * - Extract component properties as attributes (State, Property1, etc.)
 * - Mark interactive elements with interactive="true"
 * - Output text content directly (no wrapper tags for text nodes)
 * - Skip noise: IDs, invisible elements, vectors, generic wrappers
 * 
 * @param nodeData - Figma node with children
 * @returns XML string representing semantic structure
 */
export function generateSemanticXml(nodeData: any): string {
  // Convert node tree to XML
  const xmlContent = nodeToSemanticXML(nodeData, 0);
  
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- Semantic structure for Figma screen: ${nodeData.name} -->\n` +
    `<Screen name="${escapeXml(nodeData.name)}" type="${nodeData.type}">\n` +
    xmlContent + '\n' +
    `</Screen>`;
}
```

**Helper functions** (reference implementation in `/temp/figma-to-semantic-xml.mjs`):
- `nodeToSemanticXML(node, depth)` - Recursive converter
- `shouldSkipNode(node)` - Filter vectors, invisible elements, decorative nodes
- `isGenericWrapper(node)` - Identify Frame/Text wrappers to flatten
- `isIconComponent(node)` - Detect icons (skip children)
- `getSemanticTagName(node)` - Convert node name to XML tag
- `getSemanticAttributes(node)` - Extract component properties
- `isInteractive(node)` - Check for interactions/reactions
- `toXmlTagName(str)`, `escapeXml(str)` - XML utilities

**Note**: Reference implementation available at `/temp/figma-to-semantic-xml.mjs` with working examples.

**Optimizations** (from working prototype):
- Skip `visible="false"` nodes
- Skip Vector nodes (icon implementation details)
- Skip generic wrappers: `Background`, `Pixel`, `Icon-wrapper`, `Divider`
- Flatten generic Frame/Group nodes (keep named ones)
- For text nodes: output content directly if tag would duplicate content
- For icon components: self-close without children
- Remove all ID attributes (Figma-internal, no semantic meaning)

**Expected output size**: ~12-14 KB for typical screen (99% reduction from original JSON)

**Validation**: Generated XML should clearly show:
- Component hierarchy (Comment > User > Avatar, Reaction-Statistics > Hover-Card)
- State attributes (State="Hover", State="Count", State="Open")
- Interactive elements (interactive="true")
- Text content (usernames, labels, counts)
- Component variants (Property1="Original", Size="Regular")

### Step 2: Integrate Semantic XML Generation into Screen Analysis

**Goal**: Keep node data and generate semantic XML during screen analysis

**Location**: `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

**Changes needed**:

1. **Modify `RegenerateAnalysesParams` interface** to accept node data:
```typescript
export interface RegenerateAnalysesParams {
  generateText: GenerateTextFn;
  figmaClient: FigmaClient;
  screens: ScreenToAnalyze[];
  allFrames: FigmaNodeMetadata[];
  allNotes: FigmaNodeMetadata[];
  figmaFileKey: string;
  nodesDataMap?: Map<string, any>;  // NEW: Map of nodeId -> full node data
  epicContext?: string;
  notify?: (message: string) => Promise<void>;
}
```

2. **Update `analyzeScreenWithAI` function** to generate and save semantic XML:
```typescript
async function analyzeScreenWithAI(
  screen: ScreenToAnalyze,
  params: {
    generateText: GenerateTextFn;
    allFrames: FigmaNodeMetadata[];
    allNotes: FigmaNodeMetadata[];
    imagesMap: Map<string, any>;
    fileCachePath: string;
    nodesDataMap?: Map<string, any>;  // NEW
    epicContext?: string;
    originalIndex: number;
    totalScreens: number;
  }
): Promise<{ filename: string; analyzed: boolean; notesWritten: number }> {
  const { nodesDataMap, fileCachePath } = params;
  
  // ... existing image and notes handling ...
  
  // NEW: Generate semantic XML if node data available
  let semanticXml: string | undefined;
  if (nodesDataMap) {
    const frameId = frame.id; // Already have this from finding the frame
    const nodeData = nodesDataMap.get(frameId);
    
    if (nodeData) {
      semanticXml = generateSemanticXml(nodeData);
      console.log(`    🔍 Generated semantic XML (${Math.round(semanticXml.length / 1024)} KB) for analysis`);
      
      // Save to debug cache if enabled (optional for debugging)
      if (process.env.SAVE_FIGMA_SEMANTIC_XML_TO_CACHE === 'true') {
        const semanticXmlPath = path.join(fileCachePath, `${filename}.semantic.xml`);
        await fs.writeFile(semanticXmlPath, semanticXml, 'utf-8');
        console.log(`    📁 Saved semantic XML to debug cache`);
      }
    }
  }
  
  // ... existing AI analysis with modified prompt ...
  
  return { filename, analyzed: true, notesWritten };
}
```

3. **Pass node data from calling code** (`figma-screen-setup.ts`):

In `setupFigmaScreens()`, after fetching nodes with `fetchFigmaNodesBatch()`:
```typescript
// Existing code fetches nodes
const nodesMap = await fetchFigmaNodesBatch(figmaClient, fileKey, nodeIds);

// NEW: Pass full node data to regenerateScreenAnalyses
const nodesDataMap = new Map<string, any>();
for (const [nodeId, nodeData] of nodesMap.entries()) {
  nodesDataMap.set(nodeId, nodeData);
}

// Later in the call:
await regenerateScreenAnalyses({
  // ... existing params ...
  nodesDataMap,  // NEW
});
```

**Testing this step**:
- Run `write-shell-stories` on an epic with Figma screens
- Check console logs show semantic XML generation (~12-14 KB typical size)
- Verify analysis quality improves (check `.analysis.md` files reference component states)
- Optional: Set `SAVE_FIGMA_SEMANTIC_XML_TO_CACHE=true` to inspect generated XML files in cache

### Step 3: Update Analysis Prompt to Include Semantic XML

**Goal**: Modify prompt to reference semantic XML when available

**Location**: `server/providers/combined/tools/writing-shell-stories/prompt-screen-analysis.ts`

**Changes**:

1. **Add parameter to `generateScreenAnalysisPrompt`**:
```typescript
export function generateScreenAnalysisPrompt(
  screenName: string,
  screenUrl: string,
  screenPosition: string,
  notesContent?: string,
  epicContext?: string,
  semanticXml?: string  // NEW
): string {
  const hasNotes = !!notesContent;
  const hasEpicContext = !!(epicContext && epicContext.trim());
  const hasSemanticXml = !!semanticXml;  // NEW
  
  return `You are a UX analyst tasked with creating detailed documentation of this screen design. Be exhaustive in documenting every visible element.

# Screen: ${screenName}

- **Figma Node URL:** ${screenUrl}
- **Screen Order:** ${screenPosition}
- **Has Notes:** ${hasNotes ? 'Yes' : 'No'}
- **Has Epic Context:** ${hasEpicContext ? 'Yes' : 'No'}
- **Has Semantic Structure:** ${hasSemanticXml ? 'Yes' : 'No'}  // NEW

## Epic Context & Priorities

${hasEpicContext ? epicContext : 'No epic context available for this analysis.'}

[... epic context usage instructions ...]

${hasSemanticXml ? `
## Figma Semantic Structure

The following XML represents the component hierarchy and semantic structure from Figma's design system. Use this to:
- **Identify component variants**: Look for \`State\` attributes (e.g., State="Hover", State="Open", State="Selected")
- **Detect interaction patterns**: Components with \`interactive="true"\` are clickable/hoverable
- **Understand functionality**: Component names reveal purpose (Hover-Card = tooltip, Text-Listing = list of items, Reaction-Statistics = vote display)
- **Compare similar components**: Multiple instances of the same component with different states show interaction behavior

**Important**: When you see similar visual elements (like multiple comments or cards), check their semantic structure to detect state differences that indicate interactions (hover states, expanded states, selected states, etc.).

\`\`\`xml
${semanticXml}
\`\`\`

` : ''}

## Page Structure
`;
}
```

2. **Add guidance to analysis sections** (after "When comparing similar UI components" note):
```typescript
**When comparing similar UI components:** If you see multiple instances of similar components (comments, cards, list items), compare them carefully. If they differ visually, describe what's different and explain what interaction or state change that difference might represent (e.g., hover state, selected state, active state with revealed information).

**If semantic structure is provided:** Cross-reference the visual differences with the Figma component structure. Look for State attributes or additional child components (like Hover-Card) that confirm what interaction is being shown.
```

3. **Update `analyzeScreenWithAI` call** in `screen-analysis-regenerator.ts`:
```typescript
const analysisPrompt = generateScreenAnalysisPrompt(
  screen.name,
  screen.url,
  screenPosition,
  notesContent || undefined,
  epicContext,
  semanticXml  // NEW
);
```

**Testing this step**:
- Run analysis on screen 1199-79138 (the voter tooltip example)
- Check analysis mentions Hover-Card and identifies voter tooltip correctly
- Verify analysis references State="Hover" vs State="Count" difference
- Confirm analysis explains Reaction-Statistics component behavior

### Step 4: Update Other Tools Using Screen Analysis

**Goal**: Propagate changes to other tools that call `regenerateScreenAnalyses`

**Locations to update**:
1. `server/providers/combined/tools/writing-shell-stories/write-shell-stories.ts`
2. `server/providers/combined/tools/identify-features/identify-features.ts`
3. `server/providers/combined/tools/review-work-item/context-loader.ts` (if it uses screen analysis)

**Pattern**:
- Where `fetchFigmaNodesBatch()` is called, keep the full node data
- Pass `nodesDataMap` to `regenerateScreenAnalyses()`
- No other changes needed (all logic is in regenerator)

**Testing**:
- Run `write-shell-stories` on an epic with multiple Figma screens
- Run `identify-features` on same epic
- Verify both generate semantic XML files
- Confirm analysis quality improved for screens with interaction states

### Step 5: Handle Edge Cases

**Goal**: Ensure robust behavior for various scenarios

**Cases to handle**:

1. **Missing node data** (optional parameter):
   - If `nodesDataMap` not provided, skip semantic XML generation
   - Analysis still works with image only (backward compatible)
   - Log: `"No semantic structure available (node data not provided)"`

2. **Node data fetch failures**:
   - If `fetchFigmaNodesBatch` fails for a node, continue without semantic XML
   - Don't block analysis on semantic XML generation
   - Log warning: `"Semantic XML generation skipped for {nodeId}: {error}"`

3. **Large/complex screens**:
   - Set max XML size limit (200 KB)
   - If XML exceeds limit, truncate with note
   - Log: `"Semantic XML truncated (original: X KB, limit: 200 KB)"`

4. **Invalid XML generation**:
   - Wrap `generateSemanticXml()` in try-catch
   - If generation fails, skip semantic XML but continue analysis
   - Log error: `"Failed to generate semantic XML: {error}"`

5. **Cache invalidation**:
   - Semantic XML is generated on-demand during analysis
   - Semantic XML is only saved to disk when `SAVE_FIGMA_SEMANTIC_XML_TO_CACHE=true` (opt-in debugging)
   - No separate cache management needed

**Testing edge cases**:
- Test with Figma file that has authentication errors
- Test with screen that has deeply nested components (>100 levels)
- Test with screen that has no component instances (only primitives)
- Test cache invalidation by updating Figma file

## Validation Criteria

### Step 1 Complete When:
- [ ] `semantic-xml-generator.ts` module created with all helper functions
- [ ] Unit tests created at `server/providers/figma/semantic-xml-generator.test.ts` with test scenarios:
  - [ ] Nested components (validate hierarchy preservation)
  - [ ] Text nodes (validate content extraction)
  - [ ] Interactive elements (validate `interactive="true"` attribute)
  - [ ] Component states (validate State attributes)
  - [ ] Icon components (validate self-closing, no children)
  - [ ] Edge cases (invisible nodes, vectors, generic wrappers)
  - [ ] Use sample data from `/temp/1199-79138-node-data.json` for realistic test case
- [ ] Generated XML is valid (can be parsed by XML parser)
- [ ] Size reduction achieves ~99% (e.g., 1700 KB → 14 KB)
- [ ] XML preserves: component names, states, interactive flags, text content

### Step 2 Complete When:
- [ ] `RegenerateAnalysesParams` includes `nodesDataMap` parameter
- [ ] `analyzeScreenWithAI` generates semantic XML and passes to prompt
- [ ] Console logs show semantic XML generation
- [ ] Node data passed from `figma-screen-setup.ts`
- [ ] Environment variable `SAVE_FIGMA_SEMANTIC_XML_TO_CACHE=true` enables debug file saving

### Step 3 Complete When:
- [ ] `generateScreenAnalysisPrompt` includes semantic XML section
- [ ] Prompt guidance explains how to use semantic structure
- [ ] Analysis references component names and states from XML
- [ ] Screen 1199-79138 analysis correctly identifies voter tooltip
- [ ] Analysis explains State="Hover" vs State="Count" difference

### Step 4 Complete When:
- [ ] All tools using screen analysis updated
- [ ] `write-shell-stories` uses semantic XML in analysis
- [ ] `identify-features` uses semantic XML in analysis
- [ ] Tests pass for all updated tools

### Step 5 Complete When:
- [ ] Missing node data handled gracefully (no errors)
- [ ] Large screens handled (200 KB max, truncation if needed)
- [ ] Invalid XML generation caught and logged
- [ ] Analysis continues without semantic XML if generation fails
- [ ] Edge case tests all pass

## Expected Benefits

1. **Improved Interaction Detection**: AI can identify hover states, tooltips, expanded states
2. **Component Variant Recognition**: State attributes make variants explicit
3. **Semantic Context**: Component names reveal purpose (Hover-Card, Text-Listing, etc.)
4. **Reduced Ambiguity**: Questions like "Is this anonymous?" answered by structure
5. **Better Feature Descriptions**: Analysis can reference component structure in stories

## Performance Impact

- **Additional API calls**: None (node data already fetched)
- **Processing time**: ~50-100ms per screen for XML generation
- **Storage**: No persistent storage (XML generated in memory for each analysis, optionally saved to cache with `SAVE_FIGMA_SEMANTIC_XML_TO_CACHE=true` for debugging)
- **LLM tokens**: ~3,000-5,000 additional tokens per screen (acceptable for improved analysis)

**Debug Mode**: Set `SAVE_FIGMA_SEMANTIC_XML_TO_CACHE=true` environment variable to save generated XML files to cache directory (`{filename}.semantic.xml`) for inspection and debugging.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| XML generation errors break analysis | Wrap in try-catch, continue without semantic XML |
| Large XML exceeds token limits | Set 200 KB max, truncate with note if needed |
| Figma structure changes break parser | Extensive unit tests, graceful degradation |
| Performance regression | Make node data optional, benchmark before/after |
| Incorrect semantic tags mislead AI | Validate XML structure, add examples in prompt |

## Future Enhancements

1. **Interactive State Detection**: Parse `reactions` field to identify clickable elements
2. **Component Documentation**: Link component names to design system docs
3. **Layout Analysis**: Use bounds/positions to describe spatial relationships
4. **Variant Documentation**: Automatically document all component variants
5. **Figma Comments**: Include design comments from Figma in semantic structure

## Questions

1. Should semantic XML be generated for all screens, or only when requested? (Default: always generate if node data available)

All screens.

2. What should the max XML size limit be? (Proposal: 100 KB - about 7x the typical size)

200 KB.

3. Should we cache semantic XML separately or regenerate with analysis? (Proposal: cache with same invalidation as analysis)

No - generate in memory during analysis. Only save to disk when `SAVE_FIGMA_SEMANTIC_XML_TO_CACHE=true` for debugging purposes.

4. Should the prompt include XML inline or as a separate attachment? (Proposal: inline for small screens <50 KB, attachment for larger)

inline only. 


5. How should we handle screens with no component instances (only primitives)? (Proposal: generate simple XML showing frame hierarchy)

Yes, the frame titles could still be helpful.

---

## Clarifications & Resolutions

### 1. Caching Behavior - RESOLVED

**Issue**: The spec has conflicting statements about caching:
- Step 5 (line 393): "No separate caching needed (temporary use only)"
- Question 3 Answer (line 449): "Yes, cache with same invalidation as analysis"
- Step 2 (line 200): Environment variable `SAVE_FIGMA_SEMANTIC_XML_TO_CACHE` controls saving

**Question**: What is the intended caching behavior?
- **Option A**: Always cache semantic XML files alongside `.analysis.md` files (same lifecycle). The env variable only controls additional debug output/logging.
- **Option B**: Only save semantic XML when the env variable is set (opt-in caching for debugging only).
- **Option C**: Generate semantic XML temporarily in memory only (never save to disk), but env variable allows debug saving.

**Resolution**: Option B - Only save semantic XML when the env variable is set (opt-in caching for debugging only). XML is generated in memory for each analysis and passed to the prompt, but not persisted to disk unless `SAVE_FIGMA_SEMANTIC_XML_TO_CACHE=true`.

### 2. Environment Variable Checking Pattern - RESOLVED

**Issue**: Inconsistent environment variable checking:
- Line 193: Shows `env.SAVE_FIGMA_SEMANTIC_XML_TO_CACHE === '1'`
- Line 200: Shows `process.env.SAVE_FIGMA_SEMANTIC_XML_TO_CACHE === 'true' || process.env.SAVE_FIGMA_SEMANTIC_XML_TO_CACHE === '1'`

**Question**: Which pattern should be used consistently throughout the codebase?
- **Option A**: Check for both `'true'` and `'1'` (more flexible)
- **Option B**: Check only for `'1'` (consistent with other test flags like `TEST_SHORT_AUTH_TOKEN_EXP`)
- **Option C**: Check only for `'true'` (more explicit)

**Resolution**: Option C - Check only for `'true'` (more explicit). Use pattern `process.env.SAVE_FIGMA_SEMANTIC_XML_TO_CACHE === 'true'` throughout.

### 3. Max Size Limit Updates - RESOLVED

**Issue**: Question 2 answer says 200 KB max, but Step 5 code examples still reference 100 KB.

**Question**: Should all references to "100 KB" in Step 5 be updated to "200 KB"?

**Resolution**: Yes - all references to "100 KB" in Step 5 and Risks table updated to "200 KB".

### 4. Prompt Semantic XML Section Placement - RESOLVED

**Issue**: Step 3 uses placeholder comments (`// ... existing sections ...`) without showing where the semantic XML section should appear in the prompt text. (Note: Images are sent as separate content blocks in the message, not in the prompt text.)

**Question**: Where should the Figma Semantic Structure section appear in the prompt text?
- **Option A**: After screen metadata, before "Design Notes & Annotations"
- **Option B**: After "Design Notes & Annotations", before "Epic Context & Priorities"
- **Option C**: After "Epic Context & Priorities", before "Page Structure" (first analysis section)
- **Option D**: After all context sections but before "Analysis Guidelines" (last before AI starts analyzing)

**Resolution**: Option C - After "Epic Context & Priorities", before "Page Structure" (first analysis section). This places semantic XML as the last piece of context before analysis instructions begin, optimizing for recency bias and cross-referencing.

### 5. Helper Function Specifications - RESOLVED

**Issue**: Step 1 lists helper functions but doesn't provide their signatures or detailed behavior. References `/temp/figma-to-semantic-xml.mjs` which may not be accessible.

**Question**: Should Step 1 include complete function signatures and behavior specifications for all helper functions? Example:
```typescript
function nodeToSemanticXML(node: any, depth: number): string
function shouldSkipNode(node: any): boolean
// etc.
```

**Resolution**: Reference implementation at `/temp/figma-to-semantic-xml.mjs` is accessible. No need to duplicate full function signatures in spec - reference the working prototype.

### 6. Test Coverage Specification - RESOLVED

**Issue**: Step 1 validation mentions "Unit tests pass" but doesn't specify:
- What test scenarios should be covered?
- Where should test files be created?
- What assertions validate correct behavior?

**Question**: Should the spec include:
- Specific test scenarios (nested components, text nodes, interactive elements, edge cases)?
- Test file location (e.g., `server/providers/figma/semantic-xml-generator.test.ts`)?
- Key assertions to validate?

**Resolution**: Yes - include specific test scenarios in Step 1 validation:
- Test file: `server/providers/figma/semantic-xml-generator.test.ts`
- Test major behaviors: nested components, text nodes, interactive elements, component states, icons, edge cases
- Use sample data from `/temp/1199-79138-node-data.json` for realistic test cases
- Validate XML output against expected semantic structure

### 7. Backward Compatibility Testing - RESOLVED

**Issue**: Step 2 mentions backward compatibility testing but Step 5 doesn't explicitly include this in validation criteria.

**Question**: Should Step 5 validation criteria explicitly include: "Backward compatibility tested - analysis works correctly when `nodesDataMap` is undefined"?

**Resolution**: Not needed - `nodesDataMap` parameter will always be provided going forward. Remove backward compatibility testing from validation criteria.

### 8. Console Logging Format - RESOLVED

**Issue**: Step 5 specifies log messages but they don't follow the console logging convention from copilot-instructions.md (first log in function has no extra indent, subsequent logs have +2 space indent on message content).

**Question**: Should all console.log examples in the spec be updated to follow the logging convention?

**Resolution**: Yes - console.log examples should follow the convention (first log no extra indent, subsequent logs have +2 space indent on message content). Current examples already follow this pattern correctly.

### 9. Integration with `identify-features` Tool - RESOLVED

**Issue**: Step 4 mentions updating `identify-features` but doesn't verify that this tool actually calls `regenerateScreenAnalyses`.

**Resolution**: Verify during implementation. Step 4 lists likely candidates but implementation should confirm which tools actually call `regenerateScreenAnalyses()` before updating them.
