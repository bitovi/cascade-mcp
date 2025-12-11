# Parallel Screen Analysis

## Overview

Currently, screen analysis happens sequentially - we analyze one screen at a time using the LLM. The AI SDK (Anthropic, OpenAI, etc.) supports parallel API requests via `Promise.all()`, which could significantly reduce total execution time. However, **MCP sampling uses JSON-RPC request/response and should NOT make concurrent requests** - the behavior is undefined and client-dependent.

**Solution:** Add a capability flag `supportsParallelRequests` to the `GenerateTextFn` so we can detect at runtime whether parallel requests are safe.

**Current Behavior:**
- Phase A: Batch download all images upfront (already parallel/batch)
- Phase B: Analyze screens sequentially with `for` loop (SLOW for API, REQUIRED for MCP)
  - Screen 1: Download notes → Analyze → Save analysis
  - Screen 2: Download notes → Analyze → Save analysis
  - ...

**Proposed Behavior:**
- Phase A: Batch download all images upfront (no change)
- Phase B: Conditionally parallelize based on capability
  - **If `generateText.supportsParallelRequests === true`** (AI SDK): Analyze ALL screens in parallel
  - **Otherwise** (MCP sampling): Keep sequential analysis

## Current Implementation

### Location
`server/providers/combined/tools/shared/screen-analysis-regenerator.ts`

The `regenerateScreenAnalyses()` function contains two phases:

```typescript
// Phase A: Batch download ALL images upfront (lines ~140-185)
const imagesMap = await downloadFigmaImagesBatch(...);

// Phase B: Analyze screens sequentially (lines ~187-330)
for (let i = 0; i < screensToAnalyze.length; i++) {
  const screen = screensToAnalyze[i];
  
  // 1. Write notes
  if (screen.notes && screen.notes.length > 0) {
    await writeNotesForScreen(...);
  }
  
  // 2. Get pre-downloaded image
  const imageResult = imagesMap.get(frame.id);
  
  // 3. Generate analysis
  const analysisResponse = await generateText({
    messages: [...],
    maxTokens: SCREEN_ANALYSIS_MAX_TOKENS
  });
  
  // 4. Save analysis
  await fs.writeFile(analysisPath, analysisWithUrl, 'utf-8');
}
```

### Problem
The sequential `for` loop means if each screen takes 10 seconds to analyze:
- 5 screens = 50 seconds
- 10 screens = 100 seconds

With parallel analysis:
- 5 screens = ~10-15 seconds (limited by slowest screen)
- 10 screens = ~10-15 seconds (limited by slowest screen)

## Implementation Plan

### Step 1: Add Capability Flag to LLM Client Types

**File:** `server/llm-client/types.ts`

Add an optional property to `GenerateTextFn` to indicate parallel request support:

```typescript
/**
 * Function type for generating text from an LLM
 * 
 * This is the core abstraction - a function that takes a request
 * and returns a promise of the generated text.
 * 
 * Implementations:
 * - MCP: Uses mcp.server.request({ method: "sampling/createMessage" })
 * - AI SDK: Uses anthropic.messages.create() or equivalent
 */
export type GenerateTextFn = {
  (request: LLMRequest): Promise<LLMResponse>;
  
  /**
   * Whether this client supports parallel requests.
   * - true: Multiple requests can be in-flight simultaneously (AI SDK)
   * - false/undefined: Requests must be sequential (MCP sampling)
   */
  supportsParallelRequests?: boolean;
};
```

**Verification:** TypeScript compilation succeeds, no breaking changes.

### Step 2: Set Flag in AI SDK Wrapper

**File:** `server/llm-client/ai-sdk-wrapper.ts`

Mark AI SDK clients as supporting parallel requests:

```typescript
export function wrapLanguageModel(model: LanguageModel): GenerateTextFn {
  const generateText: GenerateTextFn = async (request: LLMRequest): Promise<LLMResponse> => {
    // ... existing implementation ...
  };
  
  // Mark as supporting parallel requests (AI SDK can handle concurrent calls)
  generateText.supportsParallelRequests = true;
  
  return generateText;
}
```

**Verification:** REST API calls should have `supportsParallelRequests === true`.

### Step 3: MCP Sampling Client Defaults to False

**File:** `server/llm-client/mcp-sampling-client.ts`

MCP sampling client should NOT set the flag (defaults to undefined/false):

