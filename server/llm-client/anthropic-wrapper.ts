/**
 * Anthropic Wrapper
 * 
 * Wraps Anthropic's LanguageModel to implement our GenerateTextFn interface.
 * Converts between LLMRequest (messages format) and AI SDK's generateText() API.
 */

import { generateText, type LanguageModel } from 'ai';
import type { GenerateTextFn, LLMRequest, LLMResponse, Message } from './types.js';

/**
 * Wrap an Anthropic model to implement GenerateTextFn interface
 * 
 * @param model - The Anthropic LanguageModel from @ai-sdk/anthropic
 * @returns GenerateTextFn that uses the wrapped model
 * 
 * @example
 * ```typescript
 * import { anthropic } from '@ai-sdk/anthropic';
 * const model = anthropic('claude-sonnet-4-5-20250929');
 * const generateText = wrapAnthropicModel(model);
 * const response = await generateText({ messages: [...] });
 * ```
 */
export function wrapAnthropicModel(model: LanguageModel): GenerateTextFn {
  return async (request: LLMRequest): Promise<LLMResponse> => {
    // Validate messages array
    if (!request.messages || request.messages.length === 0) {
      throw new Error('LLMRequest must include at least one message');
    }

    // Convert our Message format - AI SDK accepts messages as-is if they match the interface
    const messages = request.messages.map((msg: Message) => {
      // Simple conversion: if content is string, keep as-is; if array, need to convert
      if (typeof msg.content === 'string') {
        return msg as any;
      }
      // For image content, keep the array format
      return msg as any;
    });

    // Call AI SDK's generateText()
    try {
      const result = await generateText({
        model,
        messages,
        maxTokens: request.maxTokens || 8000,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
        ...(request.topP !== undefined && { topP: request.topP })
      } as any);

      // Convert AI SDK response to LLMResponse
      return {
        text: result.text,
        metadata: {
          model: (result as any).model || 'claude-sonnet-4-5-20250929',
          finishReason: (result.finishReason as any) || 'stop',
          usage: {
            promptTokens: result.usage.inputTokens || 0,
            completionTokens: result.usage.outputTokens || 0,
            totalTokens: (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0)
          }
        }
      };
    } catch (error: any) {
      // Throw descriptive error (not AI SDK error directly)
      throw new Error(
        `Anthropic API error: ${error.message || error.error?.message || 'Unknown error'}`
      );
    }
  };
}
