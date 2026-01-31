# MCP Client Timeout Issue

## Problem Summary

VS Code Copilot (MCP client) timed out after 40 seconds when calling `write-shell-stories`, but the server continued processing for 3+ minutes and completed successfully. The client never received the results.

## Timeline

From the server logs (times in format `04:MM:SS`):

```
04:09:10 - Tool call started (write-shell-stories for TF-101)
04:09:10 - Phase 1-3: Setting up epic and Figma screens...
04:09:10 - Fetching Jira epic details
04:09:10 - Found 1 Figma URL, 3 screens, 1 note
04:09:10 - Fetching Google Docs (1 doc)
04:09:10 - Fetching Figma comments (33 comments)
04:09:10 - Phase 4: Downloading images and analyzing screens...
04:09:10 - Downloaded 3 images (412KB total)
04:09:10 - Analyzing 3 screens...

04:10:50 - Client sent cancellation notification (40 seconds elapsed)
           {"jsonrpc":"2.0","method":"notifications/cancelled",
            "params":{"requestId":2,"reason":"McpError: MCP error -32001: Request timed out"}}

04:10:59 - First screen analysis completed (1m 49s total)
04:11:42 - Second screen analysis completed (2m 32s total)
04:12:19 - Third screen analysis completed (3m 9s total)
04:12:19 - Phase 5: Checking scope analysis...
04:12:37 - Scope analysis finished and epic updated (3m 27s total)
```

## VS Code Client Logs

From VS Code's MCP extension logs:

```
2026-01-29 10:30:16.056 [info] 🤖 Analyzing Figma: 3 screen(s), 1 note(s), 8 comment(s)...
2026-01-29 10:31:11.266 [info] Error reading from async stream, we will reconnect: TypeError: terminated
2026-01-29 10:33:17.734 [info] Error reading from async stream, we will reconnect: TypeError: terminated
2026-01-29 10:35:23.722 [info] Error reading from async stream, we will reconnect: TypeError: terminated
2026-01-29 10:37:30.065 [info] Error reading from async stream, we will reconnect: TypeError: terminated
2026-01-29 10:39:36.213 [info] Error reading from async stream, we will reconnect: TypeError: terminated
2026-01-29 10:41:42.492 [info] Error reading from async stream, we will reconnect: 
```

## Root Causes

### 1. Client-Side Timeout (40 seconds)

The MCP client has a built-in timeout (likely 30-60 seconds) for tool calls. After 40 seconds without a response, it:
- Sent a cancellation notification (`notifications/cancelled`)
- Automatically gave up on the request
- Showed error code `-32001: Request timed out`

### 2. Server Ignored Cancellation

The server received the cancellation notification but **did not respect it**:
- Continued processing all 3 screens
- Completed scope analysis generation
- Updated the Jira epic
- Sent sampling requests back to the client

From server logs:
```
Body: {"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":2,"reason":"McpError: MCP error -32001: Request timed out"}}
--------------------------------
  ♻️ Reusing existing transport for session: e6a06d8f-3c14-4091-8484-370ba3a5d1bd
  ✅ MCP POST request handled successfully
```

The server acknowledged the cancellation (`202` response) but the tool kept running.

### 3. Orphaned Sampling Requests

After cancellation, the server continued sending sampling requests (for screen analysis). The client responded to these but kept terminating the streams because the original request was cancelled:

```
Error reading from async stream, we will reconnect: TypeError: terminated
```

This created:
- **Client perspective**: "I cancelled request #2, why am I getting sampling requests for it?"
- **Server perspective**: "Request #2 is still running, let me keep analyzing screens"

### 4. No Progress Updates

The tool performed expensive operations but sent **zero progress updates** to the client:
- Downloading 412KB of images
- Generating semantic XML (3 screens × ~11KB each)
- Making 3 LLM sampling calls (30-50 seconds each)
- Generating scope analysis

From the client's perspective, the request hung with no feedback for 40 seconds.

## Why Screen Analysis Was So Slow

Each screen analysis took **30-50 seconds** via LLM sampling:

```
04:10:59 - Screen 1 analysis complete (49 seconds)
04:11:42 - Screen 2 analysis complete (43 seconds)
04:12:19 - Screen 3 analysis complete (37 seconds)
```

With 3 screens analyzed sequentially, this naturally exceeds any reasonable timeout.

## Impact

The tool **did complete successfully** and updated the Jira epic with scope analysis, but:
- The client never saw the results
- The user got a timeout error
- Resources were wasted on work the client couldn't use
- Confusing "terminated" errors appeared in VS Code logs

## Solution Implemented

### Progress Notifications During Screen Analysis

**Implementation:** Added progress notifications before each screen analysis when using sequential execution (MCP sampling):

```typescript
// In regenerateScreenAnalyses() - screen-analysis-regenerator.ts
const isSequential = !generateText.supportsParallelRequests;

const analysisPromises = screensToAnalyze.map(async (screen, index) => {
  // Send progress BEFORE analysis starts (only for sequential)
  if (notify && isSequential) {
    await notify(`📱 Analyzing screen ${index + 1} of ${screensToAnalyze.length}: ${screen.name}...`);
  }
  
  const result = await analyzeScreen(screen, { ... });
  
  // Notify after completion (for both parallel and sequential)
  if (notify && result.analyzed) {
    await notify(`✅ Analyzed: ${screen.name}`);
  }
  
  return result;
});
```

**Why conditional on sequential execution:**
- **MCP sampling**: Cannot parallelize, takes 30-50s per screen → needs progress updates to prevent timeout
- **AI SDK (parallel)**: Screens analyzed simultaneously → no need for per-screen progress (all complete ~same time)

**Key insight:** The `generateText.supportsParallelRequests` flag (from queued-generate-text.ts) tells us whether we're using:
- `false/undefined`: MCP sampling (sequential via queue) → send progress before each screen
- `true`: AI SDK (actual parallel) → don't send per-screen progress

This keeps the connection alive during the 40+ second gap in Phase 4 that was causing timeouts.

## Additional Recommendations (Not Implemented)

### 1. Implement Cancellation Handling

Tools should respect MCP cancellation notifications:

```typescript
// Check for cancellation during long operations
if (isCancelled(requestId)) {
  throw new CancellationError('Request was cancelled by client');
}
```

### 2. Optimize Screen Analysis Performance

**Note:** Screen analysis uses MCP sampling, which cannot be parallelized.

Potential optimizations:
- Cache screen analyses more aggressively (check file metadata/version before invalidating)
- Reduce semantic XML size by filtering unnecessary Figma properties
- Split large analyses into smaller chunks with progress updates between each
- Consider pre-generating analyses asynchronously when Figma links are added to epics

### 3. Increase Client Timeout (Optional)

For known long-running operations, the client could increase its timeout, but this should be a last resort. Better to make operations faster and more responsive.

## Related Files

- `server/providers/combined/tools/write-shell-stories/write-shell-stories.ts` - Main tool implementation
- `server/providers/figma/analyze-figma-screens.ts` - Screen analysis logic
- `server/mcp-service.ts` - MCP transport layer (handles notifications)
