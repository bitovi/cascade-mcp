# Figma SECTION Node Handling - Expand to Children

## Problem Statement

Currently, when users link to Figma SECTION nodes in their Jira epic descriptions, the `analyze-feature-scope` and `write-shell-stories` tools fail to process them correctly.

**Current behavior:**
- `getFramesAndNotesForNode()` in `figma-helpers.ts` only handles `CANVAS`, `FRAME`, and `INSTANCE` (Note) types
- When encountering a `SECTION` node, it returns an empty array with the message: "Node type SECTION is not a CANVAS, FRAME, or Note - returning empty"
- This causes zero screens to be analyzed, resulting in failed tool execution

**Why SECTIONs are used arbitrarily:**
After discussing with designers, we've learned that SECTIONs are used for various organizational purposes:
- ✅ Grouping responsive design variations (desktop, tablet, mobile)
- ✅ Organizing related screens by workflow
- ✅ Separating different feature areas
- ✅ Just keeping the Figma file tidy

**The key insight:** There's no consistent semantic meaning to SECTION grouping. Sometimes frames within a SECTION are related (responsive variants), but often they're completely different screens that happen to be organized together.

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
    { "type": "FRAME", "name": "workshop gride 1024px", "id": "5101:4299" },
    { "type": "FRAME", "name": "workshop grid 768px", "id": "5101:4300" },
    { "type": "FRAME", "name": "workshop grid 320px", "id": "5101:4301" }
  ]
}
```

## Solution: Expand SECTIONs to Individual Frames

**Approach:** Treat SECTION nodes like CANVAS nodes - extract all child FRAMEs as separate screens, but with enhanced naming that preserves context.

**Key principles:**
1. **Expand by default** - Each child FRAME becomes a separate screen
2. **Preserve context in filenames** - Include both SECTION name and FRAME name with node ID
3. **Let AI detect relationships** - AI prompts should identify when screens are responsive variants
4. **Keep individual analysis files** - One `.analysis.md` per frame for better caching and granularity

## Implementation Details

### 1. Filename Convention

**Format:** `{frame-slug}_{node-id}.analysis.md`

**Components:**
- `{frame-slug}` - Kebab-case version of child FRAME name  
- `{node-id}` - Node ID in URL format (e.g., `5101-4299`)

**Examples:**
```
workshop-grid-1024px_5101-4299.analysis.md
workshop-grid-768px_5101-4300.analysis.md
workshop-grid-320px_5101-4301.analysis.md
```

**Why not include SECTION name in filename?**
The filename must be derivable from just the Figma URL and node metadata. When we fetch a node by ID, we get the FRAME metadata but not its parent SECTION context. Including the SECTION name would require additional API calls or complex parent lookups.

**Solution:** Store SECTION context in the analysis file content as a title/header instead.

**Benefits:**
- ✅ Filename derivable from node ID + frame name only
- ✅ Node ID ensures uniqueness (frames can have duplicate names)
- ✅ Human-readable frame identification
- ✅ Works with existing Figma API response structure
- ✅ No additional API calls needed

**Slug generation:**
```typescript
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')      // Spaces to dashes
    .replace(/-+/g, '-')       // Collapse multiple dashes
    .replace(/^-|-$/g, '');    // Trim leading/trailing dashes
}
```

### 2. Screen Metadata Structure

**Current `screens.yaml` format:**
```yaml
- name: "5101:4299"
  url: https://www.figma.com/design/...?node-id=5101-4299
  notes: []
```

**Enhanced format with SECTION context:**
```yaml
- name: "5101:4299"
  frameName: "workshop grid 1024px"
  sectionName: "workshop grid responsive design"
  sectionId: "5107:2952"
  url: https://www.figma.com/design/...?node-id=5101-4299
  notes: []
  filename: "workshop-grid-1024px_5101-4299"
