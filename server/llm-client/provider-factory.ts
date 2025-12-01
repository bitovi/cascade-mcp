/**
 * Provider Factory
 * 
 * Creates LLM clients using the AI SDK with multiple provider support.
 * Entry point for creating GenerateTextFn instances from headers or direct configuration.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { validateAnthropicConfig, getAnthropicModel } from './anthropic-config.js';
import { wrapAnthropicModel } from './anthropic-wrapper.js';
import { UnsupportedProviderError } from './provider-errors.js';
import type { GenerateTextFn } from './types.js';
import type { LanguageModel } from 'ai';

// Import all provider modules
import * as anthropicProvider from './providers/anthropic.js';
import * as openaiProvider from './providers/openai.js';
import * as googleProvider from './providers/google.js';
import * as bedrockProvider from './providers/bedrock.js';
import * as mistralProvider from './providers/mistral.js';
import * as deepseekProvider from './providers/deepseek.js';
import * as groqProvider from './providers/groq.js';
import * as xaiProvider from './providers/xai.js';

/**
 * Registry of all supported provider modules
 */
const PROVIDER_MODULES = {
  'anthropic': anthropicProvider,
  'openai': openaiProvider,
  'google': googleProvider,
  'bedrock': bedrockProvider,
  'mistral': mistralProvider,
  'deepseek': deepseekProvider,
  'groq': groqProvider,
  'xai': xaiProvider,
} as const;

type ProviderName = keyof typeof PROVIDER_MODULES;

/**
 * Get the model ID from request headers or environment
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @param defaultModel - Optional default model if not found in headers or env
 * @returns Model ID to use
 */
export function getModelFromHeaders(
  headers: Record<string, string>,
  defaultModel?: string
): string {
  return headers['x-llm-model'] || 
         process.env.LLM_MODEL || 
         defaultModel ||
         'claude-sonnet-4-5-20250929';
}

/**
 * Create provider and model from request headers
 * 
 * This is the main factory function for multi-tenant API requests where users
 * specify their provider and credentials via headers.
 * 
 * Headers:
 * - X-LLM-Provider: Provider name (anthropic, openai, google, bedrock, mistral, deepseek, groq, xai)
 *   Default: anthropic
 * - X-LLM-Model: Model ID (e.g., claude-sonnet-4-5-20250929, gpt-4o)
 *   Default: claude-sonnet-4-5-20250929
 * - Provider-specific credential headers (see individual provider modules)
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @returns GenerateTextFn ready to use
 * @throws {UnsupportedProviderError} If provider name not supported
 * @throws {MissingCredentialsError} If required credentials not provided
 * 
 * @example
 * ```typescript
 * // Use with Anthropic (default)
 * const generateText = createProviderFromHeaders({
 *   'x-anthropic-key': 'sk-ant-...',
 * });
 * 
 * // Use with OpenAI
 * const generateText = createProviderFromHeaders({
 *   'x-llm-provider': 'openai',
 *   'x-provider-api-key': 'sk-...',
 *   'x-llm-model': 'gpt-4o',
 * });
 * 
 * // Use with AWS Bedrock
 * const generateText = createProviderFromHeaders({
 *   'x-llm-provider': 'bedrock',
 *   'x-provider-access-key-id': 'AKIA...',
 *   'x-provider-secret-access-key': '...',
 *   'x-provider-region': 'us-east-1',
 *   'x-llm-model': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
 * });
 * ```
 */
export function createProviderFromHeaders(headers: Record<string, string>): GenerateTextFn {
  // Get provider name from header (default to anthropic)
  const providerName = (headers['x-llm-provider'] || 'anthropic') as ProviderName;
  const providerModule = PROVIDER_MODULES[providerName];
  
  if (!providerModule) {
    const supportedProviders = Object.keys(PROVIDER_MODULES).join(', ');
    throw new UnsupportedProviderError(
      `Provider "${providerName}" not supported. Supported providers: ${supportedProviders}`
    );
  }
  
  // Create provider from headers (delegates to provider-specific module)
  const provider = providerModule.createProviderFromHeaders(headers);
  
  // Get model ID from headers
  const modelId = getModelFromHeaders(headers);
  
  // Create the language model
  const model: LanguageModel = provider(modelId);
  
  // Wrap and return (using Anthropic wrapper for now - works for all AI SDK providers)
  return wrapAnthropicModel(model);
}

/**
 * Create an LLM client using Anthropic provider (legacy API)
 * 
 * This is the legacy function for creating GenerateTextFn instances with Anthropic.
 * For multi-provider support, use createProviderFromHeaders() instead.
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
