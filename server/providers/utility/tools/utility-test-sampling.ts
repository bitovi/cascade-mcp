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
      console.log('utility-test-sampling called', { 
        promptLength: samplePrompt.length,
        hasSystemPrompt: !!systemPrompt,
        maxTokens: maxTokens || 10000
      });

      // Get auth info following standard pattern (even though not strictly needed for sampling)
      const authInfo = getAuthInfoSafe(extra, 'test-sampling');

      try {
        // Send notification before starting
        await extra.sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: "Sending sampling request to agent...",
          },
        });

        console.log('  Sending sampling request to agent...');

        console.log('  Making sampling request to agent', {
          promptPreview: samplePrompt.substring(0, 100),
          systemPrompt: systemPrompt || "You are a helpful assistant.",
          maxTokens: maxTokens || 10000
        });

        // Make the sampling request
        const samplingResponse = await mcp.server.request({
          "method": "sampling/createMessage",
          "params": {
            "messages": [
              {
                "role": "user",
                "content": {
                  "type": "text",
                  "text": samplePrompt
                }
              }
            ],
            "speedPriority": 0.5,
            "systemPrompt": systemPrompt || "You are a helpful assistant.",
            "maxTokens": maxTokens || 10000
          }
        }, CreateMessageResultSchema);

        console.log('  Sampling response received', {
          hasContent: !!samplingResponse.content,
          contentType: samplingResponse.content?.type
        });

        // Extract and validate response content
        const responseText = samplingResponse.content?.text as string;
        if (!responseText) {
          throw new Error('No content received from agent');
        }

        console.log('  Response validated successfully');
        console.log(`  Received response from agent (${responseText.length} characters):`);
        console.log(`  ${responseText}`);

        // Send success notification with full response
        await extra.sendNotification({
          method: "notifications/message",
          params: {
            level: "info",
            data: `Received response from agent (${responseText.length} characters): ${responseText}`,
          },
        });

        // Return success message with full response and character count
        return {
          content: [{
            type: 'text',
            text: `✅ Sampling test successful!\n\nPrompt: "${samplePrompt}"\n\nResponse (${responseText.length} characters):\n${responseText}`
          }]
        };

      } catch (error: any) {
        console.log('  Error during sampling test:', error);
        
        // Serialize full error object for detailed debugging
        const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
        
        console.log('  Error during sampling:', errorDetails);
        
        // Send error notification with full error details
        await extra.sendNotification({
          method: "notifications/message",
          params: {
            level: "error",
            data: `Error during sampling: ${errorDetails}`,
          },
        });
        
        // Return error response with full error details
        return {
          content: [{
            type: 'text',
            text: `❌ Sampling test failed:\n${errorDetails}`
          }]
        };
      }
    },
  );
}
