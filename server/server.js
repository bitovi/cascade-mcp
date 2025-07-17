import './instruments.js';

import * as Sentry from '@sentry/node';

import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { fetchTokenWithAccessCode } from './helper.js';
import { oauthMetadata, authorize, callback, jiraIssues, register } from './oauth.js';
import { handleMcpPost, handleSessionRequest } from './mcp-service.js';
import { jwtSign } from './tokens.js';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import { logger } from './logger.js';

// configurations
dotenv.config();

// Boot express
const app = express();
const port = process.env.PORT || 3000;

// Sentry setup needs to be done before the middlewares
Sentry.setupExpressErrorHandler(app);

// Session middleware for OAuth flows
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'changeme',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set to true in production with HTTPS
  }),
);

app.use(cors());

// middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Error handler middleware
app.use(function onError(err, req, res, next) {
  // Todo: do we want a page for this?
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

// --- OAuth Endpoints ---
app.get('/.well-known/oauth-authorization-server', oauthMetadata);

// OAuth 2.0 Protected Resource Metadata (RFC9728) for MCP discovery
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  console.log('🔍 OAuth Protected Resource Metadata requested!', {
    headers: req.headers,
    query: req.query,
  });
  const baseUrl = process.env.VITE_AUTH_SERVER_URL;
  const metadata = {
    resource: baseUrl,
    authorization_servers: [`${baseUrl}/.well-known/oauth-authorization-server`],
    bearer_methods_supported: ['header', 'query'],
    resource_documentation: `${baseUrl}`,
    scopes_supported: ['read:jira-work', 'offline_access'],
    scope_documentation: {
      'read:jira-work': 'Access to read Jira issues and sites',
      offline_access: 'Refresh token access',
    },
  };
  console.log('📤 Sending protected resource metadata:', metadata);
  res.json(metadata);
});

app.get('/authorize', authorize);
app.post('/register', express.json(), register);
app.get('/callback', callback);
app.get('/jira-issues', jiraIssues);

// --- MCP HTTP Endpoints ---
// Handle POST requests for client-to-server communication
app.post('/mcp', handleMcpPost);

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

// --- Existing Endpoints ---

app.get('/access-token', async (req, res) => {
  try {
    const code = req.query.code;
    const refresh = req.query.refresh;
    let data = {};
    if (!code) throw new Error('No Access code provided');
    const { error, data: accessData, message } = await fetchTokenWithAccessCode(code, refresh);
    if (error) {
      //handle properly
      return res.status(400).json({
        error: true,
        message,
      });
    } else {
      data = accessData;
    }
    return res.json({
      error: false,
      ...data,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      error: true,
      message: `${error.message}`,
    });
  }
});

app.post('/domain', async (req, res) => {
  logger.info(`[domain] - ${req.body.domain}`);

  res.status(204).send();
});

// OAuth token endpoint for MCP clients (POST)
app.post('/access-token', async (req, res) => {
  console.log('OAuth token exchange request:', {
    body: req.body,
    contentType: req.headers['content-type'],
  });

  try {
    const { grant_type, code, client_id, code_verifier, resource } = req.body;

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported',
      });
    }

    if (!code) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing authorization code',
      });
    }

    if (!code_verifier) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing code_verifier for PKCE',
      });
    }

    // Exchange the authorization code for Atlassian tokens
    const ATLASSIAN_CONFIG = {
      authUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      clientId: process.env.VITE_JIRA_CLIENT_ID,
      clientSecret: process.env.JIRA_CLIENT_SECRET,
      redirectUri: process.env.VITE_AUTH_SERVER_URL + '/callback',
      scopes: process.env.VITE_JIRA_SCOPE,
    };

    const tokenRes = await fetch(ATLASSIAN_CONFIG.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: ATLASSIAN_CONFIG.clientId,
        client_secret: ATLASSIAN_CONFIG.clientSecret,
        code,
        redirect_uri: ATLASSIAN_CONFIG.redirectUri,
        code_verifier: code_verifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Atlassian token exchange failed:', tokenData);
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Authorization code is invalid or expired',
      });
    }

    // Create JWT with embedded Atlassian token
    const jwt = await jwtSign({
      sub: 'user-' + randomUUID(),
      iss: process.env.VITE_AUTH_SERVER_URL,
      aud: resource || process.env.VITE_AUTH_SERVER_URL, // Use resource parameter if provided
      scope: ATLASSIAN_CONFIG.scopes,
      atlassian_access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    });

    console.log('OAuth token exchange successful for client:', client_id);

    // Return OAuth-compliant response
    return res.json({
      access_token: jwt,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour
      scope: ATLASSIAN_CONFIG.scopes,
    });
  } catch (error) {
    console.error('OAuth token exchange error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during token exchange',
    });
  }
});

// Start server
app.listen(port, () => console.log(`Server is listening on port ${port}!`));

// Handle unhandled promise rejections and exceptions
process.on('unhandledRejection', (err) => {
  console.log(err);
  Sentry.captureException(err);
});

process.on('uncaughtException', (err) => {
  console.log(err.message);
  Sentry.captureException(err);
});
