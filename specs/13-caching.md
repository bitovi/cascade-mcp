# Improve Figma Caching with Timestamp-Based Validation

## Summary

Implement smart cache invalidation using Figma's file-level timestamps to automatically detect when designers update Figma files. Uses a **Tier 3 validation strategy** that protects scarce Tier 1 rate limit quota.

**Key Innovation**: Make lightweight Tier 3 `/meta` API call (100/min quota) to validate cache before making expensive Tier 1 node/image calls (15/min quota). When cache is valid, skip Tier 1 calls entirely.

**Cache Structure Change**: Restructure from epic-based to **file-based caching**:
- Old: `cache/{epicKey}/screen-1.png`
- New: `cache/figma-files/{fileKey}/{nodeId}.png`

**Benefits**:
- ✅ Reusable across epics (multiple epics can share same Figma file cache)
- ✅ Simple invalidation: Delete entire folder on timestamp mismatch
- ✅ Longer cleanup intervals: 7 days (Figma files change less often)
- ✅ Natural grouping by file key

**Rate Limit Impact**: 
- Saves 80%+ of Tier 1 calls in typical workflows (cache hit scenarios)
- Trades 1 Tier 3 call (abundant quota) to save 1 Tier 1 call (scarce quota) = 6.7x better quota efficiency

**Developer Experience**:
- ✅ Automatic cache invalidation when Figma files change
- ✅ Clear console feedback about cache freshness and folder operations
- ✅ No manual cache deletion needed
- ✅ Better cache hit rates across multiple epics

## Problem Statement

Currently, our Figma caching is **time-based only** - we check if analysis files exist in the cache directory (`DEV_CACHE_DIR`) and reuse them if present. This has significant drawbacks:

1. **Stale cache problem**: Cached analyses become outdated when designers update Figma files
2. **Manual invalidation**: Developers must manually delete cache to pick up Figma changes
3. **No visibility**: No way to know if cached data reflects current Figma state
4. **Inefficient workflow**: Forces choice between "always fresh but slow" or "fast but potentially stale"

## Figma API Timestamp Validation

Figma provides file-level timestamps through the `/meta` endpoint that enable smart cache invalidation. The timestamp updates when ANY node/frame/canvas in the file changes.

### Rate Limit Context

Figma's rate limit tiers (Pro plan, Dev/Full seats):

| Tier | Requests/min | Common Endpoints |
|------|--------------|------------------|
| **Tier 1** | 15/min | `/files/{key}/nodes`, `/images/{key}` |
| **Tier 2** | 50/min | `/files/{key}/versions` |
| **Tier 3** | **100/min** | `/files/{key}/meta` |

**Key insight**: Tier 3 has 6-7x MORE capacity than Tier 1. We'll use Tier 3 for lightweight validation to protect scarce Tier 1 quota.

### File Metadata Endpoint

**Endpoint**: `GET /v1/files/{fileKey}/meta` (Tier 3)

**Response structure**:
```json
{
  "file": {
    "name": "Design System v2",
    "last_touched_at": "2024-11-20T15:30:45Z",
    "version": "1234567890",
    "creator": {...},
    "last_touched_by": {
      "id": "1234567890",
      "handle": "Designer Name",
      "img_url": "https://..."
    }
  }
}
```

**Fields we'll use**:
- `last_touched_at`: ISO 8601 timestamp of last edit (file-level)
- `version`: Opaque version string
- `last_touched_by`: User who made the last change (for debugging)

**Requirements**:
- Requires `file_metadata:read` OAuth scope
- Tier 3 endpoint (100/min quota)
- Returns metadata only (no node data)

## Cache Validation Strategy

Use lightweight Tier 3 `/meta` endpoint to validate cache before making expensive Tier 1 calls for node data.

### Validation Workflow

1. **Check if cache exists** (filesystem check - free)
2. **If cache exists** → Make Tier 3 `/meta` call to get current timestamp
3. **Compare timestamps** in cache metadata vs. Figma
4. **If cache valid** → Use cached files, skip Tier 1 calls entirely ✅
5. **If cache invalid** → Delete cache folder, make Tier 1 calls for fresh data
6. **Save metadata** to cache after successful data fetch

### Rate Limit Impact

**Typical workflow: Epic with 10 screens, run tool 3 times (no Figma changes)**

Without validation:
```
Run 1: 1 Tier 1 batch call
Run 2: 1 Tier 1 batch call
Run 3: 1 Tier 1 batch call
Total: 3 Tier 1 calls (20% of quota per run)
```

With Tier 3 validation:
```
Run 1: 1 Tier 1 batch call (no cache) + save metadata
Run 2: 1 Tier 3 /meta call → cache valid, skip Tier 1 ✅
Run 3: 1 Tier 3 /meta call → cache valid, skip Tier 1 ✅
Total: 1 Tier 1 + 2 Tier 3 calls
Savings: 2 Tier 1 calls (67% reduction in scarce quota)
```

When Figma file updates:
```
Run: 1 Tier 3 /meta call → cache invalid
     Delete cache folder
     1 Tier 1 batch call (fetch fresh data)
Total: 1 Tier 1 + 1 Tier 3 call
```

**Net benefit**: Trades 1 Tier 3 call (abundant quota) to save 1 Tier 1 call (scarce quota) = 6.7x better quota efficiency.

### Implementation Strategy

### Phase 1: Restructure Cache by Figma File Key

**Goal**: Organize cache by Figma file key instead of epic key to enable cross-epic reuse.

**Current structure** (epic-based):
```
cache/
  EPIC-123/
    screen-1.png
    screen-1.analysis.md
    screen-2.png
    screen-2.analysis.md
```

**New structure** (file-based):
```
cache/
  figma-files/
    abc123xyz/                    # Figma file key
      .figma-metadata.json        # Timestamp validation
      1234-5678.png              # Node ID (colon replaced with dash)
      1234-5678.analysis.md
      1234-5678.notes.md
      9012-3456.png
      9012-3456.analysis.md
```

