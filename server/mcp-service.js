import { mcp, setAuthContext, clearAuthContext } from './jira-mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

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
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
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
    console.log('New MCP initialization request');

    // Extract auth info
    let authInfo = null;
    const auth = req.headers.authorization;
    const tokenFromQuery = req.query.token;
    const authServerUrl = process.env.VITE_AUTH_SERVER_URL;

    if (auth && auth.startsWith('Bearer ')) {
      try {
        const payload = parseJWT(auth.slice('Bearer '.length));
        authInfo = payload;
        console.log('Successfully parsed JWT payload:', authInfo);
        // Validate that we have an Atlassian access token
        if (!authInfo.atlassian_access_token) {
          console.log('JWT payload missing atlassian_access_token');
          return sendMissingAtlassianAccessToken(res, req, 'authorization bearer token');
        }
      } catch (err) {
        logger.error('Error parsing JWT token from header:', err);
        return send401(res,{ error: 'Invalid token' })
      }
    } else if (tokenFromQuery) {
      try {
        const payload = parseJWT(tokenFromQuery);
        authInfo = payload;
        console.log('Successfully parsed JWT payload from query:', authInfo);

        // Validate that we have an Atlassian access token
        if (!authInfo.atlassian_access_token) {
          console.log('JWT payload from query missing atlassian_access_token');
          return sendMissingAtlassianAccessToken(res, req, 'query parameter');
        }
      } catch (err) {
        logger.error('Error parsing JWT token from query:', err);
        return send401(res,{ error: 'Invalid token' })
      }
    } else {
      // No authentication provided - require authentication immediately
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

  // Handle the request
  await transport.handleRequest(req, res, req.body);
}

/**
 * Reusable handler for GET and DELETE requests
 */
export async function handleSessionRequest(req, res) {
  console.log('=== MCP SESSION REQUEST ===');
  console.log(req.method);
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    console.log(`Invalid or missing session ID: ${sessionId}`);
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
}



function send401(res, jsonResponse ){
  return res
      .status(401)
      .header(
        'WWW-Authenticate',
        `Bearer realm="mcp", resource_metadata_url="${process.env.VITE_AUTH_SERVER_URL}/.well-known/oauth-protected-resource"`,
      )
      .json({ error: 'Invalid or missing token' });
}

function sendMissingAtlassianAccessToken(res, req, where = 'bearer header') {
  const message = `Authentication token missing Atlassian access token in ${where}.`;
  console.log(message);
  return send401(res,{
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: message,
    },
    id: req.body.id || null,
  });

}

function parseJWT(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
}