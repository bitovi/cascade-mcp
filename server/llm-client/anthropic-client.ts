/**
 * Anthropic Client Factory
 * 
 * Creates an LLM client that uses the Anthropic API directly.
 * The API key is captured in the closure.
 * 
 * NOTE: Requires @anthropic-ai/sdk package to be installed:
 *   npm install @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageCreateParams } from '@anthropic-ai/sdk/resources/messages.js';
import type { GenerateTextFn, LLMRequest, LLMResponse } from './types.js';

/**
 * Create an Anthropic client with pre-configured API key
 * 
 * @param apiKey - Anthropic API key
 * @param defaultModel - Default model to use (defaults to claude-sonnet-4-5-20250929)
 * @returns GenerateTextFn with API key captured in closure
 * 
 * @example
 * ```typescript
 * const client = createAnthropicClient(apiKey);
 * 
 * // Create a message
 * const response = await client.messages.create({
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   model: 'claude-sonnet-4-5-20250929' // Optional override
 * });
 * ```
 * 
 * @see https://docs.anthropic.com/en/docs/about-claude/models
 * @see https://github.com/anthropics/anthropic-sdk-typescript - Official SDK with model list
 */
export function createAnthropicClient(
  apiKey: string,
  defaultModel: string = 'claude-sonnet-4-5-20250929'
): GenerateTextFn {
  // Create the Anthropic client with API key in closure
  const client = new Anthropic({ apiKey });
  
  return async (request: LLMRequest): Promise<LLMResponse> => {
    // API key is captured in this closure!
    
    // Build content array for the message
    const messageContent: any[] = [
      {
        type: 'text',
        text: request.prompt
      }
    ];
    
    // Add image if provided
    if (request.image) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: request.image.mimeType,
          data: request.image.data
        }
      });
    }
    
    // Map our LLMRequest to Anthropic's message format
    const params: MessageCreateParams = {
      model: request.model || defaultModel,
      max_tokens: request.maxTokens ?? 8000,
      messages: [
        {
          role: 'user',
          content: messageContent
        }
      ]
    };
    
    // Add system prompt if provided
    if (request.systemPrompt) {
      params.system = request.systemPrompt;
    }
    
    // Log request details before making the call
    console.log('🔍 Anthropic API request:', {
      model: params.model,
      maxTokens: params.max_tokens,
      hasSystemPrompt: !!request.systemPrompt,
      systemPromptLength: request.systemPrompt?.length || 0,
      promptLength: request.prompt.length,
      hasImage: !!request.image,
      messageContentItems: messageContent.length
    });
    
    // Make the API call
    console.log('📡 Calling Anthropic API...');
    const startTime = Date.now();
    
    let message;
    try {
      message = await client.messages.create(params);
      
      const duration = Date.now() - startTime;
      
      console.log(`✅ Anthropic API response received (${duration}ms):`, {
        model: message.model,
        stopReason: message.stop_reason,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
        contentBlocks: message.content.length
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ Anthropic API error (${duration}ms):`, {
        error: error.message,
        type: error.constructor.name,
        status: error.status,
        model: params.model,
        maxTokens: params.max_tokens,
        promptLength: request.prompt.length
      });
      throw error;
    }    // Extract text from response
    const textBlock = message.content.find((block: any) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content received from Anthropic API');
    }
    
    return {
      text: textBlock.text,
      metadata: {
        model: message.model,
        stopReason: message.stop_reason || undefined,
        tokensUsed: message.usage.input_tokens + message.usage.output_tokens
      }
    };
  };
}

// Export alias for backward compatibility
export { createAnthropicClient as createAnthropicLLMClient };
