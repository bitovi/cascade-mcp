# cascade-mcp Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-23

## Active Technologies
- TypeScript 5.x (strict mode) + Figma API, @modelcontextprotocol/sdk, ai (vercel AI SDK), Express (001-figma-comments)
- In-memory only for comments; optional debug output to `cache/figma-files/` via env var (001-figma-comments)
- TypeScript 5.x (Node.js runtime) + Existing codebase using AI SDK, Zod, MCP protocol libraries (039-self-healing-tools)
- File-based caching (`cache/` directory), Jira API for persistence (039-self-healing-tools)

- TypeScript (ES2022 target, strict mode enabled via tsconfig.json) + @modelcontextprotocol/sdk, Google Drive API (via fetch wrapper in google-api-client.ts), ai (AI SDK for LLM providers) (001-google-docs-context)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript (ES2022 target, strict mode enabled via tsconfig.json): Follow standard conventions

## Recent Changes
- 039-self-healing-tools: Added TypeScript 5.x (Node.js runtime) + Existing codebase using AI SDK, Zod, MCP protocol libraries
- 001-figma-comments: Added TypeScript 5.x (strict mode) + Figma API, @modelcontextprotocol/sdk, ai (vercel AI SDK), Express

- 001-google-docs-context: Added TypeScript (ES2022 target, strict mode enabled via tsconfig.json) + @modelcontextprotocol/sdk, Google Drive API (via fetch wrapper in google-api-client.ts), ai (AI SDK for LLM providers)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
