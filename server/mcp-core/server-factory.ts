/**
 * MCP Server Factory
 * 
 * Creates per-session MCP server instances with dynamic tool registration
 * based on authenticated providers in the session's auth context.
 * 
 * This replaces the global MCP server pattern with isolated per-session servers,
 * ensuring users only see tools for providers they've authenticated with.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../observability/logger.ts';
import type { AuthContext } from './auth-context-store.ts';

// Import provider implementations
import { atlassianProvider } from '../providers/atlassian/index.js';
import { figmaProvider } from '../providers/figma/index.js';
import { utilityProvider } from '../providers/utility/index.js';
import { combinedProvider } from '../providers/combined/index.js';

/**
 * Creates a fresh MCP server instance for a session
 * Dynamically registers tools based on which providers are authenticated
 * 
 * @param authContext - Session's authentication context with provider credentials
 * @returns Fresh MCP server instance with provider-specific tools registered
 * 
 * @example
 * // Atlassian-only session
 * const mcp = createMcpServer({ atlassian: { access_token: '...' } });
 * // Result: Only Atlassian tools registered
 * 
 * @example
 * // Multi-provider session
 * const mcp = createMcpServer({ 
 *   atlassian: { access_token: '...' },
 *   figma: { access_token: '...' }
 * });
 * // Result: Atlassian + Figma + Combined tools registered
 */
export function createMcpServer(authContext: AuthContext): McpServer {
  console.log('Creating per-session MCP server instance');
  
  // Create fresh MCP server for this session
  const mcp = new McpServer(
    {
      name: 'jira-tool-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
        sampling: {}, // Support agent callbacks (used by utility-test-sampling)
      },
    },
  );

  // Always register utility tools (no auth required)
  console.log('  Registering utility tools');
  utilityProvider.registerTools(mcp, authContext);

  // Dynamically register provider tools based on authenticated providers
  const registeredProviders: string[] = [];

  if (authContext.atlassian) {
    console.log('  Registering Atlassian tools');
    atlassianProvider.registerTools(mcp, authContext);
    registeredProviders.push('atlassian');
  }

  if (authContext.figma) {
    console.log('  Registering Figma tools');
    figmaProvider.registerTools(mcp, authContext);
    registeredProviders.push('figma');
  }

  // Register combined tools only if BOTH providers are available
  if (authContext.atlassian && authContext.figma) {
    console.log('  Registering combined tools (atlassian + figma)');
    combinedProvider.registerTools(mcp);
    registeredProviders.push('combined');
  }

  if (registeredProviders.length === 0) {
    console.log('  ⚠️ No provider tools registered (only utility tools available)');
    logger.warn('MCP server created with no authenticated providers', {
      sessionId: authContext.sessionId,
    });
  } else {
    console.log(`  ✅ MCP server created with providers: ${registeredProviders.join(', ')}`);
    logger.info('MCP server created with dynamic tools', {
      sessionId: authContext.sessionId,
      providers: registeredProviders,
    });
  }

  return mcp;
}
