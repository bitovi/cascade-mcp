# cascade-mcp Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-23

## Active Technologies
- TypeScript 5.x (strict mode) + Figma API, @modelcontextprotocol/sdk, ai (vercel AI SDK), Express (001-figma-comments)
- In-memory only for comments; optional debug output to `cache/figma-files/` via env var (001-figma-comments)
- TypeScript 5.x (Node.js runtime) + Existing codebase using AI SDK, Zod, MCP protocol libraries (039-self-healing-tools)
- File-based caching (`cache/` directory), Jira API for persistence (039-self-healing-tools)
- TypeScript 5.x / Node.js 20+ + Node.js `crypto` module (built-in), `dotenv` for environment loading (001-static-encryption-keys)
- Environment variables (base64-encoded PEM keys), existing `server/utils/crypto.ts` encryption functions (001-static-encryption-keys)
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
- 626-generic-text-encryption: Added TypeScript 5.x (strict mode), Node.js 18+, React 18.x + Express.js (server), React + React Router (frontend), TailwindCSS (styling), Node.js crypto (RSA encryption)
- 001-static-encryption-keys: Added TypeScript 5.x / Node.js 20+ + Node.js `crypto` module (built-in), `dotenv` for environment loading
- 039-self-healing-tools: Added TypeScript 5.x (Node.js runtime) + Existing codebase using AI SDK, Zod, MCP protocol libraries


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
