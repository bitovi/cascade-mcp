/**
 * LLM Client Types
 * 
 * Common types for LLM (Large Language Model) interactions.
 * These abstractions allow the same code to work with both MCP sampling
 * and direct Anthropic API calls.
 */

/**
 * Image content for multimodal requests
 */
export interface LLMImageContent {
  type: 'image';
  data: string;       // Base64-encoded image data
  mimeType: string;   // e.g., 'image/png', 'image/jpeg'
}

/**
 * LLM Request configuration
 * 
 * Represents a request to generate text from an LLM.
 * Maps to both MCP sampling/createMessage and Anthropic messages.create formats.
 */
export interface LLMRequest {
  /**
   * The user's prompt/message
   */
  prompt: string;
  
  /**
   * Optional image to include in the request (for vision models)
   */
  image?: LLMImageContent;
  
  /**
   * System prompt to guide the model's behavior
   */
  systemPrompt?: string;
  
  /**
   * Maximum tokens to generate in the response
   */
  maxTokens?: number;
  
  /**
   * Speed priority (0.0 = max quality, 1.0 = max speed)
   * Only used by MCP sampling, ignored for direct API calls
   */
  speedPriority?: number;
  
  /**
   * Model to use (e.g., 'claude-3-5-sonnet-20241022')
   * Only used for direct API calls, ignored for MCP sampling
   */
  model?: string;
}

/**
 * LLM Response
 * 
 * Represents the generated text response from an LLM.
 */
export interface LLMResponse {
  /**
   * The generated text content
   */
  text: string;
  
  /**
   * Optional metadata about the response
   */
  metadata?: {
    model?: string;
    stopReason?: string;
    tokensUsed?: number;
  };
}

/**
 * Function type for generating text from an LLM
 * 
 * This is the core abstraction - a function that takes a request
 * and returns a promise of the generated text.
 * 
 * Implementations:
 * - MCP: Uses mcp.server.request({ method: "sampling/createMessage" })
 * - Anthropic: Uses anthropic.messages.create()
 */
export type GenerateTextFn = (request: LLMRequest) => Promise<LLMResponse>;
