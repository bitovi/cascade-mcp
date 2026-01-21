/**
 * MCP Service Module
 * 
 * This module handles the HTTP transport layer for the Model Context Protocol (MCP) server.
 * It acts as the bridge between incoming HTTP requests and the MCP server implementation,
 * managing authentication, session handling, and request routing.
 * 
 * Key responsibilities:
 * - Session management: Creates and maintains MCP transport sessions with unique IDs
 * - Authentication: Validates JWT tokens containing Atlassian access tokens from headers or query params
 * - Request routing: Handles POST (client-to-server), GET, and DELETE requests appropriately  
 * - Transport lifecycle: Sets up StreamableHTTPServerTransport instances and cleans up on close
 * - Auth context: Associates authentication information with each session for downstream use
 * 
 * This module contains:
 * - handleMcpPost(): Main handler for MCP client communication (initialization and ongoing requests)
 * - handleSessionRequest(): Handler for GET/DELETE requests using existing sessions
 * - Authentication helpers: JWT parsing and validation functions
 * - Error response utilities: Standardized 401 and error response functions
 */

import { Request, Response } from 'express';
import { setAuthContext, clearAuthContext } from './mcp-core/index.ts';
import { createMcpServer } from './mcp-core/server-factory.ts';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { randomUUID } from 'node:crypto';
import { logger } from './observability/logger.ts';
import { sanitizeJwtPayload, formatTokenWithExpiration, parseJWT, type JWTPayload } from './tokens.ts';
import { type AuthContext } from './mcp-core/auth-context-store.ts';
import { serverInstanceScope, serverStartTime } from './pkce/discovery.ts';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Validation result interface
interface ValidationResult {
  authInfo: AuthContext | null;
  errored: boolean;
}

// Interface for session data
interface SessionData {
  transport: StreamableHTTPServerTransport;
  mcpServer: McpServer;
}

// Map to store session data (transport + MCP server) by session ID
const sessions: Record<string, SessionData> = {};

/**
 * Handle POST requests for client-to-server communication
 * 
 * Copilot's MCP client, upon restarting, will send a POST without an authorization header, 
 * and then another with its last authorization header.
 */
export async function handleMcpPost(req: Request, res: Response): Promise<void> {
  console.log('======= POST /mcp =======');
  console.log('Headers:', JSON.stringify(sanitizeHeaders(req.headers)));
  console.log('Body:', JSON.stringify(req.body));
  console.log('--------------------------------');

  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;
  let mcpServer: McpServer;

  if (sessionId && sessions[sessionId]) {
    // Reuse existing transport and MCP server
    const session = sessions[sessionId];
    transport = session.transport;
    mcpServer = session.mcpServer;
    console.log(`  ♻️ Reusing existing transport for session: ${sessionId}`);
  }
  // Preferring to not use isInitializeRequest here due to returning false negatives on malformed requests
  // e.g. missing clientInfo or having an empty object for capabilities.roots
  else if (!sessionId && req.body?.method === 'initialize') {
    // New initialization request (includes both well-formed and malformed initialize attempts)
    console.log('  🥚 New MCP initialization request.');

    // Extract and validate auth info
    let { authInfo, errored } = await getAuthInfoFromBearer(req, res);
    if (errored) { return; }

    if (!authInfo) {
      ({ authInfo, errored } = await getAuthInfoFromQueryToken(req, res));
    }
    if (errored) { return; }
    
    if (!authInfo) {
      sendMissingAtlassianAccessToken(res, req, 'anywhere');
      return;
    }
    
    console.log('    Has valid token, creating per-session MCP server');
    
    // Create fresh MCP server instance with dynamic tool registration
    mcpServer = createMcpServer(authInfo);
    
    console.log('    Creating streamable transport');
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId: string) => {
        // Store the session data (transport + MCP server)
        console.log(`    Storing session data for: ${newSessionId}`);
        sessions[newSessionId] = { transport, mcpServer };
        // Store auth context for this session
        setAuthContext(newSessionId, authInfo!);
      },
    });

    // Clean up session when transport closed
    transport.onclose = () => {
      if (transport.sessionId) {
        console.log(`.   Cleaning up session: ${transport.sessionId}`);
        delete sessions[transport.sessionId];
        clearAuthContext(transport.sessionId);
      }
    };

    // Connect the per-session MCP server to this transport
    await mcpServer.connect(transport);
    console.log('    MCP server connected to new transport');
  } else {
    // Invalid request
    console.log('  ❌ Invalid MCP request - no session ID and not an initialize request');
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request with authentication error interception
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    // Check if this is an MCP OAuth authentication error
    if (error instanceof InvalidTokenError) {
      console.log('MCP OAuth authentication expired - sending proper OAuth 401 response');
      
      const wwwAuthValue = createWwwAuthenticate(req, error.message);
      
      res.set('WWW-Authenticate', wwwAuthValue);
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.status(401).json(error.toResponseObject());
      return;
    }
    
    // Re-throw other errors
    throw error;
  }
  console.log('  ✅ MCP POST request handled successfully');
}

