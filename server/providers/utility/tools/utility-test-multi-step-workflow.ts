/**
 * Multi-Step Workflow Test Tool
 * 
 * Tests how MCP clients behave across complex workflows and suggested subagent usage.
 * 
 * When subAgentCount > 0: returns a multi-part response — the operation as a text block,
 * and the subagent orchestration instructions as an embedded resource reference
 * (prompt://test-multi-step-workflow). This tests whether MCP clients resolve resource
 * references in tool responses.
 * 
 * When subAgentCount === 0 or omitted: waits 5 seconds and returns a random number.
 */

import { z } from 'zod';
import type { McpServer } from '../../../mcp-core/mcp-types.js';

interface MultiStepWorkflowParams {
  subAgentCount?: number;
}

/**
 * Subagent orchestration instructions for the multi-step workflow test.
 * Exported so prompt-resources.ts can register it as prompt://test-multi-step-workflow.
 */
export const TEST_MULTI_STEP_WORKFLOW_PROMPT_TEXT = `# Multi-Step Workflow: Subagent Orchestration

You have received a math operation and a subagent count. Your job is to orchestrate subagents and combine their results.

## Instructions

1. Spawn the number of subagents indicated in the operation context.
2. Each subagent should call \`utility-test-multi-step-workflow\` with \`subAgentCount: 0\`.
   - Each subagent will wait 5 seconds and return a random number (1-100).
3. Collect all the numbers returned by the subagents.
4. Apply the math operation to combine the numbers:
   - **add**: sum all numbers
   - **subtract**: start with the first number and subtract each subsequent one
   - **multiply**: multiply all numbers together
   - **divide**: start with the first number and divide by each subsequent one (round to 2 decimal places)
5. Return the final result to the user clearly.
`;

/**
 * Register the utility-test-multi-step-workflow tool with the MCP server
 */
export function registerUtilityTestMultiStepWorkflowTool(mcp: McpServer): void {
  mcp.registerTool(
    'utility-test-multi-step-workflow',
    {
      title: 'Test Multi-Step Workflow',
      description: 'Tests how MCP clients behave across complex workflows and suggested subagent usage. When called with subAgentCount > 0, returns an operation and a resource reference containing orchestration instructions. When called with 0 or no arguments, waits 5 seconds and returns a number.',
      inputSchema: {
        subAgentCount: z.number().optional()
          .describe('Number of subagents to suggest spawning. When 0 or omitted, waits 5 seconds and returns a number.'),
      },
    },
    async ({ subAgentCount }: MultiStepWorkflowParams) => {
      const count = subAgentCount ?? 0;
      console.log('utility-test-multi-step-workflow called', { subAgentCount: count });

      if (count > 0) {
        // Pick a random math operation for the agent to apply across subagent results
        const operations = ['add', 'subtract', 'multiply', 'divide'];
        const operation = operations[Math.floor(Math.random() * operations.length)];
        console.log(`  Selected operation: ${operation}`);

        // Multi-part response:
        // 1. Operation context as text (the data)
        // 2. Orchestration instructions as an embedded resource reference (tests resource resolution)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Operation: ${operation}\nSubagent count: ${count}`,
            },
            {
              type: 'resource' as const,
              resource: {
                uri: 'prompt://test-multi-step-workflow',
                mimeType: 'text/markdown',
                text: TEST_MULTI_STEP_WORKFLOW_PROMPT_TEXT,
              },
            },
          ],
        };
      }

      // Leaf node: wait 5 seconds and return a random number
      console.log('  Waiting 5 seconds...');
      await sleep(5000);

      const result = Math.floor(Math.random() * 100) + 1;
      console.log(`  Returning number: ${result}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: String(result),
          },
        ],
      };
    },
  );
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
