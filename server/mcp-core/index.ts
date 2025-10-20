/**
 * MCP Core Module
 *
 * This module provides core MCP (Model Context Protocol) infrastructure:
 * - Authentication context management (setAuthContext, clearAuthContext, getAuthContext)
 * - Type exports for AuthContext
 * 
 * Note: MCP server instances are now created per-session via server-factory.ts
 * instead of using a global singleton. This enables dynamic tool registration
 * based on authenticated providers.
 */

import { logger } from '../observability/logger.ts';

// Import and re-export auth helpers and types
import { setAuthContext, clearAuthContext, getAuthContext } from './auth-helpers.ts';
import type { AuthContext } from './auth-context-store.ts';

logger.info('MCP core module loaded (per-session servers via server-factory.ts)');

// Export auth functions and types for use throughout the application
export { setAuthContext, clearAuthContext, getAuthContext };
export type { AuthContext };
