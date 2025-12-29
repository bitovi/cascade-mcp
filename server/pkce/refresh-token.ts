/**
 * OAuth 2.0 Refresh Token Grant Handler
 *
 * This module implements the refresh token grant type that allows MCP clients
 * to obtain new access tokens using refresh tokens. It handles JWT verification,
 * multi-provider token refresh, and new token generation with rotation.
 *
 * Specifications Implemented:
 * - RFC 6749 Section 6 - Refreshing an Access Token (refresh_token grant)
 * - RFC 6749 Section 10.4 - Refresh Token Security (token rotation)
 * - RFC 7519 - JSON Web Token (JWT) verification and validation
 * - Atlassian OAuth 2.0 refresh token flow integration
 * - Figma OAuth 2.0 refresh token flow integration
 *
 * Key Responsibilities:
 * - Verify and decode JWT refresh tokens from MCP clients
 * - Validate refresh token expiration and type
 * - Extract embedded provider refresh tokens from nested JWT payload
 * - Exchange provider refresh tokens for new access tokens (Atlassian + Figma)
 * - Preserve Figma refresh token (no rotation, reuse original)
 * - Handle Atlassian rotating refresh tokens (save new token)
 * - Create new JWT access and refresh tokens (token rotation)
 * - Fail entire refresh if ANY provider refresh fails
 * - Handle provider API errors and provide OAuth-compliant responses
 *
 * OAuth Flow Step: Token Refresh
 * Called when MCP client access tokens expire to maintain session continuity.
 *
 * Multi-Provider Notes:
 * - Atlassian: POST https://auth.atlassian.com/oauth/token, returns new refresh_token
 * - Figma: POST https://api.figma.com/v1/oauth/refresh (HTTP Basic Auth), returns only access_token
 * - If both providers in JWT, must refresh BOTH or FAIL the entire refresh
 */

import { Request, Response } from 'express';
import {
  sanitizeObjectWithJWTs,
  jwtVerify,
} from '../tokens.ts';
import {
  getAtlassianConfig,
  type AtlassianTokenResponse
} from '../atlassian-auth-code-flow.ts';
import {
  createMCPAccessToken,
  createMCPRefreshToken,
  type MultiProviderTokens,
  type ProviderTokenData,
} from './token-helpers.ts';
import {
  refreshFigmaToken,
} from '../providers/figma/figma-helpers.ts';
import type { OAuthHandler, OAuthErrorResponse } from './types.ts';

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
 * Extract provider credentials from nested JWT payload
 * JWT payload structure: { atlassian: { refresh_token }, figma: { refresh_token }, ... }
 */
function extractProviderTokensFromJWT(jwtPayload: any): {
  atlassianRefreshToken?: string;
  figmaRefreshToken?: string;
} {
  return {
    atlassianRefreshToken: jwtPayload.atlassian?.refresh_token,
    figmaRefreshToken: jwtPayload.figma?.refresh_token,
  };
}

/**
 * Refresh Atlassian token using refresh token
 */
