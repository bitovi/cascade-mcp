# 063 — Design Review Questions with Subagents

**Date:** March 5, 2026  
**Status:** 📝 Ready to Implement  
**Implements:** [062-workflow-patterns.md](./062-workflow-patterns.md) pattern 062b (Hybrid: Server Batch + Local Files + Subagents)

## Summary

Enable agents with subagent capabilities to parallelize the design review questions workflow. The server batch-fetches all Figma data efficiently via the existing `figma-page-questions-context` tool, the orchestrating agent saves frame data to local temp files, then spawns one subagent per frame for analysis.

**No new tools are needed.** The changes are:
1. Add `resources: {}` capability to the MCP server
2. Register 4 prompt resources (`prompt://frame-analysis`, etc.)
3. Register 1 workflow resource (`workflow://review-design`)
4. Update the existing `prompt-figma-page-questions` MCP prompt to reference the workflow resource

## Current State

| Component | Status | Location |
|-----------|--------|----------|
| `figma-page-questions-context` tool | ✅ Exists | `server/providers/figma/tools/figma-page-questions-context/` |
| `prompt-figma-page-questions` MCP prompt | ✅ Exists | `server/mcp-prompts/prompt-figma-page-questions.ts` |
| Prompt constants (all 4) | ✅ Exported | `SCREEN_ANALYSIS_SYSTEM_PROMPT`, `FEATURE_IDENTIFICATION_SYSTEM_PROMPT`, `FIGMA_QUESTIONS_SYSTEM_PROMPT`, `STORY_CONTENT_SYSTEM_PROMPT` |
| `resources: {}` capability | ❌ Not declared | `server/mcp-core/server-factory.ts` |
| MCP resource registration | ❌ None exist | — |
| Embedded prompt builder | ✅ Exists | `server/utils/embedded-prompt-builder.ts` |

## How It Works

```
Agent                                MCP Server                     Local Filesystem
  │                                      │                               │
  │─ prompts/get ───────────────────────►│                               │
  │  (prompt-figma-page-questions)       │                               │
  │◄─ "Read workflow://review-design,    │                               │
  │    then call figma-page-questions-   │                               │
  │    context and follow the workflow"  │                               │
  │                                      │                               │
  │─ resources/read ────────────────────►│                               │
  │  (workflow://review-design)          │                               │
  │◄─ Full workflow orchestration ───────┤                               │
  │                                      │                               │
  │─ tools/call ────────────────────────►│                               │
  │  (figma-page-questions-context)      ├─ Batch: 2 Tier1 + 1 Tier2    │
  │◄─ Manifest + frame images/XML/      │  + 1 Tier3 Figma API calls    │
  │   annotations + embedded prompts ───┤                               │
  │                                      │                               │
  │─ Save to temp/ ─────────────────────────────────────────────────────►│
  │   temp/cascade/{fileKey}/manifest.json                              │
  │   temp/cascade/{fileKey}/prompts/frame-analysis.md                  │
  │   temp/cascade/{fileKey}/frames/{name}/image.png                    │
  │   temp/cascade/{fileKey}/frames/{name}/context.md                   │
  │                                                                     │
  │─ Spawn subagent per frame ──────────────────────────────────────────►│
  │   "Read frames/{name}/ + prompts/frame-analysis.md → analyze"       │
  │                                                                     │
  │◄─ Collect analysis.md per frame ────────────────────────────────────┤
  │                                                                     │
  │─ resources/read (prompt://scope-synthesis) ─►│                      │
  │─ Scope synthesis using all analyses          │                      │
  │─ resources/read (prompt://generate-questions)►│                     │
  │─ Generate questions                          │                      │
  │─ Present to user                             │                      │
```

**Figma API budget (5 frames):** 1× `/meta` (T3) + 1× `/files/{key}` (T1) + 1× `/images` (T1) + 1× `/comments` (T2) = **2 Tier 1 calls total** — same as the monolithic `figma-review-design` tool.

## Implementation Steps

### Step 1: Add `resources` Capability to Server Factory

**File:** `server/mcp-core/server-factory.ts`

Add `resources: {}` to the capabilities object alongside `tools`, `prompts`, `logging`, `sampling`.

```typescript
capabilities: {
  tools: {},
  prompts: {},
  resources: {},   // ← ADD
  logging: {},
  sampling: {},
  // ChatGPT-compatible capabilities...
},
```

