/**
 * Browser-based OAuth Client Provider for MCP
 * 
 * Implements the OAuthClientProvider interface from MCP SDK for browser environments.
 * Handles PKCE flow, token storage in localStorage (persists across refreshes), and dynamic client registration.
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { 
  OAuthClientMetadata, 
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthTokens 
} from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * Storage keys prefixed by server URL to support multiple servers
 */
function getStorageKey(serverUrl: string, key: string): string {
  // Create a safe key from the server URL
  const safeUrl = serverUrl.replace(/[^a-zA-Z0-9]/g, '_');
  return `mcp_${safeUrl}_${key}`;
}

/**
 * Browser OAuth Client Provider
 * 
 * Stores OAuth tokens and client info in localStorage (persists across page refreshes).
 * Stores code_verifier in sessionStorage (security-sensitive, cleared when browser closes).
 * Supports dynamic client registration per RFC 7591.
 */
export class BrowserOAuthClientProvider implements OAuthClientProvider {
  private _serverUrl: string;

  constructor(serverUrl: string) {
    this._serverUrl = serverUrl;
  }

  /**
   * Get the server URL this provider is configured for
   */
  get serverUrl(): string {
    return this._serverUrl;
  }

  /**
   * Redirect URL for OAuth callback - uses root path only
   * The specific return location is encoded in the state parameter
   */
  get redirectUrl(): string {
    return window.location.origin + '/';
  }

  /**
   * OAuth client metadata for dynamic registration
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none', // Public client
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'CascadeMCP Browser Client',
      client_uri: window.location.origin,
    };
  }

  /**
   * Generate OAuth state parameter with CSRF token AND return URL
   * This allows us to restore the user's exact location after OAuth completes
   * 
   * Per RFC 6749 Section 10.12: State parameter prevents CSRF attacks
   * Extended pattern: Encode additional data (returnUrl) alongside CSRF nonce
   */
  state(): string {
    // Generate CSRF token
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const csrfToken = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    
    // Encode current location (full URL including path, hash, query)
    const returnUrl = window.location.href;
    
    // Create state object and base64 encode it
    const stateObj = {
      csrf: csrfToken,
      returnUrl: returnUrl
    };
    
    return btoa(JSON.stringify(stateObj));
  }

  /**
   * Decode state parameter to extract return URL
   * @param state - Base64 encoded state from OAuth callback
   * @returns Decoded state with csrf and returnUrl
   */
  static decodeState(state: string): { csrf: string; returnUrl: string } | null {
    try {
      const decoded = JSON.parse(atob(state));
      if (decoded.csrf && decoded.returnUrl) {
        return decoded;
      }
      return null;
    } catch {
      console.error('[OAuth Provider] Failed to decode state parameter');
      return null;
    }
  }

  /**
   * Load stored client information (from dynamic registration)
   */
  clientInformation(): OAuthClientInformation | undefined {
    const key = getStorageKey(this.serverUrl, 'client_info');
    const stored = localStorage.getItem(key);
    console.log('[OAuth Provider] 📋 clientInformation() called:', { key, hasStored: !!stored });
    if (!stored) return undefined;
    
    try {
      const parsed = JSON.parse(stored) as OAuthClientInformation;
      console.log('[OAuth Provider] 📋 clientInformation() returning:', { client_id: parsed.client_id });
      return parsed;
    } catch {
      console.log('[OAuth Provider] ❌ clientInformation() parse error');
      return undefined;
    }
  }

  /**
   * Save client information after dynamic registration
   */
  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    const key = getStorageKey(this.serverUrl, 'client_info');
    console.log('[OAuth Provider] 💾 saveClientInformation() called:', { key, client_id: clientInformation.client_id });
    localStorage.setItem(key, JSON.stringify(clientInformation));
  }

  /**
   * Load stored OAuth tokens
   */
  tokens(): OAuthTokens | undefined {
    const key = getStorageKey(this.serverUrl, 'tokens');
    const stored = localStorage.getItem(key);
    console.log('[OAuth Provider] 🔑 tokens() called:', { key, hasStored: !!stored });
    if (!stored) return undefined;
    
    try {
      const parsed = JSON.parse(stored) as OAuthTokens;
      console.log('[OAuth Provider] 🔑 tokens() returning:', { hasAccessToken: !!parsed.access_token });
      return parsed;
    } catch {
      console.log('[OAuth Provider] ❌ tokens() parse error');
      return undefined;
    }
  }

  /**
   * Save OAuth tokens after successful authorization
   */
  saveTokens(tokens: OAuthTokens): void {
    const key = getStorageKey(this.serverUrl, 'tokens');
    console.log('[OAuth Provider] 💾 saveTokens() called:', { 
      key, 
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token 
    });
    localStorage.setItem(key, JSON.stringify(tokens));
  }

  /**
   * Redirect to authorization URL
   */
  redirectToAuthorization(authorizationUrl: URL): void {
    console.log('[OAuth Provider] ↪️ redirectToAuthorization() called:', authorizationUrl.toString());
    window.location.href = authorizationUrl.toString();
  }

  /**
   * Save PKCE code verifier before redirect
   */
  saveCodeVerifier(codeVerifier: string): void {
    const key = getStorageKey(this.serverUrl, 'code_verifier');
    console.log('[OAuth Provider] 💾 saveCodeVerifier() called:', { key, verifierLength: codeVerifier.length });
    sessionStorage.setItem(key, codeVerifier);
  }

  /**
   * Load PKCE code verifier after redirect
   */
  codeVerifier(): string {
    const key = getStorageKey(this.serverUrl, 'code_verifier');
    const verifier = sessionStorage.getItem(key);
    console.log('[OAuth Provider] 🔐 codeVerifier() called:', { key, hasVerifier: !!verifier });
    if (!verifier) {
      throw new Error('No code verifier found - OAuth flow may have been interrupted');
    }
    return verifier;
  }

  /**
   * Invalidate stored credentials
   */
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): void {
    if (scope === 'all' || scope === 'tokens') {
      localStorage.removeItem(getStorageKey(this.serverUrl, 'tokens'));
    }
    if (scope === 'all' || scope === 'client') {
      localStorage.removeItem(getStorageKey(this.serverUrl, 'client_info'));
    }
    if (scope === 'all' || scope === 'verifier') {
      // code_verifier stays in sessionStorage for security
      sessionStorage.removeItem(getStorageKey(this.serverUrl, 'code_verifier'));
    }
  }

  /**
   * Check if we have valid tokens stored
   */
  hasTokens(): boolean {
    return this.tokens() !== undefined;
  }

  /**
   * Clear all stored data for this server
   */
  clearAll(): void {
    this.invalidateCredentials('all');
  }
}