**Benefits**:
- ✅ Reusable across epics (multiple epics can use same Figma file)
- ✅ Simple invalidation (delete entire file folder on timestamp mismatch)
- ✅ Longer cleanup intervals (Figma files don't change as often as epics)
- ✅ Natural grouping by file key (matches Figma's structure)

**Metadata file structure**: `cache/figma-files/{fileKey}/.figma-metadata.json`

```typescript
interface FigmaMetadata {
  fileKey: string;
  lastTouchedAt: string;  // ISO 8601 timestamp from Figma /meta endpoint
  cachedAt: string;       // ISO 8601 timestamp when we cached
  version?: string;       // Optional: Figma version string
  lastTouchedBy?: {       // Optional: User who made last change (for debugging)
    id: string;
    handle: string;
    img_url: string;
  };
}
```

Example:
```json
{
  "fileKey": "abc123xyz",
  "lastTouchedAt": "2024-11-20T15:30:45.123Z",
  "cachedAt": "2024-11-20T15:35:00.000Z",
  "version": "1234567890",
  "lastTouchedBy": {
    "id": "1234567890",
    "handle": "Designer Name",
    "img_url": "https://..."
  }
}
```

**Cache invalidation strategy**:
```typescript
if (cacheExists && !cacheValid) {
  // Timestamp mismatch - delete entire file folder
  console.log('  🗑️  Deleting stale cache folder...');
  await fs.rm(fileCachePath, { recursive: true, force: true });
  console.log('  📥 Fetching fresh data from Figma...');
}
```

### Phase 2: Create Figma Metadata Fetcher

**Goal**: Add Tier 3 endpoint call to fetch file-level timestamps for cache validation.

**Location**: `server/providers/figma/figma-helpers.ts`

**New function**: `fetchFigmaFileMetadata()`

```typescript
/**
 * Metadata returned from Figma /meta endpoint
 */
export interface FigmaFileMetadata {
  name: string;
  lastTouchedAt: string;  // ISO 8601 timestamp
  version: string;
  lastTouchedBy?: {
    id: string;
    handle: string;
    img_url: string;
  };
}

/**
 * Metadata stored in cache for validation
 */
export interface FigmaMetadata {
  fileKey: string;
  lastTouchedAt: string;  // ISO 8601 timestamp from Figma /meta endpoint
  cachedAt: string;       // ISO 8601 timestamp when we cached
  version?: string;       // Optional: Figma version string
  lastTouchedBy?: {       // Optional: User who made last change (for debugging)
    id: string;
    handle: string;
    img_url: string;
  };
}

/**
 * Fetch lightweight metadata about a Figma file (Tier 3 endpoint)
 * 
 * Use this for cache validation - it's a lightweight request that only
 * returns metadata without node data, and uses the more generous Tier 3
 * rate limit quota (100/min vs 15/min for Tier 1).
 * 
 * @param client - Figma API client
 * @param fileKey - The Figma file key
 * @returns File metadata including last_touched_at timestamp
 */
export async function fetchFigmaFileMetadata(
  client: FigmaClient,
  fileKey: string
): Promise<FigmaFileMetadata> {
  const figmaApiUrl = `${client.getBaseUrl()}/files/${fileKey}/meta`;
  
  console.log(`  📋 Fetching file metadata (Tier 3)...`);
  
  try {
    const response = await client.fetch(figmaApiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle rate limiting
      if (response.status === 429) {
        const message = await createRateLimitErrorMessage(figmaApiUrl, response, errorText);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      // Handle 403 Forbidden
      if (response.status === 403) {
        throw new FigmaUnrecoverableError(create403ErrorMessage(figmaApiUrl, response), response.status);
      }
      
      throw new Error(`Figma API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Extract metadata from response: { file: { last_touched_at, version, ... } }
    if (!data.file) {
      throw new Error('Invalid response from Figma /meta endpoint - missing file object');
    }
    
    return {
      name: data.file.name,
      lastTouchedAt: data.file.last_touched_at,
      version: data.file.version,
      lastTouchedBy: data.file.last_touched_by
    };
    
  } catch (error: any) {
    // Re-throw FigmaUnrecoverableError as-is
    if (error instanceof FigmaUnrecoverableError) {
      throw error;
    }
    
    throw new Error(`Failed to fetch Figma file metadata: ${error.message}`);
  }
}
```

**Key aspects**:
- ✅ Tier 3 endpoint - uses abundant quota
- ✅ Lightweight - no node data, just metadata
- ✅ Same error handling as other Figma helpers (429, 403)
- ✅ Returns structured metadata for easy use

### Phase 3: Add Cache Validation Logic

**Goal**: Implement cache validation using Tier 3 /meta endpoint before making Tier 1 calls.

**Location**: Extract cache helper functions to a new module (functional approach preferred), then integrate into `screen-analysis-regenerator.ts`

**Helper functions**:

```typescript
/**
 * Check if cached Figma data is still valid
 * 
 * Compares stored lastTouchedAt timestamp with current Figma file timestamp.
 * 
 * @param fileCachePath - File-based cache directory path (e.g., cache/figma-files/abc123)
 * @param fileKey - Figma file key
 * @param currentLastTouchedAt - Current timestamp from Figma API
 * @returns true if cache is valid, false if needs refresh
 */
