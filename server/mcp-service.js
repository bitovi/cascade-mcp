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

import { mcp, setAuthContext, clearAuthContext } from './jira-mcp/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';
import { jwtVerify } from './tokens.js';

// Map to store transports by session ID
const transports = {};
console.log("STARTING",Object.keys(transports).length);

/**
 * Handle POST requests for client-to-server communication
 * 
 * Copilot's MCP client, upon restarting, will send a POST without an authorization header, 
 * and then another with its last authorization header.
 */
export async function handleMcpPost(req, res) {
  console.log('=== MCP POST REQUEST ===');
  console.log("Transport keys: ",Object.keys(transports).length);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Headers:', JSON.stringify(sanitizeHeaders(req.headers), null, 2));
  console.log('========================');

  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
    console.log("transport type", typeof transport);
    console.log(`Reusing existing transport for session: ${sessionId}`);
  } 
  else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    console.log('New MCP initialization request. POST /mcp');

    // Extract and validate auth info
    let { authInfo, errored } = await getAuthInfoFromBearer(req, res);
    if (errored) { return; }

    if (!authInfo) {
      ({ authInfo, errored } = await getAuthInfoFromQueryToken(req, res));
    }
    if (errored) { return; }
    
    if (!authInfo) {
      return sendMissingAtlassianAccessToken(res, req, 'anywhere');
    }

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        // Store the transport by session ID
        console.log(`Storing transport for new session: ${newSessionId}`);
        transports[newSessionId] = transport;
        console.log(`Transport stored for session: ${newSessionId}`);
        // Store auth context for this session
        setAuthContext(newSessionId, authInfo);
      },
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        console.log(`Cleaning up session: ${transport.sessionId}`);
        delete transports[transport.sessionId];
        clearAuthContext(transport.sessionId);
      }
    };

    // Connect the MCP server to this transport
    await mcp.connect(transport);
    console.log('MCP server connected to new transport');
  } else {
    // Invalid request
    console.log('Invalid MCP request - no session ID and not an initialize request');
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
      
      // Send proper OAuth 401 response with WWW-Authenticate header according to RFC 6750
      const wwwAuthValue = `Bearer realm="mcp", error="invalid_token", error_description="${error.message}", resource_metadata_url="${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource"`;
      
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
}

/**
 * Reusable handler for GET and DELETE requests
 */
export async function handleSessionRequest(req, res) {
  console.log('=== MCP SESSION REQUEST ===');
  console.log(req.method);
  
  // For GET requests (SSE streams), validate authentication first
  if (req.method === 'GET') {
    // Extract and validate auth info
    let { authInfo, errored } = await getAuthInfoFromBearer(req, res);
    if (errored) { return; }

    if (!authInfo) {
      ({ authInfo, errored } = await getAuthInfoFromQueryToken(req, res));
    }
    if (errored) { return; }
    
    if (!authInfo) {
      // For GET requests, send 401 with invalid_token to trigger re-auth
      console.log('No valid auth found for GET request - triggering re-authentication');
      return res
        .status(401)
        .header('WWW-Authenticate', `Bearer realm="mcp", error="invalid_token", error_description="Authentication required", resource_metadata_url="${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource"`)
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .end();
    }
  }
  
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    console.log(`Invalid or missing session ID: ${sessionId}`);
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
}

// === Helper Functions ===

/**
 * Extract and validate auth info from Authorization Bearer header
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} - {authInfo, errored} where authInfo is the parsed JWT payload or null, errored is boolean
 */
async function getAuthInfoFromBearer(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return { authInfo: null, errored: false };
  }
  return validateAndExtractJwt(auth.slice('Bearer '.length), req, res, 'authorization bearer token', 'strict mode');
}

/**
 * Extract and validate auth info from query token parameter
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} - {authInfo, errored} where authInfo is the parsed JWT payload or null, errored is boolean
 */
