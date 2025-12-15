/**
 * Unit tests for createQueuedGenerateText
 * 
 * Verifies that:
 * 1. Parallel-capable clients are returned unchanged
 * 2. Non-parallel clients get queued execution
 * 3. Queue executes requests sequentially
 * 4. Error propagation works correctly
 */

import { createQueuedGenerateText } from './queued-generate-text.js';
import type { GenerateTextFn, LLMRequest, LLMResponse } from './types.js';

describe('createQueuedGenerateText', () => {
  
  describe('when client supports parallel requests', () => {
    it('should return the same function unchanged', () => {
      const mockGenerateText: GenerateTextFn = async () => ({ text: 'response' });
      mockGenerateText.supportsParallelRequests = true;
      
      const result = createQueuedGenerateText(mockGenerateText);
      
      expect(result).toBe(mockGenerateText);
    });
  });
  
  describe('when client does not support parallel requests', () => {
    it('should return a wrapped function', () => {
      const mockGenerateText: GenerateTextFn = async () => ({ text: 'response' });
      // supportsParallelRequests is undefined (falsy)
      
      const result = createQueuedGenerateText(mockGenerateText);
      
      expect(result).not.toBe(mockGenerateText);
      expect(result.supportsParallelRequests).toBe(false);
    });
    
    it('should execute requests sequentially when called with Promise.all', async () => {
      const callOrder: number[] = [];
      const completionOrder: number[] = [];
      
      const mockGenerateText: GenerateTextFn = async (request: LLMRequest): Promise<LLMResponse> => {
        const id = (request as any).id;
        callOrder.push(id);
        
        // Simulate varying processing times
        // Request 1 takes longest, request 3 takes shortest
        // If truly parallel, request 3 would complete first
        const delays = { 1: 30, 2: 20, 3: 10 };
        await new Promise(resolve => setTimeout(resolve, delays[id as keyof typeof delays] || 10));
        
        completionOrder.push(id);
        return { text: `response-${id}` };
      };
      // supportsParallelRequests is undefined (falsy)
      
      const queuedGenerate = createQueuedGenerateText(mockGenerateText);
      
      // Call all three "in parallel" with Promise.all
      const results = await Promise.all([
        queuedGenerate({ messages: [], id: 1 } as any),
        queuedGenerate({ messages: [], id: 2 } as any),
        queuedGenerate({ messages: [], id: 3 } as any),
      ]);
      
      // Calls should be made in order (sequential queue)
      expect(callOrder).toEqual([1, 2, 3]);
      
      // Completions should also be in order (previous must complete before next starts)
      expect(completionOrder).toEqual([1, 2, 3]);
      
      // Results should be correct
      expect(results.map(r => r.text)).toEqual(['response-1', 'response-2', 'response-3']);
    });
    
    it('should propagate errors and fail subsequent queued requests', async () => {
      let callCount = 0;
      
      const mockGenerateText: GenerateTextFn = async (request: LLMRequest): Promise<LLMResponse> => {
        callCount++;
        const id = (request as any).id;
        
        if (id === 2) {
          throw new Error('Request 2 failed');
        }
        
        return { text: `response-${id}` };
      };
      
      const queuedGenerate = createQueuedGenerateText(mockGenerateText);
      
      // Start all three requests
      const promise1 = queuedGenerate({ messages: [], id: 1 } as any);
      const promise2 = queuedGenerate({ messages: [], id: 2 } as any);
      const promise3 = queuedGenerate({ messages: [], id: 3 } as any);
      
      // First request succeeds
      await expect(promise1).resolves.toEqual({ text: 'response-1' });
      
      // Second request fails
      await expect(promise2).rejects.toThrow('Request 2 failed');
      
      // Third request also fails (cascading failure)
      await expect(promise3).rejects.toThrow('Request 2 failed');
      
      // Only 2 calls were made (request 3 never actually executed)
      expect(callCount).toBe(2);
    });
  });
  
  describe('when supportsParallelRequests is explicitly false', () => {
    it('should still wrap the function', () => {
      const mockGenerateText: GenerateTextFn = async () => ({ text: 'response' });
      mockGenerateText.supportsParallelRequests = false;
      
      const result = createQueuedGenerateText(mockGenerateText);
      
      expect(result).not.toBe(mockGenerateText);
      expect(result.supportsParallelRequests).toBe(false);
    });
  });
});