Also add a call to `registerAllResources(mcp)` after `registerAllPrompts()`. Resources are always registered (no auth needed — they only return static text).

```typescript
import { registerAllResources } from '../mcp-resources/index.js';

// In createMcpServer():
registerAllPrompts(mcp, authContext);
registerAllResources(mcp);
```

**Verification:** Server starts without error. An MCP client calling `resources/list` gets back the registered resources.

---

### Step 2: Create Prompt Resources

**New file:** `server/mcp-resources/prompt-resources.ts`

Register 4 prompt resources that expose the existing prompt constants as MCP resources. Each resource returns the prompt text as markdown.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SCREEN_ANALYSIS_SYSTEM_PROMPT } from '../providers/figma/screen-analyses-workflow/screen-analyzer.js';
import { FIGMA_QUESTIONS_SYSTEM_PROMPT } from '../providers/figma/tools/figma-review-design/prompt-figma-questions.js';

export function registerPromptResources(mcp: McpServer): void {
  // prompt://frame-analysis
  // prompt://scope-synthesis
  // prompt://generate-questions
  // prompt://write-story-content
}
```

**Resource definitions:**

| URI | Source Constant | Content |
|-----|----------------|---------|
| `prompt://frame-analysis` | Mirror the embedded prompt from `core-logic.ts` `buildFrameAnalysisPromptResource()` | Frame analysis instructions including system prompt, analysis guidelines, output format, scope markers |
| `prompt://scope-synthesis` | Mirror `buildScopeSynthesisPromptResource()` | Cross-screen synthesis instructions |
| `prompt://generate-questions` | Mirror `buildQuestionsPromptResource()` (uses `FIGMA_QUESTIONS_SYSTEM_PROMPT`) | Question generation instructions with filtering rules, output format |
| `prompt://write-story-content` | `STORY_CONTENT_SYSTEM_PROMPT` from `prompt-story-content.ts` | Story writing instructions (for future `workflow://write-story`) |

**Important: Single source of truth.** The prompt text in the resources should match what `figma-page-questions-context` already embeds in its response. The context tool already includes these prompts as embedded resources — the standalone MCP resources provide the same text for agents using the workflow resource pattern instead.

Two options for avoiding duplication:
- **Option A (simpler):** Extract the prompt text from `buildFrameAnalysisPromptResource()` etc. into exported constants. Both the context tool's embedded resources and the MCP resources import from the same constants.
- **Option B (leaner):** The MCP resources just call the existing builder functions and extract the text. Slightly coupled but zero duplication.

**Recommendation: Option A.** Create exported constants like `FRAME_ANALYSIS_PROMPT_TEXT`, `SCOPE_SYNTHESIS_PROMPT_TEXT`, `QUESTIONS_GENERATION_PROMPT_TEXT` in `core-logic.ts` (or a new shared file), and import them in both places.

**Verification:** `resources/list` returns 4 prompt resources. `resources/read` for each URI returns the expected prompt markdown.

---

### Step 3: Create Workflow Resource

**New file:** `server/mcp-resources/workflow-resources.ts`

Register `workflow://review-design` — the orchestration document that tells the agent how to run the full design review with subagent support.

The content is a static markdown document (no parameters needed — the agent fills in the Figma URL when calling tools). It covers:

````markdown
# Design Review Questions Workflow

## Overview

This workflow analyzes a Figma page, synthesizes scope across frames,
and generates design review questions. It uses one server call for 
all Figma data, then parallelizes frame analysis via local files.

## Inputs
- `figmaUrl` — Figma page URL
- `context` (optional) — Feature description, epic context

## Step 1: Fetch all page data

Call `figma-page-questions-context` with `{ url: figmaUrl, context }`.

This makes efficient batched Figma API calls and returns:
- **Manifest** (JSON) — frame list with IDs, names, order
- **Per-frame image** — `image://frame/{id}` embedded resources (base64 PNG)
- **Per-frame context** — `context://frame/{id}` embedded resources (annotations, connections)
- **Per-frame structure** — `structure://frame/{id}` embedded resources (semantic XML)
- **Prompts** — `prompt://frame-analysis`, `prompt://scope-synthesis`, `prompt://generate-questions`

## Step 2: Save to temp directory

Create a working directory keyed by the Figma file: `./temp/cascade/{fileKey}/`

The `fileKey` comes from the manifest JSON in the tool response (e.g., `abc123DEF`). 
This means re-running the workflow on the same file reuses the same directory, 
enabling resumability.