```

**Fields:**
- `name` - Node ID (existing, for backward compatibility)
- `frameName` - Human-readable frame name (NEW)
- `sectionName` - Parent SECTION name if applicable (NEW, optional)
- `sectionId` - Parent SECTION ID if applicable (NEW, optional)
- `url` - Full Figma URL (existing)
- `notes` - Associated notes (existing)
- `filename` - Filename without extension (NEW) - used for `.analysis.md` and `.png` files

### 3. Code Changes

#### Step 1: Update `getFramesAndNotesForNode()`
**File:** `server/providers/figma/figma-helpers.ts`

Add a new helper function to extract common logic, then handle SECTION like CANVAS:

```typescript
/**
 * Helper: Extract first-level frames and notes from a container node's children
 * NEW FUNCTION - Add this helper to figma-helpers.ts
 * Used by both CANVAS and SECTION handling
 * 
 * @param containerNode - The parent node (CANVAS or SECTION)
 * @returns Array of frame and note metadata
 */
function extractFramesAndNotesFromChildren(
  containerNode: any
): FigmaNodeMetadata[] {
  const results: FigmaNodeMetadata[] = [];
  
  if (containerNode.children && Array.isArray(containerNode.children)) {
    for (const child of containerNode.children) {
      // Frames are type === "FRAME"
      if (child.type === 'FRAME') {
        const metadata = extractNodeMetadata(child);
        results.push(metadata);
      }
      // Notes are type === "INSTANCE" with name === "Note"
      else if (child.type === 'INSTANCE' && child.name === 'Note') {
        const metadata = extractNodeMetadata(child);
        results.push(metadata);
      }
    }
  }
  
  return results;
}

// In getFramesAndNotesForNode():

// Check if this is a CANVAS (page)
if (targetNode.type === 'CANVAS') {
  console.log('  Node is CANVAS - collecting first-level frames and notes');
  const results = extractFramesAndNotesFromChildren(targetNode, false);
  console.log(`  Collected ${results.length} first-level frames/notes from CANVAS`);
  return results;
}

// Check if this is a SECTION
if (targetNode.type === 'SECTION') {
  console.log(`  Node is SECTION: "${targetNode.name}" - expanding to child frames`);
  const results = extractFramesAndNotesFromChildren(targetNode, true);
  console.log(`  Collected ${results.length} frames/notes from SECTION`);
  return results;
}

// Check if this is a FRAME
if (targetNode.type === 'FRAME') {
  console.log('  Node is FRAME - returning single node');
  return [extractNodeMetadata(targetNode)];
}

// Check if this is a note (INSTANCE with name "Note")
if (targetNode.type === 'INSTANCE' && targetNode.name === 'Note') {
  console.log('  Node is Note (INSTANCE) - returning single node');
  return [extractNodeMetadata(targetNode)];
}

console.log(`  Node type ${targetNode.type} is not a CANVAS, SECTION, FRAME, or Note - returning empty`);
return [];
```

**Usage in `getFramesAndNotesForNode()`:**
```typescript
// Check if this is a CANVAS (page)
if (targetNode.type === 'CANVAS') {
  console.log('  Node is CANVAS - collecting first-level frames and notes');
  const results = extractFramesAndNotesFromChildren(targetNode, false);
  console.log(`  Collected ${results.length} first-level frames/notes from CANVAS`);
  return results;
}

// Check if this is a SECTION
if (targetNode.type === 'SECTION') {
  console.log(`  Node is SECTION: "${targetNode.name}" - expanding to child frames`);
  const results = extractFramesAndNotesFromChildren(targetNode, true);
  console.log(`  Collected ${results.length} frames/notes from SECTION`);
  return results;
}

// Check if this is a FRAME
if (targetNode.type === 'FRAME') {
  console.log('  Node is FRAME - returning single node');
  return [extractNodeMetadata(targetNode)];
}

// Check if this is a note (INSTANCE with name "Note")
if (targetNode.type === 'INSTANCE' && targetNode.name === 'Note') {
  console.log('  Node is Note (INSTANCE) - returning single node');
  return [extractNodeMetadata(targetNode)];
}

console.log(`  Node type ${targetNode.type} is not a CANVAS, SECTION, FRAME, or Note - returning empty`);
return [];
```

**Test:**
- SECTION with 3 FRAMEs → Returns 3 metadata entries
- SECTION with 0 FRAMEs → Returns empty array
- CANVAS behavior unchanged
- Helper function is reusable for both CANVAS and SECTION

#### Step 2: Extend `FigmaNodeMetadata` Interface
**File:** `server/providers/figma/figma-helpers.ts`

```typescript
export interface FigmaNodeMetadata {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  absoluteBoundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  children?: any[];
}
```

**Test:** TypeScript compilation succeeds

#### Step 3: Add Filename Generation Utility
**File:** `server/providers/figma/figma-helpers.ts`

```typescript
/**
 * Convert string to kebab-case slug
 * @param str - Input string
 * @returns Kebab-case slug
 */
