# 064-claude-code-typescript.md

## Status
Implemented

## What it proposes
Create an E2E test using the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) that connects to the MCP server via HTTP transport, runs the `figma-ask-scope-questions-for-page` design review workflow, and verifies the agent produces questions without errors. Auth is handled by crafting an unsigned test JWT containing Figma PAT credentials.

## Architectural decisions made
- Use `@anthropic-ai/claude-agent-sdk` (not a raw HTTP client) to programmatically invoke Claude Code as a library
- Auth strategy: unsigned JWT (`alg: none`) with PAT credentials embedded, exploiting that `parseJWT()` only base64-decodes without signature verification — no server changes needed
- MCP server name `"cascade"` so tools appear as `mcp__cascade__<toolName>` in `allowedTools`
- `permissionMode: 'bypassPermissions'` and `allowedTools` auto-approval to avoid interactive prompts
- `FIGMA_TEST_URL` env var for flexible Figma URL (no hardcoded URLs)
- Test output saved to `temp/` for post-run inspection

## What still needs implementing
Fully implemented.
