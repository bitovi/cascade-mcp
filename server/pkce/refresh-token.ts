/**
 * OAuth 2.0 Refresh Token Grant Handler
 * 
 * This module implements the refresh token grant type that allows MCP clients
 * to obtain new access tokens using refresh tokens. It handles JWT verification,
 * Atlassian token refresh, and new token generation with rotation.
 * 
 * Specifications Implemented:
 * - RFC 6749 Section 6 - Refreshing an Access Token (refresh_token grant)
 * - RFC 6749 Section 10.4 - Refresh Token Security (token rotation)
 * - RFC 7519 - JSON Web Token (JWT) verification and validation
 * - Atlassian OAuth 2.0 refresh token flow integration
 * 
 * Key Responsibilities:
 * - Verify and decode JWT refresh tokens from MCP clients
 * - Validate refresh token expiration and type
 * - Extract embedded Atlassian refresh tokens from JWT payload
 * - Exchange Atlassian refresh tokens for new access tokens
 * - Create new JWT access and refresh tokens (token rotation)
 * - Handle Atlassian API errors and provide OAuth-compliant responses
 * 
 * OAuth Flow Step: Token Refresh
 * Called when MCP client access tokens expire to maintain session continuity.
 */

import { Request, Response } from 'express';
import {
  sanitizeObjectWithJWTs,
  jwtVerify,
} from '../tokens.ts';
import { getAtlassianConfig } from '../atlassian-auth-code-flow.ts';
import {
  createMCPAccessToken,
  createMCPRefreshToken,
  createJiraMCPAuthToken,
  createJiraMCPRefreshToken,
} from './token-helpers.ts';
import type { OAuthHandler, OAuthRequest, OAuthErrorResponse } from './types.ts';

/**
 * Send error response with proper typing
 */
function sendErrorResponse(res: Response, error: string, description: string, statusCode = 400): void {
  const errorResponse: OAuthErrorResponse = {
    error,
    error_description: description,
  };
  res.status(statusCode).json(errorResponse);
}

/**
 * Refresh Token Endpoint
 * Handles OAuth 2.0 refresh token grant for renewing access tokens
 */
