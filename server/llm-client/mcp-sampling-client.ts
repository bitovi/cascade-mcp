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
 *     prompt: 'Analyze this design...',
 *     systemPrompt: 'You are a helpful assistant.',
 *     maxTokens: 8000,
 *     speedPriority: 0.5
 *   });
 *   
 *   console.log(response.text);
 * }
 * ```
 */
export function createMcpLLMClient(context: McpToolContext): GenerateTextFn {
  return async (request: LLMRequest): Promise<LLMResponse> => {
    // Tool context is captured in this closure!
    
    // Build messages array
    const messages: Array<{ role: string; content: any }> = [
      {
        role: "user",
        content: {
          type: "text",
          text: request.prompt
        }
      }
    ];
    
    // Add image if provided
    if (request.image) {
      messages.push({
        role: "user",
        content: {
          type: "image",
          data: request.image.data,
          mimeType: request.image.mimeType
        }
      });
    }
    
    const samplingResponse = await context.sendRequest({
      method: "sampling/createMessage",
      params: {
        messages,
        modelPreferences: {
          speedPriority: request.speedPriority ?? 0.5
        },
        systemPrompt: request.systemPrompt,
        maxTokens: request.maxTokens ?? 8000
      }
    }, CreateMessageResultSchema);
    
    // Extract text from MCP response
    const text = samplingResponse.content?.text as string;
    if (!text) {
      throw new Error('No text content received from MCP sampling');
    }
    
    return {
      text,
      metadata: {
        model: samplingResponse.model,
        stopReason: samplingResponse.stopReason,
      }
    };
  };
}
