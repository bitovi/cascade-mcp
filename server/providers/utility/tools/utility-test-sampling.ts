/**
 * Sample Testing Tool
 * 
 * Tests sampling functionality by sending prompts to the agent and logging
 * the interaction process. Sampling allows the MCP service to make requests
 * back to the agent (VS Code Copilot) for processing.
 */

import { z } from 'zod';
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from '../../../mcp-core/mcp-types.ts';
import { getAuthInfoSafe } from '../../../mcp-core/auth-helpers.ts';

/**
 * Tool parameters interface
 */
interface SampleTestingParams {
  samplePrompt: string;
  systemPrompt?: string;
  maxTokens?: number;
}

/**
 * Register the utility-test-sampling tool with the MCP server
 * @param mcp - MCP server instance
 */
export function registerUtilityTestSamplingTool(mcp: McpServer): void {
  mcp.registerTool(
    'utility-test-sampling',
    {
      title: 'Test Sampling',
      description: 'Test sampling functionality by sending prompts to the agent and logging the interaction. Enables testing of basic agent capabilities and inter-MCP tool communication.',
      inputSchema: {
        samplePrompt: z.string()
          .describe('The prompt message to send to the agent. Example: "Provide the answer to 1 + 2 + 3" or "Use your figma mcp service to list available commands"'),
        
        systemPrompt: z.string().optional()
          .describe('Custom system prompt for the agent. Defaults to "You are a helpful assistant."'),
        
        maxTokens: z.number().optional()
          .describe('Maximum tokens for response. Defaults to 10000.'),
      },
    },
    async ({ samplePrompt, systemPrompt, maxTokens }: SampleTestingParams, extra) => {
      console.log('utility-test-sampling called');

      // Get auth info following standard pattern (even though not strictly needed for sampling)
      const authInfo = getAuthInfoSafe(extra, 'test-sampling');

      try {
        // Make the sampling request using extra.sendRequest
        // This is the proper way to send requests from tool handlers back to the client
        // Format per MCP Spec: https://modelcontextprotocol.io/specification/2025-06-18/client/sampling
        const samplingResponse = await extra.sendRequest(
          {
            method: 'sampling/createMessage',
            params: {
              messages: [{
                role: 'user' as const,
                content: {
                  type: 'text' as const,
                  text: samplePrompt
                }
              }],
              modelPreferences: {
                speedPriority: 0.5
              },
              systemPrompt: systemPrompt || "You are a helpful assistant.",
              maxTokens: maxTokens || 10000
            }
          },
          CreateMessageResultSchema
        );

        // Extract response content
        const responseText = samplingResponse.content?.text as string;
        if (!responseText) {
          throw new Error('No content received from agent');
        }

        console.log('  ✅ Sampling successful');

        // Return success message
        return {
          content: [{
            type: 'text',
            text: `✅ Sampling test successful!\n\nPrompt: "${samplePrompt}"\n\nResponse (${responseText.length} characters):\n${responseText}`
          }]
        };

      } catch (error: any) {
        console.log('  ❌ Sampling failed:', error.message);
        
        // Check if this is the "Sampling not supported" error (ChatGPT)
        if (error.code === -32600 && error.message?.includes('Sampling not supported')) {
          return {
            content: [{
              type: 'text',
              text: `❌ Sampling not supported by this MCP client\n\nError Code: -32600\nMessage: ${error.message}`
            }]
          };
        }
        
        // For other errors, provide error details
        return {
          content: [{
            type: 'text',
            text: `❌ Sampling test failed:\n\n${error.message || 'Unknown error'}\n\nError Code: ${error.code || 'N/A'}`
          }]
        };
      }
    },
  );
}