async function isCacheValid(
  fileCachePath: string,
  fileKey: string,
  currentLastTouchedAt: string
): Promise<boolean> {
  const metadataPath = path.join(fileCachePath, '.figma-metadata.json');
  
  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: FigmaMetadata = JSON.parse(metadataContent);
    
    // Validate file key matches
    if (metadata.fileKey !== fileKey) {
      console.log('    ⚠️  Cache file key mismatch - treating cache as invalid');
      return false;
    }
    
    // Compare timestamps
    const cachedTimestamp = new Date(metadata.lastTouchedAt).getTime();
    const currentTimestamp = new Date(currentLastTouchedAt).getTime();
    
    if (currentTimestamp > cachedTimestamp) {
      console.log(`    ♻️  Figma file updated: ${metadata.lastTouchedAt} → ${currentLastTouchedAt}`);
      return false;
    }
    
    console.log(`    ✅ Cache valid (last modified: ${metadata.lastTouchedAt})`);
    return true;
    
  } catch (error: any) {
    // Metadata file doesn't exist or is corrupt - treat as invalid
    if (error.code === 'ENOENT') {
      console.log('    ℹ️  No cache metadata found - will create after analysis');
    } else {
      console.log(`    ⚠️  Error reading cache metadata: ${error.message}`);
    }
    return false;
  }
}

/**
 * Save Figma metadata to cache
 * 
 * @param fileCachePath - File-based cache directory path
 * @param fileMetadata - Metadata from Figma /meta endpoint
 */
async function saveFigmaMetadata(
  fileCachePath: string,
  fileMetadata: FigmaFileMetadata
): Promise<void> {
  const metadata: FigmaMetadata = {
    fileKey: fileMetadata.fileKey,
    lastTouchedAt: fileMetadata.lastTouchedAt,
    cachedAt: new Date().toISOString(),
    version: fileMetadata.version,
    lastTouchedBy: fileMetadata.lastTouchedBy
  };
  
  const metadataPath = path.join(fileCachePath, '.figma-metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  
  console.log(`  📝 Saved cache metadata (lastTouchedAt: ${fileMetadata.lastTouchedAt})`);
}

/**
 * Get file path for cached node asset
 * 
 * Converts node IDs (with colons) to filesystem-safe names
 * 
 * @param fileCachePath - File-based cache directory
 * @param nodeId - Figma node ID (e.g., "1234:5678")
 * @param type - Asset type (png, analysis, notes)
 * @returns Full path to cached file
 */
function getCachedNodePath(
  fileCachePath: string,
  nodeId: string,
  type: 'png' | 'analysis' | 'notes'
): string {
  // Convert "1234:5678" → "1234-5678"
  const safeName = nodeId.replace(/:/g, '-');
  
  const extensions = {
    png: '.png',
    analysis: '.analysis.md',
    notes: '.notes.md'
  };
  
  return path.join(fileCachePath, safeName + extensions[type]);
}
```

**Update `regenerateScreenAnalyses()` function**:

```typescript
/**
 * Result from regenerating screen analyses
 */
interface RegenerateAnalysesResult {
  downloadedImages: number;
  analyzedScreens: number;
  downloadedNotes: number;
  usedCache: boolean;
}

export async function regenerateScreenAnalyses(
  params: RegenerateAnalysesParams
): Promise<RegenerateAnalysesResult> {
  const { 
    generateText, figmaClient, screens, allFrames, allNotes, 
    figmaFileKey, epicContext, notify
  } = params;
  
  let downloadedImages = 0;
  let analyzedScreens = 0;
  let downloadedNotes = 0;
  
  // ✅ NEW: Use file-based cache path instead of epic-based
  const fileCachePath = process.env.DEV_CACHE_DIR 
    ? path.join(process.env.DEV_CACHE_DIR, 'figma-files', figmaFileKey)
    : null;
  
  if (fileCachePath) {
    // Step 1: Check if cache exists locally (filesystem check - free)
    const metadataPath = path.join(fileCachePath, '.figma-metadata.json');
    let cacheExists = false;
    try {
      await fs.access(metadataPath);
      cacheExists = true;
    } catch {
      // Cache doesn't exist - will need to fetch fresh data
    }
    
    if (cacheExists) {
      // Step 2: Make lightweight Tier 3 call to validate cache
      console.log('  📋 Validating cache with Figma /meta endpoint (Tier 3)...');
      
      try {
        const fileMetadata = await fetchFigmaFileMetadata(figmaClient, figmaFileKey);
        const cacheValid = await isCacheValid(fileCachePath, figmaFileKey, fileMetadata.lastTouchedAt);
        
        if (cacheValid) {
          // Step 3: Cache is valid - use cached files ✅
          console.log(`  ✅ Cache valid - using cached data`);
          
          if (notify) {
            await notify(`✅ Using cached data (validated with Tier 3 call)`);
          }
          
          // Return cached files for all requested screens
          // Individual screen files are checked in the calling code
          return { downloadedImages: 0, analyzedScreens: 0, downloadedNotes: 0, usedCache: true };
        } else {
          // Step 4: Cache invalid - DELETE entire folder and fetch fresh
          console.log('  🔄 Cache invalid - deleting stale cache');
          console.log('  🗑️  Removing cache folder:', fileCachePath);
          
          await fs.rm(fileCachePath, { recursive: true, force: true });
          
          console.log('  📥 Fetching fresh data from Figma (Tier 1)...');
          
          if (notify) {
            await notify('🔄 Figma file updated - regenerating all analyses');
          }
        }
        
      } catch (error: any) {
        // Error fetching metadata - log warning and proceed to fetch fresh data
        console.log(`    ⚠️  Error validating cache: ${error.message}`);
        console.log('    Proceeding to fetch fresh data...');
        
        // Error handling decision tree:
        // - 429 (Rate limit): Already handled by FigmaUnrecoverableError in fetchFigmaFileMetadata
        // - 403 (Forbidden): Already handled by FigmaUnrecoverableError in fetchFigmaFileMetadata  
        // - Network errors: Log and continue to fetch fresh data (no retry - will fetch anyway)
        // - Other errors: Log and continue to fetch fresh data
      }
    } else {
      console.log('  ℹ️  No cache found - will fetch fresh data');
      // Ensure cache directory exists
      await fs.mkdir(fileCachePath, { recursive: true });
    }
  }
  
  // Fetch data and save to file-based cache
  // ... existing code for downloading images and generating analyses ...
  
  // Save files to file-based cache: {fileCachePath}/{nodeId}.png, {nodeId}.analysis.md, etc.
  
  // ✅ NEW: After successful analysis, save metadata
  if (fileCachePath) {
    try {
      // Fetch metadata one more time to get the latest timestamp
      const fileMetadata = await fetchFigmaFileMetadata(figmaClient, figmaFileKey);
      await saveFigmaMetadata(fileCachePath, fileMetadata);
    } catch (error: any) {
      console.log(`  ⚠️  Failed to save cache metadata: ${error.message}`);
      // Non-fatal - analysis succeeded, just couldn't save timestamp
    }
  }
  
  return { downloadedImages, analyzedScreens, downloadedNotes, usedCache: false };
}
```

### Phase 4: Update Cache Cleanup Logic

**Goal**: Extend cleanup interval to 7 days for both cache types to improve cache hit rates.

**Location**: `temp-directory-manager.ts`

**Current cleanup**: 24-hour max age for epic-based temp directories

**New cleanup strategy**: Extend to 7-day max age for both epic-based and file-based caches

```typescript
// Update cleanup configuration
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (was 24 hours)
const CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Check every hour

/**
 * Clean up stale cache directories (both epic-based and file-based)
 * 
 * Removes cache folders that haven't been accessed in over 7 days.
 * Runs periodically in the background.
 */
async function cleanupStaleCache(): Promise<void> {
  const baseCacheDir = process.env.DEV_CACHE_DIR;
  if (!baseCacheDir) return;
  
  const now = Date.now();
  
  // Clean up epic-based caches (root level directories)
  await cleanupCacheDirectory(baseCacheDir, now);
  
  // Clean up file-based caches (figma-files subdirectory)
  const figmaCacheDir = path.join(baseCacheDir, 'figma-files');
  try {
    await fs.access(figmaCacheDir);
    await cleanupCacheDirectory(figmaCacheDir, now);
  } catch {
    // Directory doesn't exist - nothing to clean up
  }
}

async function cleanupCacheDirectory(dirPath: string, now: number): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const cachePath = path.join(dirPath, entry.name);
    const metadataPath = path.join(cachePath, '.figma-metadata.json');
    
    try {
      const stats = await fs.stat(metadataPath);
      const age = now - stats.mtimeMs;
      
      if (age > CACHE_MAX_AGE_MS) {
        const daysOld = Math.floor(age / (24 * 60 * 60 * 1000));
        console.log(`  🗑️  Cleaning up stale cache: ${entry.name} (${daysOld} days old)`);
        await fs.rm(cachePath, { recursive: true, force: true });
      }
    } catch (error: any) {
      // Error reading metadata or deleting - skip this entry
      console.log(`  ⚠️  Error cleaning up ${entry.name}: ${error.message}`);
    }
  }
}

