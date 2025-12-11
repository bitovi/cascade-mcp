# File Error: Analysis File Not Found in Staging

## Problem

In staging, the `analyze-feature-scope` tool is failing with:

```
Failed to read analysis file for screen text-search at /app/cache/figma-files/3JgSzy4U8gdIGm1oyHiovy/text-search_292-39.analysis.md. 
This indicates a filesystem error or race condition. 
Original error: ENOENT: no such file or directory
```

## Root Cause Analysis

### Filename Mismatch Issue

The error shows the system is looking for a file with the NEW filename format (`text-search_292-39.analysis.md`) but can't find it. This is actually the **correct** filename format that includes the node ID.

The real issue is a **property mismatch** in the `Screen` object:

1. **Analysis files are created with**: `{frame-slug}_{node-id}.analysis.md` format (e.g., `text-search_292-39.analysis.md`)
   - Created by `regenerateScreenAnalyses()` in `screen-analysis-regenerator.ts`
   - Uses `filename = screen.filename || screen.name` to determine the filename
   - Then saves the file using `generateScreenFilename(frameName, nodeId)` which produces the format with node ID

2. **Files are read using**: `screen.filename || screen.name` as fallback
   - In `analyze-feature-scope/core-logic.ts` line 161
   - In `write-next-story/core-logic.ts` line 432
   - In `writing-shell-stories/core-logic.ts` line 236

3. **The problem**: When `screen.filename` is undefined/missing, the fallback `screen.name` is just the slugified frame name WITHOUT the node ID
   - `screen.name` = `"text-search"` (just slugified frame name)
   - `screen.filename` = `"text-search_292-39"` (frame slug + node ID)
   - The actual file on disk = `text-search_292-39.analysis.md`

### Why the Filename Doesn't Match

According to **spec 25-section-handling-expand.md**, the filename format was changed:

- **OLD FORMAT (pre-section-handling):** `{node-id}.analysis.md` (e.g., `292-39.analysis.md`)
- **EVEN OLDER FORMAT:** `{frame-slug}.analysis.md` (e.g., `text-search.analysis.md`) - just the slugified frame name
- **NEW FORMAT (current):** `{frame-slug}_{node-id}.analysis.md` (e.g., `text-search_292-39.analysis.md`)

The `filename` property is set in `associateNotesWithFrames()` (screen-analyzer.ts line 166):

```typescript
const filename = generateScreenFilename(frame.name, frame.id);

screens.push({
  name: screenName || `screen-${screens.length + 1}`,
  url: `${baseUrl}?node-id=${frame.id.replace(/:/g, '-')}`,
  notes: assignedNoteUrls,
  frameName: frame.name,
  sectionName: (frame as any).sectionName,
  sectionId: (frame as any).sectionId,
  filename: filename,  // New format with frame slug + node ID
});
```

However, in staging the error shows:
- **File exists as:** `text-search.analysis.md` (old format - frame slug only)
- **Code looks for:** `text-search_292-39.analysis.md` (new format - frame slug + node ID)
- **Fallback tries:** `text-search.analysis.md` using `screen.name` (which is just the frame slug)

The staging server has **cached analysis files from an old run** using the legacy filename format without node IDs.

## Why This Happens in Staging

The issue occurs in staging because:
1. **Old cached files**: Staging has cached `.analysis.md` files from before the filename format change (spec 25-section-handling-expand.md)
2. **Filename format mismatch**: Old files use `{frame-slug}.analysis.md`, new code expects `{frame-slug}_{node-id}.analysis.md`
3. **Missing backward compatibility in read path**: The regenerator has backward compatibility checks (see spec 25-section-handling-expand.md Section 4), but the **read path** in `core-logic.ts` doesn't check legacy formats

## Solution

### Option 0: Clear Staging Cache (Quick Fix)

The spec **25-section-handling-expand.md Section 4** shows backward compatibility logic for the **regeneration path**, but this needs to be added to the **read path** as well.

Follow the same pattern as shown in the spec:

```typescript
// In analyze-feature-scope/core-logic.ts and write-next-story/core-logic.ts
for (const screen of screens) {
  // Try new format first
  const filename = screen.filename || screen.name;
  let analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);
  
  try {
    const content = await fs.readFile(analysisPath, 'utf-8');
    // Success - use the file
  } catch (error: any) {
    // Try legacy format: just the slugified frame name (screen.name)
    // This handles old caches from before the node ID was added to filenames
    if (filename !== screen.name) {
      const legacyPath = path.join(fileCachePath, `${screen.name}.analysis.md`);
      try {
        const content = await fs.readFile(legacyPath, 'utf-8');
        console.log(`  ✅ Found analysis using legacy filename: ${screen.name}.analysis.md`);
        // Success with legacy format!
        continue;
      } catch {
        // Legacy format also missing - throw original error
      }
    }
    // Both formats failed - throw original error
    throw error;
  }
}
```

**Benefits:**
- Matches the backward compatibility pattern already in spec 25-section-handling-expand.md
- Handles old caches gracefully
- No reconstruction needed - just check the old filename format
- Simple and consistent with existing code

