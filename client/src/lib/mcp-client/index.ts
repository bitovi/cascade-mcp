/**
 * MCP Client Library - Browser Edition
 * 
 * Provides OAuth-authenticated MCP client with sampling support for browsers.
 */

export { BrowserMcpClient } from './client.js';
export type { ConnectionStatus, ConnectionState, NotificationHandler, StatusChangeHandler } from './client.js';

export { BrowserOAuthClientProvider } from './oauth/provider.js';

export { AnthropicSamplingProvider } from './sampling/anthropic.js';
export type { 
  SamplingProvider, 
  CreateMessageRequest, 
  CreateMessageResult, 
  SamplingMessage 
} from './sampling/types.js';
