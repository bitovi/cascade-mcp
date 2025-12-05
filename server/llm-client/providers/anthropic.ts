/**
 * Anthropic Provider Module
 * 
 * Creates Anthropic provider from headers with backward-compatible legacy naming.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { MissingCredentialsError } from '../provider-errors.js';

/**
 * Create Anthropic provider from request headers
 * 
 * Looks for API key in the following order (for backward compatibility):
 * 1. x-anthropic-key header (legacy, primary for Anthropic)
 * 2. ANTHROPIC_API_KEY env var (legacy, primary for Anthropic)
 * 3. x-llmclient-anthropic-api-key header (new standard with llmclient prefix)
 * 4. LLMCLIENT_ANTHROPIC_API_KEY env var (new standard with llmclient prefix)
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @returns Anthropic provider function
 * @throws {MissingCredentialsError} If API key not provided
 */
export function createProviderFromHeaders(headers: Record<string, string>) {
  // Check legacy names first, then standard names with llmclient prefix
  const apiKey = headers['x-anthropic-key'] ||              // Legacy header (primary)
                 process.env.ANTHROPIC_API_KEY ||            // Legacy env (primary)
                 headers['x-llmclient-anthropic-api-key'] || // Standard header
                 process.env.LLMCLIENT_ANTHROPIC_API_KEY;    // Standard env
  
  if (!apiKey) {
    throw new MissingCredentialsError(
      'Anthropic requires: x-anthropic-key header or ANTHROPIC_API_KEY env var ' +
      '(legacy, primary) OR x-llmclient-anthropic-api-key header or LLMCLIENT_ANTHROPIC_API_KEY env var (standard)'
    );
  }
  
  return createAnthropic({ apiKey });
}
