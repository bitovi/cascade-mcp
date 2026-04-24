/**
 * MCP Workflow Resources
 * 
 * Registers workflow orchestration documents as MCP resources.
 * Workflow resources are static markdown documents that instruct agents
 * how to execute multi-step workflows including subagent parallelization.
 * 
 * Resources:
 * - workflow://review-design — Design review questions workflow
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const REVIEW_DESIGN_WORKFLOW = `# Design Review Questions Workflow

## Overview

This workflow analyzes a Figma page, synthesizes scope across frames,
and generates design review questions. It uses one server call for
all Figma data, then parallelizes frame analysis via local files.

## Inputs
- \`figmaUrl\` — Figma page URL
- \`context\` (optional) — Feature description, epic context

## Step 1: Fetch all page data

Call \`figma-ask-scope-questions-for-page\` with \`{ url: figmaUrl, context }\`.

This makes efficient batched Figma API calls and returns:
- **Manifest** (JSON) — frame list with IDs, names, order
- **Per-frame data** — each frame has a text label ("## Frame: {name} ({id})"), an ImageContent block (base64 PNG), a context resource, and a structure resource
- **Per-frame context** — \`context://frame/{id}\` embedded resources (annotations, connections)
- **Per-frame structure** — \`structure://frame/{id}\` embedded resources (semantic XML)
- **Prompts** — \`prompt://frame-analysis\`, \`prompt://scope-synthesis\`, \`prompt://generate-questions\`

## Step 2: Save to temp directory

Create a working directory keyed by the Figma file: \`./temp/cascade/{fileKey}/\`

The \`fileKey\` comes from the manifest JSON in the tool response (e.g., \`abc123DEF\`).
This means re-running the workflow on the same file reuses the same directory,
enabling resumability.

Parse the tool response and save:

\`\`\`
temp/cascade/{fileKey}/
├── manifest.json              # The manifest from the response
├── prompts/
│   ├── frame-analysis.md      # From prompt://frame-analysis resource
│   ├── scope-synthesis.md     # From prompt://scope-synthesis resource
│   └── generate-questions.md  # From prompt://generate-questions resource
└── frames/
    ├── {frame-name}/
    │   ├── image.png          # From the ImageContent block after the frame's text label
    │   ├── context.md         # From context://frame/{id}
    │   └── structure.xml      # From structure://frame/{id}
    └── ...
\`\`\`

**Mapping content to files:**
- Parse the manifest JSON to get the frame list
- Each frame group starts with a text label "## Frame: {name} ({id})" followed by an ImageContent block, then context://frame/{id} and structure://frame/{id} resources
- Save the image data (base64 from the ImageContent block) as PNG
- Save context and structure as-is

## Step 3: Analyze each frame

> **⚡ PARALLEL**: Spawn one subagent per frame directory.
>
> Each frame analysis is fully independent — no shared state.
> If you don't support subagents, process frames sequentially.

For each frame directory without an existing \`analysis.md\`:

### Subagent Task (per frame)

\`\`\`
Analyze the Figma frame in the directory I'm providing.

**Files to read:**
- \`context.md\` — designer annotations, comments, connections to other frames
- \`structure.xml\` — semantic XML showing the component tree
- \`image.png\` — screenshot of the frame (use as vision input)
- \`../prompts/frame-analysis.md\` — analysis instructions to follow

**Instructions:**
1. Read the prompt file \`frame-analysis.md\`
2. Follow its instructions using the frame's image, context, and structure
3. Write your complete analysis to \`analysis.md\` in this directory
\`\`\`

## Step 4: Synthesize scope

After ALL frame analyses are complete:

1. Read \`prompts/scope-synthesis.md\`
2. Read every \`frames/*/analysis.md\` file
3. Synthesize a cross-screen scope analysis
4. Save to \`temp/cascade/{fileKey}/scope-analysis.md\`

## Step 5: Generate questions

1. Read \`prompts/generate-questions.md\`
2. Read \`scope-analysis.md\` + all \`frames/*/analysis.md\`
3. Generate frame-specific clarifying questions
4. Save to \`temp/cascade/{fileKey}/questions.md\`

## Step 6: Present to user

Present the generated questions. The user may:
- Answer questions directly
- Ask you to post them to Figma as comments
- Ask for revisions

To post a question as a Figma comment, use the \`figma-post-comment\` tool
with the frame's nodeId (from manifest.json) and the question text.

## Re-running

Because the temp directory is keyed by Figma file key (\`temp/cascade/{fileKey}/\`),
re-running the workflow on the same file automatically finds the existing directory:
- Frame analyses (\`analysis.md\`) are preserved — skip already-analyzed frames
- Scope analysis and questions can be regenerated on top of existing frame analyses
- The \`figma-ask-scope-questions-for-page\` tool uses server-side caching and will
  skip redundant Figma API calls if the file hasn't changed
- To force a full re-analysis, delete the \`temp/cascade/{fileKey}/\` directory
`;

export function registerWorkflowResources(mcp: McpServer): void {
  console.log('    Registering workflow resources');

  // workflow://review-design
  mcp.registerResource(
    'review-design',
    'workflow://review-design',
    {
      description: 'Design review questions workflow — full orchestration with subagent parallelization for analyzing Figma pages and generating stakeholder questions.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'workflow://review-design',
          mimeType: 'text/markdown',
          text: REVIEW_DESIGN_WORKFLOW,
        },
      ],
    }),
  );
}
