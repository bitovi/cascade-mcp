/**
 * Groq Provider Module
 * 
 * Creates Groq provider from headers using standard naming convention.
 */

import { createGroq } from '@ai-sdk/groq';
import { createSimpleProvider } from './provider-helpers.js';

/**
 * Create Groq provider from request headers
 * 
 * Looks for:
 * - x-llmclient-groq-api-key header or LLMCLIENT_GROQ_API_KEY env var
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @returns Groq provider function
 * @throws {MissingCredentialsError} If API key not provided
 */
export const createProviderFromHeaders = createSimpleProvider({
  createFn: createGroq,
  providerName: 'Groq',
  providerKey: 'groq',
  keys: ['apiKey'],
});