async function getAuthInfoFromQueryToken(req, res) {
  const tokenFromQuery = req.query.token;
  if (!tokenFromQuery) {
    return { authInfo: null, errored: false };
  }
  return validateAndExtractJwt(tokenFromQuery, req, res, 'query parameter', 'strict mode, query param');
}
// Shared helper for JWT validation and extraction
function validateAndExtractJwt(token, req, res, source, strictLabel) {
  try {
    const payload = parseJWT(token);
    console.log(`Successfully parsed JWT payload from ${source}:`, JSON.stringify(sanitizeJwtPayload(payload), null, 2));

    // Validate that we have an Atlassian access token
    if (!payload.atlassian_access_token) {
      console.log(`JWT payload missing atlassian_access_token (${source})`);
      sendMissingAtlassianAccessToken(res, req, source);
      return { authInfo: null, errored: true };
    }

    // Conditionally check expiration if env var is set
    const checkExpiration = String(process.env.CHECK_JWT_EXPIRATION).toLowerCase() === 'true';
    if (checkExpiration) {
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === 'number' && payload.exp < now) {
        console.log(`JWT token expired (${strictLabel})`);
        send401(res, { error: 'Token expired' }, true);
        return { authInfo: null, errored: true };
      }
    }

    return { authInfo: payload, errored: false };
  } catch (err) {
    logger.error(`Error parsing JWT token from ${source}:`, err);
    send401(res, { error: 'Invalid token' }, true); // Trigger re-auth for invalid tokens
    return { authInfo: null, errored: true };
  }
}

function send401(res, jsonResponse, includeInvalidToken = false) {
  const wwwAuthHeader = includeInvalidToken 
    ? `Bearer realm="mcp", error="invalid_token", error_description="Token expired - please re-authenticate", resource_metadata_url="${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource"`
    : `Bearer realm="mcp", resource_metadata_url="${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource"`;
    
  return res
      .status(401)
      .header('WWW-Authenticate', wwwAuthHeader)
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .json({ error: 'Invalid or missing token' });
}

function sendMissingAtlassianAccessToken(res, req, where = 'bearer header') {
  const message = `Authentication token missing Atlassian access token in ${where}.`;
  console.log(message);
  return res
      .status(401)
      .header('WWW-Authenticate', `Bearer realm="mcp", error="invalid_token", error_description="${message}", resource_metadata_url="${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource"`)
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: message,
        },
        id: req.body.id || null,
      });
}

function formatTokenWithExpiration(token, maxLength = 20) {
  try {
    const payload = parseJWT(token);
    const truncatedToken = token.substring(0, maxLength) + '...';
    
    // Check if we have a valid expiration timestamp
    if (!payload.exp || typeof payload.exp !== 'number') {
      return `${truncatedToken} (no expiration info)`;
    }
    
    const expTimestamp = payload.exp;
    const now = Math.floor(Date.now() / 1000);
    const diffSeconds = expTimestamp - now;
    
    // Sanity check - if the difference is more than 10 years, something is wrong
    const tenYearsInSeconds = 10 * 365 * 24 * 60 * 60;
    if (Math.abs(diffSeconds) > tenYearsInSeconds) {
      return `${truncatedToken} (invalid expiration: ${expTimestamp})`;
    }
    
    let timeMessage;
    if (diffSeconds > 0) {
      // Token hasn't expired yet
      const hours = Math.floor(diffSeconds / 3600);
      const minutes = Math.floor((diffSeconds % 3600) / 60);
      
      if (hours > 0) {
        timeMessage = `expires in ${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        timeMessage = `expires in ${minutes}m`;
      } else {
        timeMessage = `expires in ${diffSeconds}s`;
      }
    } else {
      // Token has expired
      const expiredSeconds = Math.abs(diffSeconds);
      const hours = Math.floor(expiredSeconds / 3600);
      const minutes = Math.floor((expiredSeconds % 3600) / 60);
      
      if (hours > 0) {
        timeMessage = `expired ${hours}h ${minutes}m ago`;
      } else if (minutes > 0) {
        timeMessage = `expired ${minutes}m ago`;
      } else {
        timeMessage = `expired ${expiredSeconds}s ago`;
      }
    }
    
    return `${truncatedToken} (${timeMessage})`;
  } catch (err) {
    // If we can't parse the token, just truncate it
    const truncatedToken = token.substring(0, maxLength) + '...';
    return `${truncatedToken} (could not parse expiration)`;
  }
}

function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  
  if (sanitized.authorization && sanitized.authorization.startsWith('Bearer ')) {
    const token = sanitized.authorization.slice('Bearer '.length);
    sanitized.authorization = `Bearer ${formatTokenWithExpiration(token, 20)}`;
  }
  
  return sanitized;
}

function sanitizeJwtPayload(payload) {
  const sanitized = { ...payload };
  
  // Truncate the atlassian_access_token and add expiration info
  if (sanitized.atlassian_access_token) {
    sanitized.atlassian_access_token = formatTokenWithExpiration(sanitized.atlassian_access_token, 30);
  }
  
  return sanitized;
}

function parseJWT(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
}