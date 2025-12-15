# Parallel vs Sequential LLM Request Handling

## Overview

When using AI SDK (REST API with Anthropic/OpenAI tokens), we can make parallel LLM requests via `Promise.all()`. However, when using MCP sampling, requests must be sequential - the JSON-RPC protocol doesn't support concurrent requests from the same client.

Currently, `specs/26-parallel-analysis.md` addresses this for screen analysis by adding a `supportsParallelRequests` flag to `GenerateTextFn`. However, as we add more tools that need multiple LLM calls (like `review-work-item` which may need to process multiple Confluence docs), we need a more generic solution.

**Key Insight:** The queue wrapper is applied **at the source** (where `generateText` is created), not at each usage site. Tools receive an already-wrapped `generateText` and can use `Promise.all()` freely - they don't need to know whether queuing is happening.

## Architecture

```
MCP Client connects
    ↓
createMcpLLMClient(context)  →  baseGenerateText (no parallel support)
    ↓
createQueuedGenerateText(baseGenerateText)  →  queuedGenerateText (auto-sequences)
    ↓
Pass to ToolDependencies as `generateText`
    ↓
Tools just use `generateText` with Promise.all()
    ↓
Queue handles sequencing transparently
```

vs

```
REST API call with Anthropic token
    ↓
createAISDKClient()  →  generateText (supports parallel)
    ↓
createQueuedGenerateText(generateText)  →  returns same function (no-op)
    ↓
Pass to ToolDependencies as `generateText`
    ↓
Tools just use `generateText` with Promise.all()
    ↓
Actual parallel execution
```

**Result:** Tool code is simple - no `supportsParallelRequests` checks needed. The decision is made once at client creation time.

## Problem

The `review-work-item` tool will need to:
1. Potentially summarize multiple Confluence documents
2. Process multiple Figma screens (already handled by parallel-analysis)
3. Generate the final review questions

If we naively call `Promise.all()` on document summaries:
- **AI SDK**: Works great, all summaries happen in parallel
- **MCP sampling**: Undefined behavior, likely errors or race conditions

## Current State

From `specs/26-parallel-analysis.md`, we already have:

```typescript
export type GenerateTextFn = {
  (request: LLMRequest): Promise<LLMResponse>;
  supportsParallelRequests?: boolean;  // true for AI SDK, false/undefined for MCP
};
```

This works but requires every call site to:
1. Check `generateText.supportsParallelRequests`
2. Use `Promise.all()` if true, sequential loop if false
3. Handle this logic repeatedly

## Proposed Solution: Queue-Aware generateText Wrapper

Create a wrapper that handles this automatically:

```typescript
/**
 * Creates a generateText function that automatically handles 
 * parallel vs sequential execution based on client capability.
 * 
 * For MCP sampling: Queues requests internally, executes sequentially
 * For AI SDK: Allows parallel execution
 */
function createQueuedGenerateText(baseGenerateText: GenerateTextFn): GenerateTextFn {
  if (baseGenerateText.supportsParallelRequests) {
    // AI SDK - no queuing needed
    return baseGenerateText;
  }
  
  // MCP sampling - wrap with queue
  let pendingPromise: Promise<any> = Promise.resolve();
  
  const queuedGenerateText: GenerateTextFn = async (request) => {
    // Chain this request after all pending requests
    const result = pendingPromise.then(() => baseGenerateText(request));
    pendingPromise = result;
    return result;
  };
  
  queuedGenerateText.supportsParallelRequests = false;
  return queuedGenerateText;
}
```

With this wrapper, calling code can always use `Promise.all()`:

```typescript
// Before: Manual branching everywhere
if (generateText.supportsParallelRequests) {
  results = await Promise.all(docs.map(d => summarize(d, generateText)));
} else {
  results = [];
  for (const d of docs) {
    results.push(await summarize(d, generateText));
  }
}

// After: Just use Promise.all, queue handles it
const queuedGenerate = createQueuedGenerateText(generateText);
results = await Promise.all(docs.map(d => summarize(d, queuedGenerate)));
```

## Implementation Plan

### Step 1: Create Queue Wrapper Utility

**File:** `server/llm-client/queued-generate-text.ts`

```typescript
import type { GenerateTextFn, LLMRequest, LLMResponse } from './types.js';

/**
 * Wraps a generateText function with automatic request queuing for 
 * clients that don't support parallel requests (MCP sampling).
 * 
 * For clients that support parallel requests (AI SDK), returns 
 * the function unchanged.
 */
export function createQueuedGenerateText(baseGenerateText: GenerateTextFn): GenerateTextFn {
  // If parallel requests are supported, no queuing needed
  if (baseGenerateText.supportsParallelRequests) {
    return baseGenerateText;
  }
  
  // For MCP sampling: queue requests to execute sequentially
  // If any request fails, all subsequent queued requests also fail
  // (MCP connection is likely broken, no point retrying)
  let pendingPromise: Promise<LLMResponse> = Promise.resolve() as Promise<LLMResponse>;
  
  const queuedGenerateText: GenerateTextFn = async (request: LLMRequest): Promise<LLMResponse> => {
    // Chain this request after pending requests
    // If pendingPromise rejected, this will also reject immediately
    const result = pendingPromise.then(() => baseGenerateText(request));
    pendingPromise = result;
    return result;
  };
  
  // Mark as NOT supporting parallel (since we're queuing)
  queuedGenerateText.supportsParallelRequests = false;
  
  return queuedGenerateText;
}
```

