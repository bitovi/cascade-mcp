# 30-markdown-result.md

## Status
Implemented

## What it proposes
Enhance the client `ResultDisplay` component to render MCP tool results with proper markdown formatting for text content and display image content as `<img>` elements, rather than showing everything as raw JSON/text in a `<pre>` tag.

## Architectural decisions made
- Detect MCP content format via a `isMcpToolResult()` type guard checking for a `content` array
- Use `react-markdown` + `remark-gfm` for markdown rendering inside a `prose` Tailwind class container
- Separate `ContentRenderer` component handles per-item rendering (text, image, fallback)
- TypeScript types for MCP content items defined in a `types.ts` module
- Add `@tailwindcss/typography` plugin for prose styles
- Non-MCP results fall back to existing JSON/text rendering
- Empty content arrays show "No content returned"; `isError: true` results use red error styling

## What still needs implementing
Fully implemented.
