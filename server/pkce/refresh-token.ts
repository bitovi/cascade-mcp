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
import { sanitizeObjectWithJWTs, jwtVerify, parseJWT } from '../tokens.ts';
import {
  createMultiProviderAccessToken,
  createMultiProviderRefreshToken,
  type MultiProviderTokens,
} from './token-helpers.ts';
import { atlassianProvider } from '../providers/atlassian/index.ts';
import { figmaProvider } from '../providers/figma/index.ts';
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
 * Extract expires_in from a JWT token by decoding its exp claim
 * @param token - JWT token string
 * @returns seconds until expiration, or default 3540 if unable to extract
 */
function getExpiresInFromJwt(token: string): number {
  try {
    const payload = parseJWT(token);
    if (payload.exp && typeof payload.exp === 'number') {
      const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
      return Math.max(0, expiresIn); // Don't return negative
    }
  } catch (err) {
    console.log('  Warning: Could not extract exp from JWT, using default');
  }
  return 3540; // Default fallback
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
        // Check for nested provider structure
        has_atlassian: !!refreshPayload.atlassian,
        has_figma: !!refreshPayload.figma,
        atlassian_has_refresh_token: !!refreshPayload.atlassian?.refresh_token,
        figma_has_refresh_token: !!refreshPayload.figma?.refresh_token,
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

    // Extract provider refresh tokens from nested structure
    const atlassianRefreshToken = refreshPayload.atlassian?.refresh_token;
    const figmaRefreshToken = refreshPayload.figma?.refresh_token;

    console.log('🔄 REFRESH TOKEN FLOW - Provider refresh tokens found:', {
      has_atlassian: !!atlassianRefreshToken,
      has_figma: !!figmaRefreshToken,
    });

    // Refresh each provider using the provider interface
    let newAtlassianTokens: any = null;
    let newFigmaTokens: any = null;

    try {
      // Refresh Atlassian if present
      if (atlassianRefreshToken) {
        console.log('🔄 REFRESH TOKEN FLOW - Refreshing Atlassian tokens');
        newAtlassianTokens = await atlassianProvider.refreshAccessToken!({
          refreshToken: atlassianRefreshToken,
        });
        console.log('🔄 REFRESH TOKEN FLOW - Atlassian refresh successful:', {
          hasAccessToken: !!newAtlassianTokens.access_token,
          hasRefreshToken: !!newAtlassianTokens.refresh_token,
          expiresIn: newAtlassianTokens.expires_in,
        });
      }

      // Refresh Figma if present
      if (figmaRefreshToken) {
        console.log('🔄 REFRESH TOKEN FLOW - Refreshing Figma tokens');
        newFigmaTokens = await figmaProvider.refreshAccessToken!({
          refreshToken: figmaRefreshToken,
        });
        console.log('🔄 REFRESH TOKEN FLOW - Figma refresh successful:', {
          hasAccessToken: !!newFigmaTokens.access_token,
          hasRefreshToken: !!newFigmaTokens.refresh_token,
          expiresIn: newFigmaTokens.expires_in,
        });
      }

      // Check if we refreshed any provider
      if (!newAtlassianTokens && !newFigmaTokens) {
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

    if (newAtlassianTokens) {
      console.log(
        '🔄 REFRESH TOKEN FLOW - Adding refreshed Atlassian tokens to JWT'
      );
      multiProviderTokens.atlassian = {
        access_token: newAtlassianTokens.access_token,
        refresh_token: newAtlassianTokens.refresh_token, // Provider handles rotation
        expires_at:
          Math.floor(Date.now() / 1000) + (newAtlassianTokens.expires_in || 3600),
        scope: newAtlassianTokens.scope,
      };
    }

    if (newFigmaTokens) {
      console.log(
        '🔄 REFRESH TOKEN FLOW - Adding refreshed Figma tokens to JWT'
      );
      multiProviderTokens.figma = {
        access_token: newFigmaTokens.access_token,
        refresh_token: newFigmaTokens.refresh_token, // Provider handles non-rotation
        expires_at:
          Math.floor(Date.now() / 1000) + (newFigmaTokens.expires_in || 7776000),
        scope: newFigmaTokens.scope,
      };
    }

    // Create new access token with refreshed provider tokens
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT access token');
    const newAccessToken = await createMultiProviderAccessToken(
      multiProviderTokens,
      {
        resource: refreshPayload.aud,
        scope: refreshPayload.scope,
        sub: refreshPayload.sub,
        iss: refreshPayload.iss,
      }
    );
    console.log('🔄 REFRESH TOKEN FLOW - New JWT access token created:', {
      token_length: newAccessToken?.length,
      token_prefix: newAccessToken
        ? newAccessToken.substring(0, 20) + '...'
        : 'none',
    });

    // Create new refresh token (with potentially rotated provider refresh tokens)
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT refresh token');
    const { refreshToken: newRefreshToken } =
      await createMultiProviderRefreshToken(multiProviderTokens, {
        resource: refreshPayload.aud,
        scope: refreshPayload.scope,
        sub: refreshPayload.sub,
        iss: refreshPayload.iss,
      });
    console.log('🔄 REFRESH TOKEN FLOW - New JWT refresh token created:', {
      token_length: newRefreshToken?.length,
      token_prefix: newRefreshToken
        ? newRefreshToken.substring(0, 20) + '...'
        : 'none',
    });

    console.log(
      '🔄 REFRESH TOKEN FLOW - SUCCESS: OAuth refresh token exchange successful for client:',
      client_id
    );

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

    console.log('🔄 REFRESH TOKEN FLOW - Final response:', {
      has_access_token: !!responsePayload.access_token,
      has_refresh_token: !!responsePayload.refresh_token,
      expires_in: responsePayload.expires_in,
      token_type: responsePayload.token_type,
      scope: responsePayload.scope,
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
