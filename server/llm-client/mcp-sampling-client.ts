/**
 * MCP Sampling Client Factory
 * 
 * Creates an LLM client that uses MCP's sampling/createMessage endpoint.
 * The tool context (extra) is captured in the closure.
 */

import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { GenerateTextFn, LLMRequest, LLMResponse } from './types.js';

/**
 * Tool context interface (extra parameter from MCP tool handler)
 */
export interface McpToolContext {
  sendRequest: (request: any, schema?: any) => Promise<any>;
  sessionId?: string;
}

/**
 * Create an LLM client that uses MCP sampling
 * 
 * @param context - The tool context (extra parameter) from MCP tool handler
 * @returns GenerateTextFn with context captured in closure
 * 
 * @example
 * ```typescript
 * // Inside a tool handler:
 * async (params, extra) => {
 *   const generateText = createMcpLLMClient(extra);
 *   
 *   const response = await generateText({
 *     messages: [
 *       { role: 'system', content: 'You are a helpful assistant.' },
 *       { role: 'user', content: 'Analyze this design...' }
 *     ],
 *     maxTokens: 8000
 *   });
 *   
 *   console.log(response.text);
 * }
 * ```
 */
export function createMcpLLMClient(context: McpToolContext): GenerateTextFn {
  return async (request: LLMRequest): Promise<LLMResponse> => {
    // Tool context is captured in this closure!
    
    // Build messages array for MCP sampling format
    const mcpMessages: Array<{ role: string; content: any }> = [];
    
    // Extract system prompt if present
    let systemPrompt: string | undefined;
    
    for (const message of request.messages) {
      if (message.role === 'system') {
        // MCP sampling uses separate systemPrompt parameter
        systemPrompt = typeof message.content === 'string' ? message.content : message.content[0]?.text;
      } else {
        // Handle text and multimodal content
        if (typeof message.content === 'string') {
          mcpMessages.push({
            role: message.role,
            content: {
              type: "text",
              text: message.content
            }
          });
        } else {
          // Handle array of content (text and images)
          for (const item of message.content) {
            mcpMessages.push({
              role: message.role,
              content: item
            });
          }
        }
      }
    }
    
    const samplingResponse = await context.sendRequest({
      method: "sampling/createMessage",
      params: {
        messages: mcpMessages,
        modelPreferences: {
          speedPriority: 0.5 // Default speed priority
        },
        systemPrompt,
        maxTokens: request.maxTokens ?? 8000
      }
    }, CreateMessageResultSchema);
    
    // Extract text from MCP response
    const text = samplingResponse.content?.text as string;
    if (!text) {
      throw new Error('No text content received from MCP sampling');
    }
    
    // Map MCP response to standard LLMResponse format
    return {
      text,
      metadata: {
        model: samplingResponse.model,
        finishReason: mapStopReason(samplingResponse.stopReason),
        usage: {
          promptTokens: 0, // MCP doesn't provide this
          completionTokens: 0, // MCP doesn't provide this
          totalTokens: 0 // MCP doesn't provide this
        }
      }
    };
  };
}

/**
 * Map MCP stop reason to standard finish reason
 */
function mapStopReason(stopReason?: string): 'stop' | 'length' | 'tool-calls' | 'error' | 'other' {
  switch (stopReason) {
    case 'end_turn': return 'stop';
    case 'max_tokens': return 'length';
    case 'stop_sequence': return 'stop';
    default: return 'other';
  }
}