/**
 * Reusable handler for GET and DELETE requests
 */
export async function handleSessionRequest(req: Request, res: Response): Promise<void> {
  console.log('=== MCP SESSION REQUEST ===');
  console.log(req.method);
  
  let authInfo: AuthContext | null = null;
  
  // For GET requests (SSE streams), validate authentication first
  if (req.method === 'GET') {
    // Extract and validate auth info
    let errored: boolean;
    ({ authInfo, errored } = await getAuthInfoFromBearer(req, res));
    if (errored) { return; }

    if (!authInfo) {
      ({ authInfo, errored } = await getAuthInfoFromQueryToken(req, res));
    }
    if (errored) { return; }
    
    if (!authInfo) {
      // For GET requests, send 401 with invalid_token to trigger re-auth
      console.log('No valid auth found for GET request - triggering re-authentication');
      res
        .status(401)
        .header('WWW-Authenticate', createWwwAuthenticate(req, 'Authentication required'))
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .json({
          error: "invalid_token",
          error_description: "Missing or invalid access token"
        });
      return;
    }
  }
  
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions[sessionId]) {
    console.log(`❌ Session ID issue - sessionId: ${sessionId}, available sessions: [${Object.keys(sessions).join(', ')}]`);
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  // Update session context store with auth info from GET request
  // This is crucial for refreshed tokens - the client sends new JWT via GET request
  // and we need to update the session store so tool calls can access the auth context
  // 
  // Why we update here instead of during refresh flow:
  // 1. Refresh flow happens at /access-token endpoint without session context
  // 2. Periodic cleanup removes expired sessions before refresh can complete
  // 3. This defensive approach catches any case where session exists but context is missing
  // 4. Handles edge cases gracefully without interfering with cleanup logic
  if (authInfo && sessionId) {
    setAuthContext(sessionId, authInfo);
  }

  const { transport } = sessions[sessionId];
  await transport.handleRequest(req, res);
}

// === Helper Functions ===

/**
 * Detect if the client is VS Code based on User-Agent and MCP client info
 * 
 * @param req - Express request object
 * @returns True if client is VS Code
 */
function isVSCodeClient(req: Request): boolean {
  const userAgent = req.headers['user-agent'];
  
  // Check MCP initialize request clientInfo first (most reliable)
  if (req.body && req.body.method === 'initialize' && req.body.params && req.body.params.clientInfo) {
    const clientName = req.body.params.clientInfo.name;
    if (clientName === 'Visual Studio Code') {
      return true;
    }
  }
  
  // Only use User-Agent as fallback when no clientInfo is available
  // This handles cases where VS Code sends requests without clientInfo
  if (userAgent === 'node' && 
      (!req.body?.params?.clientInfo)) {
    return true;
  }
  
  return false;
}

/**
 * Generate WWW-Authenticate header value according to RFC 6750 and RFC 9728
 * with VS Code Copilot compatibility handling
 * 
 * @param req - Express request object (used for client detection)
 * @param errorDescription - Optional error description for invalid_token errors
 * @param errorCode - Optional error code (defaults to "invalid_token" when errorDescription provided)
 * @returns Complete WWW-Authenticate header value
 * 
 * Specifications:
 * - RFC 6750 Section 3: WWW-Authenticate Response Header Field
 * - RFC 9728 Section 5.1: WWW-Authenticate Resource Metadata Parameter (resource_metadata)
 * - VS Code Copilot Extension: Non-standard resource_metadata_url parameter
 * 
 * Implementation Note:
 * VS Code breaks when it sees both resource_metadata and resource_metadata_url parameters.
 * We detect VS Code clients and only send the parameter they expect:
 * - VS Code: Only resource_metadata_url (their non-standard parameter)
 * - Other clients: Only resource_metadata (RFC 9728 standard)
 * See specs/vs-code-copilot/readme.md for details.
 */