export function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')  // Remove special chars except spaces and dashes
    .replace(/\s+/g, '-')       // Spaces to dashes
    .replace(/-+/g, '-')        // Collapse multiple dashes
    .replace(/^-|-$/g, '');     // Trim leading/trailing dashes
}

/**
 * Generate filename for a screen analysis file
 * 
 * Format: {frame-slug}_{node-id}
 * 
 * Examples:
 * - "workshop-grid-1024px_5101-4299"
 * - "dashboard-main_1234-5678"
 * 
 * @param frameName - Name of the frame
 * @param nodeId - Node ID in API format (e.g., "5101:4299")
 * @returns Filename without extension
 */
export function generateScreenFilename(
  frameName: string,
  nodeId: string
): string {
  const frameSlug = toKebabCase(frameName);
  const nodeIdSlug = nodeId.replace(/:/g, '-'); // Convert "5101:4299" to "5101-4299"
  
  return `${frameSlug}_${nodeIdSlug}`;
}
```

**Test:**
```typescript
generateScreenFilename("workshop grid 1024px", "5101:4299")
// → "workshop-grid-1024px_5101-4299"

generateScreenFilename("Dashboard Main", "1234:5678")
// → "dashboard-main_1234-5678"

generateScreenFilename("User Profile (Editing)", "9999:1111")
// → "user-profile-editing_9999-1111"
```

#### Step 4: Extend `Screen` Interface
**File:** `server/providers/combined/tools/writing-shell-stories/screen-analyzer.ts`

```typescript
/**
 * Screen with associated notes
 */
export interface Screen {
  name: string;           // Node ID (existing)
  url: string;            // Figma URL (existing)
  notes: string[];        // Associated notes (existing)
  
  // New fields for enhanced metadata
  frameName?: string;     // Human-readable frame name
  sectionName?: string;   // Parent SECTION name if applicable
  sectionId?: string;     // Parent SECTION ID if applicable
  filename?: string;      // Filename without extension for .analysis.md and .png files
}
```

**Test:** TypeScript compilation succeeds

#### Step 5: Track SECTION Context During URL Processing
**File:** `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts`

**Challenge:** Since `FigmaNodeMetadata` no longer stores parent SECTION info, we need to track which frames came from which SECTION URLs during the URL processing phase.

**Solution:** When processing Figma URLs, if a URL points to a SECTION node, remember the SECTION name/ID and associate it with all child frames extracted from that SECTION.

```typescript
// In fetchFigmaMetadataFromUrls() or similar function
for (const url of figmaUrls) {
  const nodeId = extractNodeIdFromUrl(url);
  const frames = getFramesAndNotesForNode(fileData, nodeId);
  
  // Check if the original URL pointed to a SECTION
  const originalNode = findNodeInDocument(fileData.document, nodeId);
  if (originalNode?.type === 'SECTION') {
    // Tag all extracted frames with this SECTION context
    frames.forEach(frame => {
      frame.sectionName = originalNode.name;
      frame.sectionId = originalNode.id;
    });
  }
  
  allFramesAndNotes.push(...frames);
}
```

#### Step 6: Update `setupFigmaScreens()` to Use New Filenames
**File:** `server/providers/combined/tools/writing-shell-stories/figma-screen-setup.ts`

```typescript
// When building screen entries, generate filename and use SECTION context
const screens = framesAndNotes
  .filter(frame => frame.type === 'FRAME')
  .map(frame => {
    const filename = generateScreenFilename(frame.name, frame.id);
    
    return {
      name: frame.id,
      frameName: frame.name,
      sectionName: frame.sectionName,  // From URL processing step
      sectionId: frame.sectionId,      // From URL processing step
      url: `https://www.figma.com/design/${figmaFileKey}?node-id=${frame.id.replace(/:/g, '-')}`,
      notes: nearbyNotes[frame.id] || [],
      filename: filename
    };
  });
