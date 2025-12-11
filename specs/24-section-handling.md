# Figma SECTION Node Handling

## Problem Statement

Currently, when users link to Figma SECTION nodes in their Jira epic descriptions, the `analyze-feature-scope` and `write-shell-stories` tools fail to process them correctly. 

**Current behavior:**
- `getFramesAndNotesForNode()` in `figma-helpers.ts` only handles `CANVAS`, `FRAME`, and `INSTANCE` (Note) types
- When encountering a `SECTION` node, it returns an empty array with the message: "Node type SECTION is not a CANVAS, FRAME, or Note - returning empty"
- This causes zero screens to be analyzed, resulting in failed tool execution

**Why this matters:**
SECTIONs are commonly used in Figma to group related frames, especially for responsive design variations. For example, a SECTION named "workshop grid responsive design" might contain three child FRAMEs:
- "workshop grid 1024px"
- "workshop grid 768px" 
- "workshop grid 320px"

These frames show the same UI component at different breakpoints and should ideally be analyzed together as a single conceptual "screen" rather than three separate screens.

**Example URL:** 
```
https://www.figma.com/design/3xvfCkL399ZQBlnz6IvqVc/Bitovi-website---Bits-theme?node-id=5107-2952
```

**Figma API Response:**
```json
{
  "type": "SECTION",
  "name": "workshop grid responsive design",
  "children": [
    { "type": "FRAME", "name": "workshop gride 1024px" },
    { "type": "FRAME", "name": "workshop grid 768px" },
    { "type": "FRAME", "name": "workshop grid 320px" }
  ]
}
```

## Current Architecture

### Screen Analysis Flow

1. **Epic parsing** → Extract Figma URLs from Jira epic description
2. **Figma URL parsing** → `parseFigmaUrl()` extracts `fileKey` and `nodeId`
3. **Node type detection** → `getFramesAndNotesForNode()` determines what to extract
4. **Screen setup** → Creates `screens.yaml` with one entry per "screen"
5. **Image download** → Downloads PNG for each screen using batch API
6. **AI analysis** → Analyzes each screen image individually with LLM vision model
7. **Scope/story generation** → Uses analysis results to generate scope or stories

### Key Functions

**`getFramesAndNotesForNode(fileData, nodeId)`** (figma-helpers.ts:610-670)
- **CANVAS**: Returns first-level children that are FRAMEs or Notes
- **FRAME**: Returns just that single frame
- **INSTANCE + name="Note"**: Returns just that note
- **Other types (including SECTION)**: Returns empty array ❌

**`setupFigmaScreens()`** (writing-shell-stories/figma-screen-setup.ts)
- Calls `getFramesAndNotesForNode()` for each Figma URL
- Creates `screens.yaml` with one entry per frame/note
- Associates notes with nearest frames based on spatial distance

**`regenerateScreenAnalyses()`** (shared/screen-analysis-regenerator.ts)
- Downloads images for screens missing `.analysis.md` files
- Calls LLM with single image + prompt per screen
- Saves analysis to `{nodeId}.analysis.md`

## Solution Options

### Option 1: Treat SECTION as CANVAS (Expand to Children)

**Behavior:** When a SECTION is encountered, extract all child FRAMEs as individual screens (same as CANVAS behavior).

**Implementation:**
```typescript
// In getFramesAndNotesForNode()
if (targetNode.type === 'CANVAS' || targetNode.type === 'SECTION') {
  console.log(`  Node is ${targetNode.type} - collecting first-level frames and notes`);
  
  const results: FigmaNodeMetadata[] = [];
  if (targetNode.children && Array.isArray(targetNode.children)) {
    for (const child of targetNode.children) {
      if (child.type === 'FRAME') {
        results.push(extractNodeMetadata(child));
      } else if (child.type === 'INSTANCE' && child.name === 'Note') {
        results.push(extractNodeMetadata(child));
      }
    }
  }
  
  return results;
}
```