// Start periodic cleanup (if not in test environment)
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID && process.env.DEV_CACHE_DIR) {
  setInterval(cleanupStaleCache, CACHE_CLEANUP_INTERVAL_MS);
  console.log('  🧹 Started cache cleanup task (7 day max age, checks hourly)');
}
```

**Migration note**: Old epic-based caches will be manually cleaned up. The 7-day interval applies to both cache types going forward.

### Phase 5: Update Tool Integration Points

**Goal**: Simplify tool code by removing epic-based temp directory management.

**Location**: `write-shell-stories/index.ts` and `write-next-story/index.ts`

**Key changes**:
1. Remove `getTempDir()` calls (epic-based temp directories)
2. Use file-based cache path directly: `cache/figma-files/{fileKey}`
3. Let `regenerateScreenAnalyses()` handle all cache validation/cleanup

**Example integration**:

```typescript
// In write-shell-stories tool - BEFORE:
const { path: tempDirPath, cleanup } = await getTempDir(sessionId, epicKey);

// AFTER:
// No temp dir needed - cache is managed by file key internally
```

**No other tool changes needed** - cache validation happens internally in `regenerateScreenAnalyses()` and uses the `figmaFileKey` parameter that's already passed.

### Phase 6: Add User-Facing Feedback

**Goal**: Provide minimal console output about cache operations, following simplified logging standards (see `specs/6-simplify-logging.md`).

**Console output (only log operations, not details):**

```typescript
// Cache validation happens silently via 🎨 emoji from fetchFigmaFileMetadata (Phase 2)
// No additional "Validating cache..." message needed

// When cache is valid:
// (Already shown in screen-analysis-regenerator.ts via existing ♻️ Cached message)

// When cache is invalid - DELETE FOLDER:
// No additional log needed - deletion is internal operation

// When no cache exists:
// No log needed - internal operation

// After successful analysis:
// No "Saved cache metadata" log needed - internal operation
```

**Key principle**: Cache operations are **infrastructure details** that don't need logging. The user-visible outcome (cached screens vs. fresh downloads) is already shown by existing screen analysis logs.

**What users already see**:

```
Phase 4: Downloading images and analyzing screens
  ♻️ Cached: Home, Profile, Settings
  🎨 Batch downloading 2 images (200)
  🤖 Analyzing: Dashboard
  🤖 Analyzing: Reports
```

This already communicates cache effectiveness without adding "Validating cache..." or "Cache valid" messages.

## Migration & Backward Compatibility

### Graceful Degradation

1. **No `.figma-metadata.json`**: Treats cache as invalid, regenerates all (makes Tier 3 validation call)
2. **Corrupt metadata file**: Logs warning, treats cache as invalid
3. **`DEV_CACHE_DIR` not set**: No caching behavior (current behavior)
4. **Tier 3 validation fails**: Logs error, proceeds to fetch fresh data with Tier 1 calls
5. **File key mismatch**: Treats cache as invalid (different Figma file)

### Existing Cache Handling

**Migration from epic-based to file-based structure**:

Old structure:
```
cache/
  EPIC-123/
    screen-1.png
    screen-1.analysis.md
