/**
 * Utility Provider
 * 
 * A special "provider" for tools that don't require authentication to external systems.
 * These are built-in tools for testing, debugging, and utility functions.
 */

import type { McpServer } from '../../mcp-core/mcp-types.js';
import type { 
  OAuthProvider, 
  AuthUrlParams, 
  TokenExchangeParams, 
  StandardTokenResponse, 
  CallbackParams 
} from '../provider-interface.js';
import { registerUtilityTools } from './tools/index.js';

/**
 * Utility Provider Object
 * This is a pseudo-provider that doesn't actually implement OAuth
 * since utility tools don't require external authentication
 */
export const utilityProvider: OAuthProvider = {
  name: 'utility',
  
  /**
   * Not implemented - utility tools don't use OAuth
   */
  createAuthUrl(params: AuthUrlParams): string {
    throw new Error('Utility provider does not support OAuth');
  },
  
  /**
   * Not implemented - utility tools don't use OAuth
   */
  extractCallbackParams(req: any): CallbackParams {
    throw new Error('Utility provider does not support OAuth');
  },
  
  /**
   * Not implemented - utility tools don't use OAuth
   */
  async exchangeCodeForTokens(params: TokenExchangeParams): Promise<StandardTokenResponse> {
    throw new Error('Utility provider does not support OAuth');
  },

  /**
   * Register utility tools with the MCP server
   * @param mcp - MCP server instance
   * @param authContext - Authentication context (unused for utility tools)
   */
  registerTools(mcp: McpServer, authContext: any): void {
    registerUtilityTools(mcp, authContext);
  },
};
