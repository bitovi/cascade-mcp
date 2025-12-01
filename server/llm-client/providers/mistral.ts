/**
 * Mistral Provider Module
 * 
 * Creates Mistral provider from headers using standard naming convention.
 */

import { createMistral } from '@ai-sdk/mistral';
import { createSimpleProvider } from './provider-helpers.js';

/**
 * Create Mistral provider from request headers
 * 
 * Looks for:
 * - x-llmclient-mistral-api-key header or LLMCLIENT_MISTRAL_API_KEY env var
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @returns Mistral provider function
 * @throws {MissingCredentialsError} If API key not provided
 */
export const createProviderFromHeaders = createSimpleProvider({
  createFn: createMistral,
  providerName: 'Mistral',
  providerKey: 'mistral',
  keys: ['apiKey'],
});