**Pros:**
- ✅ Simple 5-line change
- ✅ Minimal disruption to existing architecture
- ✅ Each frame gets analyzed individually (better for complex designs)
- ✅ Works with existing caching (one `.analysis.md` per frame)

**Cons:**
- ❌ Responsive design variations analyzed separately (e.g., "1024px", "768px", "320px" are 3 screens)
- ❌ AI doesn't understand these are the same component at different breakpoints
- ❌ May generate duplicate/redundant features in scope analysis
- ❌ Doesn't leverage the semantic grouping that SECTION provides

**Best for:** When SECTIONs contain truly different screens (not responsive variations)

---

### Option 2: Treat SECTION as Single Composite Screen (Recommended)

**Behavior:** When a SECTION is encountered, download images for all child FRAMEs and send them together in a single AI analysis request.

**Implementation:**

**Step 1:** Modify `getFramesAndNotesForNode()` to return SECTION metadata with children:
```typescript
// In getFramesAndNotesForNode()
if (targetNode.type === 'SECTION') {
  console.log('  Node is SECTION - returning section with child frames');
  
  const metadata = extractNodeMetadata(targetNode);
  
  // Mark as composite screen with child frames
  metadata.isComposite = true;
  metadata.childFrames = targetNode.children
    ?.filter(child => child.type === 'FRAME')
    .map(child => extractNodeMetadata(child)) || [];
  
  return [metadata];
}
```

**Step 2:** Update `FigmaNodeMetadata` interface:
```typescript
export interface FigmaNodeMetadata {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  absoluteBoundingBox: { x: number; y: number; width: number; height: number; } | null;
  children?: any[];
  
  // New fields for SECTION handling
  isComposite?: boolean;           // True if this is a SECTION with multiple frames
  childFrames?: FigmaNodeMetadata[]; // Child FRAME metadata for composite screens
}
```

**Step 3:** Modify `regenerateScreenAnalyses()` to handle composite screens:
```typescript
// In regenerateScreenAnalyses() - Phase A: Batch download
for (const screen of screensToAnalyze) {
  const frame = allFrames.find(f => screen.url.includes(f.id.replace(/:/g, '-')));
  
  if (!frame) continue;
  
  // For composite screens (SECTIONs), download all child frames
  if (frame.isComposite && frame.childFrames) {
    for (const childFrame of frame.childFrames) {
      frameIds.push(childFrame.id);
      // Map child frame back to parent SECTION
      screenFrameMap.set(childFrame.id, { screen, frameId: frame.id, originalIndex });
    }
  } else {
    // Regular frame
    frameIds.push(frame.id);
    screenFrameMap.set(frame.id, { screen, frameId: frame.id, originalIndex });
  }
}

// Batch download all images (including child frames)
const imagesMap = await downloadFigmaImagesBatch(figmaClient, figmaFileKey, frameIds, { format: 'png', scale: 1 });
```

**Step 4:** Update AI analysis prompt to handle multiple images:
```typescript
// In regenerateScreenAnalyses() - Phase B: Analyze
for (const screen of screensToAnalyze) {
  const frame = allFrames.find(f => screen.url.includes(f.id.replace(/:/g, '-')));
  
  if (frame.isComposite && frame.childFrames) {
    // Composite screen - gather all child images
    const images = [];
    for (const childFrame of frame.childFrames) {
      const imageData = imagesMap.get(childFrame.id);
      if (imageData) {
        images.push({
          name: childFrame.name,
          data: imageData.data,
          mimeType: imageData.mimeType
        });
      }
    }
    
    // Generate analysis with multiple images
    const prompt = generateScreenAnalysisPrompt(
      screen.name,
      epicContext,
      originalIndex + 1,
      screens.length,
      screen.notes,
      true // isComposite flag
    );
    
    const analysisResult = await generateText({
      systemPrompt: SCREEN_ANALYSIS_SYSTEM_PROMPT,
      userPrompt: prompt,
      maxTokens: SCREEN_ANALYSIS_MAX_TOKENS * 2, // More tokens for multiple images
      images: images.map(img => ({
        data: img.data,
        mimeType: img.mimeType
      }))
    });
    
    // Save analysis
    const analysisPath = path.join(fileCachePath, `${screen.name}.analysis.md`);
    await fs.writeFile(analysisPath, analysisResult.text);
    
  } else {
    // Regular single-image analysis (existing code)
    // ...
  }
}
```