```

New structure:
```
cache/
  figma-files/
    abc123xyz/
      .figma-metadata.json
      1234-5678.png
      1234-5678.analysis.md
```

**Migration strategy**: No automatic migration needed
- **Old epic-based caches are ignored** - new file-based cache system will be used exclusively
- Existing epic-based caches will age out naturally over 7 days via cleanup process
- New runs will always create and use file-based caches (`cache/figma-files/{fileKey}/`)
- **Both cache structures can coexist** on disk during transition (no conflict)
  - Old structure: `cache/{epicKey}/` - read by nothing, cleaned up after 7 days
  - New structure: `cache/figma-files/{fileKey}/` - actively used by tools
- Manual cleanup of old epic-based caches is optional (automatic cleanup will handle it)

**First run with file-based caching**:
```bash
# Tool detects no file-based cache exists
  ℹ️  No cache found for file abc123xyz
  📁 Creating cache folder: cache/figma-files/abc123xyz
  📥 Downloading images and analyzing 10 screens...
  ✅ Complete - analyses saved
  📝 Saved cache metadata (lastTouchedAt: 2024-11-20T15:30:45Z)
  💾 Cached 10 nodes to: cache/figma-files/abc123xyz
```

**Second run (same file, different epic)**:
```bash
# Tool finds existing file-based cache
  📋 Validating cache with Figma /meta endpoint (Tier 3)...
  ✅ Cache valid (last modified: 2024-11-20T15:30:45Z)
  ✅ Using cached files from: cache/figma-files/abc123xyz
  ♻️  Cached nodes: 1234-5678, 9012-3456, ... (10 nodes)
# Instant - no downloads needed! ✅
```

**Third run (Figma file updated)**:
```bash
# Tool detects file changed
  📋 Validating cache with Figma /meta endpoint (Tier 3)...
  ♻️  Figma file updated: 2024-11-20T15:30:45Z → 2024-11-20T16:45:30Z
  🗑️  Deleting stale cache folder: cache/figma-files/abc123xyz
  📥 Fetching fresh data from Figma (Tier 1)...
  ✅ Complete - analyses saved
  📝 Saved cache metadata (lastTouchedAt: 2024-11-20T16:45:30Z)
```

### Rate Limit Impact on Migration

**Scenario: Multiple epics using same Figma file**

**Before (epic-based caching)**:
```
Epic A (file abc123): 1 Tier 1 call (10 nodes)
Epic B (file abc123): 1 Tier 1 call (same 10 nodes) ❌ Redundant!
Epic C (file abc123): 1 Tier 1 call (same 10 nodes) ❌ Redundant!
Total: 3 Tier 1 calls for same data
```

**After (file-based caching)**:
```
Epic A (file abc123): 1 Tier 1 call (10 nodes)
                       → Cached to figma-files/abc123/
