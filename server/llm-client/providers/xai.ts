/**
 * xAI Provider Module
 * 
 * Creates xAI (Grok) provider from headers using standard naming convention.
 */

import { createXai } from '@ai-sdk/xai';
import { createSimpleProvider } from './provider-helpers.js';

/**
 * Create xAI provider from request headers
 * 
 * Looks for:
 * - x-llmclient-xai-api-key header or LLMCLIENT_XAI_API_KEY env var
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @returns xAI provider function
 * @throws {MissingCredentialsError} If API key not provided
 */
export const createProviderFromHeaders = createSimpleProvider({
  createFn: createXai,
  providerName: 'xAI',
  providerKey: 'xai',
  keys: ['apiKey'],
});
