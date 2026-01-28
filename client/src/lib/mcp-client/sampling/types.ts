/**
 * Sampling Provider Types
 * 
 * Types for LLM providers that handle MCP sampling requests.
 */

/**
 * Message content from MCP sampling request
 */
export interface SamplingMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  } | {
    type: 'image';
    data: string;
    mimeType: string;
  };
}

/**
 * Sampling request from MCP server
 */
export interface CreateMessageRequest {
  messages: SamplingMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  modelPreferences?: {
    hints?: Array<{ name?: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Sampling response to MCP server
 */
export interface CreateMessageResult {
  role: 'assistant';
  content: {
    type: 'text';
    text: string;
  };
  model: string;
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | string;
}

/**
 * Interface for LLM providers that handle sampling
 */
export interface SamplingProvider {
  name: string;
  createMessage(request: CreateMessageRequest): Promise<CreateMessageResult>;
}