```typescript
export function createMcpLLMClient(context: McpToolContext): GenerateTextFn {
  const generateText: GenerateTextFn = async (request: LLMRequest): Promise<LLMResponse> => {
    // ... existing implementation ...
  };
  
  // Do NOT set supportsParallelRequests
  // (undefined/false indicates sequential-only)
  
  return generateText;
}
```

**Verification:** MCP tool calls should have `supportsParallelRequests === undefined`.

### Step 4: Extract Screen Analysis Logic into Helper Function

Create a new helper function at the bottom of `screen-analysis-regenerator.ts` that processes a single screen:

```typescript
/**
 * Analyze a single screen with pre-downloaded image
 * 
 * @param screen - Screen to analyze
 * @param params - Analysis parameters (generateText, paths, image data, etc.)
 * @returns Analysis metadata (success, filename, etc.)
 */
async function analyzeScreen(
  screen: ScreenToAnalyze,
  params: {
    generateText: GenerateTextFn;
    allFrames: FigmaNodeMetadata[];
    allNotes: FigmaNodeMetadata[];
    imagesMap: Map<string, any>;
    fileCachePath: string;
    epicContext?: string;
    originalIndex: number;
    totalScreens: number;
  }
): Promise<{ filename: string; analyzed: boolean; notesWritten: number }> {
  // Move logic from current for loop body here
  // 1. Write notes
  // 2. Get image
  // 3. Generate analysis
  // 4. Save analysis
  // 5. Return metadata
}
```

**Verification:** Run existing tests/workflows - should work identically (still sequential at this point).

### Step 5: Add Conditional Parallelization Logic

Replace the current `for` loop in Phase B with conditional execution based on capability:

```typescript
// ==========================================
// Phase B: Analyze screens (parallel if supported, sequential otherwise)
// ==========================================

let analysisResults: Array<{ filename: string; analyzed: boolean; notesWritten: number }>;

// Check if parallel requests are supported (AI SDK = true, MCP sampling = false/undefined)
if (generateText.supportsParallelRequests) {
  console.log(`  🚀 Parallel analysis mode (AI SDK)`);
  
  // Parallel execution for REST API
  const analysisPromises = screensToAnalyze.map((screen) => {
    const originalIndex = screens.indexOf(screen);
    
    return analyzeScreen(screen, {
      generateText,
      allFrames,
      allNotes,
      imagesMap,
      fileCachePath,
      epicContext,
      originalIndex,
      totalScreens: screens.length
    });
  });
  
  analysisResults = await Promise.all(analysisPromises);
  
} else {
  console.log(`  🔄 Sequential analysis mode (MCP sampling)`);
  
  // Sequential execution for MCP tools
  analysisResults = [];
  for (const screen of screensToAnalyze) {
    const originalIndex = screens.indexOf(screen);
    
    const result = await analyzeScreen(screen, {
      generateText,
      allFrames,
      allNotes,
      imagesMap,
      fileCachePath,
      epicContext,
      originalIndex,
      totalScreens: screens.length
    });
    
    analysisResults.push(result);
  }
}

// Count successes (same for both modes)
downloadedImages = analysisResults.filter(r => r.analyzed).length;
analyzedScreens = analysisResults.filter(r => r.analyzed).length;
downloadedNotes = analysisResults.reduce((sum, r) => sum + r.notesWritten, 0);
```

**Verification:** 
- REST API: Should log "Parallel analysis mode" and complete much faster (2-3 screens)
- MCP tools: Should log "Sequential analysis mode" and work as before
- Check all analysis files are created correctly in both modes

### Step 6: Update Progress Notifications

Update notifications to match the execution mode:

**Parallel Mode (REST API) - Notify on completion:**
```typescript
if (generateText.supportsParallelRequests) {
  // Start notification
  if (notify) {
    await notify(`🤖 Analyzing ${screensToAnalyze.length} screens in parallel...`);
  }
  
  // Wrap each analysis to notify on completion
  const analysisPromises = screensToAnalyze.map(async (screen) => {
    const result = await analyzeScreen(screen, {...});
    
    // Notify after each completes
    if (notify) {
      await notify(`✅ Analyzed: ${screen.name}`);
    }
    
    return result;
  });
  
  analysisResults = await Promise.all(analysisPromises);
}
```