Epic B (file abc123): 1 Tier 3 call → Cache valid! ✅ Reuse
Epic C (file abc123): 1 Tier 3 call → Cache valid! ✅ Reuse
Total: 1 Tier 1 + 2 Tier 3 calls
Savings: 2 Tier 1 calls (67% reduction)
```

**With cleanup interval change**:

Old: 24-hour cleanup
```
Day 1: Epic A uses file → cached
Day 2: Cache expired and deleted ❌
Day 2: Epic B uses same file → re-downloads ❌
```

New: 7-day cleanup (applies to both epic-based and file-based caches)
```
Day 1: Epic A uses file → cached
Day 2: Epic B uses same file → cache hit! ✅
Day 3: Epic C uses same file → cache hit! ✅
Week: Multiple epics share cache all week ✅
```

**Note**: Old epic-based caches will naturally age out over 7 days with the new cleanup interval.

## Testing Strategy

### Unit Tests

**Test `isCacheValid()`**:
```typescript
describe('isCacheValid', () => {
  it('returns false when no metadata file exists', async () => {
    const valid = await isCacheValid('/tmp/test', 'abc123', '2024-11-20T15:30:45Z');
    expect(valid).toBe(false);
  });
  
  it('returns false when Figma timestamp is newer', async () => {
    // Setup: metadata with old timestamp
    await fs.writeFile('/tmp/test/.figma-metadata.json', JSON.stringify({
      fileKey: 'abc123',
      lastTouchedAt: '2024-11-20T15:00:00Z',
      cachedAt: '2024-11-20T15:01:00Z'
    }));
    
    // Check with newer timestamp from Figma
    const valid = await isCacheValid('/tmp/test', 'abc123', '2024-11-20T16:00:00Z');
    expect(valid).toBe(false);
  });
  
  it('returns true when cache timestamp matches Figma', async () => {
    await fs.writeFile('/tmp/test/.figma-metadata.json', JSON.stringify({
      fileKey: 'abc123',
      lastTouchedAt: '2024-11-20T15:30:45Z',
      cachedAt: '2024-11-20T15:31:00Z'
    }));
    
    const valid = await isCacheValid('/tmp/test', 'abc123', '2024-11-20T15:30:45Z');
    expect(valid).toBe(true);
  });
  
  it('returns false when file key mismatches', async () => {
    await fs.writeFile('/tmp/test/.figma-metadata.json', JSON.stringify({
      fileKey: 'different-key',
      lastTouchedAt: '2024-11-20T15:30:45Z',
      cachedAt: '2024-11-20T15:31:00Z'
    }));
    
    const valid = await isCacheValid('/tmp/test', 'abc123', '2024-11-20T15:30:45Z');
    expect(valid).toBe(false);
  });
});
```

**Test `saveFigmaMetadata()`**:
```typescript
describe('saveFigmaMetadata', () => {
  it('creates metadata file with correct structure', async () => {
    const fileMetadata: FigmaFileMetadata = {
      name: 'Test File',
      fileKey: 'abc123',
      lastTouchedAt: '2024-11-20T15:30:45Z',
      version: '1234567890',
      lastTouchedBy: {
        id: '123',
        handle: 'designer',
        img_url: 'https://...'
      }
    };
    
    await saveFigmaMetadata('/tmp/test', fileMetadata);
    
    const content = await fs.readFile('/tmp/test/.figma-metadata.json', 'utf-8');
    const metadata = JSON.parse(content);
    
    expect(metadata.fileKey).toBe('abc123');
    expect(metadata.lastTouchedAt).toBe('2024-11-20T15:30:45Z');
    expect(metadata.cachedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    expect(metadata.lastTouchedBy.handle).toBe('designer');
  });
});
```

**Test `fetchFigmaFileMetadata()`**:
```typescript
describe('fetchFigmaFileMetadata', () => {
  it('returns file metadata from /meta endpoint', async () => {
    // Mock Figma client
    const mockClient = {
      getBaseUrl: () => 'https://api.figma.com/v1',
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          file: {
            name: 'Test File',
            last_touched_at: '2024-11-20T15:30:45Z',
            version: '1234567890',
            last_touched_by: {
              id: '123',
              handle: 'designer',
              img_url: 'https://...'
            }
          }
        })
      })
    };
    
    const metadata = await fetchFigmaFileMetadata(mockClient as any, 'abc123');
    
    expect(metadata.lastTouchedAt).toBe('2024-11-20T15:30:45Z');
    expect(metadata.name).toBe('Test File');
    expect(mockClient.fetch).toHaveBeenCalledWith(
      'https://api.figma.com/v1/files/abc123/meta'
    );
  });
  
  it('throws FigmaUnrecoverableError on 429', async () => {
    const mockClient = {
      getBaseUrl: () => 'https://api.figma.com/v1',
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited'
      })
    };
    
    await expect(
      fetchFigmaFileMetadata(mockClient as any, 'abc123')
    ).rejects.toThrow(FigmaUnrecoverableError);
  });
});
```

### Integration Tests

**Test with real Figma file**:

```typescript
describe('Cache validation integration', () => {
  it('uses cache when Figma file unchanged', async () => {
    // Phase 1: First run - generate cache
    const result1 = await writeShellStories({
      epicKey: 'TEST-1',
      figmaUrls: ['https://figma.com/file/abc123?node-id=1-2'],
      ...
    });
    
    expect(result1.downloadedImages).toBeGreaterThan(0);
    expect(result1.usedCache).toBe(false);
    
    // Verify metadata file was created in file-based cache
    const metadataPath = path.join(cacheDir, 'figma-files', 'abc123', '.figma-metadata.json');
    const metadata1 = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    expect(metadata1.lastTouchedAt).toBeDefined();
    
    // Phase 2: Second run - should use cache (Tier 3 validation succeeds)
    const result2 = await writeShellStories({
      epicKey: 'TEST-1',
      figmaUrls: ['https://figma.com/file/abc123?node-id=1-2'],
      ...
    });
    
    expect(result2.usedCache).toBe(true);
    expect(result2.downloadedImages).toBe(0); // No images downloaded
  });
  
  it('regenerates when Figma file updated', async () => {
    // Phase 1: First run - generate cache
    const result1 = await writeShellStories({
      epicKey: 'TEST-1',
      figmaUrls: ['https://figma.com/file/abc123?node-id=1-2'],
      ...
    });
    
    expect(result1.usedCache).toBe(false);
    
    // Phase 2: Manually update metadata timestamp to simulate old cache
    const metadataPath = path.join(cacheDir, 'figma-files', 'abc123', '.figma-metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    metadata.lastTouchedAt = '2020-01-01T00:00:00Z'; // Very old timestamp
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    // Phase 3: Second run - should regenerate (Tier 3 validation detects stale cache)
    const result2 = await writeShellStories({
      epicKey: 'TEST-1',
      figmaUrls: ['https://figma.com/file/abc123?node-id=1-2'],
      ...
    });
    
    expect(result2.usedCache).toBe(false);
    expect(result2.downloadedImages).toBeGreaterThan(0); // Regenerated
    
    // Verify metadata was updated
    const metadata2 = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
    expect(new Date(metadata2.lastTouchedAt).getTime()).toBeGreaterThan(
      new Date('2020-01-01').getTime()
    );
  });
  
  it('handles missing cache metadata gracefully', async () => {
    // Phase 1: Create cache with analysis files but no metadata
    const fileCacheDir = path.join(process.env.DEV_CACHE_DIR!, 'figma-files', 'abc123');
    await fs.mkdir(fileCacheDir, { recursive: true });
    await fs.writeFile(path.join(fileCacheDir, '1234-5678.analysis.md'), 'Old analysis');
    
    // Phase 2: Run tool - should detect missing metadata and validate with Tier 3
    const result = await writeShellStories({
      epicKey: 'TEST-1',
      figmaUrls: ['https://figma.com/file/abc123?node-id=1-2'],
      ...
    });
    
    // Should fetch fresh data and create metadata
    const metadataPath = path.join(fileCacheDir, '.figma-metadata.json');
    const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false);
    expect(metadataExists).toBe(true);
  });
});
```

### Manual Testing Scenarios

**Scenario 1: Fresh cache (file-based structure)**
```bash
# Setup - no cache exists yet
rm -rf cache/figma-files/abc123xyz

# Run tool on Epic TEST-123 (uses Figma file abc123xyz)
npm run start-local
# In MCP client: Run write-shell-stories on TEST-123

# Expected:
# ℹ️  No cache found for file abc123xyz
# 📁 Creating cache folder: cache/figma-files/abc123xyz
# 📥 Downloading images and analyzing 8 screens...
# ✅ Complete - analyses saved
# 📝 Saved cache metadata (lastTouchedAt: 2024-11-20T15:30:45Z)
# 💾 Cached 8 nodes to: cache/figma-files/abc123xyz

