/**
 * OAuth 2.0 Discovery and Client Registration Module
 * 
 * This module implements OAuth 2.0 discovery endpoints and dynamic client registration
 * to enable MCP clients (like VS Code Copilot) to automatically discover and register
 * with the authorization server.
 * 
 * Specifications Implemented:
 * - RFC 8414 - OAuth 2.0 Authorization Server Metadata (/.well-known/oauth-authorization-server)
 * - RFC 9728 - OAuth 2.0 Protected Resource Metadata (/.well-known/oauth-protected-resource)  
 * - RFC 7591 - Dynamic Client Registration Protocol (/register endpoint)
 * - Model Context Protocol (MCP) discovery patterns for VS Code integration
 * 
 * Key Responsibilities:
 * - OAuth server metadata endpoint for client discovery of capabilities
 * - Protected resource metadata for MCP client configuration
 * - Dynamic client registration allowing MCP clients to obtain client_id
 * - PKCE method advertisement (S256 code challenge method)
 * - Scope documentation for Jira access permissions
 * 
 * OAuth Flow Step: 1. Client Discovery
 * Clients use these endpoints to discover server capabilities before initiating authorization.
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import { OAuthClientMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthHandler } from './types.ts';
// Track server startup time for restart detection
const serverStartTime = new Date();
// 🔑 FIX: Include server instance in scopes to force VS Code to refresh tokens
// This must match the scope in the WWW-Authenticate header
// https://github.com/microsoft/vscode/issues/270383
const serverInstanceScope = /*`server-instance`;*/ `server-instance-${serverStartTime.getTime()}`;

export { serverStartTime, serverInstanceScope };

/**
 * OAuth Metadata Endpoint
 * Provides OAuth server configuration for clients
 */
export const oauthMetadata: OAuthHandler = (req: Request, res: Response): void => {
  console.log('↔️ Received request for OAuth metadata');
  res.json({
    issuer: process.env.VITE_AUTH_SERVER_URL,
    authorization_endpoint: process.env.VITE_AUTH_SERVER_URL + '/auth/connect',
    token_endpoint: process.env.VITE_AUTH_SERVER_URL + '/access-token',
    registration_endpoint: process.env.VITE_AUTH_SERVER_URL + '/register',
    code_challenge_methods_supported: ['S256'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['read:jira-work', 'offline_access', serverInstanceScope],
  });
};

/**
 * OAuth 2.0 Protected Resource Metadata (RFC9728) for MCP discovery
 * Provides metadata about the protected resource for OAuth clients
 */
export const oauthProtectedResourceMetadata: OAuthHandler = (req: Request, res: Response): void => {
  console.log('↔️ OAuth Protected Resource Metadata requested!', {
    headers: req.headers,
    query: req.query,
  });
  
  const baseUrl = process.env.VITE_AUTH_SERVER_URL;
  const metadata = {
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: ['read:jira-work', 'write:jira-work', 'offline_access', serverInstanceScope],
    bearer_methods_supported: ['header', 'body'],
    resource_documentation: `${baseUrl}/docs`,
  };

  res.json(metadata);
};

/**
 * Dynamic Client Registration endpoint (RFC 7591)
 * Allows MCP clients to register themselves dynamically
 */
export const dynamicClientRegistration: OAuthHandler = (req: Request, res: Response): void => {
  console.log('↔️ Dynamic Client Registration requested:', {
    body: req.body,
    headers: req.headers,
  });

  try {
    // Validate incoming request using MCP SDK schema
    const clientMetadata = OAuthClientMetadataSchema.parse(req.body);

    // Generate a unique client ID for this MCP client
    const clientId = `mcp_${crypto.randomUUID()}`;
    
    // MCP clients are public clients (no client secret)
    const registrationResponse = {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      // Return the validated redirect_uris from the request (RFC 7591 requirement)
      redirect_uris: clientMetadata.redirect_uris,
      grant_types: ['authorization_code', 'refresh_token'], // Always OAuth code flow + refresh
      response_types: ['code'], // Always authorization code flow
      token_endpoint_auth_method: 'none', // Always public client for MCP
      scope: 'read:jira-work write:jira-work offline_access', // Always return our supported scopes
      // Include optional metadata if provided
      ...(clientMetadata.client_name && { client_name: clientMetadata.client_name }),
      ...(clientMetadata.client_uri && { client_uri: clientMetadata.client_uri }),
      ...(clientMetadata.logo_uri && { logo_uri: clientMetadata.logo_uri }),
    };

    res.status(201).json(registrationResponse);
  } catch (error) {
    console.error('  ❌ Client registration validation failed:', error);
    
    // Return RFC 7591 compliant error response
    res.status(400).json({
      error: 'invalid_client_metadata',
      error_description: error instanceof Error ? error.message : 'Invalid client metadata',
    });
  }
};