**Step 5:** Update `generateScreenAnalysisPrompt()` to handle composite screens:
```typescript
export function generateScreenAnalysisPrompt(
  screenName: string,
  epicContext: string | undefined,
  screenNumber: number,
  totalScreens: number,
  associatedNotes: string[] | undefined,
  isComposite: boolean = false
): string {
  const compositeInstructions = isComposite 
    ? `
**IMPORTANT: This is a composite screen showing multiple images (e.g., responsive design breakpoints).**

You are analyzing ${screenName} which contains multiple related frames shown at different sizes or states.
These images show the same UI component/feature at different breakpoints or variations.

When analyzing:
1. Identify the core UI component/feature that's consistent across all images
2. Note how the layout adapts across different sizes (if responsive design)
3. List behaviors and interactions that are consistent
4. Flag any differences in functionality between variations
5. Provide a single unified analysis that covers all variations

Do not repeat the same feature description for each image. Synthesize into one coherent analysis.
`
    : '';

  return `You are analyzing screen #${screenNumber} of ${totalScreens}...
${compositeInstructions}
...rest of prompt...`;
}
```

**Pros:**
- ✅ Honors the semantic grouping that SECTION provides
- ✅ AI understands responsive variations as a single feature
- ✅ Avoids duplicate feature identification
- ✅ More accurate scope analysis for responsive designs
- ✅ Better alignment with designer intent (they grouped these for a reason!)

**Cons:**
- ⚠️ More complex implementation (~50-100 lines across multiple files)
- ⚠️ Requires modifying `FigmaNodeMetadata` interface
- ⚠️ Caching strategy needs consideration (one `.analysis.md` for SECTION, not per child)
- ⚠️ Higher token cost per analysis (multiple images in one request)
- ⚠️ May exceed vision model context limits for SECTIONs with many children (10+ frames)

**Best for:** When SECTIONs primarily contain responsive design variations

---

### Option 3: Hybrid Approach (User Choice)

**Behavior:** Detect SECTION node and provide two modes:
1. **Composite mode** (default): Treat as single screen with multiple images
2. **Expanded mode**: Treat as CANVAS and extract individual frames

**Implementation:** Add URL parameter or epic description directive:
```markdown
# Epic Description

## Figma Designs

- https://figma.com/...?node-id=5107-2952 <!-- default: composite -->
- https://figma.com/...?node-id=5107-2952&expand-sections=true <!-- expanded -->

OR use magic comment:
<!-- figma-sections: expand -->
- https://figma.com/...?node-id=5107-2952
```

**Pros:**
- ✅ Flexibility for different use cases
- ✅ Handles both responsive design and heterogeneous content

**Cons:**
- ❌ More complex UX (requires user understanding of distinction)
- ❌ Added implementation complexity
- ❌ Harder to document and explain

**Best for:** Teams with varied SECTION usage patterns

## Recommendation

**Implement Option 2 (Composite Screen)** with these considerations:

1. **Start with basic composite support:**
   - Treat SECTION as single screen
   - Download all child frame images
   - Send all images in single AI request
   - Generate one `.analysis.md` file

2. **Add safety limits:**
   - Max 5 child frames per SECTION (to avoid token limit issues)
   - If SECTION has >5 children, fall back to Option 1 (expand to individual frames)
   - Log warning when falling back

3. **Document clearly:**
   - Update README.md to explain SECTION behavior
   - Add example showing responsive design use case
   - Document the 5-frame limit

4. **Consider future enhancement:**
   - Could add `expand-sections` URL parameter later if users request it
   - Could detect "non-responsive" SECTIONs heuristically (different names, etc.) and auto-expand

