/**
 * Jest Setup for E2E Tests
 * 
 * Global configuration and setup for all E2E tests.
 * Sets up test environment variables and global utilities.
 */

// Load environment variables from .env file
import { config } from 'dotenv';
config({ path: '.env' });

// Set default test environment variables
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

// Set default testing mode - prefer mock OAuth over PAT bypass for MCP SDK tests
if (!process.env.TEST_USE_MOCK_ATLASSIAN && !process.env.TEST_USE_PAT_BYPASS) {
  process.env.TEST_USE_MOCK_ATLASSIAN = 'true';
}

// Fallback to PAT bypass if no PAT token available and mock not explicitly enabled
if (process.env.TEST_USE_MOCK_ATLASSIAN === 'true' && !process.env.ATLASSIAN_TEST_PAT) {
  console.warn('⚠️  Mock Atlassian mode enabled but ATLASSIAN_TEST_PAT not set');
  console.warn('   Mock OAuth endpoints will use PAT token internally');
}

// Set test server URL if not specified
if (!process.env.VITE_AUTH_SERVER_URL) {
  process.env.VITE_AUTH_SERVER_URL = 'http://localhost:3000';
}

// Set default Jira scope for tests
if (!process.env.VITE_JIRA_SCOPE) {
  process.env.VITE_JIRA_SCOPE = 'read:jira-work write:jira-work offline_access';
}

// Increase default timeout for E2E tests
jest.setTimeout(30000);

// Global test setup
beforeAll(() => {
  console.log('🧪 Starting E2E test suite...');
  
  if (process.env.TEST_USE_MOCK_ATLASSIAN === 'true') {
    console.log('   Test mode: Mock Atlassian OAuth (full OAuth flow with mock endpoints)');
  } else if (process.env.TEST_USE_PAT_BYPASS === 'true') {
    console.log('   Test mode: PAT Bypass (skips OAuth flow entirely)');
  } else {
    console.log('   Test mode: Manual OAuth (requires browser interaction)');
  }
  
  if (process.env.TEST_USE_MOCK_ATLASSIAN === 'true' && !process.env.ATLASSIAN_TEST_PAT) {
    console.warn('⚠️  WARNING: Mock OAuth mode enabled but ATLASSIAN_TEST_PAT not set');
    console.warn('   Mock endpoints need PAT token for internal Jira API calls');
  }
});

// Global test cleanup
afterAll(() => {
  console.log('✅ E2E test suite completed');
});
