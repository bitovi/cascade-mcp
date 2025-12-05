# Dev Cache Folder Override

## Overview

Add a development environment variable `DEV_CACHE_DIR` that overrides the default temporary directory location used by `getTempDir()`. This allows developers to use a consistent, easy-to-find cache location during development instead of OS temporary directories that change with each session.

## Current Behavior

The `getTempDir()` function in `server/providers/combined/tools/writing-shell-stories/temp-directory-manager.ts`:

- Creates temporary directories using `tmp-promise` library in OS temp directory (e.g., `/tmp`)
- Uses deterministic naming: `shell-stories-{sessionId}-{epicKey}-{random}`
- Maintains a 24-hour cleanup policy for unused directories
- Stores directories in an in-memory map keyed by `sessionId:epicKey`
- Example path: `/tmp/shell-stories-abc123-PROJ-456-xyz789/`

**Problem**: In development, these paths are hard to locate and change between sessions, making debugging artifacts difficult to access.

## Desired Behavior

When `DEV_CACHE_DIR` environment variable is set:

- Use the specified directory as the base for all cache directories
- Support relative paths resolved from project root (e.g., `./cache`)
- Support absolute paths (e.g., `/Users/dev/my-cache`)
- Still use deterministic subdirectory naming: `{sessionId}/{epicKey}/`
- Maintain the same in-memory lookup and cleanup behavior
- Only active in development mode, ignored in production

Example with `DEV_CACHE_DIR=./cache`:
- Path becomes: `<project-root>/cache/{sessionId}/{epicKey}/`
- Full path: `/Users/justinmeyer/dev/cascade-mcp/cache/abc123/PROJ-456/`

## Affected Components

### Core Module

**`server/providers/combined/tools/writing-shell-stories/temp-directory-manager.ts`**
- Currently uses `tmp-promise` and `os.tmpdir()`
- Needs to support override via environment variable
- Should resolve relative paths from project root

### Tools Using getTempDir

1. **`server/providers/combined/tools/writing-shell-stories/core-logic.ts`** - Line 85
2. **`server/providers/combined/tools/shared/screen-analysis-pipeline.ts`** - Line 80
3. **`server/providers/combined/tools/write-next-story/core-logic.ts`** - Line 83
4. **`server/providers/combined/tools/write-next-story/write-next-story-old.ts`** - Line 105

These tools consume `getTempDir()` but don't need modification - they just receive paths.

### Utility Functions

**`server/utils/file-paths.ts`**
- Already has `getServerDir()` which returns `/server` directory
- Add `getProjectRoot()` function to return project root (parent of `/server`)

## Implementation Plan

### Step 1: Add getProjectRoot() to file-paths.ts

**File**: `server/utils/file-paths.ts`

Add a new exported function after `getServerDir()`:

```typescript
/**
 * Get the project root directory path
 * 
 * This assumes the helper is located at `/server/utils/file-paths.ts`
 * and returns the project root directory (parent of `/server`).
 * 
 * @returns Absolute path to the project root directory
 */
export function getProjectRoot(): string {
  const serverDir = getServerDir();
  // From /server, go up one level to project root
  return path.dirname(serverDir);
}
```

**Verification**:
- Build the project: `npm run build`
- Check that TypeScript compiles without errors
- Function should return the project root directory path

### Step 2: Update getTempDir() to Support DEV_CACHE_DIR

**File**: `server/providers/combined/tools/writing-shell-stories/temp-directory-manager.ts`

#### 2.1: Add Imports

Add import for the new utility:

```typescript
import { getProjectRoot } from '../../../../utils/file-paths.js';
```

#### 2.2: Add Helper Function to Resolve Dev Cache Path

Add near the top of the file, after the existing helper functions:

```typescript
/**
 * Get the base directory for cache files
 * 
 * In development mode with DEV_CACHE_DIR set, uses that directory.
 * Otherwise, uses OS temp directory.
 * 
 * @returns Absolute path to base cache directory
 */
function getBaseCacheDir(): string {
  const devCacheDir = process.env.DEV_CACHE_DIR;
  
  if (!devCacheDir) {
    // No override - use OS temp directory
    return os.tmpdir();
  }
  
  // Check if path is absolute
  if (path.isAbsolute(devCacheDir)) {
    console.log('  Using absolute DEV_CACHE_DIR:', devCacheDir);
    return devCacheDir;
  }
  
  // Relative path - resolve from project root
  const projectRoot = getProjectRoot();
  const resolvedPath = path.resolve(projectRoot, devCacheDir);
  console.log('  Using relative DEV_CACHE_DIR:', devCacheDir, '→', resolvedPath);
  return resolvedPath;
}
```

#### 2.3: Modify getTempDir() Function

Update the directory creation logic in `getTempDir()`:

**Current code** (lines ~76-84):
```typescript
// Create new temp directory with deterministic prefix
const tempDirPrefix = `shell-stories-${sessionId}-${epicKey}`;

const { path: tempDirPath, cleanup } = await dir({
  prefix: tempDirPrefix,
  unsafeCleanup: true, // Remove directory even if not empty
  tmpdir: os.tmpdir()
});

console.log('  Created new temp directory:', tempDirPath);
```

