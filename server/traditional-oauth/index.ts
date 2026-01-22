/**
 * Traditional OAuth Module
 * 
 * Centralized OAuth utilities for Server-Side OAuth flows between
 * the bridge server and OAuth providers (Atlassian, Figma, Google, etc.).
 * 
 * This is SEPARATE from the MCP PKCE flow (handled in server/pkce/).
 * 
 * Usage:
 *   import { buildOAuthUrl, performTokenExchange } from '../../traditional-oauth/index.js';
 *   import { makeAuthorize, makeCallback, renderConnectionHub } from '../../traditional-oauth/route-handlers/index.js';
 */

// Core OAuth utilities
export { buildOAuthUrl } from './url-builder.js';
export { performTokenExchange, performTokenRefresh } from './token-exchange.js';

// Route handlers (re-export from route-handlers subdirectory)
export {
  makeAuthorize,
  makeCallback,
  hubCallbackHandler,
  renderConnectionHub,
  handleConnectionDone,
} from './route-handlers/index.js';

// Type exports
export type * from './types.js';
