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

    // Use the Atlassian refresh token to get a new access token
    let newAtlassianTokens: any;
    try {
      const ATLASSIAN_CONFIG = getAtlassianConfig();
      console.log('🔄 REFRESH TOKEN FLOW - Making request to Atlassian token endpoint:', {
        atlassian_token_url: ATLASSIAN_CONFIG.tokenUrl,
        atlassian_client_id: ATLASSIAN_CONFIG.clientId,
        has_client_secret: !!ATLASSIAN_CONFIG.clientSecret,
        client_secret_length: ATLASSIAN_CONFIG.clientSecret?.length,
        atlassian_refresh_token_length: refreshPayload.atlassian_refresh_token?.length,
        atlassian_refresh_token_prefix: refreshPayload.atlassian_refresh_token ? 
          refreshPayload.atlassian_refresh_token.substring(0, 20) + '...' : 'none',
      });
      
      const atlassianRequestBody = {
        grant_type: 'refresh_token',
        client_id: ATLASSIAN_CONFIG.clientId,
        client_secret: ATLASSIAN_CONFIG.clientSecret,
        refresh_token: refreshPayload.atlassian_refresh_token,
      };
      
      console.log('🔄 REFRESH TOKEN FLOW - Atlassian request body:', {
        grant_type: atlassianRequestBody.grant_type,
        client_id: atlassianRequestBody.client_id,
        has_client_secret: !!atlassianRequestBody.client_secret,
        has_refresh_token: !!atlassianRequestBody.refresh_token,
        refresh_token_sample: atlassianRequestBody.refresh_token ? 
          atlassianRequestBody.refresh_token.substring(0, 30) + '...' : 'none',
      });
      
      console.log('  Using Atlassian refresh token to get new access token');
      const tokenRes = await fetch(ATLASSIAN_CONFIG.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(atlassianRequestBody),
      });

      console.log('🔄 REFRESH TOKEN FLOW - Atlassian response received:', {
        status: tokenRes.status,
        status_text: tokenRes.statusText,
        ok: tokenRes.ok,
        headers: Object.fromEntries(tokenRes.headers.entries()),
      });

      newAtlassianTokens = await tokenRes.json();
      
      console.log('🔄 REFRESH TOKEN FLOW - Atlassian response body:', {
        has_access_token: !!(newAtlassianTokens as any).access_token,
        has_refresh_token: !!(newAtlassianTokens as any).refresh_token,
        expires_in: (newAtlassianTokens as any).expires_in,
        token_type: (newAtlassianTokens as any).token_type,
        scope: (newAtlassianTokens as any).scope,
        error: (newAtlassianTokens as any).error,
        error_description: (newAtlassianTokens as any).error_description,
        response_keys: Object.keys(newAtlassianTokens as any),
      });
      
      if (!(newAtlassianTokens as any).access_token) {
        const errorDetails = {
          atlassian_error: (newAtlassianTokens as any).error,
          atlassian_error_description: (newAtlassianTokens as any).error_description,
          full_response: newAtlassianTokens,
          http_status: tokenRes.status,
        };
        console.error('🔄 REFRESH TOKEN FLOW - ERROR: No access token in Atlassian response:', errorDetails);
        throw new Error(`Atlassian refresh failed: ${JSON.stringify(errorDetails)}`);
      }
      
      console.log('  🔑 Atlassian refresh token exchange successful:', sanitizeObjectWithJWTs(newAtlassianTokens));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('🔄 REFRESH TOKEN FLOW - ERROR: Atlassian refresh token exchange failed:', {
        error_name: error instanceof Error ? error.constructor.name : 'Unknown',
        error_message: errorMessage,
        is_fetch_error: error instanceof Error && (error.name === 'FetchError' || (error as any).code === 'FETCH_ERROR'),
      });
      sendErrorResponse(res, 'invalid_grant', 'Failed to refresh Atlassian access token');
      return;
    }

    // Create new access token with new Atlassian tokens
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT access token');
    const newAccessToken = await createJiraMCPAuthToken(newAtlassianTokens, {
      resource: refreshPayload.aud,
      scope: refreshPayload.scope,
      sub: refreshPayload.sub,
      iss: refreshPayload.iss
    });
    console.log('🔄 REFRESH TOKEN FLOW - New JWT access token created:', {
      token_length: newAccessToken?.length,
      token_prefix: newAccessToken ? newAccessToken.substring(0, 20) + '...' : 'none',
    });

    // Create new refresh token (Atlassian always provides a new rotating refresh token)
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT refresh token');
    const { refreshToken: newRefreshToken } = await createJiraMCPRefreshToken(newAtlassianTokens, {
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
    const jwtExpiresIn = Math.max(60, ((newAtlassianTokens as any).expires_in || 3600) - 60);
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