**Replace with**:
```typescript
// Determine base directory and create temp directory
const baseCacheDir = getBaseCacheDir();
let tempDirPath: string;
let cleanup: () => Promise<void>;

if (process.env.DEV_CACHE_DIR) {
  // Manual directory creation for dev mode
  tempDirPath = path.join(baseCacheDir, sessionId, epicKey);
  
  // Create directory if it doesn't exist
  await fs.mkdir(tempDirPath, { recursive: true });
  
  console.log('  Created/reused dev cache directory:', tempDirPath);
  
  // Create cleanup function (for consistency, but won't auto-delete in dev mode)
  cleanup = async () => {
    console.log('  Cleanup called for dev cache directory:', tempDirPath);
    // Note: In dev mode, we don't actually delete the directory
    // This preserves artifacts for debugging across sessions
  };
} else {
  // Production mode - use tmp-promise with OS temp directory
  const tempDirPrefix = `shell-stories-${sessionId}-${epicKey}`;
  
  const tmpResult = await dir({
    prefix: tempDirPrefix,
    unsafeCleanup: true,
    tmpdir: baseCacheDir
  });
  
  tempDirPath = tmpResult.path;
  cleanup = tmpResult.cleanup;
  
  console.log('  Created new temp directory:', tempDirPath);
}
```

**Verification**:
- Set `DEV_CACHE_DIR=./cache` in environment
- Run `write-shell-stories` tool with a test epic
- Verify directory created at `<project-root>/cache/{sessionId}/{epicKey}/`
- Verify artifacts (yaml files, analysis files, images) are written correctly
- Verify console logs show the resolved path

### Step 3: Update Environment Variable Documentation

**File**: `scripts/generate-build-env.sh`

Add documentation comment for the new variable:

```bash
# DEV_CACHE_DIR - Override cache directory location (development only)
# - Relative paths resolved from project root: DEV_CACHE_DIR=./cache
# - Absolute paths used as-is: DEV_CACHE_DIR=/tmp/my-cache
# - When not set, uses OS temp directory
# export DEV_CACHE_DIR=./cache
```

**File**: `server/readme.md`

Add to environment variables section:

```markdown
#### DEV_CACHE_DIR (Optional - Development Only)

Override the default OS temp directory for cache files.

- **Relative paths**: Resolved from project root (e.g., `./cache`)
- **Absolute paths**: Used as-is (e.g., `/tmp/dev-cache`)
- **Default**: OS temp directory when not set

Example:
```bash
export DEV_CACHE_DIR=./cache
npm run start-local
```

Cache structure with override:
```
<project-root>/cache/
  ├── {sessionId}/
  │   ├── {epicKey}/
  │   │   ├── screens.yaml
  │   │   ├── {screen-name}.png
  │   │   ├── {screen-name}.analysis.md
  │   │   └── ...
```

**Note**: In dev mode, directories are NOT automatically cleaned up. This preserves debugging artifacts across sessions.
```

**Verification**:
- Read through documentation to ensure clarity
- Verify examples are correct

### Step 4: Update .gitignore

**File**: `.gitignore` (at project root)

Add entry to ignore the cache directory:

```
# Development cache directory (when DEV_CACHE_DIR=./cache)
/cache/
```

**Verification**:
- Create `./cache` directory manually
- Run `git status` and verify it's ignored

### Step 5: Testing the Feature

#### Test Case 1: Relative Path

```bash
export DEV_CACHE_DIR=./cache
npm run start-local
```

**Expected**:
- Server starts successfully
- Logs show: `Using relative DEV_CACHE_DIR: ./cache → /Users/.../cascade-mcp/cache`
- When tool runs, creates directory at `<project-root>/cache/{sessionId}/{epicKey}/`
- Directory persists after tool completes

**Verification Steps**:
1. Start server with environment variable set
2. Trigger `write-shell-stories` via REST API or MCP tool
3. Check console logs for path resolution messages
4. Navigate to `./cache` directory and verify structure
5. Check that artifact files are present (yaml, analysis, images)

#### Test Case 2: Absolute Path

```bash
export DEV_CACHE_DIR=/tmp/cascade-dev-cache
npm run start-local
```

**Expected**:
- Logs show: `Using absolute DEV_CACHE_DIR: /tmp/cascade-dev-cache`
- Creates directory at `/tmp/cascade-dev-cache/{sessionId}/{epicKey}/`

**Verification Steps**:
1. Start server with absolute path
2. Run a tool that uses `getTempDir()`
3. Verify directory created at absolute location
4. Verify artifact files are present

#### Test Case 3: No Override (Default Behavior)

```bash
unset DEV_CACHE_DIR
npm run start-local
```

**Expected**:
- No special logging about DEV_CACHE_DIR
- Uses OS temp directory (e.g., `/tmp/shell-stories-...`)
- 24-hour cleanup policy remains active

