/**
 * Test Server Helper
 * 
 * Manages starting and stopping the Jira MCP Auth Bridge server for E2E tests.
 * Also manages mock Atlassian OAuth server when needed.
 * Supports both automated (PAT bypass) and manual OAuth testing modes.
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { startMockAtlassianServer, stopMockAtlassianServer } from '../test-servers/mock-atlassian-oauth.js';

let serverProcess = null;
let serverUrl = null;
let mockAtlassianPort = null;

/**
 * Start the test server with specified configuration
 * @param {Object} options - Server configuration options
 * @param {boolean} options.testMode - Enable test mode
 * @param {string} options.logLevel - Log level (error, warn, info, debug)
 * @param {number} options.port - Server port (default: 3000)
 * @returns {Promise<string>} Server base URL
 */
export async function startTestServer(options = {}) {
  if (serverProcess) {
    console.log('♻️ Test server already running');
    return serverUrl;
  }

  const {
    testMode = true,
    logLevel = 'error',
    port = 3000,
    shortTokenExp = null
  } = options;

  console.log('🚀 Starting test server...');

  // Set up base environment
  const env = {
    ...process.env,
    TEST_MODE: testMode.toString(),
    PORT: port.toString(),
    LOG_LEVEL: logLevel
  };

  // Start mock Atlassian server if needed
  if (process.env.TEST_USE_MOCK_ATLASSIAN === 'true') {
    console.log('🧪 Starting mock Atlassian OAuth server...');
    mockAtlassianPort = await startMockAtlassianServer(3001);
    console.log(`   Mock Atlassian server running on port ${mockAtlassianPort}`);
    
    // Set environment variables for bridge server to use mock endpoints
    env.TEST_USE_MOCK_ATLASSIAN = 'true';  // Explicitly set the flag
    env.TEST_ATLASSIAN_AUTH_URL = `http://localhost:${mockAtlassianPort}/authorize`;
    env.TEST_ATLASSIAN_TOKEN_URL = `http://localhost:${mockAtlassianPort}/token`;
    env.TEST_ATLASSIAN_CLIENT_ID = 'mock-test-client-id';
    env.TEST_ATLASSIAN_CLIENT_SECRET = 'mock-test-client-secret';
  }

  // Add short token expiration for token lifecycle tests
  if (shortTokenExp) {
    env.TEST_SHORT_AUTH_TOKEN_EXP = shortTokenExp.toString();
    console.log(`🧪 Test mode: ${shortTokenExp}s token expiration`);
  }

  // Debug environment before spawning server
  console.log('🔧 Environment being passed to server:');
  console.log('  TEST_USE_MOCK_ATLASSIAN:', env.TEST_USE_MOCK_ATLASSIAN);
  console.log('  TEST_ATLASSIAN_AUTH_URL:', env.TEST_ATLASSIAN_AUTH_URL);
  console.log('  TEST_ATLASSIAN_TOKEN_URL:', env.TEST_ATLASSIAN_TOKEN_URL);

  // Start server process
  serverProcess = spawn('node', ['--import', './loader.mjs', 'server/server.ts'], {
    env,
    stdio: ['inherit', 'pipe', 'pipe'], // Capture stdout+stderr so we can show them on failure
    cwd: process.cwd()
  });

  serverUrl = `http://localhost:${port}`;

  // Buffer output so we can dump it if the server crashes
  let serverOutput = '';

  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });

  serverProcess.stderr.on('data', (data) => {
    const text = data.toString();
    serverOutput += text;
    if (!text.includes('DeprecationWarning') && !text.includes('ExperimentalWarning')) {
      process.stderr.write(text);
    }
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
    throw error;
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== 0 || signal) {
      console.error(`\n❌ Server exited unexpectedly (code=${code}, signal=${signal})`);
      if (serverOutput) {
        console.error('--- Server output ---');
        console.error(serverOutput.slice(-4000)); // last 4000 chars to avoid flooding
        console.error('--- End server output ---');
      }
    }
    serverProcess = null;
    serverUrl = null;
  });

  // Wait for server to be ready
  console.log(`⏳ Waiting for server health check at ${serverUrl}/health...`);
  let retries = 30;
  let lastError = null;
  while (retries > 0) {
    // Fast-fail: if the process already exited, don't keep waiting
    if (!serverProcess) {
      const outputSummary = serverOutput ? `\n--- Server output ---\n${serverOutput.slice(-4000)}\n--- End ---` : '';
      throw new Error(`Server process exited unexpectedly during startup. Last error: ${lastError || 'unknown'}${outputSummary}`);
    }

    try {
      const response = await fetch(`${serverUrl}/health`);
      if (response.ok) {
        console.log(`✅ Test server ready at ${serverUrl}`);
        return serverUrl;
      }
      lastError = `Health check failed with status: ${response.status}`;
      console.log(`   Retry ${31 - retries}/30: ${lastError}`);
    } catch (error) {
      lastError = error.message;
      console.log(`   Retry ${31 - retries}/30: ${lastError}`);
      // Server not ready yet
    }
    
    await delay(1000);
    retries--;
  }

  throw new Error(`Test server failed to start within 30 seconds. Last error: ${lastError}\n--- Server output ---\n${serverOutput.slice(-4000)}\n--- End ---`);
}

/**
 * Stop the test server
 */
export async function stopTestServer() {
  if (!serverProcess) {
    return;
  }

  console.log('🛑 Stopping test server...');
  
  // Stop mock Atlassian server first
  if (mockAtlassianPort) {
    console.log('🛑 Stopping mock Atlassian OAuth server...');
    await stopMockAtlassianServer();
    mockAtlassianPort = null;
  }
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      serverProcess.kill('SIGKILL');
      resolve();
    }, 5000);

    serverProcess.on('exit', () => {
      clearTimeout(timeout);
      serverProcess = null;
      serverUrl = null;
      console.log('✅ Test server stopped');
      resolve();
    });

    serverProcess.kill('SIGTERM');
  });
}

/**
 * Get the current server URL
 * @returns {string|null} Server URL or null if not running
 */
export function getServerUrl() {
  return serverUrl;
}