# Verify folder structure:
ls cache/figma-files/abc123xyz/
# .figma-metadata.json
# 1234-5678.png
# 1234-5678.analysis.md
# 9012-3456.png
# 9012-3456.analysis.md
```

**Scenario 2: Cache reuse across epics**
```bash
# Run on different epic (TEST-456) using SAME Figma file (abc123xyz)
npm run start-local
# In MCP client: Run write-shell-stories on TEST-456

# Expected:
# 📋 Validating cache with Figma /meta endpoint (Tier 3)...
# ✅ Cache valid (last modified: 2024-11-20T15:30:45Z)
# ✅ Using cached files from: cache/figma-files/abc123xyz
# ♻️  Cached nodes: 1234-5678, 9012-3456, ... (8 nodes)
# Result: Instant! No Tier 1 calls made ✅
```

**Scenario 3: Simulate Figma update (folder deletion)**
```bash
# Manually update cache metadata to old timestamp
echo '{"fileKey":"abc123xyz","lastTouchedAt":"2020-01-01T00:00:00Z","cachedAt":"2020-01-01T00:01:00Z"}' \
  > cache/figma-files/abc123xyz/.figma-metadata.json

# Run tool on any epic using file abc123xyz
npm run start-local
# In MCP client: Run write-shell-stories on TEST-123

# Expected:
# 📋 Validating cache with Figma /meta endpoint (Tier 3)...
# ♻️  Figma file updated: 2020-01-01T00:00:00Z → 2024-11-20T15:30:45Z
# 🗑️  Deleting stale cache folder: cache/figma-files/abc123xyz
# 📥 Fetching fresh data from Figma (Tier 1)...
# ✅ Complete - analyses saved
# 📝 Saved cache metadata (lastTouchedAt: 2024-11-20T15:30:45Z)

# Verify folder was recreated:
ls cache/figma-files/abc123xyz/
# Files are freshly downloaded
```

**Scenario 4: Cache cleanup (7-day interval)**
```bash
# Create old cache (manually set old timestamp)
mkdir -p cache/figma-files/old-file-xyz
echo '{"fileKey":"old-file-xyz","lastTouchedAt":"2024-01-01T00:00:00Z","cachedAt":"2024-01-01T00:00:00Z"}' \
  > cache/figma-files/old-file-xyz/.figma-metadata.json

# Wait for cleanup task (runs hourly) OR manually trigger:
# Cleanup will detect 7+ day old cache and delete it

# Expected after 7+ days:
# 🗑️  Cleaning up stale cache: old-file-xyz (10 days old)

# Verify deletion:
ls cache/figma-files/old-file-xyz
# No such file or directory
```

**Scenario 5: Monitor cross-epic cache efficiency**
```bash
# Run tool on 3 different epics using same Figma file
for epic in TEST-100 TEST-200 TEST-300; do
  echo "=== Epic: $epic ==="
  # Run write-shell-stories on $epic (all use file abc123xyz)
  sleep 2
done

# Expected rate limit usage:
# TEST-100: 1 Tier 1 call (fetch + cache)
# TEST-200: 1 Tier 3 call → cache hit! ✅
# TEST-300: 1 Tier 3 call → cache hit! ✅
# Total: 1 Tier 1 + 2 Tier 3 (vs 3 Tier 1 with epic-based caching)
```

## Performance Impact

### Complete Rate Limit Analysis

This section provides comprehensive rate limit impact analysis across different scenarios.

**Single epic workflow: 10 screens, run tool 5 times over a day**

*Scenario A: No Figma changes*
```
New approach (Tier 3 validation):
Run 1: 1 Tier 1 call (no cache) + save metadata
Run 2-5: 1 Tier 3 call each → Cache valid, skip Tier 1 ✅
Total: 1 Tier 1 + 4 Tier 3 calls
Savings: 80% reduction in Tier 1 usage
```

*Scenario B: Figma updated once during the day*
```
New approach:
Run 1: 1 Tier 1 call (no cache) + save metadata
Run 2-3: 1 Tier 3 call each → Cache valid ✅
Run 4: 1 Tier 3 call → Cache invalid → 1 Tier 1 call + update
Run 5: 1 Tier 3 call → Cache valid ✅
Total: 2 Tier 1 + 4 Tier 3 calls
Savings: 60% reduction in Tier 1 usage
```

### Cost Analysis

**Additional Costs**:
- **API calls**: +1 Tier 3 call per run when cache exists
- **Storage**: ~300 bytes per epic (`.figma-metadata.json` file with user data)
- **Processing**: ~5-10ms for Tier 3 request + timestamp comparison per tool run
- **Scope requirement**: Needs `file_metadata:read` scope (in addition to existing `file_content:read`)

**Benefits**:
- **Eliminates false cache hits**: No more outdated analyses
- **Protects scarce quota**: Uses abundant Tier 3 to save limited Tier 1
- **Better developer experience**: Clear feedback when cache is invalid
- **Automatic invalidation**: No manual cache deletion needed
- **Optimal resource usage**: 1 Tier 3 call (100/min quota) saves 1 Tier 1 call (15/min quota)

### Quota Math (Pro Plan, Dev Seat)

**Tier 1 quota**: 15/min = ~900/hour
**Tier 3 quota**: 100/min = ~6000/hour

**For every cache validation**:
- **Cost**: 1 Tier 3 call (1/6000th of hourly quota)
- **Saved** (when cache valid): 1 Tier 1 call (1/900th of hourly quota)
- **Net benefit**: Saves ~6.7x more valuable quota by using less valuable quota

## Timestamp Granularity

**Important**: Both Figma timestamp fields (`lastModified` and `last_touched_at`) are **file-level only**, not per-node.

**What this means**:
- Timestamp updates when **ANY** node/frame/canvas/component in the file changes
- No way to detect which specific nodes changed
- Changing one screen invalidates cache for entire file

**Impact on caching**:
- ✅ **Pro**: Simple, reliable invalidation - always reflects current file state
- ⚠️ **Con**: Less granular - updating 1 screen invalidates cache for all 10 screens in that file

**Mitigation**: File-based caching structure means:
- Multiple epics sharing the same file benefit from one download
- Cache reuse across epics compensates for coarse invalidation
- Example: 3 epics × 10 screens = 30 potential re-downloads becomes 1 download shared by all 3 epics

**Future enhancement**: Node-level checksum validation could be added (see Future Enhancements section) if file-level invalidation proves too coarse in practice.

## Cache Structure Design

The implementation uses a **file-based** cache structure organized by Figma file keys rather than epic keys.

**Directory structure**:
```
cache/
  figma-files/
    {fileKey}/
      .figma-metadata.json
      {nodeId}.png
      {nodeId}.analysis.md