```

**screens.yaml output:**
```yaml
- name: "5101:4299"
  frameName: "workshop grid 1024px"
  sectionName: "workshop grid responsive design"
  sectionId: "5107:2952"
  url: "https://www.figma.com/design/3xvfCkL399ZQBlnz6IvqVc?node-id=5101-4299"
  notes: []
  filename: "workshop-grid-1024px_5101-4299"
```

**Test:**
- SECTION frames include `sectionName` and `sectionId` fields
- Standalone frames have these fields as `undefined`
- `filename` field populated for all screens
- Filename matches expected format

#### Step 7: Update `regenerateScreenAnalyses()` to Use Filename
**File:** `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

```typescript
// Use filename from screen metadata instead of just node ID
for (const screen of screensToAnalyze) {
  // Determine filename: use screen.filename if available, fallback to node ID
  const filename = screen.filename || screen.name;
  const analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);
  const imagePath = path.join(fileCachePath, `${filename}.png`);
  
  // ... rest of analysis logic ...
  
  // Save analysis with new filename
  await fs.writeFile(analysisPath, analysisResult.text);
  
  // Save image with new filename
  if (imageData && imageData.data) {
    await fs.writeFile(imagePath, imageData.data);
  }
}
```

**Test:**
- `.analysis.md` files created with format: `{frame}_{id}.analysis.md`
- `.png` files created with matching names
- SECTION context preserved in file content (not filename)

#### Step 8: Add SECTION Context to Analysis File Header
**File:** `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

Prepend SECTION context to analysis content:

```typescript
// After getting analysisResult from generateText()
let finalAnalysisContent = analysisResult.text;

// If this frame is from a SECTION, prepend context header
if (screen.sectionName) {
  const sectionHeader = `# ${screen.frameName}\n\n**Part of SECTION:** ${screen.sectionName}\n**Frame ID:** ${screen.name}\n\n---\n\n`;
  finalAnalysisContent = sectionHeader + analysisResult.text;
}

// Save analysis with header
await fs.writeFile(analysisPath, finalAnalysisContent);
```

**Example output file (`workshop-grid-1024px_5101-4299.analysis.md`):**
```markdown
# workshop grid 1024px

**Part of SECTION:** workshop grid responsive design
**Frame ID:** 5101:4299

---

## UI Elements
- Grid layout with 4 columns
...
```

**Test:**
- Analysis files from SECTIONs include header with SECTION name
- Header includes both human-readable frame name and technical ID
- Analysis files from standalone frames don't have SECTION header

#### Step 9: Future Enhancement - Scope Analysis Prompt (Optional)

**⚠️ NOT IMPLEMENTED IN PHASE 1** - Wait to see how scope analysis handles SECTION frames naturally before making prompt changes.

**Potential future enhancement** if scope analysis generates duplicate features for responsive variants:

**File:** `server/providers/combined/tools/analyze-feature-scope/prompt-scope-analysis.ts`

Could add instruction to consolidate responsive variants:

```typescript
## Feature Grouping Guidelines

When grouping features from screen analyses:

1. **Consolidate responsive variants** - If multiple screens show the same component 
   at different breakpoints (e.g., "Dashboard 1440px", "Dashboard 768px"), group them 
   into ONE feature area, not separate features.
   
   ❌ Wrong:
   - ☐ Dashboard display at 1440px
   - ☐ Dashboard display at 768px
   - ☐ Dashboard display at 320px
   
   ✅ Correct:
   - ☐ Dashboard display (responsive: desktop, tablet, mobile)

2. **Look for naming patterns** - Screens with similar names and size indicators 
   (px, desktop, mobile, tablet) are likely responsive variants.

3. **Check file headers** - If analysis files include "Part of SECTION: X", they may be related.

4. **Preserve functionality differences** - If a mobile version has DIFFERENT features 
   (not just layout adaptation), list those separately.
```

**Decision:** Test with real SECTION data first. The AI may naturally consolidate responsive 
variants by detecting similar UI elements and functionality across screens, even without 
explicit instructions. Only add this if we see consistent duplication issues.

### 4. Backward Compatibility

**Migration strategy for existing projects:**

1. **Legacy filename format** (`{node-id}.analysis.md`) remains valid
2. **New filename format** used for all new analyses
3. **Cache invalidation** - When regenerating, prefer new format
4. **Screen metadata** - Both `name` (node ID) and `filename` (new format) stored

**Handling mixed formats:**
```typescript
// In regenerateScreenAnalyses() - check both filename formats
const newFilename = screen.filename || generateScreenFilename(screen.frameName, screen.name);
const legacyFilename = screen.name;

