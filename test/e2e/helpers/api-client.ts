/**
 * API Client for testing REST endpoints
 * Provides base configuration and request methods for E2E tests
 */

export interface ApiClientConfig {
  baseUrl: string;
  atlassianToken: string;
  figmaToken: string;
  anthropicToken: string;
  timeout?: number;
}

export class ApiClient {
  private config: Required<ApiClientConfig>;

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
    console.log(`  Headers:`, {
      'X-Atlassian-Token': this.config.atlassianToken?.substring(0, 20) + '...',
      'X-Figma-Token': this.config.figmaToken?.substring(0, 20) + '...',
      'X-Anthropic-Token': this.config.anthropicToken?.substring(0, 20) + '...',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Atlassian-Token': this.config.atlassianToken,
          'X-Figma-Token': this.config.figmaToken,
          'X-Anthropic-Token': this.config.anthropicToken,
        },
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
 */
export function createApiClient(options?: Partial<ApiClientConfig>): ApiClient {
  const baseUrl = options?.baseUrl || process.env.API_BASE_URL || 'http://localhost:3000';
  const atlassianToken = options?.atlassianToken || process.env.ATLASSIAN_TEST_PAT || '';
  const figmaToken = options?.figmaToken || process.env.FIGMA_TEST_PAT || '';
  const anthropicToken = options?.anthropicToken || process.env.ANTHROPIC_API_KEY || '';

  if (!atlassianToken) {
    throw new Error('ATLASSIAN_TEST_PAT environment variable is required');
  }
  if (!figmaToken) {
    throw new Error('FIGMA_TEST_PAT environment variable is required');
  }
  if (!anthropicToken) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  return new ApiClient({
    baseUrl,
    atlassianToken,
    figmaToken,
    anthropicToken,
    ...options,
  });
}
