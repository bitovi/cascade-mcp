/**
 * Server-Side OAuth Authorization Endpoint Factory
 * 
 * Creates authorize endpoints that initiate Server-Side OAuth flows with providers.
 * This is SEPARATE from the MCP PKCE flow - it handles authentication between
 * the bridge server and providers (Atlassian, Figma, etc.).
 * 
 * Key Responsibilities:
 * - Generate code_verifier for provider OAuth (separate from MCP PKCE)
 * - Store Server-Side OAuth session parameters
 * - Redirect to provider's authorization URL
 * 
 * Usage:
 *   app.get('/auth/connect/atlassian', makeAuthorize(atlassianProvider));
 */

import type { Request, Response } from 'express';
import type { OAuthProvider } from '../../providers/provider-interface.js';
import { generateCodeVerifier, generateCodeChallenge } from '../../tokens.js';

/**
 * Creates an authorize endpoint for a specific provider (Server-Side OAuth)
 * Per Q25: Static routes with factory functions
 * 
 * This initiates Server-Side OAuth with the provider (NOT MCP PKCE flow).
 * It generates its OWN code_verifier/code_challenge for the provider OAuth flow.
 * 
 * @param provider - The OAuth provider configuration
 * @returns Express route handler
 */
export function makeAuthorize(provider: OAuthProvider) {
  return async (req: Request, res: Response) => {
    console.log(`\n========== AUTHORIZE START: ${provider.name} ==========`);
    console.log(`[AUTHORIZE] Starting Server-Side OAuth flow for provider: ${provider.name}`);
    console.log(`[AUTHORIZE] Session ID: ${req.sessionID}`);
    console.log(`[AUTHORIZE] Request headers:`, {
      host: req.headers.host,
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
      origin: req.headers.origin,
      referer: req.headers.referer,
      cookie: req.headers.cookie ? 'present' : 'missing'
    });

    // Generate OUR code_verifier for Server-Side OAuth with this provider
    // This is SEPARATE from the MCP client's code_verifier (which is for MCP PKCE flow)
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const codeChallengeMethod = 'S256';

    // Generate state for this provider's OAuth flow
    const state = generateCodeVerifier(); // Random state value

    console.log(`[AUTHORIZE] Generated OAuth parameters:`);
    console.log(`[AUTHORIZE]   - code_verifier: ${codeVerifier.substring(0, 10)}... (length: ${codeVerifier.length})`);
    console.log(`[AUTHORIZE]   - code_challenge: ${codeChallenge.substring(0, 10)}... (length: ${codeChallenge.length})`);
    console.log(`[AUTHORIZE]   - state: ${state.substring(0, 10)}... (length: ${state.length})`);
    console.log(`[AUTHORIZE]   - codeChallengeMethod: ${codeChallengeMethod}`);

    // Store Server-Side OAuth parameters for callback validation
    req.session.provider = provider.name;
    req.session.codeVerifier = codeVerifier; // OUR code_verifier for provider OAuth
    req.session.codeChallenge = codeChallenge;
    req.session.codeChallengeMethod = codeChallengeMethod;
    req.session.state = state;

    console.log(`[AUTHORIZE] Stored in session (ID: ${req.sessionID}):`);
    console.log(`[AUTHORIZE]   - provider: ${req.session.provider}`);
    console.log(`[AUTHORIZE]   - codeVerifier: ${req.session.codeVerifier?.substring(0, 10)}...`);
    console.log(`[AUTHORIZE]   - state: ${req.session.state?.substring(0, 10)}...`);

    const baseUrl = process.env.VITE_AUTH_SERVER_URL!;
    console.log(`[AUTHORIZE] Base URL from env: ${baseUrl}`);

    const redirectUri = `${baseUrl}/auth/callback/${provider.name}`;
    console.log(`[AUTHORIZE] Redirect URI: ${redirectUri}`);

    const authUrl = provider.createAuthUrl({
      redirectUri: redirectUri, // Per Q26: Provider-specific callback
      codeChallenge: codeChallenge,
      codeChallengeMethod: codeChallengeMethod,
      state: state,
      responseType: 'code',
    });

    console.log(`[AUTHORIZE] Full auth URL: ${authUrl.substring(0, 150)}...`);
    console.log(`[AUTHORIZE] Redirecting to ${provider.name} OAuth URL`);
    console.log(`========== AUTHORIZE END: ${provider.name} ==========\n`);

    res.redirect(authUrl);
  };
}