async function refreshAtlassianToken(
  refreshToken: string
): Promise<AtlassianTokenResponse> {
  const ATLASSIAN_CONFIG = getAtlassianConfig();

  console.log('🔄 ATLASSIAN REFRESH - Making request to Atlassian token endpoint:', {
    atlassian_token_url: ATLASSIAN_CONFIG.tokenUrl,
    atlassian_client_id: ATLASSIAN_CONFIG.clientId,
    has_client_secret: !!ATLASSIAN_CONFIG.clientSecret,
    has_refresh_token: !!refreshToken,
    refresh_token_length: refreshToken?.length,
    refresh_token_prefix: refreshToken ? refreshToken.substring(0, 20) + '...' : 'none',
  });

  const atlassianRequestBody = {
    grant_type: 'refresh_token',
    client_id: ATLASSIAN_CONFIG.clientId,
    client_secret: ATLASSIAN_CONFIG.clientSecret,
    refresh_token: refreshToken,
  };

  try {
    const tokenRes = await fetch(ATLASSIAN_CONFIG.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(atlassianRequestBody),
    });

    console.log('🔄 ATLASSIAN REFRESH - Response received:', {
      status: tokenRes.status,
      status_text: tokenRes.statusText,
      ok: tokenRes.ok,
    });

    const newTokens = await tokenRes.json() as any;

    console.log('🔄 ATLASSIAN REFRESH - Response body:', {
      has_access_token: !!newTokens.access_token,
      has_refresh_token: !!newTokens.refresh_token,
      expires_in: newTokens.expires_in,
      error: newTokens.error,
      error_description: newTokens.error_description,
    });

    if (!newTokens.access_token) {
      throw new Error(`Atlassian refresh failed: ${newTokens.error || 'No access_token in response'}`);
    }

    console.log('🔄 ATLASSIAN REFRESH - Success');
    return newTokens;
  } catch (error: any) {
    console.error('🔄 ATLASSIAN REFRESH - ERROR:', {
      error_name: error instanceof Error ? error.constructor.name : 'Unknown',
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Refresh Figma token using refresh token
 * Important: Figma does not return a new refresh_token - the original must be preserved
 */
async function refreshFigmaTokenWithPreserved(
  clientId: string,
  clientSecret: string,
  currentRefreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  console.log('🔄 FIGMA REFRESH - Starting Figma token refresh');

  try {
    const { access_token, expires_in } = await refreshFigmaToken(
      clientId,
      clientSecret,
      currentRefreshToken
    );

    // CRITICAL: Figma does NOT return a new refresh_token
    // We must preserve the original refresh_token from the request
    console.log('🔄 FIGMA REFRESH - Preserving original refresh_token (Figma does not rotate)');

    return {
      access_token,
      refresh_token: currentRefreshToken, // Reuse original
      expires_in,
    };
  } catch (error: any) {
    console.error('🔄 FIGMA REFRESH - ERROR:', {
      error_name: error instanceof Error ? error.constructor.name : 'Unknown',
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Refresh Token Endpoint
 * Handles OAuth 2.0 refresh token grant for renewing access tokens
 *
 * Multi-provider behavior:
 * - If JWT has Atlassian refresh token: refresh with Atlassian
 * - If JWT has Figma refresh token: refresh with Figma
 * - If JWT has both: refresh BOTH, fail entire request if ANY fails
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
        has_atlassian: !!refreshPayload.atlassian,
        has_figma: !!refreshPayload.figma,
        payload_keys: Object.keys(refreshPayload),
      });
    } catch (error: any) {
      console.error('🔄 REFRESH TOKEN FLOW - ERROR: JWT verification failed:', {
        error_name: error instanceof Error ? error.constructor.name : 'Unknown',
        error_message: error instanceof Error ? error.message : String(error),
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

    // Extract provider tokens from JWT
    const { atlassianRefreshToken, figmaRefreshToken } = extractProviderTokensFromJWT(refreshPayload);
    console.log('🔄 REFRESH TOKEN FLOW - Extracted provider tokens from JWT:', {
      has_atlassian_refresh_token: !!atlassianRefreshToken,
      has_figma_refresh_token: !!figmaRefreshToken,
    });

    if (!atlassianRefreshToken && !figmaRefreshToken) {
      console.log('🔄 REFRESH TOKEN FLOW - ERROR: No provider refresh tokens in JWT');
      sendErrorResponse(res, 'invalid_grant', 'No provider tokens available for refresh');
      return;
    }

    // Refresh provider tokens
    const newProviderTokens: MultiProviderTokens = {};

    // Refresh Atlassian if present
    if (atlassianRefreshToken) {
      console.log('🔄 REFRESH TOKEN FLOW - Refreshing Atlassian token');
      try {
        const newAtlassianTokens = await refreshAtlassianToken(atlassianRefreshToken);
        newProviderTokens.atlassian = newAtlassianTokens as ProviderTokenData;
        console.log('🔄 REFRESH TOKEN FLOW - Atlassian refresh successful');
      } catch (error: any) {
        console.error('🔄 REFRESH TOKEN FLOW - ERROR: Atlassian refresh failed:', {
          error_message: error instanceof Error ? error.message : String(error),
        });
        sendErrorResponse(res, 'invalid_grant', 'Failed to refresh Atlassian access token');
        return;
      }
    }

    // Refresh Figma if present
    if (figmaRefreshToken) {
      console.log('🔄 REFRESH TOKEN FLOW - Refreshing Figma token');
      try {
        const FIGMA_CONFIG = {
          clientId: process.env.VITE_FIGMA_CLIENT_ID,
          clientSecret: process.env.FIGMA_CLIENT_SECRET,
        };

        if (!FIGMA_CONFIG.clientId || !FIGMA_CONFIG.clientSecret) {
          throw new Error('Figma OAuth credentials not configured');
        }

        const newFigmaTokens = await refreshFigmaTokenWithPreserved(
          FIGMA_CONFIG.clientId,
          FIGMA_CONFIG.clientSecret,
          figmaRefreshToken
        );
        newProviderTokens.figma = newFigmaTokens as ProviderTokenData;
        console.log('🔄 REFRESH TOKEN FLOW - Figma refresh successful');
      } catch (error: any) {
        console.error('🔄 REFRESH TOKEN FLOW - ERROR: Figma refresh failed:', {
          error_message: error instanceof Error ? error.message : String(error),
        });
        sendErrorResponse(res, 'invalid_grant', 'Failed to refresh Figma access token');
        return;
      }
    }

    // Create new access token with refreshed provider tokens
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT access token');
    const newAccessToken = await createMCPAccessToken(newProviderTokens, {
      resource: refreshPayload.aud,
      scope: refreshPayload.scope,
      sub: refreshPayload.sub,
      iss: refreshPayload.iss,
    });
    console.log('🔄 REFRESH TOKEN FLOW - New JWT access token created:', {
      token_length: newAccessToken?.length,
      token_prefix: newAccessToken ? newAccessToken.substring(0, 20) + '...' : 'none',
    });

    // Create new refresh token (both providers may have new refresh tokens)
    // Atlassian: rotating refresh token (new token returned)
    // Figma: reused refresh token (original preserved above)
    console.log('🔄 REFRESH TOKEN FLOW - Creating new JWT refresh token');
    const { refreshToken: newRefreshToken } = await createMCPRefreshToken(newProviderTokens, {
      resource: refreshPayload.aud,
      scope: refreshPayload.scope,
      sub: refreshPayload.sub,
      iss: refreshPayload.iss,
    });
    console.log('🔄 REFRESH TOKEN FLOW - New JWT refresh token created:', {
      token_length: newRefreshToken?.length,
      token_prefix: newRefreshToken ? newRefreshToken.substring(0, 20) + '...' : 'none',
    });

    console.log('🔄 REFRESH TOKEN FLOW - SUCCESS: OAuth refresh token exchange successful for client:', client_id);

    // Determine expiration time from provider tokens
    let expiresIn = 3600; // Default 1 hour
    if (newProviderTokens.atlassian?.expires_in) {
      expiresIn = Math.max(60, newProviderTokens.atlassian.expires_in - 60);
    }
    if (newProviderTokens.figma?.expires_in) {
      expiresIn = Math.min(expiresIn, Math.max(60, newProviderTokens.figma.expires_in - 60));
    }

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

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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
