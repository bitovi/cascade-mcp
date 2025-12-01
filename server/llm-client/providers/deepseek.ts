/**
 * DeepSeek Provider Module
 * 
 * Creates DeepSeek provider from headers using standard naming convention.
 */

import { createDeepSeek } from '@ai-sdk/deepseek';
import { createSimpleProvider } from './provider-helpers.js';

/**
 * Create DeepSeek provider from request headers
 * 
 * Looks for:
 * - x-llmclient-deepseek-api-key header or LLMCLIENT_DEEPSEEK_API_KEY env var
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @returns DeepSeek provider function
 * @throws {MissingCredentialsError} If API key not provided
 */
export const createProviderFromHeaders = createSimpleProvider({
  createFn: createDeepSeek,
  providerName: 'DeepSeek',
  providerKey: 'deepseek',
  keys: ['apiKey'],
});