const newPath = path.join(fileCachePath, `${newFilename}.analysis.md`);
const legacyPath = path.join(fileCachePath, `${legacyFilename}.analysis.md`);

// Check both locations
try {
  await fs.access(newPath);
  cachedScreens.push(screen.name);
  continue;
} catch {
  try {
    await fs.access(legacyPath);
    cachedScreens.push(screen.name);
    continue;
  } catch {
    // Need to analyze
    screensToAnalyze.push(screen);
  }
}
```

### 5. Documentation Updates

#### Update `analyze-feature-scope/README.md`

Add section under "Understanding Figma Links":

```markdown
### Figma SECTION Nodes

When you link to a Figma SECTION (organizational container), the tool **expands** it 
to process all child frames as individual screens.

**Example:**
```
https://www.figma.com/design/ABC123?node-id=5107-2952
```
This SECTION contains 3 frames (desktop, tablet, mobile responsive variants).

The tool will:
1. Extract all 3 frames as separate screens
2. Download and analyze each frame individually
3. Generate 3 `.analysis.md` files with frame name + ID:
   - `workshop-grid-1024px_5101-4299.analysis.md`
   - `workshop-grid-768px_5101-4300.analysis.md`
   - `workshop-grid-320px_5101-4301.analysis.md`
4. Each file includes a header showing it's part of "workshop grid responsive design" SECTION
5. Scope analysis may group them as one feature or separate features (observe behavior)

**Why expand instead of combining?**
Designers use SECTIONs for various organizational purposes - sometimes for responsive 
variants, sometimes for unrelated screens. Expanding preserves maximum flexibility and 
lets AI detect patterns rather than assuming grouping intent.

**File naming:** The filename uses only the frame name + ID because this is derivable from 
the Figma API response alone. SECTION context is preserved in the file content header.
## Testing Plan

### Unit Tests

**Test `toKebabCase()`:**
```typescript
expect(toKebabCase("Workshop Grid 1024px")).toBe("workshop-grid-1024px");
expect(toKebabCase("User Profile (Editing)")).toBe("user-profile-editing");
expect(toKebabCase("  Spaces   Everywhere  ")).toBe("spaces-everywhere");
expect(toKebabCase("Special@#$Chars")).toBe("specialchars");
```

**Test `generateScreenFilename()`:**
```typescript
expect(generateScreenFilename("Frame Name", "1234:5678"))
  .toBe("frame-name_1234-5678");

expect(generateScreenFilename("workshop grid 1024px", "5101:4299"))
  .toBe("workshop-grid-1024px_5101-4299");
```

### Integration Tests

**Test 1: SECTION with responsive variants**
1. Create epic with SECTION URL containing 3 frames (desktop, tablet, mobile)
2. Run `analyze-feature-scope`
3. Verify:
2. Run `analyze-feature-scope`
3. Verify:
   - 3 `.analysis.md` files created with format `{frame}_{id}.analysis.md`
   - Files include SECTION context header at top
   - Scope analysis consolidates into ONE feature (not 3)

**Test 2: SECTION with unrelated screens**
1. Create epic with SECTION URL containing 3 different screens (login, dashboard, settings)
2. Run `analyze-feature-scope`
3. Verify:
   - 3 `.analysis.md` files created with format `{frame}_{id}.analysis.md`
   - Each file includes SECTION context header
   - Scope analysis treats as SEPARATE features (3 entries)

**Test 3: Mixed links (SECTION + individual FRAMEs)**
1. Create epic with:
   - SECTION URL (expands to 3 frames)
   - Individual FRAME URL
2. Run `analyze-feature-scope`
3. Verify:
   - 4 total screens analyzed
   - All frames use consistent `{frame}_{id}` naming
   - SECTION frames include header with SECTION context

**Test 4: Backward compatibility**
1. Use cache from old version (files named `{node-id}.analysis.md`)
2. Run `analyze-feature-scope`
3. Verify:
   - Old files still recognized and reused
   - New analyses use new naming format
   - Mixed format works correctly

