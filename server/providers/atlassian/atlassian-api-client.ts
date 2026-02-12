/**
 * Atlassian API Client Factory
 * 
 * Creates a pre-configured client for making Atlassian API requests.
 * The access token is captured in the closure, eliminating the need to
 * pass authentication context through function parameters.
 * 
 * Usage:
 *   const client = createAtlassianClient(accessToken);
 *   const response = await client.fetch(url, options);
 */

/**
 * Atlassian API Client interface
 * 
 * Provides methods for making authenticated requests to Atlassian APIs.
 * All methods have the access token pre-configured via closure.
 */
export interface AtlassianClient {
  /**
   * Make an authenticated fetch request to Atlassian API
   * @param url - The full URL to fetch
   * @param options - Standard fetch options (method, body, etc.)
   * @returns Promise resolving to fetch Response
   */
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  
  /**
   * Get the base API URL for a specific cloud ID
   * @param cloudId - The Atlassian cloud ID
   * @returns Base URL for Jira REST API
   */
  getJiraBaseUrl: (cloudId: string) => string;
  
  /**
   * Get the base Confluence API URL for a specific cloud ID
   * @param cloudId - The Atlassian cloud ID
   * @returns Base URL for Confluence REST API v2
   */
  getConfluenceBaseUrl: (cloudId: string) => string;
  
  /**
   * Authentication type used by this client
   */
  authType: 'oauth' | 'pat';
}

/**
 * Create an Atlassian API client with pre-configured authentication
 * 
 * @param accessToken - Atlassian OAuth access token
 * @returns AtlassianClient with token captured in closure
 * 
 * @example
 * ```typescript
 * const client = createAtlassianClient(token);
 * 
 * // Fetch with auth automatically included
 * const response = await client.fetch(
 *   client.getJiraBaseUrl(cloudId) + '/issue/PROJ-123',
 *   { method: 'GET' }
 * );
 * ```
 */
export function createAtlassianClient(accessToken: string): AtlassianClient {
  return {
    authType: 'oauth',
    
    fetch: async (url: string, options: RequestInit = {}) => {
      // Token is captured in this closure!
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
    },
    
    getJiraBaseUrl: (cloudId: string) => {
      return `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`;
    },
    
    getConfluenceBaseUrl: (cloudId: string) => {
      return `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2`;
    },
  };
}

/**
 * Create an Atlassian API client using a Personal Access Token (PAT)
 * 
 * PATs for Atlassian require Basic Authentication. The token should be
 * base64-encoded in the format: base64(email:api_token)
 * 
 * See: https://bitovi.atlassian.net/wiki/spaces/agiletraining/pages/1302462817/How+to+create+a+Jira+Request+token
 * 
 * @param base64Credentials - Base64-encoded string of "email:api_token"
 * @param siteName - Optional site name (e.g., "mycompany" from mycompany.atlassian.net). If not provided, will be set to empty and must be passed via siteUrl parameter in getJiraBaseUrl calls.
 * @returns AtlassianClient with credentials captured in closure
 * 
 * @example
 * ```typescript
 * // Create base64 credentials: echo -n "user@example.com:ATATT..." | base64
 * const credentials = "dXNlckBleGFtcGxlLmNvbTpBVEFUVC4uLg==";
 * const client = createAtlassianClientWithPAT(credentials, "mycompany");
 * 
 * // Fetch with Basic Auth automatically included
 * const response = await client.fetch(
 *   'https://your-site.atlassian.net/rest/api/3/issue/PROJ-123',
 *   { method: 'GET' }
 * );
 * ```
 */
export function createAtlassianClientWithPAT(base64Credentials: string, siteName?: string): AtlassianClient {
  console.log('Creating Atlassian client with PAT (Basic Auth):', {
    hasCredentials: !!base64Credentials,
    credentialsLength: base64Credentials?.length,
    credentialsPrefix: base64Credentials?.substring(0, 20) + '...',
    siteName: siteName || 'not-provided',
  });
  
  return {
    authType: 'pat',
    
    fetch: async (url: string, options: RequestInit = {}) => {
      // Credentials are captured in this closure!
      const headers = {
        ...options.headers,
        'Authorization': `Basic ${base64Credentials}`,
        'Accept': 'application/json',
      };
      
      console.log('🔍 Atlassian PAT fetch call (Basic Auth):', {
        url: url.substring(0, 100) + '...',
        method: options.method || 'GET',
        authMethod: 'Basic',
      });
      
      return fetch(url, {
        ...options,
        headers,
      });
    },
    
    getJiraBaseUrl: (cloudId: string) => {
      // For Basic Auth (PAT), use the direct site URL instead of api.atlassian.com
      if (!siteName) {
        throw new Error('siteName is required when using createAtlassianClientWithPAT. Pass siteName as second parameter.');
      }
      return `https://${siteName}.atlassian.net/rest/api/3`;
    },
    
    getConfluenceBaseUrl: (cloudId: string) => {
      // For Basic Auth (PAT), use the direct site URL instead of api.atlassian.com
      if (!siteName) {
        throw new Error('siteName is required when using createAtlassianClientWithPAT. Pass siteName as second parameter.');
      }
      return `https://${siteName}.atlassian.net/wiki/api/v2`;
    },
  };
}