## Implementation Steps

### Step 1: Extend FigmaNodeMetadata Interface
**File:** `server/providers/figma/figma-helpers.ts`

Add fields to support composite screens:
```typescript
export interface FigmaNodeMetadata {
  // ... existing fields ...
  isComposite?: boolean;
  childFrames?: FigmaNodeMetadata[];
}
```

**Test:** TypeScript compilation succeeds

---

### Step 2: Update getFramesAndNotesForNode() 
**File:** `server/providers/figma/figma-helpers.ts`

Add SECTION handling logic with 5-frame safety limit:
```typescript
// After CANVAS check, before FRAME check:
if (targetNode.type === 'SECTION') {
  console.log('  Node is SECTION - checking child frames');
  
  const childFrames = targetNode.children?.filter(c => c.type === 'FRAME') || [];
  
  // Safety limit: max 5 frames to avoid token limits
  if (childFrames.length > 5) {
    console.log(`  ⚠️  SECTION has ${childFrames.length} child frames (>5) - falling back to expanded mode`);
    // Fall back to expanded mode (treat like CANVAS)
    const results: FigmaNodeMetadata[] = [];
    for (const child of childFrames) {
      results.push(extractNodeMetadata(child));
    }
    return results;
  }
  
  // Composite mode: return SECTION with child metadata
  console.log(`  ✓ SECTION has ${childFrames.length} child frames - using composite mode`);
  const metadata = extractNodeMetadata(targetNode);
  metadata.isComposite = true;
  metadata.childFrames = childFrames.map(c => extractNodeMetadata(c));
  return [metadata];
}
```

**Test:** 
1. Call with SECTION node (≤5 frames) → Returns 1 metadata with `isComposite: true`
2. Call with SECTION node (>5 frames) → Returns N metadata entries (one per frame)
3. Verify child frames are properly included in `childFrames` array

---

### Step 3: Update Image Download Logic
**File:** `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

Modify Phase A to download child frame images for composite screens:
```typescript
// In "Phase A: Batch download" section
for (const screen of screensToAnalyze) {
  const frame = allFrames.find(f => screen.url.includes(f.id.replace(/:/g, '-')));
  
  if (!frame) {
    console.log(`  ⚠️  Frame not found for screen: ${screen.name}`);
    continue;
  }
  
  const originalIndex = screens.indexOf(screen);
  
  // Check if this is a composite screen (SECTION with child frames)
  if (frame.isComposite && frame.childFrames && frame.childFrames.length > 0) {
    console.log(`  🖼️  Composite screen ${screen.name} - downloading ${frame.childFrames.length} child images`);
    
    // Add all child frame IDs for batch download
    for (const childFrame of frame.childFrames) {
      screenFrameMap.set(childFrame.id, { screen, frameId: frame.id, originalIndex, isChildOfComposite: true });
      frameIds.push(childFrame.id);
    }
  } else {
    // Regular single frame
    screenFrameMap.set(frame.id, { screen, frameId: frame.id, originalIndex });
    frameIds.push(frame.id);
  }
}
```

**Test:**
1. Composite screen with 3 child frames → 3 frame IDs added to `frameIds`
2. Regular screen → 1 frame ID added
3. Verify `screenFrameMap` correctly associates child frames with parent SECTION

---

### Step 4: Update AI Analysis to Handle Multiple Images
**File:** `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

