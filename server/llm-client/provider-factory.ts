/**
 * Provider Factory
 * 
 * Creates LLM clients using the AI SDK with Anthropic provider.
 * Entry point for creating GenerateTextFn instances.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { validateAnthropicConfig, getAnthropicModel } from './anthropic-config.js';
import { wrapAnthropicModel } from './anthropic-wrapper.js';
import type { GenerateTextFn } from './types.js';

/**
 * Create an LLM client using Anthropic provider
 * 
 * This is the main factory function for creating GenerateTextFn instances.
 * 
 * @param options - Optional configuration object OR model string (for backward compatibility)
 * @param options.model - Model override; uses LLM_MODEL env var or default if not provided
 * @param options.apiKey - API key override; uses ANTHROPIC_API_KEY env var if not provided
 * @returns GenerateTextFn ready to use
 * 
 * @throws {Error} If ANTHROPIC_API_KEY is not set and apiKey not provided
 * 
 * @example
 * ```typescript
 * // Uses ANTHROPIC_API_KEY from environment (MCP tools)
 * const generateText = createLLMClient();
 * 
 * // Use with API key from header (REST API)
 * const generateText = createLLMClient({ apiKey: req.headers['x-anthropic-key'] });
 * 
 * // Use with custom model
 * const generateText = createLLMClient({ model: 'claude-opus-4-20250805' });
 * 
 * // Backward compatible: model string
 * const generateText = createLLMClient('claude-opus-4-20250805');
 * 
 * const response = await generateText({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   maxTokens: 1024
 * });
 * ```
 */
export function createLLMClient(
  options?: string | { model?: string; apiKey?: string }
): GenerateTextFn {
  // Handle backward compatibility: string parameter = model
  const config = typeof options === 'string' 
    ? { model: options } 
    : (options || {});

  const { model, apiKey } = config;

  // Get API key (parameter takes precedence over environment)
  const anthropicApiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  
  // Validate API key is available
  if (!anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required.\n' +
      'Either:\n' +
      '  1. Set environment variable: export ANTHROPIC_API_KEY=sk-ant-...\n' +
      '  2. Pass as parameter: createLLMClient({ apiKey: "sk-ant-..." })\n' +
      'Get your API key from: https://console.anthropic.com/account/keys'
    );
  }

  // Get model to use
  const modelId = model || getAnthropicModel();

  // Create Anthropic provider with API key
  const anthropicProvider = createAnthropic({
    apiKey: anthropicApiKey
  });
  
  // Create the language model
  const anthropicModel = anthropicProvider(modelId);

  // Wrap and return
  return wrapAnthropicModel(anthropicModel);
}
