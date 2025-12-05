/**
 * Provider Errors
 * 
 * Custom error types for LLM provider operations with helpful error messages.
 */

/**
 * Error thrown when a requested provider is not supported
 */
export class UnsupportedProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedProviderError';
    Error.captureStackTrace(this, UnsupportedProviderError);
  }
}

/**
 * Error thrown when provider initialization fails
 */
export class InvalidProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProviderError';
    Error.captureStackTrace(this, InvalidProviderError);
  }
}

/**
 * Error thrown when required credentials are missing
 */
export class MissingCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingCredentialsError';
    Error.captureStackTrace(this, MissingCredentialsError);
  }
}
