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
import { sanitizeObjectWithJWTs, jwtVerify, getExpiresInFromJwt } from '../tokens.ts';
import {
  createMultiProviderAccessToken,
  createMultiProviderRefreshToken,
  addProviderTokens,
  type MultiProviderTokens,
} from './token-helpers.ts';
import { atlassianProvider } from '../providers/atlassian/index.ts';
import { figmaProvider } from '../providers/figma/index.ts';
import { googleProvider } from '../providers/google/index.ts';
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
    
    if (refreshPayload.exp && now >= refreshPayload.exp) {
      sendErrorResponse(res, 'invalid_grant', 'Refresh token has expired');
      return;
    }

    // Extract provider refresh tokens from nested structure
    const atlassianRefreshToken = refreshPayload.atlassian?.refresh_token;
    const figmaRefreshToken = refreshPayload.figma?.refresh_token;
    const googleRefreshToken = refreshPayload.google?.refresh_token;

    // Refresh each provider using the provider interface
    let newAtlassianTokens: any = null;
    let newFigmaTokens: any = null;
    let newGoogleTokens: any = null;

    try {
      // Refresh Atlassian if present
      if (atlassianRefreshToken) {
        newAtlassianTokens = await atlassianProvider.refreshAccessToken!({
          refreshToken: atlassianRefreshToken,
        });
      }

      // Refresh Figma if present
      if (figmaRefreshToken) {
        newFigmaTokens = await figmaProvider.refreshAccessToken!({
          refreshToken: figmaRefreshToken,
        });
      }

      // Refresh Google if present
      if (googleRefreshToken) {
        newGoogleTokens = await googleProvider.refreshAccessToken!({
          refreshToken: googleRefreshToken,
        });
      }

      // Check if we refreshed any provider
      if (!newAtlassianTokens && !newFigmaTokens && !newGoogleTokens) {
        console.error(
          '🔄 REFRESH TOKEN FLOW - ERROR: No provider refresh tokens found in JWT'
        );
        sendErrorResponse(
          res,
          'invalid_grant',
          'No provider refresh tokens found'
        );
        return;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        '🔄 REFRESH TOKEN FLOW - ERROR: Provider refresh token exchange failed:',
        {
          error_name: error instanceof Error ? error.constructor.name : 'Unknown',
          error_message: errorMessage,
          is_fetch_error:
            error instanceof Error &&
            (error.name === 'FetchError' ||
              (error as any).code === 'FETCH_ERROR'),
        }
      );
      sendErrorResponse(
        res,
        'invalid_grant',
        'Failed to refresh provider access tokens'
      );
      return;
    }

    // Build multi-provider tokens structure for new JWTs
    const multiProviderTokens: MultiProviderTokens = {};
    addProviderTokens(multiProviderTokens, 'atlassian', newAtlassianTokens);
    addProviderTokens(multiProviderTokens, 'figma', newFigmaTokens);
    addProviderTokens(multiProviderTokens, 'google', newGoogleTokens);

    // Create new access token with refreshed provider tokens
    const newAccessToken = await createMultiProviderAccessToken(
      multiProviderTokens,
      {
        resource: refreshPayload.aud,
        scope: refreshPayload.scope,
        sub: refreshPayload.sub,
        iss: refreshPayload.iss,
      }
    );

    // Create new refresh token (with potentially rotated provider refresh tokens)
    const { refreshToken: newRefreshToken } =
      await createMultiProviderRefreshToken(multiProviderTokens, {
        resource: refreshPayload.aud,
        scope: refreshPayload.scope,
        sub: refreshPayload.sub,
        iss: refreshPayload.iss,
      });

    // Extract expires_in from the JWT's exp claim (respects TEST_SHORT_AUTH_TOKEN_EXP)
    const expiresIn = getExpiresInFromJwt(newAccessToken);

    // Return new tokens
    const responsePayload = {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: refreshPayload.scope,
    };

    // Single summary log for successful refresh
    console.log('🔄 Token refresh successful', {
      client_id,
      providers_refreshed: [
        newAtlassianTokens && 'atlassian',
        newFigmaTokens && 'figma',
        newGoogleTokens && 'google',
      ].filter(Boolean),
      expires_in: expiresIn,
    });

    res.json(responsePayload);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(
      '🔄 REFRESH TOKEN FLOW - FATAL ERROR: Unexpected error during refresh flow:',
      {
        error_name: error instanceof Error ? error.constructor.name : 'Unknown',
        error_message: errorMessage,
      }
    );
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during token refresh',
    });
  }
};
