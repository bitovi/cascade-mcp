/**
 * Figma API Client Factory
 * 
 * Creates a pre-configured client for making Figma API requests.
 * The access token is captured in the closure, eliminating the need to
 * pass authentication context through function parameters.
 * 
 * Usage:
 *   const client = createFigmaClient(accessToken);
 *   const response = await client.fetch(url, options);
 */

/**
 * Figma API Client interface
 * 
 * Provides methods for making authenticated requests to Figma API.
 * All methods have the access token pre-configured via closure.
 */
export interface FigmaClient {
  /**
   * Make an authenticated fetch request to Figma API
   * @param url - The full URL to fetch
   * @param options - Standard fetch options (method, body, etc.)
   * @returns Promise resolving to fetch Response
   */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  
  /**
   * Get the base API URL for Figma
   * @returns Base URL for Figma REST API
   */
  getBaseUrl: () => string;
}

/**
 * Create a Figma API client with pre-configured authentication
 * 
 * @param accessToken - Figma personal access token or OAuth token
 * @returns FigmaClient with token captured in closure
 * 
 * @example
 * ```typescript
 * const client = createFigmaClient(token);
 * 
 * // Fetch with auth automatically included (Authorization Bearer header)
 * const response = await client.fetch(
 *   `${client.getBaseUrl()}/files/${fileKey}/nodes?ids=${nodeId}`,
 *   { method: 'GET' }
 * );
 * ```
 * 
 * @note OAuth tokens use Authorization Bearer, PATs use X-Figma-Token
 * @see https://www.figma.com/developers/api#authentication
 */
export function createFigmaClient(accessToken: string): FigmaClient {
  console.log('Creating Figma client with token:', {
    hasToken: !!accessToken,
    tokenLength: accessToken?.length,
    tokenPreview: accessToken?.substring(0, 10) + '...',
  });
  
  return {
    fetch: async (url: string, options: RequestInit = {}) => {
      // Token is captured in this closure!
      // OAuth tokens use Authorization Bearer header (figu_ prefix)
      // PATs use X-Figma-Token header (figd_ prefix)
      const isOAuthToken = accessToken.startsWith('figu_');
      const headers = {
        ...options.headers,
        ...(isOAuthToken 
          ? { 'Authorization': `Bearer ${accessToken}` }
          : { 'X-Figma-Token': accessToken }
        ),
      };
      
      console.log('🔍 Figma fetch call:', {
        url: url.substring(0, 80) + '...',
        hasToken: !!accessToken,
        tokenInHeader: accessToken?.substring(0, 20) + '...',
        headerType: isOAuthToken ? 'Authorization Bearer' : 'X-Figma-Token',
        allHeaders: Object.keys(headers),
      });
      
      return fetch(url, {
        ...options,
        headers,
      });
    },
    
    getBaseUrl: () => {
      return 'https://api.figma.com/v1';
    },
  };
}