function createWwwAuthenticate(req: Request, errorDescription: string | null = null, errorCode: string = 'invalid_token'): string {
  const metadataUrl = `${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource`;
  
  let authValue = `Bearer realm="mcp", scope="${serverInstanceScope}"`;
  
  // Add error parameters if provided (RFC 6750 Section 3.1)
  if (errorDescription) {
    authValue += `, error="${errorCode}", error_description="${errorDescription}"`;
  }
  
  // Add appropriate resource metadata parameter based on client type
  if (isVSCodeClient(req)) {
    // VS Code Copilot expects resource_metadata_url (non-standard)
    authValue += `, resource_metadata_url="${metadataUrl}"`;
  } else {
    // Standard RFC 9728 parameter for other clients
    authValue += `, resource_metadata="${metadataUrl}"`;
  }
  
  return authValue;
}

/**
 * Extract and validate auth info from Authorization Bearer header
 * @param req - Express request object
 * @param res - Express response object
 * @returns {authInfo, errored} where authInfo is the parsed JWT payload or null, errored is boolean
 */
async function getAuthInfoFromBearer(req: Request, res: Response): Promise<ValidationResult> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return { authInfo: null, errored: false };
  }
  return validateAndExtractJwt(auth.slice('Bearer '.length), req, res, 'authorization bearer token', 'strict mode');
}

/**
 * Extract and validate auth info from query token parameter
 * @param req - Express request object
 * @param res - Express response object
 * @returns {authInfo, errored} where authInfo is the parsed JWT payload or null, errored is boolean
 */
async function getAuthInfoFromQueryToken(req: Request, res: Response): Promise<ValidationResult> {
  const tokenFromQuery = req.query.token as string | undefined;
  if (!tokenFromQuery) {
    return { authInfo: null, errored: false };
  }
  return validateAndExtractJwt(tokenFromQuery, req, res, 'query parameter', 'strict mode, query param');
}

// Shared helper for JWT validation and extraction
function validateAndExtractJwt(token: string, req: Request, res: Response, source: string, strictLabel: string): ValidationResult {
  try {
    const payload = parseJWT(token) as JWTPayload & Partial<AuthContext>;
    console.log(`Successfully parsed JWT payload from ${source}:`, JSON.stringify(sanitizeJwtPayload(payload), null, 2));

    // Validate that we have at least one provider's credentials (nested structure per Q21)
    if (!payload.atlassian && !payload.figma && !payload.google) {
      console.log(`JWT payload missing provider credentials (${source}) - expected 'atlassian', 'figma', or 'google' nested structure`);
      sendMissingAtlassianAccessToken(res, req, source);
      return { authInfo: null, errored: true };
    }

    // Only enforce JWT expiration if CHECK_JWT_EXPIRATION is set to 'true'.
    // This is intentional: strict expiration is NOT the default, because some MCP clients (like VS Code)
    // may get stuck and not refresh tokens properly if they receive a 401 for an expired token.
    // By default (unset or any value except 'true'), expiration is NOT checked, which is safer for production.
    // Set CHECK_JWT_EXPIRATION=true to enable strict mode for testing refresh flows.
    const checkExpiration = String(process.env.CHECK_JWT_EXPIRATION).toLowerCase() === 'true';
    if (checkExpiration) {
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === 'number' && payload.exp < now) {
        console.log(`JWT token expired (${strictLabel})`);
        send401(res, { error: 'Token expired' }, true, req);
        return { authInfo: null, errored: true };
      }
    }

    return { authInfo: payload as AuthContext, errored: false };
  } catch (err) {
    logger.error(`Error parsing JWT token from ${source}:`, err);
    send401(res, { error: 'Invalid token' }, true, req); // Trigger re-auth for invalid tokens
    return { authInfo: null, errored: true };
  }
}

function send401(res: Response, jsonResponse: { error: string }, includeInvalidToken: boolean = false, req: Request | null = null): Response {
  const wwwAuthHeader = includeInvalidToken 
    ? createWwwAuthenticate(req!, 'Token expired - please re-authenticate')
    : createWwwAuthenticate(req!); // No error description for general auth required
    
  return res
      .status(401)
      .header('WWW-Authenticate', wwwAuthHeader)
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .json({ error: 'Invalid or missing token' });
}

function sendMissingAtlassianAccessToken(res: Response, req: Request, where: string = 'bearer header'): Response {
  const message = `Authentication token missing provider access token in ${where}.`;
  console.log(`❌🔑 ${message}`);
  return res
      .status(401)
      .header('WWW-Authenticate', createWwwAuthenticate(req, message))
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: message,
        },
        id: req.body?.id || null,
      });
}

function sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
  const sanitized = { ...headers };
  
  if (sanitized.authorization && sanitized.authorization.startsWith('Bearer ')) {
    const token = sanitized.authorization.slice('Bearer '.length);
    sanitized.authorization = `Bearer ${formatTokenWithExpiration(token, 20)}`;
  }
  
  return sanitized;
}