**Verification**: Unit test that queued requests execute sequentially

**Test file:** `server/llm-client/queued-generate-text.test.ts` (co-located with source)

### Step 2: Export from llm-client/index.ts

```typescript
export { createQueuedGenerateText } from './queued-generate-text.js';
```

### Step 3: Wrap at MCP Client Creation

Each MCP tool wrapper creates `generateText` via `createMcpLLMClient()` before passing to core logic. Apply the queue wrapper in each:

**Files to update:**
- `server/providers/combined/tools/analyze-feature-scope/analyze-feature-scope.ts`
- `server/providers/combined/tools/writing-shell-stories/write-shell-stories.ts`
- `server/providers/combined/tools/write-next-story/write-next-story.ts`
- `server/providers/atlassian/tools/confluence-analyze-page.ts`

**Example (analyze-feature-scope.ts):**

```typescript
import { createMcpLLMClient } from '../../../../llm-client/mcp-sampling-client.js';
import { createQueuedGenerateText } from '../../../../llm-client/queued-generate-text.js';

// Inside the tool handler:
const baseGenerateText = createMcpLLMClient(context);
const generateText = createQueuedGenerateText(baseGenerateText);

const deps: ToolDependencies = {
  generateText,  // Already wrapped - core logic doesn't need to know
  // ... other deps
};
```

For AI SDK (REST API), the wrapper is a no-op:

```typescript
import { createAISDKClient } from './llm-client/ai-sdk-wrapper.js';
import { createQueuedGenerateText } from './llm-client/queued-generate-text.js';

// When setting up dependencies for REST API:
const baseLLMClient = createAISDKClient(apiKey);
const generateText = createQueuedGenerateText(baseLLMClient); // No-op, returns same function

const deps: ToolDependencies = {
  generateText,  // Parallel execution works naturally
  // ... other deps
};
```

**Verification**: MCP tools receive queued generateText; REST API tools receive parallel-capable generateText

### Step 4: Refactor screen-analysis-regenerator

Remove the manual `supportsParallelRequests` branching from `server/providers/combined/tools/shared/screen-analysis-regenerator.ts`.

**Before** (current code with branching):
```typescript
if (generateText.supportsParallelRequests) {
  console.log(`  🚀 Parallel analysis mode (AI SDK)`);
  results = await Promise.all(screensToAnalyze.map(screen => analyzeScreen(screen, params)));
} else {
  console.log(`  📝 Sequential analysis mode (MCP sampling)`);
  results = [];
  for (const screen of screensToAnalyze) {
    results.push(await analyzeScreen(screen, params));
  }
}
```

**After** (simple, queue handles it):
```typescript
// Queue wrapper handles parallel vs sequential transparently
results = await Promise.all(screensToAnalyze.map(screen => analyzeScreen(screen, params)));
```

**Verification**: Screen analysis works correctly for both MCP and REST API paths

### Step 5: Remove supportsParallelRequests Checks from Tools

Search for any other `supportsParallelRequests` checks in tool code and remove them. Tools should just use `Promise.all()` and trust the wrapper.

**Verification**: No `supportsParallelRequests` checks remain in tool/helper code (only in llm-client layer)

## Alternative Approaches Considered

### Option A: Batch Helper Function
Instead of a queue wrapper, provide a helper that runs functions in parallel or sequential:

```typescript
async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  generateText: GenerateTextFn
): Promise<R[]> {
  if (generateText.supportsParallelRequests) {
    return Promise.all(items.map(processor));
  }
  const results: R[] = [];
  for (const item of items) {
    results.push(await processor(item));
  }
  return results;
}
```

**Pros**: Explicit about what's being batched
**Cons**: Requires passing generateText everywhere, can't compose easily

### Option B: Do Nothing (Keep Manual Checks)
Each tool checks `supportsParallelRequests` and branches.

**Pros**: Simple, explicit
**Cons**: Repetitive, error-prone, easy to forget

### Option C: Always Sequential for MCP
Just always run sequentially when MCP sampling is detected.

**Pros**: Simplest
**Cons**: Loses parallelism benefit for AI SDK users

## Recommended Approach

**Option: Queue Wrapper (Steps 1-5)** provides the best balance:
- Tools can use `Promise.all()` naturally
- Queue handles sequencing automatically for MCP
- AI SDK gets full parallelism
- Easy to reason about
- Wrapping happens once at client creation, not scattered in tools

## Answered Questions

1. **Should `queuedGenerateText` be added to `ToolDependencies` by default?** 
   - Yes, wrapping should happen at the source when `generateText` is created. Tools receive an already-wrapped function - they don't call `createQueuedGenerateText()` themselves.

2. **Should there be a timeout/max queue size?**
   - No.

3. **Should we add logging/metrics?**
   - Not now. 

## Implementation Order

**This spec (31) must be completed before spec 29 (review-work-item).**

Spec 29 depends on being able to use `Promise.all()` for parallel document processing without worrying about MCP sampling limitations.

## Related Specs

- `specs/26-parallel-analysis.md` - Original parallel analysis implementation (will be simplified by this)
- `specs/29-work-item-review.md` - Tool that depends on this capability
- `specs/28-confluence.md` - Document summarization that may need parallel LLM calls 
