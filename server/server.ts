import './observability/instruments.ts';

import * as Sentry from '@sentry/node';

import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
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
import {
  makeAuthorize,
  makeCallback,
  hubCallbackHandler,
  renderConnectionHub,
  handleConnectionDone
} from './provider-server-oauth/index.js';
import { atlassianProvider } from './providers/atlassian/index.js';
import { figmaProvider } from './providers/figma/index.js';
import { googleProvider } from './providers/google/index.js';
import { logEnvironmentInfo } from './debug-helpers.js';
import { registerRestApiRoutes } from './api/index.js';
import { getProjectRoot } from './utils/file-paths.js';
import { renderEncryptionPage, handleEncryptionRequest } from './google-service-encrypt.js';

// configurations
dotenv.config();

// Log environment info at startup for debugging
logEnvironmentInfo();

// Boot express
const app = express();
const port = process.env.PORT || 3000;

// CRITICAL: Trust proxy when behind AWS ELB/ALB
// This allows Express to correctly detect HTTPS from X-Forwarded-Proto header
app.set('trust proxy', 1);

// Sentry setup needs to be done before the middlewares
Sentry.setupExpressErrorHandler(app);

// Session middleware for OAuth flows
// Note: In production, consider using a persistent session store like Redis
// to handle load balancing and container restarts

// We need to use 'auto' for secure cookies when behind Classic ELB with TCP protocol
// Express will set secure: true if req.secure is true (which trust proxy helps with)
// But if ELB doesn't send X-Forwarded-Proto, we can't set secure: true
console.log(`\n========== SESSION CONFIGURATION ==========`);
console.log(`VITE_AUTH_SERVER_URL: ${process.env.VITE_AUTH_SERVER_URL}`);
console.log(`SESSION_SECRET: ${process.env.SESSION_SECRET ? 'present (length: ' + process.env.SESSION_SECRET.length + ')' : 'using default "changeme"'}`);
console.log(`Cookie settings: secure=auto, httpOnly=true, sameSite=lax, maxAge=24h`);
console.log(`Trust proxy: enabled (level 1)`);
console.log(`WARNING: Using in-memory session store - sessions will be lost on restart`);
console.log(`========== SESSION CONFIGURATION END ==========\n`);

// Log DEV_CACHE_DIR configuration if set
if (process.env.DEV_CACHE_DIR) {
  console.log(`\n========== DEV CACHE CONFIGURATION ==========`);
  const devCacheDir = process.env.DEV_CACHE_DIR;
  if (path.isAbsolute(devCacheDir)) {
    console.log(`DEV_CACHE_DIR: ${devCacheDir} (absolute path)`);
  } else {
    const projectRoot = getProjectRoot();
    const resolvedPath = path.resolve(projectRoot, devCacheDir);
    console.log(`DEV_CACHE_DIR: ${devCacheDir} → ${resolvedPath}`);
  }
  console.log(`Cache cleanup: DISABLED (directories preserved for debugging)`);
  console.log(`========== DEV CACHE CONFIGURATION END ==========\n`);
}

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: 'auto', // Let express-session decide based on req.secure
    httpOnly: true,
    sameSite: 'lax', // Important for OAuth redirects
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
  // Warning: Using in-memory store (default) - sessions lost on restart
  // For production with load balancing, consider: connect-redis, connect-mongo, etc.
});

app.use(sessionMiddleware);

// Debug middleware to log session info on OAuth routes
app.use('/auth', (req, res, next) => {
  console.log(`[SESSION] ${req.method} ${req.url}`);
  console.log(`[SESSION]   - Session ID: ${req.sessionID}`);
  console.log(`[SESSION]   - Cookie header present: ${!!req.headers.cookie}`);
  console.log(`[SESSION]   - req.secure: ${req.secure}`);
  console.log(`[SESSION]   - X-Forwarded-Proto: ${req.headers['x-forwarded-proto']}`);
  console.log(`[SESSION]   - Session cookie will be secure: ${req.secure || req.headers['x-forwarded-proto'] === 'https'}`);
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
  allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization', 'mcp-protocol-version'],
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

// Serve static files from the 'static' directory
app.use(express.static('static'));

// Error handler middleware
app.use(function onError(err: Error, req: Request, res: Response, next: NextFunction) {
  // Todo: do we want a page for this?
  res.statusCode = 500;
  res.end((res as any).sentry + '\n');
});

// --- OAuth Endpoints ---
// Health check endpoint for tests
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to check environment configuration (remove in production!)
app.get('/debug/config', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV || 'development',
    baseUrl: process.env.VITE_AUTH_SERVER_URL!,
    jira: {
      clientId: process.env.VITE_JIRA_CLIENT_ID ? process.env.VITE_JIRA_CLIENT_ID.substring(0, 10) + '...' : 'not set',
      clientSecretPresent: !!process.env.JIRA_CLIENT_SECRET,
      clientSecretLength: process.env.JIRA_CLIENT_SECRET?.length || 0,
      scope: process.env.VITE_JIRA_SCOPE!,
      redirectUri: `${process.env.VITE_AUTH_SERVER_URL!}/auth/callback/atlassian`,
    },
    session: {
      secretPresent: !!process.env.SESSION_SECRET,
      secretLength: process.env.SESSION_SECRET?.length || 0,
    },
    server: {
      trustProxy: app.get('trust proxy'),
      port: process.env.PORT || 3000,
    }
  });
});

