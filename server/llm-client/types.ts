/**
 * LLM Client Types
 * 
 * Common types for LLM (Large Language Model) interactions.
 * These abstractions allow the same code to work with both MCP sampling
 * and direct Anthropic API calls.
 */

/**
 * Message content - either text or multimodal (text + images)
 */
export type MessageContent = string | Array<{
  type: 'text' | 'image';
  text?: string;           // For text content
  data?: string;           // Base64-encoded image data
  mimeType?: string;       // e.g., 'image/png', 'image/jpeg'
}>;

/**
 * A single message in the conversation
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: MessageContent;
}

/**
 * LLM Request configuration
 * 
 * Represents a request to generate text from an LLM using messages format.
 * Maps to both MCP sampling/createMessage and Anthropic messages.create formats.
 */
export interface LLMRequest {
  /**
   * Array of messages in the conversation.
   * For simple text generation, typically: [{ role: 'user', content: 'Your prompt' }]
   * With system prompt: [{ role: 'system', content: 'Instructions' }, { role: 'user', content: 'Your prompt' }]
   */
  messages: Message[];
  
  /**
   * Maximum tokens to generate in the response (default: 8000)
   */
  maxTokens?: number;
  
  /**
   * Temperature for sampling (0-1, default: varies by model)
   */
  temperature?: number;
  
  /**
   * Top-p for nucleus sampling (0-1)
   */
  topP?: number;
  
  /**
   * Model to use (e.g., 'claude-sonnet-4-5-20250929')
   * If not provided, uses LLM_MODEL env var or provider default
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
    finishReason?: 'stop' | 'length' | 'tool-calls' | 'error' | 'other';
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    warnings?: string[];
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