## Implementation Steps

### Phase 1: Core SECTION Support (Minimal)
1. Add SECTION handling to `getFramesAndNotesForNode()` ✅
2. Extend `FigmaNodeMetadata` interface ✅
3. Test with basic SECTION URL ✅

**Goal:** SECTIONs no longer cause tool failures

---

### Phase 2: Enhanced Naming (Recommended)
1. Add `toKebabCase()` and `generateScreenFilename()` utilities ✅
2. Extend `Screen` interface with new fields (`frameName`, `sectionName`, `sectionId`, `filename`) ✅
3. Track SECTION context during URL processing (tag frames from SECTION URLs) ✅
4. Update `setupFigmaScreens()` to generate and store `filename` ✅
5. Update `regenerateScreenAnalyses()` to use `filename` for file paths ✅
6. Add SECTION context header to analysis files ✅
7. Add backward compatibility checks for legacy filenames ✅

**Goal:** Analysis files have descriptive, context-aware names

---

### Phase 3: Observation & Evaluation
1. Test with real SECTION URLs containing responsive variants ✅
2. Observe how scope analysis naturally handles related screens ✅
3. Document any duplication or grouping issues ✅
4. **Defer prompt changes** - Only modify prompts if consistent issues emerge ✅

**Goal:** Understand actual behavior before making prompt changes

---

### Phase 4: Documentation & Testing
1. Update README files with SECTION behavior explanation ✅
2. Add examples to `getting-started-creating-epic-with-figma-links.md` ✅
3. Create integration tests ✅
4. Manual QA with real Figma files ✅

**Goal:** Users understand how SECTIONs work and can use them effectively

---

## Design Decisions

Based on discussion and requirements, the following decisions have been made:

### 1. Nested SECTION Handling
**Decision:** Only extract first-level FRAMEs from SECTIONs. Do not recursively expand nested SECTIONs.

**Rationale:** Keeps implementation simple and covers the primary use case (responsive design grouping). Nested SECTIONs are rare in practice.

**Implementation:** `extractFramesAndNotesFromChildren()` only checks immediate children, doesn't recurse into child SECTIONs.

---

### 2. Filename Length Limits
**Decision:** No truncation or length limits on slugified filenames.

**Rationale:** File systems support long names. Node IDs ensure uniqueness. Better to preserve full context than introduce ambiguity with truncation.

---

### 3. Duplicate Frame Names
**Decision:** Node IDs provide differentiation. No additional counter needed.

**Example:** Two frames named "Dashboard" become:
- `dashboard_1234-5678.analysis.md`
- `dashboard_9999-1111.analysis.md`

**Rationale:** Node IDs are guaranteed unique and already part of the filename format.

---

### 4. SECTION Expansion Logging
**Decision:** No explicit notification when SECTIONs are expanded.

**Rationale:** Keep logs focused on actionable information. Standard "Analyzing X of Y screens" messages already provide context.

---

### 5. SECTION Tree Storage
**Decision:** Only store immediate parent SECTION context (name + ID). Do not store full hierarchy for nested structures.

**Rationale:** 
- First-level context is sufficient for identifying related screens
- Nested SECTIONs won't be recursively expanded (see Decision 1)
- Simpler data structure

**Schema remains:**
```yaml
sectionName: "workshop grid responsive design"
sectionId: "5107:2952"
```

---

### 6. Cache Invalidation Strategy
**Decision:** Cache validation already handled at file level. If Figma file changes (`lastTouchedAt` timestamp), entire cache is invalidated and regenerated.

**Current behavior:** `ensureValidCacheForFigmaFile()` compares cached metadata timestamp with Figma API `/meta` endpoint. Any change triggers full regeneration.

**Implementation:** No changes needed. Filename changes are handled by existing cache invalidation logic.

---

### 7. SECTION Expansion Control
**Decision:** No URL parameter or opt-out mechanism. Always expand SECTIONs to individual frames.

**Rationale:** 
- Simpler UX (one consistent behavior)
- "Expand to individual frames" covers both responsive variants and heterogeneous content
- Scope analysis can handle consolidation if needed
- Can add opt-in later if use case emerges

---