// Favicon route
app.get('/favicon.ico', (req, res) => {
  res.sendFile('favicon.ico', { root: 'static' });
});

// Determine if React client build exists
const projectRoot = getProjectRoot();
const clientDistPath = path.join(projectRoot, 'dist', 'client');
const clientIndexPath = path.join(clientDistPath, 'index.html');
const hasClientBuild = fs.existsSync(clientIndexPath);

if (hasClientBuild) {
  console.log(`Serving React app from: ${clientDistPath}`);
  
  // Serve static assets from Vite build (JS, CSS, etc.)
  app.use('/assets', express.static(path.join(clientDistPath, 'assets')));
  
  // Serve the React app at the homepage
  app.get('/', (req, res) => {
    res.sendFile(clientIndexPath);
  });
} else {
  console.log(`React client not built. Using fallback HTML homepage.`);
  
  // Fallback: Root endpoint for service discovery (original HTML)
  app.get('/', (req, res) => {
    const baseUrl = process.env.VITE_AUTH_SERVER_URL!;

    res.send(`
      <h1>Cascade MCP Service</h1>
      <p>MCP tools that help software teams. Integrates Jira and Figma. See <a href="https://github.com/bitovi/cascade-mcp">Cascade MCP on GitHub</a> for guides and documentation.</p>
      <p>Note: some tools require <a href="https://modelcontextprotocol.io/specification/2025-06-18/client/sampling">sampling</a>. Make sure your agent supports sampling.</p>
      <h2>Available Endpoints</h2>
      <ul>
        <li><a href="/mcp">MCP Endpoint</a> - <code>${baseUrl}/mcp</code></li>
        <li><a href="/.well-known/oauth-authorization-server">OAuth Server Metadata</a></li>
        <li><a href="/.well-known/oauth-protected-resource">Protected Resource Metadata</a></li>
        <li><a href="/get-access-token">Manual Token Retrieval</a></li>
        <li><a href="/google-service-encrypt">🔐 Encrypt Google Service Account</a></li>
      </ul>
      <h2>REST API Endpoints (PAT Authentication)</h2>
      <ul>
        <li><strong>POST /api/write-shell-stories</strong> - Generate shell stories from Figma designs</li>
        <li><strong>POST /api/write-next-story</strong> - Write next Jira story from shell stories</li>
      </ul>
    `);
  });
}

app.get('/.well-known/oauth-authorization-server', oauthMetadata);

// OAuth 2.0 Protected Resource Metadata (RFC9728) for MCP discovery
app.get('/.well-known/oauth-protected-resource', oauthProtectedResourceMetadata);

// Manual token retrieval page
app.get('/get-access-token', renderManualTokenPage);

// Google service account encryption page
app.get('/google-service-encrypt', renderEncryptionPage);
app.post('/google-service-encrypt', express.urlencoded({ extended: true }), handleEncryptionRequest);

app.get('/authorize', authorize);
app.post('/register', express.json(), clientRegistration);
app.get('/callback', callback);

// --- Connection Hub Routes (Phase 1.3) ---
// Per Q25: Static routes with factory functions
app.get('/auth/connect', renderConnectionHub);
app.get('/auth/connect/atlassian', makeAuthorize(atlassianProvider));
app.get('/auth/callback/atlassian', makeCallback(atlassianProvider, { onSuccess: hubCallbackHandler }));
app.get('/auth/connect/figma', makeAuthorize(figmaProvider));
app.get('/auth/callback/figma', makeCallback(figmaProvider, { onSuccess: hubCallbackHandler }));
app.get('/auth/connect/google', makeAuthorize(googleProvider));
app.get('/auth/callback/google', makeCallback(googleProvider, { onSuccess: hubCallbackHandler }));
app.get('/auth/done', handleConnectionDone);

// --- MCP HTTP Endpoints ---
// Handle POST requests for client-to-server communication
app.post('/mcp', handleMcpPost);
// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);
// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

// --- REST API Endpoints (PAT Authentication) ---
registerRestApiRoutes(app);

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
