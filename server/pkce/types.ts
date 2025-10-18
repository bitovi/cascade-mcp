/**
 * OAuth 2.0 PKCE Types and Interfaces Module
 * 
 * This module provides TypeScript type definitions and interfaces for the OAuth 2.0 
 * authorization server with PKCE (Proof Key for Code Exchange) support. It defines
 * the core data structures used throughout the OAuth flow.
 * 
 * Specifications Implemented:
 * - RFC 6749 - OAuth 2.0 Authorization Framework (core request/response types)
 * - RFC 7636 - PKCE for OAuth Public Clients (session data structures)
 * - RFC 7591 - Dynamic Client Registration (request parameters)
 * - Express.js session extensions for OAuth state management
 * 
 * Key Responsibilities:
 * - Express session data type definitions for OAuth flow state
 * - OAuth handler function signatures for consistent implementation
 * - Request/response type definitions for authorization code and refresh token grants
 * - Error response structures following OAuth 2.0 specification
 * - Token response formats for access and refresh tokens
 * 
 * This module serves as the foundation for type safety across all OAuth modules.
 */

import { Request, Response } from 'express';

// Express session interface extension
declare module 'express-session' {
  interface SessionData {
    codeVerifier?: string | null;
    state?: string;
    mcpClientId?: string;
    mcpRedirectUri?: string;
    mcpScope?: string;
    mcpResource?: string;
    usingMcpPkce?: boolean;
    manualFlow?: { codeVerifier: string; state: string; isManualFlow: boolean; };
    
    // Multi-provider session fields (Phase 1.3)
    provider?: string;  // Current provider being authenticated
    codeChallenge?: string;  // PKCE challenge for current provider
    codeChallengeMethod?: string;  // PKCE challenge method
    providerTokens?: Record<string, {
      access_token: string;
      refresh_token?: string;
      expires_at: number;
      scope?: string;
    }>;  // Tokens keyed by provider name
    connectedProviders?: string[];  // List of connected provider names
    
    // MCP client's original PKCE parameters (stored from connection hub)
    mcpCodeChallenge?: string;  // Original PKCE challenge from MCP client
    mcpCodeChallengeMethod?: string;  // Original PKCE method from MCP client
    mcpState?: string;  // Original state from MCP client
  }
}

export interface OAuthRequest extends Request {
  body: {
    grant_type?: string;
    code?: string;
    client_id?: string;
    code_verifier?: string;
    resource?: string;
    refresh_token?: string;
    scope?: string;
    [key: string]: any;
  };
}

export interface AuthorizationCodeGrantParams {
  code: string;
  client_id: string;
  code_verifier: string;
  resource?: string;
}

export interface RefreshTokenGrantParams {
  refresh_token: string;
  client_id: string;
  resource?: string;
}

export interface OAuthErrorResponse {
  error: string;
  error_description: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export type OAuthHandler = (req: Request, res: Response) => Promise<void> | void;
