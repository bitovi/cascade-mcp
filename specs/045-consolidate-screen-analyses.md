# Spec 045: Consolidate Screen Analysis Functions

## Problem Statement

Screen analysis is duplicated across two code paths with similar but divergent implementations:

1. **Shared function** (`regenerateScreenAnalyses`) - Used by `write-shell-stories`, `write-next-story`, and `screen-analysis-pipeline`
2. **Inline implementation** - Used by `context-loader.ts` (for `write-story` and `review-work-item` tools)

This leads to:
- Code duplication (~200 lines of analysis logic)
- Inconsistent features (semantic XML only in shared function)
- Different progress notification formats
- Different caching strategies (filename format differs)
- Maintenance burden when adding new features

## Current State Analysis

### 1. Shared Function: `regenerateScreenAnalyses()`

**Location:** `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

**Input Type:**
```typescript
interface ScreenToAnalyze {
  name: string;           // Sanitized kebab-case name for display
  nodeId: string;         // Original Figma node ID (e.g., "1234:5678")
  url: string;            // Full Figma URL
  notes?: string[];       // Optional notes from Figma
  frameName?: string;     // Human-readable frame name
  sectionName?: string;   // Parent SECTION name if applicable
  sectionId?: string;     // Parent SECTION ID if applicable
  filename?: string;      // Filename without extension
}
```

**Return Type:**
```typescript
interface RegenerateAnalysesResult {
  downloadedImages: number;
  analyzedScreens: number;
  downloadedNotes: number;
  usedCache: boolean;
  cachedScreens: number;
}
```

**Features:**
- ✅ Tier 3 cache validation via `/meta` endpoint
- ✅ Batch image downloading (all at once, then analyze)
- ✅ Semantic XML generation for richer AI analysis
- ✅ Notes file writing (`.notes.md`)
- ✅ Parallel analysis support (when LLM supports it)
- ✅ SECTION context headers
- ✅ Proper filename sanitization with nodeId suffix

**Callers:**
1. `write-shell-stories/core-logic.ts` - Uses `setupFigmaScreens()` which returns `Screen[]`
2. `write-next-story/core-logic.ts` - Uses `setupFigmaScreens()` which returns `Screen[]`
3. `shared/screen-analysis-pipeline.ts` - Uses `setupFigmaScreens()` which returns `Screen[]`

### 2. Inline Implementation: `loadFigmaScreens()`

**Location:** `server/providers/combined/tools/review-work-item/context-loader.ts`

**Input:** Raw Figma URLs (`string[]`)

**Return Type:**
```typescript
interface AnalyzedScreen {
  name: string;     // Screen name from Figma frame
  url: string;      // Original Figma URL
  analysis: string; // AI-generated analysis
  notes: string[];  // Design notes
}

// Full return:
{ screens: AnalyzedScreen[], comments: ScreenAnnotation[] }
```

**Features:**
- ✅ Cache validation via `ensureValidCacheForFigmaFile()`
- ✅ Batch image downloading
- ✅ Figma comment fetching and spatial matching
- ❌ No semantic XML generation
- ❌ No notes file writing
- ❌ No SECTION context headers
- ⚠️ Different filename sanitization (no nodeId suffix)

**Callers:**
1. `review-work-item` tool (via `loadLinkedResources()`)
2. `write-story` tool (via `loadLinkedResources()`)

### 3. Related Type: `Screen` (from screen-analyzer.ts)

```typescript
interface Screen {
  name: string;           // Sanitized kebab-case name for display
  nodeId: string;         // Original Figma node ID
  url: string;            // Figma URL
  notes: string[];        // Associated notes
  frameName?: string;     // Human-readable frame name
  sectionName?: string;   // Parent SECTION name
  sectionId?: string;     // Parent SECTION ID
  filename?: string;      // Filename without extension
}
```

This is nearly identical to `ScreenToAnalyze` but with `notes: string[]` instead of `notes?: string[]`.

## Proposed Solution

### Design Principle

Create a single, authoritative screen analysis function that:
1. Returns analysis content directly (not just stats)
2. Accepts either pre-processed `Screen[]` OR raw Figma data
3. Unifies all features from both implementations
4. Uses a single canonical type throughout the codebase

### Unified Type

Consolidate `Screen`, `ScreenToAnalyze`, and `AnalyzedScreen` into one type:

```typescript
/**
 * Screen with optional analysis results
 * 
 * Before analysis: name, nodeId, url, notes are populated
 * After analysis: analysis field is populated
 */