Modify Phase B to send multiple images for composite screens:
```typescript
// In "Phase B: Analyze screens" loop
for (let i = 0; i < screensToAnalyze.length; i++) {
  const screen = screensToAnalyze[i];
  const originalIndex = screens.indexOf(screen);
  
  const frame = allFrames.find(f => screen.url.includes(f.id.replace(/:/g, '-')));
  if (!frame) continue;
  
  // Check if this is a composite screen
  if (frame.isComposite && frame.childFrames && frame.childFrames.length > 0) {
    console.log(`  🤖 Analyzing composite screen: ${screen.name} (${frame.childFrames.length} images)`);
    
    // Gather all child frame images
    const images: Array<{ name: string; data: Buffer; mimeType: string }> = [];
    
    for (const childFrame of frame.childFrames) {
      const imageData = imagesMap.get(childFrame.id);
      if (imageData && imageData.data) {
        images.push({
          name: childFrame.name,
          data: imageData.data,
          mimeType: imageData.mimeType || 'image/png'
        });
      }
    }
    
    if (images.length === 0) {
      console.log(`  ⚠️  No images found for composite screen: ${screen.name}`);
      continue;
    }
    
    // Generate prompt for composite screen
    const prompt = generateScreenAnalysisPrompt(
      screen.name,
      epicContext,
      originalIndex + 1,
      screens.length,
      screen.notes,
      true // isComposite = true
    );
    
    // Call LLM with multiple images
    const analysisResult = await generateText({
      systemPrompt: SCREEN_ANALYSIS_SYSTEM_PROMPT,
      userPrompt: prompt,
      maxTokens: SCREEN_ANALYSIS_MAX_TOKENS * 2, // Double tokens for multiple images
      images: images.map(img => ({
        data: img.data,
        mimeType: img.mimeType
      }))
    });
    
    // Save analysis
    const analysisPath = path.join(fileCachePath, `${screen.name}.analysis.md`);
    await fs.writeFile(analysisPath, analysisResult.text);
    analyzedScreens++;
    
  } else {
    // Regular single-image analysis (existing code path)
    // ... keep existing code ...
  }
}
```

**Test:**
1. Composite screen → Multiple images sent to LLM in single request
2. Regular screen → Single image sent (existing behavior)
3. Verify `.analysis.md` file saved with SECTION node ID as filename

---

### Step 5: Update Prompt Generation
**File:** `server/providers/combined/tools/writing-shell-stories/prompt-screen-analysis.ts`

Add `isComposite` parameter and instructions:
```typescript
export function generateScreenAnalysisPrompt(
  screenName: string,
  epicContext: string | undefined,
  screenNumber: number,
  totalScreens: number,
  associatedNotes: string[] | undefined,
  isComposite: boolean = false
): string {
  // Build composite screen instructions if applicable
  const compositeSection = isComposite 
    ? `
## 🎯 COMPOSITE SCREEN ANALYSIS

**You are analyzing a composite screen containing multiple related images.**

This screen (${screenName}) shows the same UI component at different:
- Screen sizes (responsive breakpoints: desktop, tablet, mobile)
- States (default, hover, active, error)
- Variations (light theme, dark theme)

**Analysis Instructions:**
1. **Identify the core feature/component** shown across all images
2. **Note layout adaptations** - how the design changes across sizes/states
3. **List consistent behaviors** - interactions that work the same way
4. **Flag differences** - any functionality that changes between variations
5. **Provide unified analysis** - synthesize into one coherent description

❌ **DO NOT** repeat the same description for each image
✅ **DO** provide one analysis covering all variations

Example:
"The navigation menu adapts responsively: desktop shows horizontal menu bar, 
tablet shows collapsed hamburger icon, mobile shows bottom tab bar."
`
    : '';

  // Build notes section if provided
  const notesSection = associatedNotes && associatedNotes.length > 0
    ? `
## 📝 Associated Figma Notes

${associatedNotes.map((note, i) => `### Note ${i + 1}\n${note}`).join('\n\n')}
`
    : '';

  // Build epic context section if provided
  const epicContextSection = epicContext?.trim()
    ? `
## 📋 Epic Context

${epicContext}

Use this context to understand project goals, scope, and constraints.
`
    : '';

  return `You are analyzing screen #${screenNumber} of ${totalScreens}: **${screenName}**

${compositeSection}

${notesSection}

${epicContextSection}

## 🎯 Analysis Tasks

