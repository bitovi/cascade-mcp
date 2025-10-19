/**
 * Provider Server-Side OAuth Module
 * 
 * This module provides factory functions and handlers for Server-Side OAuth flows
 * between the bridge server and OAuth providers (Atlassian, Figma, etc.).
 * 
 * This is SEPARATE from the MCP PKCE flow (handled in /server/pkce/).
 * 
 * Two OAuth Flows in this system:
 * 1. MCP PKCE Flow: MCP Client ↔ Bridge Server (public client, RFC 7636)
 * 2. Server-Side OAuth: Bridge Server ↔ Providers (confidential client with client_secret)
 * 
 * Modules:
 * - authorize.ts - makeAuthorize() factory for /auth/connect/{provider} endpoints
 * - callback.ts - makeCallback() factory for /auth/callback/{provider} endpoints
 * - connection-hub.ts - renderConnectionHub() for multi-provider UI
 * - connection-done.ts - handleConnectionDone() for completing the MCP flow
 * 
 * Usage:
 *   import { makeAuthorize, makeCallback, hubCallbackHandler, 
 *            renderConnectionHub, handleConnectionDone } from './provider-server-oauth/index.js';
 *   
 *   app.get('/auth/connect', renderConnectionHub);
 *   app.get('/auth/connect/atlassian', makeAuthorize(atlassianProvider));
 *   app.get('/auth/callback/atlassian', makeCallback(atlassianProvider, { onSuccess: hubCallbackHandler }));
 *   app.get('/auth/done', handleConnectionDone);
 */

// Authorization endpoint factory
export { makeAuthorize } from './authorize.js';

// Callback endpoint factory and success handler
export { makeCallback, hubCallbackHandler } from './callback.js';

// Connection hub UI
export { renderConnectionHub } from './connection-hub.js';

// Connection done handler
export { handleConnectionDone } from './connection-done.js';
