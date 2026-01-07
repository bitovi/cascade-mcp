/**
 * Atlassian OAuth Configuration
 * 
 * This module provides configuration for Atlassian OAuth services.
 * Used by token refresh flows and JWT creation.
 */

// Atlassian OAuth configuration interface
export interface AtlassianConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string;
  scopes: string | undefined;
}

// Atlassian token response interface
export interface AtlassianTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * Get Atlassian OAuth configuration
 * @returns Atlassian OAuth configuration
 */
export function getAtlassianConfig(): AtlassianConfig {
  // Support environment-configurable OAuth endpoints for testing
  const baseUrl = process.env.VITE_AUTH_SERVER_URL || 'http://localhost:3000';
  const useMockEndpoints = process.env.TEST_USE_MOCK_ATLASSIAN === 'true';
  
  if (useMockEndpoints) {
    return {
      authUrl: process.env.TEST_ATLASSIAN_AUTH_URL || `${baseUrl}/mock-atlassian/authorize`,
      tokenUrl: process.env.TEST_ATLASSIAN_TOKEN_URL || `${baseUrl}/mock-atlassian/token`,
      clientId: process.env.TEST_ATLASSIAN_CLIENT_ID || 'mock-test-client-id',
      clientSecret: process.env.TEST_ATLASSIAN_CLIENT_SECRET || 'mock-test-client-secret',
      redirectUri: process.env.VITE_JIRA_CALLBACK_URL || `${baseUrl}/auth/callback/atlassian`,
      scopes: process.env.VITE_JIRA_SCOPE || 'read:jira-work write:jira-work offline_access',
    };
  }
  
  // Production Atlassian endpoints
  return {
    authUrl: process.env.TEST_ATLASSIAN_AUTH_URL || 'https://auth.atlassian.com/authorize',
    tokenUrl: process.env.TEST_ATLASSIAN_TOKEN_URL || 'https://auth.atlassian.com/oauth/token',
    clientId: process.env.VITE_JIRA_CLIENT_ID,
    clientSecret: process.env.JIRA_CLIENT_SECRET,
    redirectUri: process.env.VITE_JIRA_CALLBACK_URL || `${baseUrl}/auth/callback/atlassian`,
    scopes: process.env.VITE_JIRA_SCOPE,
  };
}