1. **UI Elements**: List all interactive and non-interactive components
2. **User Actions**: Describe what users can do on this screen
3. **Data & Content**: Identify what information is displayed
4. **Navigation**: Explain how users move to/from this screen
5. **Business Logic**: Note any rules, validations, or calculations
6. **Edge Cases**: Consider error states, empty states, loading states

## 📐 Output Format

Provide analysis as markdown with clear sections. Be specific and evidence-based.
Only describe what you can see in the image(s) or what is documented in notes.
`;
}
```

**Test:**
1. Call with `isComposite: true` → Prompt includes composite instructions
2. Call with `isComposite: false` → Prompt omits composite instructions (existing behavior)

---

### Step 6: Update Documentation
**Files:** 
- `server/providers/combined/tools/analyze-feature-scope/README.md`
- `server/providers/combined/tools/writing-shell-stories/README.md`
- `docs/getting-started-creating-epic-with-figma-links.md`

Add section explaining SECTION handling:

```markdown
### Figma SECTION Nodes

Figma SECTIONs (organizational containers) are treated as **composite screens** - 
all child frames are analyzed together in a single AI request.

**Example:** A SECTION named "Dashboard responsive design" with three child frames:
- "Dashboard 1440px" (desktop)
- "Dashboard 768px" (tablet)  
- "Dashboard 320px" (mobile)

The tool will:
1. Download images for all three frames
2. Send all three images to AI in one analysis request
3. Generate one `.analysis.md` file with unified analysis
4. Create one scope analysis entry covering all breakpoints

**Limit:** SECTIONs with >5 child frames are automatically expanded into separate screens 
to avoid AI context limits.

**Best Practice:** Use SECTIONs to group responsive design variations or closely related 
UI states (hover, active, error) that should be analyzed together.
```

**Test:** Documentation is clear and includes practical examples

---

### Step 7: Integration Testing
**Manual test:**

1. Create/update Jira epic with SECTION URL:
   ```
   https://www.figma.com/design/3xvfCkL399ZQBlnz6IvqVc/?node-id=5107-2952
   ```

2. Run `analyze-feature-scope`:
   ```bash
   node --import ./loader.mjs scripts/api/analyze-feature-scope.ts https://bitovi.atlassian.net/browse/EPIC-123
   ```

3. **Verify:**
   - ✅ Tool logs "SECTION has 3 child frames - using composite mode"
   - ✅ 3 images downloaded
   - ✅ 1 analysis file created (`5107:2952.analysis.md`)
   - ✅ Analysis mentions multiple breakpoints/sizes
   - ✅ Scope analysis treats as single feature (not 3 separate features)

4. **Test fallback (>5 frames):**
   - Link to SECTION with 8 child frames
   - ✅ Tool logs "SECTION has 8 child frames (>5) - falling back to expanded mode"
   - ✅ 8 separate analysis files created
   - ✅ 8 separate scope entries generated

**Test:**
- Composite mode works for ≤5 frames
- Fallback mode works for >5 frames
- Error handling works for missing images, API failures

---

## Questions

1. **Should we use a different token multiplier for composite screens?** Currently suggesting `maxTokens * 2` for composite screens with multiple images. Should this be configurable or scale with number of images?

2. **How should caching work for composite screens?** Currently one `.analysis.md` file per SECTION. Should we cache individual child frame images separately for reuse if they appear in different SECTIONs?

3. **Should the 5-frame limit be configurable?** Hard-coded at 5 frames to avoid token limits. Should this be an environment variable or epic directive?

4. **What if a SECTION contains non-FRAME children?** Current implementation only extracts FRAME children. Should we also extract nested SECTIONs, or only process first-level FRAMEs?

5. **Should we support explicit opt-out of composite mode?** If a user wants a SECTION expanded into individual screens, should we provide a URL parameter or epic directive (e.g., `?expand-sections=true`)?

6. **How should progress notifications work?** Should notify show "Analyzing 1 of 3 screens" (counting SECTIONs) or "Analyzing 3 of 10 frames" (counting individual frames)?