/**
 * AWS Bedrock Provider Module
 * 
 * Creates AWS Bedrock provider from headers with multi-part credentials.
 * Requires AWS credentials (access key, secret key) and optional region/session token.
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createSimpleProvider } from './provider-helpers.js';

/**
 * Create AWS Bedrock provider from request headers
 * 
 * Looks for:
 * - x-llmclient-bedrock-access-key-id header or LLMCLIENT_BEDROCK_ACCESS_KEY_ID env var (required)
 * - x-llmclient-bedrock-secret-access-key header or LLMCLIENT_BEDROCK_SECRET_ACCESS_KEY env var (required)
 * - x-llmclient-bedrock-region header or LLMCLIENT_BEDROCK_REGION env var (optional, defaults to us-east-1)
 * - x-llmclient-bedrock-session-token header or LLMCLIENT_BEDROCK_SESSION_TOKEN env var (optional)
 * 
 * @param headers - Request headers (case-insensitive, normalized to lowercase by Express)
 * @returns AWS Bedrock provider function
 * @throws {MissingCredentialsError} If required credentials not provided
 */
export const createProviderFromHeaders = createSimpleProvider({
  createFn: createAmazonBedrock,
  providerName: 'AWS Bedrock',
  providerKey: 'bedrock',
  keys: ['region', 'accessKeyId', 'secretAccessKey', 'sessionToken'],
});
