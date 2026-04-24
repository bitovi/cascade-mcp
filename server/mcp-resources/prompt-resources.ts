/**
 * MCP Prompt Resources
 * 
 * Registers prompt text as standalone MCP resources. These expose the same
 * prompt instructions that figma-ask-scope-questions-for-page embeds in its response,
 * but as independently readable resources for agents using the workflow pattern.
 * 
 * Both the embedded resources and these MCP resources import from the same
 * shared constants (prompt-constants.ts) to maintain a single source of truth.
 * 
 * Resources:
 * - prompt://frame-analysis — Frame analysis instructions
 * - prompt://scope-synthesis — Cross-screen scope synthesis instructions
 * - prompt://generate-questions — Question generation instructions
 * - prompt://write-story-content — Story writing instructions (for future workflow://write-story)
 * - prompt://test-multi-step-workflow — Subagent orchestration instructions for testing resource resolution
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  FRAME_ANALYSIS_PROMPT_TEXT,
  SCOPE_SYNTHESIS_PROMPT_TEXT,
  QUESTIONS_GENERATION_PROMPT_TEXT,
} from '../providers/figma/tools/figma-ask-scope-questions-for-page/prompt-constants.js';
import { STORY_CONTENT_SYSTEM_PROMPT } from '../providers/combined/tools/write-story/prompt-story-content.js';
import { TEST_MULTI_STEP_WORKFLOW_PROMPT_TEXT } from '../providers/utility/tools/utility-test-multi-step-workflow.js';

export function registerPromptResources(mcp: McpServer): void {
  console.log('    Registering prompt resources');

  // prompt://frame-analysis
  mcp.registerResource(
    'frame-analysis',
    'prompt://frame-analysis',
    {
      description: 'Frame analysis instructions — how to analyze a single Figma frame using its image, context, and semantic XML.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt://frame-analysis',
          mimeType: 'text/markdown',
          text: FRAME_ANALYSIS_PROMPT_TEXT,
        },
      ],
    }),
  );

  // prompt://scope-synthesis
  mcp.registerResource(
    'scope-synthesis',
    'prompt://scope-synthesis',
    {
      description: 'Scope synthesis instructions — how to combine frame analyses into a cross-screen scope analysis.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt://scope-synthesis',
          mimeType: 'text/markdown',
          text: SCOPE_SYNTHESIS_PROMPT_TEXT,
        },
      ],
    }),
  );

  // prompt://generate-questions
  mcp.registerResource(
    'generate-questions',
    'prompt://generate-questions',
    {
      description: 'Question generation instructions — how to produce frame-specific clarifying questions from analyses.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt://generate-questions',
          mimeType: 'text/markdown',
          text: QUESTIONS_GENERATION_PROMPT_TEXT,
        },
      ],
    }),
  );

  // prompt://write-story-content
  mcp.registerResource(
    'write-story-content',
    'prompt://write-story-content',
    {
      description: 'Story writing instructions — how to write or refine a Jira story from hierarchy context.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt://write-story-content',
          mimeType: 'text/markdown',
          text: STORY_CONTENT_SYSTEM_PROMPT,
        },
      ],
    }),
  );

  // prompt://test-multi-step-workflow
  mcp.registerResource(
    'test-multi-step-workflow',
    'prompt://test-multi-step-workflow',
    {
      description:
        'Subagent orchestration instructions for utility-test-multi-step-workflow. ' +
        'Tells the agent how to spawn subagents and combine their numeric results using the given operation.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt://test-multi-step-workflow',
          mimeType: 'text/markdown',
          text: TEST_MULTI_STEP_WORKFLOW_PROMPT_TEXT,
        },
      ],
    }),
  );
}
