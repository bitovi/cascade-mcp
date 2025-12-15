/**
 * Queued Generate Text Wrapper
 * 
 * Provides automatic request queuing for LLM clients that don't support
 * parallel requests (MCP sampling). For clients that support parallel
 * requests (AI SDK), returns the function unchanged.
 * 
 * This allows tool code to always use Promise.all() without worrying
 * about whether the underlying client supports concurrency.
 */

import type { GenerateTextFn, LLMRequest, LLMResponse } from './types.js';

/**
 * Wraps a generateText function with automatic request queuing for 
 * clients that don't support parallel requests (MCP sampling).
 * 
 * For clients that support parallel requests (AI SDK), returns 
 * the function unchanged.
 * 
 * Error behavior: If any request fails, all subsequent queued requests
 * also fail. This is intentional - for MCP sampling, the connection is
 * likely broken and there's no point retrying.
 * 
 * @example
 * ```typescript
 * // MCP tool - wrap the client
 * const baseGenerateText = createMcpLLMClient(context);
 * const generateText = createQueuedGenerateText(baseGenerateText);
 * 
 * // Tool code can now use Promise.all() freely
 * const results = await Promise.all(items.map(item => 
 *   processItem(item, generateText)
 * ));
 * // Queue handles sequencing transparently for MCP
 * // Actual parallel execution happens for AI SDK
 * ```
 */
export function createQueuedGenerateText(baseGenerateText: GenerateTextFn): GenerateTextFn {
  // If parallel requests are supported, no queuing needed
  if (baseGenerateText.supportsParallelRequests) {
    return baseGenerateText;
  }
  
  // For MCP sampling: queue requests to execute sequentially
  let pendingPromise: Promise<LLMResponse> = Promise.resolve() as unknown as Promise<LLMResponse>;
  
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
