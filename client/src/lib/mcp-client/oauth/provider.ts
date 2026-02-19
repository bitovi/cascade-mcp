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
   * Redirect URL for OAuth callback - uses current origin
   */
  get redirectUrl(): string {
    return window.location.origin + window.location.pathname;
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
   * Generate a random state parameter for CSRF protection
   */
  state(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
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
   * Preserves current URL query parameters (like ?tool=...) for restoration after OAuth
   */
  redirectToAuthorization(authorizationUrl: URL): void {
    console.log('[OAuth Provider] ↪️ redirectToAuthorization() called:', authorizationUrl.toString());
    
    // Save current URL query parameters before OAuth redirect (excluding OAuth params)
    const currentParams = new URLSearchParams(window.location.search);
    const paramsToPreserve: Record<string, string> = {};
    
    // Preserve non-OAuth parameters (like tool, anthropicKey, etc.)
    for (const [key, value] of currentParams.entries()) {
      if (!['code', 'state', 'error', 'error_description'].includes(key)) {
        paramsToPreserve[key] = value;
      }
    }
    
    if (Object.keys(paramsToPreserve).length > 0) {
      const preserveKey = getStorageKey(this.serverUrl, 'preserved_params');
      console.log('[OAuth Provider] 💾 Preserving URL parameters:', paramsToPreserve);
      sessionStorage.setItem(preserveKey, JSON.stringify(paramsToPreserve));
    }
    
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

  /**
   * Restore URL parameters that were preserved before OAuth redirect
   * Returns the preserved parameters for the caller to apply to the URL
   */
  restorePreservedParams(): Record<string, string> | null {
    const preserveKey = getStorageKey(this.serverUrl, 'preserved_params');
    const stored = sessionStorage.getItem(preserveKey);
    
    if (!stored) {
      console.log('[OAuth Provider] ℹ️ No preserved parameters found');
      return null;
    }
    
    try {
      const params = JSON.parse(stored) as Record<string, string>;
      console.log('[OAuth Provider] 📦 Restoring preserved parameters:', params);
      
      // Clear the stored params so they're only restored once
      sessionStorage.removeItem(preserveKey);
      
      return params;
    } catch {
      console.log('[OAuth Provider] ❌ Failed to parse preserved parameters');
      sessionStorage.removeItem(preserveKey);
      return null;
    }
  }
}