**Drawbacks:**
- Requires checking two file paths for old caches
- Slightly slower on cache miss (tries twice)lename } = await import('../../../figma/figma-helpers.js');
        filename = generateScreenFilename(screen.frameName, nodeId);
        analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);
        
        // Try again with reconstructed filename
        const content = await fs.readFile(analysisPath, 'utf-8');
        // Success!
      }
    }
    // If still fails, throw original error
  }
}
```

**Benefits:**
- Backward compatible with old caches
- Self-healing - reconstructs correct filename when needed
- Works even if `screen.filename` is missing

**Drawbacks:**
- Extra complexity in read logic
- Relies on URL format stability

### Option 2: Cache Invalidation When Missing Filename

Force cache invalidation when `filename` property is missing:

```typescript
// In screen-analysis-regenerator.ts
for (const screen of screens) {
  if (!screen.filename) {
    console.log('     ⚠️  Missing filename property - invalidating cache for this screen');
    screensToAnalyze.push(screen);
    continue;
  }
  
  // Check if file exists with new format
  const filename = screen.filename;
  const analysisPath = path.join(fileCachePath, `${filename}.analysis.md`);
  
  try {
    await fs.access(analysisPath);
    console.log(`     ✓ Cache hit: ${filename}`);
    cachedScreens.push(screen.name);
  } catch {
    console.log(`     ✗ Cache miss: ${filename}`);
    screensToAnalyze.push(screen);
  }
}
```

**Benefits:**
- Clean approach - regenerates with correct property
- No perpetual backward compatibility code
- Self-correcting over time as cache naturally invalidates

**Drawbacks:**
- One-time cost: API calls and LLM tokens on first run after deploy
- Slower on first request after deployment (one-time)

### Option 3: Ensure `filename` is Always Set

Add defensive checks in the pipeline:

```typescript
// In screen-analysis-pipeline.ts or setupFigmaScreens
export async function executeScreenAnalysisPipeline(...) {
  // ... existing code ...
  
  // Ensure all screens have filename property
  const screensWithFilenames = screens.map(screen => {
    if (!screen.filename && screen.frameName) {
      // Extract node ID from URL and generate filename
      const nodeIdMatch = screen.url.match(/node-id=([0-9]+-[0-9]+)/);
      if (nodeIdMatch) {
        const nodeId = nodeIdMatch[1].replace(/-/g, ':');
        return {
          ...screen,
          filename: generateScreenFilename(screen.frameName, nodeId)
        };
      }
    }
    return screen;
  });
  
  return { ...result, screens: screensWithFilenames };
}
```

**Benefits:**
- Proactive fix - ensures property is always set
- Clean read logic downstream

**Drawbacks:**
- Adds processing overhead to every request
- Doesn't fix already-cached files

## Implementation

**Implemented: Cache Invalidation (No Perpetual Backward Compatibility)**

### Changes Made

1. **Removed backward compatibility from `screen-analysis-regenerator.ts`**:
   - Removed legacy filename checking
   - Now invalidates cache if `screen.filename` is missing
   - Forces regeneration with correct format

2. **Created migration script**: `scripts/clear-legacy-cache.sh`
   - Removes entire Figma file cache directory
   - Run once during deployment: `./scripts/clear-legacy-cache.sh`
   - Can set `CACHE_DIR` env var to specify cache location (defaults to `./cache/figma-files`)

### Deployment Steps

**Automatic cache cleanup added to Dockerfile** (temporary, remove after next release):
```dockerfile
# TEMPORARY: Clear legacy cache format (remove after next release)
RUN mkdir -p cache/figma-files && \
    find cache/figma-files -name "*.analysis.md" -type f ! -name "*_*" -delete 2>/dev/null || true
```

This runs during Docker image build, clearing any legacy format files before the app starts.

**Alternative manual cleanup** (if needed):
```bash
# On staging/production:
export CACHE_DIR=/app/cache/figma-files
./scripts/clear-legacy-cache.sh
```

### Result

- ✅ Clean break from old format (no perpetual backward compatibility)
- ✅ One-time cost of regeneration after deploy
- ✅ Future-proof - all new caches will have correct format
- ✅ Simpler code going forward
- ✅ No technical debt accumulating

## Files to Update

1. `server/providers/combined/tools/analyze-feature-scope/core-logic.ts` (line 158-172)
2. `server/providers/combined/tools/write-next-story/core-logic.ts` (line 429-440)
3. `server/providers/combined/tools/writing-shell-stories/core-logic.ts` (line 235-245)
4. `server/providers/combined/tools/shared/screen-analysis-pipeline.ts` (add filename normalization)

## Related Code

- `generateScreenFilename()` - `server/providers/figma/figma-helpers.ts` line 728
- `associateNotesWithFrames()` - `server/providers/combined/tools/writing-shell-stories/screen-analyzer.ts` line 166
- `regenerateScreenAnalyses()` - `server/providers/combined/tools/shared/screen-analysis-regenerator.ts` line 101
