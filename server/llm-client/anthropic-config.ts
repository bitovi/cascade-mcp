/**
 * Anthropic Configuration
 * 
 * Validates and provides default configuration for Anthropic provider integration.
 */

/**
 * Default Anthropic model ID
 */
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Get default configuration for Anthropic provider
 * 
 * @returns Object with default model and other config
 */
export function getAnthropicDefaults() {
  return {
    model: DEFAULT_MODEL
  };
}

/**
 * Get the model to use for Anthropic
 * 
 * Uses LLM_MODEL env var if set, otherwise returns default
 * 
 * @returns The model ID to use
 */
export function getAnthropicModel(): string {
  return process.env.LLM_MODEL || DEFAULT_MODEL;
}

/**
 * Validate Anthropic configuration
 * 
 * Checks that ANTHROPIC_API_KEY is set.
 * Throws descriptive error with setup instructions if missing.
 * 
 * @throws {Error} If ANTHROPIC_API_KEY is not set
 */
export function validateAnthropicConfig(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set.\n' +
      'Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n' +
      'Get your API key from: https://console.anthropic.com/account/keys'
    );
  }
}
