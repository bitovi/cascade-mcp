/**
 * Provider Helpers
 * 
 * Utilities for creating standard provider modules with consistent naming conventions.
 * Automatically derives header and environment variable names from AI SDK parameter names.
 */

import { MissingCredentialsError } from '../provider-errors.js';
import type { LanguageModel } from 'ai';

/**
 * Configuration for creating a simple provider module
 */
export interface SimpleProviderConfig<T> {
  /** The AI SDK provider creation function (e.g., createAnthropic, createOpenAI) */
  createFn: (config: T) => any; // Returns provider function that takes modelId
  
  /** Human-readable provider name for error messages */
  providerName: string;
  
  /** Provider identifier for header/env naming (lowercase, no spaces) */
  providerKey: string;
  
  /** Parameter keys that match the AI SDK's createFn parameter names */
  keys: (keyof T)[];
}

/**
 * Convert camelCase to kebab-case for headers
 * Example: apiKey → api-key, accessKeyId → access-key-id
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
}

/**
 * Convert camelCase to UPPER_SNAKE_CASE for environment variables
 * Example: apiKey → API_KEY, accessKeyId → ACCESS_KEY_ID
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, m => `_${m}`).toUpperCase();
}

/**
 * Create a provider module function using AI SDK parameter names
 * 
 * This helper automatically derives consistent header and environment variable names
 * from the provider key and AI SDK parameter names. For example, for OpenAI with `apiKey`,
 * this will look for:
 * - Headers: `x-llmclient-openai-api-key` (kebab-case with x-llmclient-{provider}- prefix)
 * - Env vars: `LLMCLIENT_OPENAI_API_KEY` (UPPER_SNAKE_CASE with LLMCLIENT_{PROVIDER}_ prefix)
 * 
 * @param config - Provider configuration matching AI SDK parameter structure
 * @returns Function that creates provider from headers
 * 
 * @example
 * ```typescript
 * // For OpenAI which accepts { apiKey }
 * export const createProviderFromHeaders = createSimpleProvider({
 *   createFn: createOpenAI,
 *   providerName: 'OpenAI',
 *   providerKey: 'openai',
 *   keys: ['apiKey'],
 * });
 * // Looks for: x-llmclient-openai-api-key header or LLMCLIENT_OPENAI_API_KEY env var
 * 
 * // For Bedrock which accepts { region, accessKeyId, secretAccessKey, sessionToken }
 * export const createProviderFromHeaders = createSimpleProvider({
 *   createFn: createAmazonBedrock,
 *   providerName: 'AWS Bedrock',
 *   providerKey: 'bedrock',
 *   keys: ['region', 'accessKeyId', 'secretAccessKey', 'sessionToken'],
 * });
 * // Looks for: x-llmclient-bedrock-region, x-llmclient-bedrock-access-key-id, etc.
 * ```
 */
export function createSimpleProvider<T extends Record<string, any>>(
  config: SimpleProviderConfig<T>
) {
  return function createProviderFromHeaders(headers: Record<string, string>) {
    const providerConfig = {} as T;
    const missingKeys: string[] = [];
    
    for (const key of config.keys) {
      const keyStr = String(key);
      
      // Generate provider-specific header and env var names with llmclient prefix
      const headerKey = `x-llmclient-${config.providerKey}-${camelToKebab(keyStr)}`;
      const envKey = `LLMCLIENT_${config.providerKey.toUpperCase()}_${camelToSnake(keyStr)}`;
      
      // Check standard names
      const value = headers[headerKey] || process.env[envKey];
      
      if (!value) {
        missingKeys.push(`${headerKey} header or ${envKey} env var`);
      } else {
        (providerConfig as any)[key] = value;
      }
    }
    
    if (missingKeys.length > 0) {
      throw new MissingCredentialsError(
        `${config.providerName} requires: ${missingKeys.join(', ')}`
      );
    }
    
    return config.createFn(providerConfig);
  };
}