export interface Screen {
  // Identity (always present)
  name: string;           // Sanitized kebab-case name
  nodeId: string;         // Figma node ID (e.g., "1234:5678")
  url: string;            // Full Figma URL
  
  // Content (may be populated by setup or analysis)
  notes: string[];        // Associated design notes (empty array if none)
  analysis?: string;      // AI-generated analysis (populated after analysis)
  
  // Metadata (optional, for enhanced context)
  frameName?: string;     // Human-readable frame name
  sectionName?: string;   // Parent SECTION name
  sectionId?: string;     // Parent SECTION ID
  filename?: string;      // Cache filename (without extension)
}
```

### Unified Return Type

```typescript
export interface ScreenAnalysisResult {
  /** Analyzed screens with analysis content populated */
  screens: Screen[];
  
  /** Analysis statistics */
  stats: {
    analyzedScreens: number;  // Newly analyzed this run
    cachedScreens: number;    // Loaded from cache
    downloadedNotes: number;  // Notes files written
  };
}
```

### Unified Function Signature

```typescript
export async function analyzeScreens(
  params: AnalyzeScreensParams
): Promise<ScreenAnalysisResult>

interface AnalyzeScreensParams {
  // Required
  generateText: GenerateTextFn;
  figmaClient: FigmaClient;
  figmaFileKey: string;
  
  // Screen data - ONE of these is required
  screens?: Screen[];                    // Pre-processed screens (from setupFigmaScreens)
  figmaUrls?: string[];                  // Raw URLs (will fetch frame data internally)
  
  // Frame context (required if screens provided, fetched if figmaUrls provided)
  allFrames?: FigmaNodeMetadata[];
  allNotes?: FigmaNodeMetadata[];
  nodesDataMap?: Map<string, any>;
  
