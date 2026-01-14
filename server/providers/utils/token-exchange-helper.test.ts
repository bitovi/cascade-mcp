/**
 * Token Exchange Helper Tests
 * 
 * Tests the centralized token exchange and refresh utilities including:
 * - OAuth token exchange with PKCE and traditional flows
 * - JSON and form-encoded content types
 * - Token refresh with rotation (Atlassian) and preservation (Figma, Google)
 * - HTTP Basic Auth for Figma refresh
 * - Error handling and logging
 */

import { performTokenExchange, performTokenRefresh } from './token-exchange-helper.js';
import type { TokenExchangeConfig, TokenRefreshConfig } from './token-exchange-helper.js';
import type { TokenExchangeParams, RefreshTokenParams, StandardTokenResponse } from './provider-interface.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('Token Exchange Helper', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Set up environment variables
    process.env = {
      ...originalEnv,
      VITE_AUTH_SERVER_URL: 'https://test-server.com',
      JIRA_CLIENT_ID: 'atlassian-client-id',
      JIRA_CLIENT_SECRET: 'atlassian-client-secret',
      FIGMA_CLIENT_ID: 'figma-client-id',
      FIGMA_CLIENT_SECRET: 'figma-client-secret',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
    };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
  });

  describe('performTokenExchange', () => {
    describe('Atlassian (PKCE + JSON)', () => {
      const config: TokenExchangeConfig = {
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        clientIdEnvVar: 'JIRA_CLIENT_ID',
        clientSecretEnvVar: 'JIRA_CLIENT_SECRET',
        usePKCE: true,
        contentType: 'json',
        defaultExpiresIn: 3600,
        redirectPath: '/auth/callback/atlassian',
      };

      const params: TokenExchangeParams = {
        code: 'auth-code-123',
        codeVerifier: 'code-verifier-abc',
        redirectUri: 'https://test-server.com/auth/callback/atlassian',
      };

      it('should exchange code for tokens with PKCE and JSON', async () => {
        const mockResponse: StandardTokenResponse = {
          access_token: 'access-token-xyz',
          refresh_token: 'refresh-token-xyz',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read:jira-work write:jira-work',
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockResponse,
        });

        const result = await performTokenExchange(config, params);

        expect(result).toEqual(mockResponse);
        expect(global.fetch).toHaveBeenCalledWith(
          config.tokenUrl,
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grant_type: 'authorization_code',
              client_id: 'atlassian-client-id',
              client_secret: 'atlassian-client-secret',
              code: params.code,
              redirect_uri: params.redirectUri,
              code_verifier: params.codeVerifier,
            }),
          })
        );
      });

      it('should use default redirectUri if not provided', async () => {
        const mockResponse: StandardTokenResponse = {
          access_token: 'access-token-xyz',
          refresh_token: 'refresh-token-xyz',
          token_type: 'Bearer',
          expires_in: 3600,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const paramsWithoutRedirect = { ...params, redirectUri: undefined };
        await performTokenExchange(config, paramsWithoutRedirect);

        const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
        expect(callBody.redirect_uri).toBe('https://test-server.com/auth/callback/atlassian');
      });

      it('should handle network errors', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network failure'));

        await expect(performTokenExchange(config, params)).rejects.toThrow(
          'Network error contacting ATLASSIAN: Network failure'
        );
      });

      it('should handle HTTP errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => 'Invalid grant',
        });

        await expect(performTokenExchange(config, params)).rejects.toThrow(
          'Token exchange failed (400): Invalid grant'
        );
      });

      it('should handle missing access_token in response', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({ error: 'invalid_grant' }),
        });

        await expect(performTokenExchange(config, params)).rejects.toThrow(
          'Token exchange failed'
        );
      });

      it('should use default expires_in if not provided', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({
            access_token: 'token',
            refresh_token: 'refresh',
          }),
        });

        const result = await performTokenExchange(config, params);
        expect(result.expires_in).toBe(3600);
      });
    });

    describe('Figma (Traditional OAuth + Form)', () => {
      const config: TokenExchangeConfig = {
        tokenUrl: 'https://api.figma.com/v1/oauth/token',
        clientIdEnvVar: 'FIGMA_CLIENT_ID',
        clientSecretEnvVar: 'FIGMA_CLIENT_SECRET',
        usePKCE: false,
        contentType: 'form',
        defaultExpiresIn: 7776000,
        redirectPath: '/auth/callback/figma',
      };

      const params: TokenExchangeParams = {
        code: 'figma-auth-code',
        codeVerifier: '', // Not used
        redirectUri: 'https://test-server.com/auth/callback/figma',
      };

      it('should exchange code for tokens with form-encoded body', async () => {
        const mockResponse = {
          access_token: 'figma-access-token',
          refresh_token: 'figma-refresh-token',
          expires_in: 7776000,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await performTokenExchange(config, params);

        expect(result.access_token).toBe('figma-access-token');
        expect(global.fetch).toHaveBeenCalledWith(
          config.tokenUrl,
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          })
        );

        // Check that body is form-encoded
        const callBody = (global.fetch as jest.Mock).mock.calls[0][1].body;
        expect(callBody).toContain('grant_type=authorization_code');
        expect(callBody).toContain('client_id=figma-client-id');
        expect(callBody).toContain('code=figma-auth-code');
        expect(callBody).not.toContain('code_verifier'); // No PKCE
      });
    });

    describe('Google (Traditional OAuth + Form)', () => {
      const config: TokenExchangeConfig = {
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientIdEnvVar: 'GOOGLE_CLIENT_ID',
        clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
        usePKCE: false,
        contentType: 'form',
        defaultExpiresIn: 3600,
        redirectPath: '/auth/callback/google',
      };

      const params: TokenExchangeParams = {
        code: 'google-auth-code',
        codeVerifier: '',
        redirectUri: 'https://test-server.com/auth/callback/google',
      };

      it('should exchange code for tokens', async () => {
        const mockResponse = {
          access_token: 'google-access-token',
          refresh_token: 'google-refresh-token',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/drive',
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await performTokenExchange(config, params);

        expect(result.access_token).toBe('google-access-token');
        expect(result.scope).toBe('https://www.googleapis.com/auth/drive');
      });
    });
  });

  describe('performTokenRefresh', () => {
    describe('Atlassian (JSON + Token Rotation)', () => {
      const config: TokenRefreshConfig = {
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        clientIdEnvVar: 'JIRA_CLIENT_ID',
        clientSecretEnvVar: 'JIRA_CLIENT_SECRET',
        contentType: 'json',
        rotatesRefreshToken: true,
        defaultExpiresIn: 3600,
      };

      const params: RefreshTokenParams = {
        refreshToken: 'old-refresh-token',
      };

      it('should refresh token and return NEW refresh token', async () => {
        const mockResponse = {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token', // Atlassian rotates
          expires_in: 3600,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await performTokenRefresh(config, params);

        expect(result.access_token).toBe('new-access-token');
        expect(result.refresh_token).toBe('new-refresh-token'); // NEW token
        expect(global.fetch).toHaveBeenCalledWith(
          config.tokenUrl,
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grant_type: 'refresh_token',
              client_id: 'atlassian-client-id',
              client_secret: 'atlassian-client-secret',
              refresh_token: params.refreshToken,
            }),
          })
        );
      });

      it('should handle network errors', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection timeout'));

        await expect(performTokenRefresh(config, params)).rejects.toThrow(
          'Network error refreshing ATLASSIAN token: Connection timeout'
        );
      });

      it('should handle HTTP 401 errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 401,
          text: async () => 'Invalid refresh token',
        });

        await expect(performTokenRefresh(config, params)).rejects.toThrow(
          'ATLASSIAN token refresh failed (401): Invalid refresh token'
        );
      });
    });

    describe('Figma (Form + Basic Auth + Token Preservation)', () => {
      const config: TokenRefreshConfig = {
        tokenUrl: 'https://api.figma.com/v1/oauth/refresh',
        clientIdEnvVar: 'FIGMA_CLIENT_ID',
        clientSecretEnvVar: 'FIGMA_CLIENT_SECRET',
        contentType: 'form',
        useBasicAuth: true,
        rotatesRefreshToken: false,
        defaultExpiresIn: 7776000,
      };

      const params: RefreshTokenParams = {
        refreshToken: 'figma-refresh-token',
      };

      it('should refresh token with Basic Auth and preserve refresh token', async () => {
        const mockResponse = {
          access_token: 'new-figma-access-token',
          expires_in: 7776000,
          // No refresh_token in response - Figma doesn't rotate
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await performTokenRefresh(config, params);

        expect(result.access_token).toBe('new-figma-access-token');
        expect(result.refresh_token).toBe('figma-refresh-token'); // ORIGINAL token preserved

        // Verify Basic Auth header
        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const headers = fetchCall[1].headers;
        const expectedAuth = Buffer.from('figma-client-id:figma-client-secret').toString('base64');
        expect(headers['Authorization']).toBe(`Basic ${expectedAuth}`);

        // Verify form-encoded body
        const body = fetchCall[1].body;
        expect(body).toBe('refresh_token=figma-refresh-token');
      });

      it('should return original token even if response includes one', async () => {
        // Edge case: response includes refresh_token but config says don't rotate
        const mockResponse = {
          access_token: 'new-access',
          refresh_token: 'should-be-ignored',
          expires_in: 7776000,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await performTokenRefresh(config, params);
        expect(result.refresh_token).toBe('figma-refresh-token'); // Original preserved
      });
    });

    describe('Google (Form + Token Preservation)', () => {
      const config: TokenRefreshConfig = {
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientIdEnvVar: 'GOOGLE_CLIENT_ID',
        clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
        contentType: 'form',
        rotatesRefreshToken: false,
        defaultExpiresIn: 3600,
      };

      const params: RefreshTokenParams = {
        refreshToken: 'google-refresh-token',
      };

      it('should refresh token and preserve refresh token', async () => {
        const mockResponse = {
          access_token: 'new-google-access-token',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/drive',
          // No refresh_token - Google doesn't rotate
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await performTokenRefresh(config, params);

        expect(result.access_token).toBe('new-google-access-token');
        expect(result.refresh_token).toBe('google-refresh-token'); // ORIGINAL token
        expect(result.scope).toBe('https://www.googleapis.com/auth/drive');

        // Verify form body includes all required fields
        const body = (global.fetch as jest.Mock).mock.calls[0][1].body;
        expect(body).toContain('client_id=google-client-id');
        expect(body).toContain('client_secret=google-client-secret');
        expect(body).toContain('refresh_token=google-refresh-token');
        expect(body).toContain('grant_type=refresh_token');

        // Verify NO Basic Auth
        const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
        expect(headers['Authorization']).toBeUndefined();
      });
    });

    describe('Token Rotation Logic', () => {
      it('should return provider refresh token when rotatesRefreshToken=true', async () => {
        const config: TokenRefreshConfig = {
          tokenUrl: 'https://auth.atlassian.com/oauth/token',
          clientIdEnvVar: 'JIRA_CLIENT_ID',
          clientSecretEnvVar: 'JIRA_CLIENT_SECRET',
          contentType: 'json',
          rotatesRefreshToken: true,
          defaultExpiresIn: 3600,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({
            access_token: 'new-access',
            refresh_token: 'rotated-refresh-token',
            expires_in: 3600,
          }),
        });

        const result = await performTokenRefresh(config, {
          refreshToken: 'old-refresh-token',
        });

        expect(result.refresh_token).toBe('rotated-refresh-token');
      });

      it('should return original refresh token when rotatesRefreshToken=false', async () => {
        const config: TokenRefreshConfig = {
          tokenUrl: 'https://api.figma.com/v1/oauth/refresh',
          clientIdEnvVar: 'FIGMA_CLIENT_ID',
          clientSecretEnvVar: 'FIGMA_CLIENT_SECRET',
          contentType: 'form',
          useBasicAuth: true,
          rotatesRefreshToken: false,
          defaultExpiresIn: 7776000,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({
            access_token: 'new-access',
            // No refresh_token in response
            expires_in: 7776000,
          }),
        });

        const result = await performTokenRefresh(config, {
          refreshToken: 'preserved-refresh-token',
        });

        expect(result.refresh_token).toBe('preserved-refresh-token');
      });

      it('should prefer original token when rotatesRefreshToken=false even if provider returns one', async () => {
        const config: TokenRefreshConfig = {
          tokenUrl: 'https://oauth2.googleapis.com/token',
          clientIdEnvVar: 'GOOGLE_CLIENT_ID',
          clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
          contentType: 'form',
          rotatesRefreshToken: false,
          defaultExpiresIn: 3600,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({
            access_token: 'new-access',
            refresh_token: 'unexpected-new-token', // Provider shouldn't return this
            expires_in: 3600,
          }),
        });

        const result = await performTokenRefresh(config, {
          refreshToken: 'original-token',
        });

        // Should still use original, not the one from provider
        expect(result.refresh_token).toBe('original-token');
      });
    });

    describe('Default Values', () => {
      it('should use default expires_in when not provided', async () => {
        const config: TokenRefreshConfig = {
          tokenUrl: 'https://auth.atlassian.com/oauth/token',
          clientIdEnvVar: 'JIRA_CLIENT_ID',
          clientSecretEnvVar: 'JIRA_CLIENT_SECRET',
          contentType: 'json',
          rotatesRefreshToken: true,
          defaultExpiresIn: 7200,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({
            access_token: 'token',
            refresh_token: 'refresh',
            // No expires_in
          }),
        });

        const result = await performTokenRefresh(config, {
          refreshToken: 'refresh-token',
        });

        expect(result.expires_in).toBe(7200);
      });

      it('should default to Bearer for token_type', async () => {
        const config: TokenRefreshConfig = {
          tokenUrl: 'https://auth.atlassian.com/oauth/token',
          clientIdEnvVar: 'JIRA_CLIENT_ID',
          clientSecretEnvVar: 'JIRA_CLIENT_SECRET',
          contentType: 'json',
          rotatesRefreshToken: true,
        };

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => ({
            access_token: 'token',
            refresh_token: 'refresh',
            // No token_type
          }),
        });

        const result = await performTokenRefresh(config, {
          refreshToken: 'refresh-token',
        });

        expect(result.token_type).toBe('Bearer');
      });
    });
  });
});
