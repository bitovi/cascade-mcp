import './observability/instruments.ts';

import * as Sentry from '@sentry/node';

import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import morgan from 'morgan';
import { 
  oauthMetadata, 
  oauthProtectedResourceMetadata, 
  dynamicClientRegistration as clientRegistration
} from './pkce/discovery.ts';
import { authorize } from './pkce/authorize.ts';
import { callback } from './pkce/callback.ts';
import { accessToken } from './pkce/access-token.ts';
import { handleMcpPost, handleSessionRequest } from './mcp-service.ts';
import { renderManualTokenPage } from './manual-token-flow.ts';
import cors from 'cors';
import { logger } from './observability/logger.ts';

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

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
  allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization'],
  exposedHeaders: ['mcp-session-id'],
  maxAge: 86400
}));

// HTTP request logging middleware
app.use(morgan('common', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Error handler middleware
app.use(function onError(err: Error, req: Request, res: Response, next: NextFunction) {
  // Todo: do we want a page for this?
  res.statusCode = 500;
  res.end((res as any).sentry + '\n');
});

// --- OAuth Endpoints ---
// Root endpoint for service discovery
app.get('/', (req, res) => {
  const baseUrl = process.env.VITE_AUTH_SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  res.send(`
    <h1>Jira MCP Auth Bridge</h1>
    <p>OAuth 2.0 authorization server for Jira MCP clients</p>
    <h2>Available Endpoints</h2>
    <ul>
      <li><a href="/.well-known/oauth-authorization-server">OAuth Server Metadata</a></li>
      <li><a href="/.well-known/oauth-protected-resource">Protected Resource Metadata</a></li>
      <li><a href="/get-access-token">Manual Token Retrieval</a></li>
    </ul>
    <h2>OAuth Flow</h2>
    <ol>
      <li>Client registration: POST /register</li>
      <li>Authorization: GET /authorize</li>
      <li>Token exchange: POST /access-token</li>
    </ol>
  `);
});

app.get('/.well-known/oauth-authorization-server', oauthMetadata);

// OAuth 2.0 Protected Resource Metadata (RFC9728) for MCP discovery
app.get('/.well-known/oauth-protected-resource', oauthProtectedResourceMetadata);

// Manual token retrieval page
app.get('/get-access-token', renderManualTokenPage);

app.get('/authorize', authorize);
app.post('/register', express.json(), clientRegistration);
app.get('/callback', callback);

// --- MCP HTTP Endpoints ---
// Handle POST requests for client-to-server communication
app.post('/mcp', handleMcpPost);
// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);
// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

app.post('/domain', async (req: Request, res: Response) => {
  logger.info(`[domain] - ${req.body.domain}`);
  res.status(204).send();
});

// OAuth token endpoint for MCP clients (POST)
app.post('/access-token', accessToken);

// OAuth refresh token endpoint (kept for backwards compatibility)
app.post('/refresh-token', accessToken);

// Start server
app.listen(port, () => console.log(`Server is listening on port ${port}!`));

// Handle unhandled promise rejections and exceptions
process.on('unhandledRejection', (err: Error) => {
  console.log(err);
  Sentry.captureException(err);
});

process.on('uncaughtException', (err: Error) => {
  console.log(err.message);
  Sentry.captureException(err);
});
