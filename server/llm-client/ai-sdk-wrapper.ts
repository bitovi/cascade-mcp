/**
 * AI SDK Wrapper
 * 
 * Wraps AI SDK's LanguageModel to implement our GenerateTextFn interface.
 * Converts between LLMRequest (messages format) and AI SDK's generateText() API.
 * Works with any AI SDK provider (Anthropic, OpenAI, Google, etc.).
 */

import { generateText, type LanguageModel } from 'ai';
import type { GenerateTextFn, LLMRequest, LLMResponse, Message } from './types.js';

/**
 * Wrap an AI SDK language model to implement GenerateTextFn interface
 * 
 * @param model - Any AI SDK LanguageModel (from @ai-sdk/anthropic, @ai-sdk/openai, etc.)
 * @returns GenerateTextFn that uses the wrapped model
 * 
 * @example
 * ```typescript
 * import { anthropic } from '@ai-sdk/anthropic';
 * const model = anthropic('claude-sonnet-4-5-20250929');
 * const generateText = wrapLanguageModel(model);
 * const response = await generateText({ messages: [...] });
 * ```
 */
export function wrapLanguageModel(model: LanguageModel): GenerateTextFn {
  const generateTextFn: GenerateTextFn = async (request: LLMRequest): Promise<LLMResponse> => {
    // Validate messages array
    if (!request.messages || request.messages.length === 0) {
      throw new Error('LLMRequest must include at least one message');
    }

    // Separate system message from user/assistant messages
    // AI SDK expects system as a separate parameter, not in messages array
    let systemPrompt: string | undefined;
    const conversationMessages = request.messages.filter((msg: Message) => {
      if (msg.role === 'system') {
        systemPrompt = typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.type === 'text' ? c.text : '').join('');
        return false;
      }
      return true;
    });

    // Convert our Message format to AI SDK format
    // Handle both string content and multimodal content (text + images)
    const messages = conversationMessages.map((msg: Message) => {
      // If content is a string, use it directly
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content
        };
      }
      
      // If content is an array (multimodal), convert to AI SDK format
      return {
        role: msg.role,
        content: msg.content.map((part: any) => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text };
          }
          if (part.type === 'image') {
            // AI SDK expects base64 data with proper format
            return { 
              type: 'image',
              image: part.data, // base64 string
              mimeType: part.mimeType
            };
          }
          return part;
        })
      };
    });

    // Call AI SDK's generateText()
    try {
      const result = await generateText({
        model,
        system: systemPrompt,
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
  
  // Mark as supporting parallel requests (AI SDK can handle concurrent calls)
  generateTextFn.supportsParallelRequests = true;
  
  return generateTextFn;
}