**Verification Steps**:
1. Start server without environment variable
2. Run a tool
3. Verify directory created in OS temp location
4. Verify path includes random suffix from `tmp-promise`

#### Test Case 4: Directory Reuse

```bash
export DEV_CACHE_DIR=./cache
npm run start-local
```

Then make two API calls with same sessionId and epicKey.

**Expected**:
- First call: Creates directory and artifacts
- Second call: Logs "Reusing existing temp directory"
- Same directory path used for both calls
- No duplicate files created

**Verification Steps**:
1. Make first API call with specific sessionId and epicKey
2. Note the directory path in logs
3. Make second API call with same parameters
4. Verify console shows reuse message
5. Check that directory wasn't recreated

### Step 6: Update Contributing Documentation

**File**: `contributing.md`

Add section about development cache:

```markdown
## Development Cache Directory

For easier debugging, you can override the default temporary directory location:

```bash
# Use a local cache directory
export DEV_CACHE_DIR=./cache
npm run start-local
```

This will:
- Store all cache artifacts in `<project-root>/cache/` instead of `/tmp`
- Preserve artifacts across server restarts for inspection
- Use consistent paths: `./cache/{sessionId}/{epicKey}/`
- Skip automatic cleanup (directories persist until manually deleted)

To inspect artifacts while debugging:
```bash
ls -la ./cache/default/PROJ-123/
# Shows: screens.yaml, *.analysis.md, *.png, etc.
```

To clean up manually:
```bash
rm -rf ./cache
```
```

**Verification**:
- Read through documentation
- Follow the instructions to verify they work

## Edge Cases & Considerations

### 1. Directory Permissions

**Issue**: User might not have write permissions for specified directory.

**Solution**: Let the `fs.mkdir()` call fail naturally with a descriptive error. The error will propagate up to the tool handler which already has error handling.

**Test**: Try setting `DEV_CACHE_DIR=/root/cache` without sudo permissions - should see permission error in logs.

### 2. Invalid Path Syntax

**Issue**: User provides invalid path syntax (e.g., contains null bytes, invalid characters).

**Solution**: Let Node.js path resolution and fs operations handle validation. Invalid paths will throw errors that get logged.

**Test**: Try `DEV_CACHE_DIR="./cache\0invalid"` - should see path error.

### 3. Very Long Paths

**Issue**: Combined path might exceed OS limits (e.g., Windows 260 char limit).

**Solution**: No special handling - let filesystem errors occur naturally. Document that paths should be reasonable length.

### 4. Concurrent Access

**Issue**: Multiple processes/servers using same DEV_CACHE_DIR might conflict.

**Solution**: Existing sessionId separation prevents conflicts if different sessions are used. If same sessionId used across processes, the in-memory map won't be shared, but filesystem will handle concurrent writes.

**Note**: Document that DEV_CACHE_DIR is for single-developer use, not production.

### 5. Production Safety

**Issue**: DEV_CACHE_DIR accidentally set in production.

**Solution**: Current implementation allows it but documents as "development only". The variable name prefix "DEV_" signals intent. No special production blocking needed.

### 6. Cleanup Behavior

**Issue**: Dev cache directories don't auto-cleanup like temp directories.

**Solution**: This is intentional for debugging. Document clearly that manual cleanup is required. The cleanup function in dev mode is a no-op to preserve artifacts.

## Rollback Plan

If issues arise, the feature can be disabled by:

1. **Immediate**: Unset `DEV_CACHE_DIR` environment variable - reverts to original behavior
2. **Code rollback**: Revert changes to `temp-directory-manager.ts` - single file change
3. **Partial rollback**: Keep `getProjectRoot()` utility but remove usage in `getTempDir()`

## Questions

1. Should we add a startup log message showing the resolved DEV_CACHE_DIR path when the server starts? This would make it obvious when the override is active.

Yes.

2. Should the cleanup function in dev mode actually delete the directory, or preserve it for debugging (current proposal preserves it)? Or should there be a separate flag like `DEV_CACHE_PERSIST=true`?

Preserve.

3. Should we validate that DEV_CACHE_DIR is not set in production environments (e.g., check NODE_ENV), or trust the "DEV_" prefix naming convention?

Trust the convention.

4. Should we support a manual cleanup REST API endpoint for dev cache directories (e.g., `DELETE /api/cache/{sessionId}/{epicKey}`)? This would allow cleaning up without SSH/filesystem access.

No

5. Should the 24-hour cleanup timer be disabled when DEV_CACHE_DIR is set, since directories are manually managed? Or keep it running but have it skip dev-mode directories?

Disabled.

6. Should we create a `.cache` subdirectory instead of `cache` (hidden by default on Unix systems)? Example: `DEV_CACHE_DIR=./.cache`

We shouldn't create it. We want people to be aware of it.

7. Should we add logging of the cache directory path to the tool response messages so users know where to find artifacts? Example: "Debug artifacts available at: /path/to/cache/..."

No. 