  // Optional context
  epicContext?: string;
  notify?: (message: string) => Promise<void>;
}
```

## Implementation Plan

### Step 1: Create Unified Types

**Files to modify:**
- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

**Changes:**
1. Export unified `Screen` type (deprecate `ScreenToAnalyze`)
2. Export `ScreenAnalysisResult` as the return type
3. Make `notes` a required field (default to empty array)

**Verification:**
- TypeScript compiles without errors
- Existing tests pass

### Step 2: Update `regenerateScreenAnalyses` Return Type

**Files to modify:**
- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

**Changes:**
1. After analyzing each screen, read the analysis content back
2. Return `ScreenAnalysisResult` with populated `screens` array
3. Keep backward compatibility by also returning stats

**Verification:**
- Run `write-shell-stories` tool manually
- Confirm analysis files are still created
- Confirm return value includes screen analysis content

### Step 3: Add Raw URL Support to Shared Function

**Files to modify:**
- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

**Changes:**
1. Accept `figmaUrls?: string[]` as alternative to `screens`
2. When `figmaUrls` provided without `screens`:
   - Parse URLs to extract fileKey and nodeIds
   - Fetch frame metadata via Figma API
   - Build internal `Screen[]` from frame data
3. Consolidate with existing logic

**Verification:**
- Unit test: pass raw URLs, get back analyzed screens
- No changes needed to existing callers yet

### Step 4: Migrate `context-loader.ts` to Use Shared Function

**Files to modify:**
- `server/providers/combined/tools/review-work-item/context-loader.ts`

**Changes:**
1. Import `analyzeScreens` from shared module
2. Replace inline `loadFigmaScreens()` implementation:
   ```typescript
   // Before (inline implementation ~200 lines)
   async function loadFigmaScreens(...) { ... }
   
   // After (delegation to shared function)
   async function loadFigmaScreens(...) {
     const result = await analyzeScreens({
       generateText,
       figmaClient,
       figmaFileKey,
       figmaUrls,
       epicContext,
       notify
     });
     
     return {
       screens: result.screens.map(s => ({
         name: s.name,
         url: s.url,
         analysis: s.analysis || '',
         notes: s.notes
       })),
       comments: result.comments // Need to add comment support to shared function
     };
   }
   ```
3. Remove duplicated helper functions (`sanitizeFilename`, etc.)

**Verification:**
- Run `write-story` tool manually
- Confirm screen analysis includes semantic XML (new feature!)
- Confirm Figma comments still work
- Confirm cache behavior is correct

### Step 5: Update Existing Callers to Use New Return Type

**Files to modify:**
- `server/providers/combined/tools/writing-shell-stories/core-logic.ts`
- `server/providers/combined/tools/write-next-story/core-logic.ts`
- `server/providers/combined/tools/shared/screen-analysis-pipeline.ts`

**Changes:**
1. Update destructuring to use new return shape:
   ```typescript
   // Before
   const { analyzedScreens, cachedScreens } = await regenerateScreenAnalyses(...);
   
   // After
   const { screens: analyzedScreens, stats } = await analyzeScreens(...);
   const { analyzedScreens: analyzedCount, cachedScreens } = stats;
   ```

2. If any caller needs analysis content directly, it's now available:
   ```typescript
   // Can now access analysis content without reading from file
   for (const screen of analyzedScreens) {
     console.log(screen.analysis);
   }
   ```

**Verification:**
- All tools work as before
- Stats still logged correctly
- No regression in functionality

### Step 6: Add Comment Fetching to Shared Function (Optional)

**Files to modify:**
- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

**Changes:**
1. Add optional `fetchComments?: boolean` parameter
2. When true, fetch and format Figma comments
3. Return comments alongside screens

**Verification:**
- `write-story` still receives Figma comments
- `write-shell-stories` can opt-in to comment fetching if needed

### Step 7: Deprecate and Remove Old Types

**Files to modify:**
- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`
- `server/providers/combined/tools/review-work-item/context-loader.ts`

**Changes:**
1. Remove `ScreenToAnalyze` interface (use `Screen`)
2. Remove `AnalyzedScreen` interface (use `Screen`)
3. Update any remaining imports

**Verification:**
- TypeScript compiles
- All tests pass
- No duplicate type definitions

### Step 8: Consolidate Notification Format

**Files to modify:**
- `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

**Changes:**
1. Create helper function for consistent notification format:
   ```typescript
   function formatFigmaAnalysisNotification(
     screens: Screen[], 
     notes: number, 
     comments: number
   ): string {
     const screenNames = screens.map(s => s.name).join(', ');
     return `🤖 Analyzing Figma: ${screens.length} screen(s) [${screenNames}], ${notes} note(s), ${comments} comment(s)...`;
   }
   ```
2. Use this helper in all notification points

**Verification:**
- All tools show consistent notification format
- Screen names appear in notifications

## Migration Strategy

### Phase 1: Non-Breaking Changes (Steps 1-3)
- Add new types alongside existing
- Extend shared function without changing signature
- No caller updates required

### Phase 2: Migrate Callers (Steps 4-5)
- Update callers one at a time
- Test each migration thoroughly
- Can be done incrementally

### Phase 3: Cleanup (Steps 6-8)
- Remove old types and code
- Consolidate notification format
- Final polish

## Questions

1. Should the unified `Screen` type live in `screen-analysis-regenerator.ts` or should we create a dedicated `types.ts` file in the `shared` folder?

2. The `context-loader.ts` currently handles multiple Figma file keys (groups URLs by fileKey). Should the shared function also support this, or should callers loop over file keys?

3. Should we rename `regenerateScreenAnalyses` to `analyzeScreens` for clarity, or keep the existing name for backward compatibility?

4. The inline implementation in `context-loader.ts` fetches comments separately. Should comment fetching be:
   - a) Built into the shared analysis function
   - b) A separate shared helper called after analysis
   - c) Left to callers to handle