```

**Key benefits**:
- **Cross-epic reuse**: Multiple epics referencing the same Figma file share cached data
- **Higher cache hit rates**: ~80% cache hits vs ~20% with epic-based structure
- **Significant rate limit savings**: 67-90% reduction in Tier 1 API calls
- **Automatic invalidation**: Timestamp validation ensures fresh data without manual intervention
- **Longer retention**: 7-day cleanup interval (vs 24-hour for epic-based) improves reuse

**Real-world impact**:

Design team with 3 Figma files (Design System, App Screens, Marketing) and 10 epics per quarter:

```
Without file-based caching:
10 epics × 3 files × 1 Tier 1 call each = 30 Tier 1 calls

With file-based caching:
3 files × 1 Tier 1 call (initial) = 3 Tier 1 calls
10 epics × 3 files × 1 Tier 3 call (validation) = 30 Tier 3 calls
Result: 90% reduction in Tier 1 usage ✅
```

## Future Enhancements

### 1. Version String Tracking
Figma provides a `version` field alongside `lastModified`. We could:
- Store both `lastModified` and `version` in metadata
- Use version for exact-match validation
- Log version changes for debugging

### 2. Cache Statistics
Add cache hit/miss tracking:
```typescript
interface CacheStats {
  hits: number;
  misses: number;
  lastHit?: string;
  lastMiss?: string;
}
```

### 3. Partial Cache Invalidation
If designers update only 1 screen out of 10:
- Current approach: Regenerate all 10
- Enhancement: Detect which nodes changed (via checksums)
- Regenerate only changed screens

### 4. Timestamp-Based Cleanup
Clean up old cache directories based on Figma file updates:
```typescript
// If Figma file hasn't been updated in 30 days, delete cache
if (daysSinceLastModified > 30) {
  await cleanupCacheDir(tempDirPath);
}
```

## Implementation Decisions

### OAuth Scope Requirement ✅

The `/meta` endpoint requires `file_metadata:read` scope in addition to the existing `file_content:read` scope.

**Action items**:
1. **Add to OAuth scope configuration**:
   - Update `VITE_FIGMA_SCOPE` in `.env` files to include `file_metadata:read`
   - Example: `VITE_FIGMA_SCOPE=files:read file_metadata:read`
2. **Document in `server/readme.md`**:
   - Add new scope to Figma API scopes section
   - Explain it's used for cache validation (Tier 3 endpoint)
3. **Update OAuth flow**:
   - Scope will be automatically included in authorization request
   - Users may need to re-authorize to grant new scope
4. **Error handling**:
   - No startup validation needed
   - Will fail gracefully with 403 if scope missing when `/meta` endpoint is called
   - Error message will indicate missing scope

### User Attribution in Cache Metadata ✅

Include `lastTouchedBy` user data in cache metadata.

**Storage only** - do not log this data when invalidating cache:
- Zero additional cost (already in `/meta` response)
- Available for future debugging needs
- Small storage cost (~100 bytes per cache folder)
- Not displayed in console output during normal operations

### Implementation Independence ✅

This cache validation feature can be implemented **independently** of batch request optimization (Spec #5).

**Rationale**:
- Cache validation uses `/meta` endpoint (Tier 3)
- Batch requests optimize node fetching (Tier 1)
- Both provide rate limit improvements in different ways:
  - Batching: Reduces N requests to 1 request
  - Caching: Reduces N requests to 0 requests (when cache valid)

**Recommendation**: Implement caching first for maximum immediate impact.

### Deferred Features

The following features are explicitly **NOT** included in the initial implementation. They can be added later if user feedback indicates they are needed:

1. **Force Cache Refresh Parameter**: Users can manually delete cache folders (`rm -rf cache/figma-files/{fileKey}`) if needed
2. **Cache Statistics Logging**: Console logs provide sufficient visibility initially
3. **Cache Info in Tool Response**: Tools return structured data for Jira/stories, not infrastructure details
4. **Rate Limit Awareness**: Existing error handling already catches 429s from `/meta` endpoint
5. **Validation Interval Configuration**: Always validate on every run - Tier 3 quota is abundant (100/min)

## Verification Steps

After implementing each phase, verify it works before moving to the next:

**Phase 1**: Check that `.figma-metadata.json` structure is correct
```bash
cat cache/figma-files/abc123xyz/.figma-metadata.json
# Should contain: fileKey, lastTouchedAt, cachedAt, version, lastTouchedBy
```

**Phase 2**: Test `fetchFigmaFileMetadata()` returns expected data
```typescript
// Unit test should verify metadata structure matches Figma API response
expect(metadata.lastTouchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
```

**Phase 3**: Verify cache validation logic
```bash
# First run - should create cache
# Second run - should validate with Tier 3 and use cache
# After manual timestamp change - should invalidate and regenerate
```

**Phase 4**: Confirm cleanup runs and removes old caches
```bash
# Create test cache with old timestamp, wait for cleanup cycle
ls cache/figma-files/  # Old cache should be gone
```

**Phase 5**: Test tools work without `getTempDir()` calls
```bash
# Run write-shell-stories - should complete successfully
# Verify cache created in figma-files directory
```

**Phase 6**: Review console output matches expected format
```bash
# Check for: validation messages, cache hit/miss, folder operations
``` 