Parse the tool response and save:

```
temp/cascade/{fileKey}/
├── manifest.json              # The manifest from the response
├── prompts/
│   ├── frame-analysis.md      # From prompt://frame-analysis resource
│   ├── scope-synthesis.md     # From prompt://scope-synthesis resource
│   └── generate-questions.md  # From prompt://generate-questions resource
└── frames/
    ├── {frame-name}/
    │   ├── image.png          # Decoded from image://frame/{id} base64
    │   ├── context.md         # From context://frame/{id}
    │   └── structure.xml      # From structure://frame/{id}
    └── ...
```

**Mapping embedded resources to files:**
- Parse the manifest JSON to get the frame list
- For each frame, find the matching `image://frame/{id}`, `context://frame/{id}`, 
  and `structure://frame/{id}` resources in the tool response content array
- Decode base64 image data and save as PNG
- Save context and structure as-is

## Step 3: Analyze each frame

> **⚡ PARALLEL**: Spawn one subagent per frame directory.
>
> Each frame analysis is fully independent — no shared state.
> If you don't support subagents, process frames sequentially.

For each frame directory without an existing `analysis.md`:

### Subagent Task (per frame)

```
Analyze the Figma frame in the directory I'm providing.

**Files to read:**
- `context.md` — designer annotations, comments, connections to other frames
- `structure.xml` — semantic XML showing the component tree
- `image.png` — screenshot of the frame (use as vision input)
- `../prompts/frame-analysis.md` — analysis instructions to follow

**Instructions:**
1. Read the prompt file `frame-analysis.md`
2. Follow its instructions using the frame's image, context, and structure
3. Write your complete analysis to `analysis.md` in this directory
```

## Step 4: Synthesize scope

After ALL frame analyses are complete:

1. Read `prompts/scope-synthesis.md`
2. Read every `frames/*/analysis.md` file  
3. Synthesize a cross-screen scope analysis
4. Save to `temp/cascade/{fileKey}/scope-analysis.md`

## Step 5: Generate questions

1. Read `prompts/generate-questions.md`
2. Read `scope-analysis.md` + all `frames/*/analysis.md`
3. Generate frame-specific clarifying questions
4. Save to `temp/cascade/{fileKey}/questions.md`

## Step 6: Present to user

Present the generated questions. The user may:
- Answer questions directly
- Ask you to post them to Figma as comments
- Ask for revisions

To post a question as a Figma comment, use the `figma-post-comment` tool
with the frame's nodeId (from manifest.json) and the question text.

## Re-running

Because the temp directory is keyed by Figma file key (`temp/cascade/{fileKey}/`),
re-running the workflow on the same file automatically finds the existing directory:
- Frame analyses (`analysis.md`) are preserved — skip already-analyzed frames
- Scope analysis and questions can be regenerated on top of existing frame analyses
- The `figma-page-questions-context` tool uses server-side caching and will 
  skip redundant Figma API calls if the file hasn't changed
- To force a full re-analysis, delete the `temp/cascade/{fileKey}/` directory
````

**Verification:** `resources/read` for `workflow://review-design` returns the workflow markdown.

---

### Step 4: Create Resource Registration Index

**New file:** `server/mcp-resources/index.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPromptResources } from './prompt-resources.js';
import { registerWorkflowResources } from './workflow-resources.js';

export function registerAllResources(mcp: McpServer): void {
  console.log('  Registering MCP resources');
  registerPromptResources(mcp);
  registerWorkflowResources(mcp);
}
```

---

### Step 5: Update `prompt-figma-page-questions` to Reference Workflow Resource

**File:** `server/mcp-prompts/prompt-figma-page-questions.ts`

Update the prompt text to tell the agent about the workflow resource first (for agents that support resources), with the current inline instructions as a fallback.

```typescript
text: `# Design Review Questions Workflow

## Input
- **Figma URL:** ${args.figmaUrl}${contextSection}

## How to Execute

**If you can read MCP resources:** Read \`workflow://review-design\` for the 
full workflow with subagent parallelization support. It tells you exactly what 
to do step by step.

**Quick version (if you prefer inline instructions):**

1. Call \`figma-page-questions-context\` with:
   - \`url\`: "${args.figmaUrl}"${args.context ? `\n   - \`context\`: "${args.context}"` : ''}

