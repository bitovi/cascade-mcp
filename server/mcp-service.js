import { mcp, setAuthContext, clearAuthContext } from './mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

// Map to store transports by session ID
const transports = {};

/**
 * Handle POST requests for client-to-server communication
 */
export async function handleMcpPost(req, res) {
  console.log('=== MCP POST REQUEST ===');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('========================');

  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
    console.log(`Reusing existing transport for session: ${sessionId}`);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    console.log('New MCP initialization request');

    // Extract auth info
    let authInfo = null;
    const auth = req.headers.authorization;
    const tokenFromQuery = req.query.token;
    const authServerUrl = process.env.VITE_AUTH_SERVER_URL;

    if (auth && auth.startsWith('Bearer ')) {
      try {
        const token = auth.slice('Bearer '.length);
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        authInfo = payload;
        console.log('Successfully parsed JWT payload:', authInfo);

        // Validate that we have an Atlassian access token
        if (!authInfo.atlassian_access_token) {
          console.log('JWT payload missing atlassian_access_token');
          return res
            .status(401)
            .header(
              'WWW-Authenticate',
              `Bearer realm="mcp", resource_metadata_url="${authServerUrl}/.well-known/oauth-protected-resource"`,
            )
            .json({
              jsonrpc: '2.0',
              error: {
                code: -32001,
                message: 'Authentication token missing Atlassian access token',
              },
              id: req.body.id || null,
            });
        }
      } catch (err) {
        logger.error('Error parsing JWT token from header:', err);
        return res
          .status(401)
          .header(
            'WWW-Authenticate',
            `Bearer realm="mcp", resource_metadata_url="${authServerUrl}/.well-known/oauth-protected-resource"`,
          )
          .json({ error: 'Invalid token' });
      }
    } else if (tokenFromQuery) {
      try {
        const payload = JSON.parse(Buffer.from(tokenFromQuery.split('.')[1], 'base64url').toString());
        authInfo = payload;
        console.log('Successfully parsed JWT payload from query:', authInfo);

        // Validate that we have an Atlassian access token
        if (!authInfo.atlassian_access_token) {
          console.log('JWT payload from query missing atlassian_access_token');
          return res
            .status(401)
            .header(
              'WWW-Authenticate',
              `Bearer realm="mcp", resource_metadata_url="${authServerUrl}/.well-known/oauth-protected-resource"`,
            )
            .json({
              jsonrpc: '2.0',
              error: {
                code: -32001,
                message: 'Authentication token missing Atlassian access token',
              },
              id: req.body.id || null,
            });
        }
      } catch (err) {
        logger.error('Error parsing JWT token from query:', err);
        return res
          .status(401)
          .header(
            'WWW-Authenticate',
            `Bearer realm="mcp", resource_metadata_url="${authServerUrl}/.well-known/oauth-protected-resource"`,
          )
          .json({ error: 'Invalid token' });
      }
    } else {
      // No authentication provided - require authentication immediately
      console.log('No authentication provided - requiring authentication for session initialization');
      return res
        .status(401)
        .header(
          'WWW-Authenticate',
          `Bearer realm="mcp", resource_metadata_url="${authServerUrl}/.well-known/oauth-protected-resource"`,
        )
        .json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Authentication required. Please authenticate with Jira first.',
          },
          id: req.body.id || null,
        });
    }

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        // Store the transport by session ID
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
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
}