export const refreshToken: OAuthHandler = async (req: Request, res: Response): Promise<void> => {
  console.log('↔️ OAuth refresh token request:', {
    body: sanitizeObjectWithJWTs(req.body),
    contentType: req.headers['content-type'],
  });

  try {
    const { grant_type, refresh_token, client_id, scope } = req.body;
    
    console.log('🔄 REFRESH TOKEN FLOW - Starting validation:', {
      grant_type,
      has_refresh_token: !!refresh_token,
      refresh_token_length: refresh_token?.length,
      refresh_token_prefix: refresh_token ? refresh_token.substring(0, 20) + '...' : 'none',
      client_id,
      scope,
      request_headers: Object.keys(req.headers),
    });

    if (grant_type !== 'refresh_token') {
      console.log('🔄 REFRESH TOKEN FLOW - ERROR: Unsupported grant type:', grant_type);
      sendErrorResponse(res, 'unsupported_grant_type', 'Only refresh_token grant type is supported');
      return;
    }

    if (!refresh_token) {
      console.log('🔄 REFRESH TOKEN FLOW - ERROR: Missing refresh token in request body');
      sendErrorResponse(res, 'invalid_request', 'Missing refresh_token');
      return;
    }

    // Verify and decode the refresh token
    let refreshPayload: any;
    console.log('🔄 REFRESH TOKEN FLOW - Attempting to verify JWT refresh token');
    try {
      refreshPayload = await jwtVerify(refresh_token);
      console.log('🔄 REFRESH TOKEN FLOW - JWT verification successful:', {
        type: refreshPayload.type,
        sub: refreshPayload.sub,
        exp: refreshPayload.exp,
        iss: refreshPayload.iss,
        aud: refreshPayload.aud,
        scope: refreshPayload.scope,
        has_atlassian_refresh_token: !!refreshPayload.atlassian_refresh_token,
        atlassian_refresh_token_length: refreshPayload.atlassian_refresh_token?.length,
        atlassian_refresh_token_prefix: refreshPayload.atlassian_refresh_token ? 
          refreshPayload.atlassian_refresh_token.substring(0, 20) + '...' : 'none',
        payload_keys: Object.keys(refreshPayload),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('🔄 REFRESH TOKEN FLOW - ERROR: JWT verification failed:', {
        error_name: error instanceof Error ? error.constructor.name : 'Unknown',
        error_message: errorMessage,
        refresh_token_sample: refresh_token ? refresh_token.substring(0, 50) + '...' : 'none',
      });
      sendErrorResponse(res, 'invalid_grant', 'Invalid or expired refresh token');
      return;
    }

    // Validate it's actually a refresh token
    console.log('🔄 REFRESH TOKEN FLOW - Validating token type:', {
      expected_type: 'refresh_token',
      actual_type: refreshPayload.type,
      type_match: refreshPayload.type === 'refresh_token',
    });
    
    if (refreshPayload.type !== 'refresh_token') {
      console.log('🔄 REFRESH TOKEN FLOW - ERROR: Token is not a refresh token:', {
        type: refreshPayload.type,
        expected: 'refresh_token',
      });
      sendErrorResponse(res, 'invalid_grant', 'Token is not a refresh token');
      return;
    }

    // Check if refresh token is expired
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExp = refreshPayload.exp ? refreshPayload.exp - now : null;
    console.log('🔄 REFRESH TOKEN FLOW - Checking expiration:', {
      current_timestamp: now,
      token_exp: refreshPayload.exp,
      time_until_expiration_seconds: timeUntilExp,
      time_until_expiration_minutes: timeUntilExp ? Math.round(timeUntilExp / 60) : null,
      is_expired: refreshPayload.exp && now >= refreshPayload.exp,
    });
    
    if (refreshPayload.exp && now >= refreshPayload.exp) {
      console.log('🔄 REFRESH TOKEN FLOW - ERROR: Refresh token has expired');
      sendErrorResponse(res, 'invalid_grant', 'Refresh token has expired');
      return;
    }

    // Refresh provider tokens
    const newProviderTokens: Record<string, any> = {};
    let hasAtlassianError = false;
    let hasFigmaError = false;
    let atlassianErrorMessage = '';
    let figmaErrorMessage = '';

    // === Refresh Atlassian Tokens (if present) ===
    if (refreshPayload.atlassian?.refresh_token) {
      try {
        const ATLASSIAN_CONFIG = getAtlassianConfig();
        console.log('🔄 REFRESH TOKEN FLOW - Refreshing Atlassian tokens');

        const atlassianRequestBody = {
          grant_type: 'refresh_token',
          client_id: ATLASSIAN_CONFIG.clientId,
          client_secret: ATLASSIAN_CONFIG.clientSecret,
          refresh_token: refreshPayload.atlassian.refresh_token,
        };

        const tokenRes = await fetch(ATLASSIAN_CONFIG.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(atlassianRequestBody),
        });

        const responseData = await tokenRes.json();

        if (responseData.access_token) {
          newProviderTokens.atlassian = responseData;
          console.log('  🔑 Atlassian refresh successful');
        } else {
          hasAtlassianError = true;
          atlassianErrorMessage = responseData.error_description || 'No access token in response';
          console.error('🔄 REFRESH TOKEN FLOW - Atlassian refresh failed:', {
            error: responseData.error,
            description: responseData.error_description,
          });
        }
      } catch (error) {
        hasAtlassianError = true;
        atlassianErrorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('🔄 REFRESH TOKEN FLOW - Atlassian refresh error:', atlassianErrorMessage);
      }
    }

    // === Refresh Figma Tokens (if present) ===
    if (refreshPayload.figma?.refresh_token) {
      try {
        console.log('🔄 REFRESH TOKEN FLOW - Refreshing Figma tokens');

        // Figma uses different endpoint and auth method than Atlassian
        // POST https://api.figma.com/v1/oauth/refresh
        // With Basic Auth: Authorization: Basic <base64(client_id:client_secret)>
        const clientId = process.env.FIGMA_CLIENT_ID;
        const clientSecret = process.env.FIGMA_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
          throw new Error('Missing FIGMA_CLIENT_ID or FIGMA_CLIENT_SECRET environment variables');
        }

        // Figma uses form-urlencoded body with refresh_token parameter
        const figmaRequestBody = new URLSearchParams({
          refresh_token: refreshPayload.figma.refresh_token,
        });

        // Figma uses Basic Auth (base64(client_id:client_secret))
        const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const tokenRes = await fetch('https://api.figma.com/v1/oauth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authHeader,
          },
          body: figmaRequestBody.toString(),
        });

        const responseData = await tokenRes.json();

        if (responseData.access_token) {
          // CRITICAL: Figma does NOT return a new refresh_token - preserve the original!
          newProviderTokens.figma = {
            access_token: responseData.access_token,
            refresh_token: refreshPayload.figma.refresh_token, // Reuse the original
            token_type: responseData.token_type || 'Bearer',
            expires_in: responseData.expires_in || 7776000, // Figma default: 90 days
            scope: responseData.scope,
          };
          console.log('  🔑 Figma refresh successful (reused original refresh_token)');
        } else {
          hasFigmaError = true;
          figmaErrorMessage = responseData.error_description || responseData.message || 'No access token in response';
          console.error('🔄 REFRESH TOKEN FLOW - Figma refresh failed:', {
            error: responseData.error,
            message: responseData.message,
          });
        }
      } catch (error) {
        hasFigmaError = true;
        figmaErrorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('🔄 REFRESH TOKEN FLOW - Figma refresh error:', figmaErrorMessage);
      }
    }

    // If either provider refresh failed, fail the entire refresh
    // This keeps token state simple: either both succeed or both fail
    if (hasAtlassianError || hasFigmaError) {
      const errors = [];
      if (hasAtlassianError) errors.push(`Atlassian: ${atlassianErrorMessage}`);
      if (hasFigmaError) errors.push(`Figma: ${figmaErrorMessage}`);
      console.error('🔄 REFRESH TOKEN FLOW - FAILURE: One or more providers failed to refresh:', errors.join('; '));
      sendErrorResponse(res, 'invalid_grant', `Token refresh failed: ${errors.join('; ')}`);
      return;
    }

    // Ensure we have at least one provider token
    if (Object.keys(newProviderTokens).length === 0) {
      console.error('🔄 REFRESH TOKEN FLOW - ERROR: No providers in original token to refresh');
      sendErrorResponse(res, 'invalid_grant', 'No provider tokens to refresh');
      return;
    }

    // Create new access token with refreshed provider tokens
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT access token from refreshed provider tokens');
    const newAccessToken = await createMCPAccessToken(newProviderTokens, {
      resource: refreshPayload.aud,
      scope: refreshPayload.scope,
      sub: refreshPayload.sub,
      iss: refreshPayload.iss
    });
    console.log('🔄 REFRESH TOKEN FLOW - New JWT access token created:', {
      token_length: newAccessToken?.length,
      token_prefix: newAccessToken ? newAccessToken.substring(0, 20) + '...' : 'none',
    });

    // Create new refresh token with provider refresh tokens
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT refresh token');
    const { refreshToken: newRefreshToken } = await createMCPRefreshToken(newProviderTokens, {
      resource: refreshPayload.aud,
      scope: refreshPayload.scope,
      sub: refreshPayload.sub,
      iss: refreshPayload.iss
    });
    console.log('🔄 REFRESH TOKEN FLOW - New JWT refresh token created:', {
      token_length: newRefreshToken?.length,
      token_prefix: newRefreshToken ? newRefreshToken.substring(0, 20) + '...' : 'none',
    });

    console.log('🔄 REFRESH TOKEN FLOW - SUCCESS: OAuth refresh token exchange successful for client:', client_id);

    // Return new tokens
    // Calculate expires_in from the earliest provider expiration
    let minExpiresIn = 3600; // Default 1 hour
    if (newProviderTokens.atlassian?.expires_in) {
      minExpiresIn = Math.min(minExpiresIn, newProviderTokens.atlassian.expires_in);
    }
    if (newProviderTokens.figma?.expires_in) {
      minExpiresIn = Math.min(minExpiresIn, newProviderTokens.figma.expires_in);
    }
    const jwtExpiresIn = Math.max(60, minExpiresIn - 60);
    const responsePayload = {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: jwtExpiresIn,
      refresh_token: newRefreshToken,
      scope: refreshPayload.scope,
    };
    
    console.log('🔄 REFRESH TOKEN FLOW - Final response:', {
      has_access_token: !!responsePayload.access_token,
      has_refresh_token: !!responsePayload.refresh_token,
      expires_in: responsePayload.expires_in,
      token_type: responsePayload.token_type,
      scope: responsePayload.scope,
    });
    
    res.json(responsePayload);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('🔄 REFRESH TOKEN FLOW - FATAL ERROR: Unexpected error during refresh flow:', {
      error_name: error instanceof Error ? error.constructor.name : 'Unknown',
      error_message: errorMessage,
    });
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during token refresh',
    });
  }
};