**Sequential Mode (MCP) - Notify on start (current behavior):**
```typescript
else {
  analysisResults = [];
  for (const screen of screensToAnalyze) {
    // Notify as we start each screen (current behavior)
    if (notify) {
      await notify(`🤖 Analyzing: ${screen.name}`);
    }
    
    const result = await analyzeScreen(screen, {...});
    analysisResults.push(result);
  }
}
```

**Verification:** 
- REST API: See completion notifications as each screen finishes (may arrive out of order)
- MCP tools: See start notifications before each screen begins (in order)

### Step 7: Error Handling (Fail Fast)

Both modes should fail fast on first error (consistent behavior):

```typescript
// Both parallel and sequential modes let errors propagate immediately
// No try-catch wrapper collecting failures

if (generateText.supportsParallelRequests) {
  // Parallel mode: Promise.all() will reject on first error
  const analysisPromises = screensToAnalyze.map(async (screen) => {
    const result = await analyzeScreen(screen, {...}); // Error propagates
    if (notify) await notify(`✅ Analyzed: ${screen.name}`);
    return result;
  });
  
  analysisResults = await Promise.all(analysisPromises); // Rejects on first failure
  
} else {
  // Sequential mode: await throws immediately on first error
  analysisResults = [];
  for (const screen of screensToAnalyze) {
    if (notify) await notify(`🤖 Analyzing: ${screen.name}`);
    const result = await analyzeScreen(screen, {...}); // Error propagates
    analysisResults.push(result);
  }
}
```

**Behavior:**
- **Parallel mode**: If any screen fails, `Promise.all()` rejects immediately, stopping execution
- **Sequential mode**: If any screen fails, the error propagates and stops the loop
- Both modes provide the same fail-fast behavior

**Verification:**
- Temporarily break LLM API key
- REST API: Should fail on first screen error (may not be screen 1 due to parallel execution)
- MCP tools: Should fail on first screen error (screen 1 in sequential order)
- Fix API key - both should succeed for all screens

### Step 8: Test with Both MCP Sampling and AI SDK

Verify parallel execution works with both LLM client types:

**Test with MCP Sampling (VS Code Copilot):**
- Open VS Code Copilot
- Run `write-shell-stories` tool
- Check console logs show "Sequential analysis mode (MCP sampling)"
- Verify behavior unchanged (sequential)

**Test with AI SDK (REST API):**
- Call REST API endpoint `/api/write-shell-stories`
- Include `X-Anthropic-Token` header
- Check logs show "Parallel analysis mode (AI SDK)"
- Verify significantly faster execution (5-10 screens)

**Verification:** 
- MCP path: Same performance as before (sequential)
- REST API: 5-10x faster for multi-screen epics

## Benefits

1. **Performance:** 5-10x faster for REST API workflows with 5-10 screens
2. **No Breaking Changes:** Same inputs/outputs, same cache behavior
3. **Safe for MCP:** Automatically stays sequential for MCP sampling (no client compatibility issues)
4. **Better UX for API users:** Less waiting, faster iteration on designs
5. **Zero Risk:** Only parallelizes when explicitly supported

## Technical Considerations

### Rate Limits
- **Anthropic:** 40,000 requests/minute for Tier 4 (won't hit with typical usage)
- **OpenAI:** 10,000 requests/minute for Tier 4
- **Parallel limit:** Current implementation has no explicit limit on parallelism

**Mitigation (future optimization):** If rate limits become an issue, add configurable batch size:
```typescript
// Process in batches of 5
const batchSize = 5;
for (let i = 0; i < screensToAnalyze.length; i += batchSize) {
  const batch = screensToAnalyze.slice(i, i + batchSize);
  const batchResults = await Promise.all(batch.map(screen => analyzeScreen(...)));
}
```

### Memory Usage
- Each parallel request holds image data + prompt in memory
- Typical screen: 500KB image + 5KB prompt = ~505KB
- 10 screens in parallel: ~5MB total (negligible)

**No mitigation needed** for typical usage.

### Error Handling
- Both modes use fail-fast behavior (stop on first error)
- Parallel mode: `Promise.all()` rejects on first failure
- Sequential mode: `await` throws on first failure
- **Consistent UX:** Same error behavior regardless of mode

## Answers to Questions

1. **Parallelism limit:** Not needed now (rate limits unlikely with typical usage)

2. **Progress notifications:**
   - **Parallel mode**: Notify on completion (as each screen finishes)
   - **Sequential mode**: Notify on start (as each screen begins)

3. **Error handling:** Fail fast on first error in both modes (consistent behavior)