2. The response contains frame data + embedded prompts. Follow them in order:
   - \`prompt://frame-analysis\` — Analyze each frame (can be parallel)
   - \`prompt://scope-synthesis\` — Combine analyses into scope
   - \`prompt://generate-questions\` — Generate questions

3. Present questions to the user for review.
`,
```

This is backward-compatible — agents that don't support resources still get the inline instructions. Agents that do support resources get directed to the richer workflow with subagent orchestration.

**Verification:** `prompts/get` for `prompt-figma-page-questions` returns the updated text with the resource reference.

---

### Step 6: Update Documentation

**File:** `server/readme.md`

Add a section describing:
- The 4 prompt resources and their URIs
- The `workflow://review-design` resource
- The hybrid workflow pattern (batch fetch → local files → subagent fork/join)
- How resources relate to the existing tools and prompts

## File Changes Summary

| File | Change | Type |
|------|--------|------|
| `server/mcp-core/server-factory.ts` | Add `resources: {}` capability, call `registerAllResources()` | Edit |
| `server/mcp-resources/index.ts` | New — central resource registration | Create |
| `server/mcp-resources/prompt-resources.ts` | New — register 4 prompt resources | Create |
| `server/mcp-resources/workflow-resources.ts` | New — register `workflow://review-design` | Create |
| `server/mcp-prompts/prompt-figma-page-questions.ts` | Update prompt text to reference workflow resource | Edit |
| `server/readme.md` | Document resources and workflow pattern | Edit |

Optionally (for single source of truth):
| `server/providers/figma/tools/figma-page-questions-context/core-logic.ts` | Extract prompt text constants from `buildFrameAnalysisPromptResource()`, `buildScopeSynthesisPromptResource()`, `buildQuestionsPromptResource()` into importable exports | Edit |

## What's NOT Changing

- **`figma-page-questions-context` tool** — Unchanged. It already returns exactly the response shape the workflow needs.
- **`figma-review-design` tool** — Unchanged. Still works for agents with sampling.
- **`figma-post-comment` tool** — Unchanged. Still exists for question posting.
- **Figma API caching** — Unchanged. The context tool already batch-fetches efficiently.
- **MCP prompts** — `prompt-write-story` is unchanged. `prompt-figma-page-questions` gets a minor text update.
- **No new Figma tools** — `figma-get-frame-data` from 062 is not needed for this pattern.

## Verification Plan

### Manual Test: Full Workflow

1. Start server with `npm run start-local`
2. Connect an MCP client (VS Code Copilot or browser client)
3. Verify `resources/list` returns 5 resources (4 prompts + 1 workflow)
4. Verify `resources/read` for `workflow://review-design` returns the workflow markdown
5. Verify `resources/read` for each `prompt://` URI returns prompt text
6. Verify `prompts/get` for `prompt-figma-page-questions` includes the workflow resource reference
7. Call `figma-page-questions-context` with a test Figma page — verify response still works as before
8. End-to-end: follow the workflow manually — batch fetch → save files → analyze frames → synthesize → generate questions

### Automated

- `npx tsc --noEmit` passes
- Existing tests pass (no regressions)

## Design Decisions

**Q: Why not make `figma-page-questions-context` return the prompts from the MCP resources?**  
A: The context tool already embeds prompts in its response, and that works fine for agents that don't use resources. Adding a resource read dependency to the tool would make it coupled to the resource layer. Instead, both the embedded prompts and the MCP resources pull from the same source constants.

**Q: Why a workflow resource instead of a longer MCP prompt?**  
A: MCP prompts are designed as user-facing templates with arguments. A workflow orchestration document is reference material that stays the same across invocations. Resources are the right MCP primitive for "read this document and follow it." Also, resources are independently cacheable and discoverable without calling `prompts/get`.

**Q: Why save to local files instead of keeping everything in the agent's context?**  
A: Three reasons: (1) Subagents may not share context with the parent agent — local files are the universal coordination mechanism. (2) Frame images as base64 in context would consume ~2.5MB of context window for 5 frames. (3) Local files enable resumability — re-run the workflow and skip already-analyzed frames.

**Q: What about agents without subagent support?**  
A: The workflow explicitly says "If you don't support subagents, process frames sequentially." The MCP prompt also includes inline quick instructions that work without resources or subagents at all. Three graceful tiers:
  - **Has subagents:** Follow workflow resource, fork per frame
  - **No subagents:** Follow workflow resource, process sequentially
  - **Wants simplicity:** Follow inline prompt instructions, ignore resources
