import './instruments.js';

import * as Sentry from '@sentry/node';

import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { oauthMetadata, oauthProtectedResourceMetadata, authorize, callback, register, accessToken } from './pkce.js';
import { handleMcpPost, handleSessionRequest } from './mcp-service.js';
import cors from 'cors';
import { logger } from './logger.js';
import { jiraIssues } from './jira-mcp.js';

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
app.get('/.well-known/oauth-protected-resource', oauthProtectedResourceMetadata);

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

app.post('/domain', async (req, res) => {
  logger.info(`[domain] - ${req.body.domain}`);

  res.status(204).send();
});

// OAuth token endpoint for MCP clients (POST)
app.post('/access-token', accessToken);

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
