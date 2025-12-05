/**
 * Google Provider Module
 * 
 * Creates Google Generative AI provider from headers using standard naming convention.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createSimpleProvider } from './provider-helpers.js';

/**
 * Create Google Generative AI provider from request headers
 * 
 * Looks for:
 * - x-llmclient-google-api-key header or LLMCLIENT_GOOGLE_API_KEY env var
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @returns Google provider function
 * @throws {MissingCredentialsError} If API key not provided
 */
export const createProviderFromHeaders = createSimpleProvider({
  createFn: createGoogleGenerativeAI,
  providerName: 'Google',
  providerKey: 'google',
  keys: ['apiKey'],
});
