# 062-workflow-patterns.md

## Status
Partial

## What it proposes
Use MCP Resources as a stable, discoverable "prompt library" — registering workflow orchestration documents and atomic prompt instructions as `workflow://` and `prompt://` URIs that agents can read on demand. This separates instructions (resources, no auth) from data access (tools, require auth) and enables explicit subagent parallelization via structured orchestration documents.

## Architectural decisions made
- Resources serve as a resolvable prompt library with stable URIs (not embedded inline in tool responses)
- Two URI schemes: `workflow://` for multi-step orchestration documents, `prompt://` for atomic LLM instructions
- Resources require no auth; tools handle all data access and side effects
- Workflow resources explicitly define parallel steps for subagent fork/join patterns
- Prompt resources import their text from existing source files (e.g., `SCREEN_ANALYSIS_SYSTEM_PROMPT`)
- `registerAllResources()` in `server/mcp-resources/index.ts` registers both workflow and prompt resources

## What still needs implementing
- `workflow://write-story` resource is not implemented (`prompt://write-story-content` exists but is noted as "for future workflow://write-story")
