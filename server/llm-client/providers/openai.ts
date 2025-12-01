/**
 * OpenAI Provider Module
 * 
 * Creates OpenAI provider from headers using standard naming convention.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createSimpleProvider } from './provider-helpers.js';

/**
 * Create OpenAI provider from request headers
 * 
 * Looks for:
 * - x-llmclient-openai-api-key header or LLMCLIENT_OPENAI_API_KEY env var
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @returns OpenAI provider function
 * @throws {MissingCredentialsError} If API key not provided
 */
export const createProviderFromHeaders = createSimpleProvider({
  createFn: createOpenAI,
  providerName: 'OpenAI',
  providerKey: 'openai',
  keys: ['apiKey'],
});
