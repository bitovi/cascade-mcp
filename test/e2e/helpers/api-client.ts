/**
 * API Client for testing REST endpoints
 * Provides base configuration and request methods for E2E tests
 */

export interface ApiClientConfig {
  baseUrl: string;
  atlassianToken: string;
  figmaToken: string;
  headers?: Record<string, string>; // Additional headers (e.g., X-LLM-Provider, X-LLM-Model, etc.)
  timeout?: number;
}

export class ApiClient {
  private config: ApiClientConfig & { timeout: number };

  constructor(config: ApiClientConfig) {
    this.config = {
      timeout: 300000, // 5 minutes for AI processing
      ...config,
    };
  }

  /**
   * Make a POST request to an API endpoint
   */
  async post(endpoint: string, body: object): Promise<Response> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    console.log(`POST ${url}`);
    console.log(`  Body:`, JSON.stringify(body, null, 2));
    
    // Build headers dynamically
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Atlassian-Token': this.config.atlassianToken,
      'X-Figma-Token': this.config.figmaToken,
      ...this.config.headers, // Merge any additional headers
    };
    
    const logHeaders: Record<string, string> = {
      'X-Atlassian-Token': this.config.atlassianToken?.substring(0, 20) + '...',
      'X-Figma-Token': this.config.figmaToken?.substring(0, 20) + '...',
    };
    // Log additional headers (truncate values that look like API keys)
    if (this.config.headers) {
      for (const [key, value] of Object.entries(this.config.headers)) {
        logHeaders[key] = value.length > 20 && (key.toLowerCase().includes('key') || key.toLowerCase().includes('token'))
          ? value.substring(0, 20) + '...'
          : value;
      }
    }
    console.log(`  Headers:`, logHeaders);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      console.log(`  Response: ${response.status} ${response.statusText}`);

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create an API client with defaults from environment variables
 * 
 * Supports multiple LLM providers via:
 * - LLM_PROVIDER env var
 * - LLM_MODEL env var
 * - Provider-specific API key env vars (e.g., LLMCLIENT_OPENAI_API_KEY, ANTHROPIC_API_KEY)
 * 
 * Additional headers can be passed via options.headers or will be built from LLM env vars
 */
export function createApiClient(options?: Partial<ApiClientConfig>): ApiClient {
  const baseUrl = options?.baseUrl || process.env.API_BASE_URL || 'http://localhost:3000';
  const atlassianToken = options?.atlassianToken || process.env.ATLASSIAN_TEST_PAT || '';
  const figmaToken = options?.figmaToken || process.env.FIGMA_TEST_PAT || '';
  
  // Build LLM headers from environment variables if not provided
  const headers: Record<string, string> = { ...options?.headers };
  
  // Add LLM provider headers from env vars if not already in headers
  const llmProvider = process.env.LLM_PROVIDER;
  const llmModel = process.env.LLM_MODEL;
  
  if (llmProvider && !headers['X-LLM-Provider']) {
    headers['X-LLM-Provider'] = llmProvider;
  }
  if (llmModel && !headers['X-LLM-Model']) {
    headers['X-LLM-Model'] = llmModel;
  }
  
  // Try to find API key for the specified provider
  if (llmProvider) {
    const providerUpper = llmProvider.toUpperCase();
    const llmApiKey = process.env[`LLMCLIENT_${providerUpper}_API_KEY`] || process.env[`${providerUpper}_API_KEY`];
    if (llmApiKey) {
      const headerName = `X-LLMClient-${llmProvider.charAt(0).toUpperCase() + llmProvider.slice(1)}-Api-Key`;
      if (!headers[headerName]) {
        headers[headerName] = llmApiKey;
      }
    }
  }

  if (!atlassianToken) {
    throw new Error('ATLASSIAN_TEST_PAT environment variable is required');
  }
  if (!figmaToken) {
    throw new Error('FIGMA_TEST_PAT environment variable is required');
  }

  return new ApiClient({
    baseUrl,
    atlassianToken,
    figmaToken,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    ...options,
  });
}
