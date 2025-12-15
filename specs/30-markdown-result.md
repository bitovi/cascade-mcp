
# Markdown Result Display Enhancement

## Overview

Enhance the `ResultDisplay` component to properly render MCP tool results with markdown formatting for text content and support for images.

### Current Behavior

The `ResultDisplay` component (`src/react/components/ResultDisplay/ResultDisplay.tsx`) currently:
- Takes raw `result` and displays it as formatted JSON or plain text
- Uses a simple `formatResult` function that tries to parse strings as JSON
- Renders everything in a `<pre>` tag

### Desired Behavior

When the result follows the MCP content format `{content: [{type: "text", text: "..."}]}`:
- Render text content blocks as **markdown**
- Render image content blocks as `<img>` elements
- For any other content types, fall back to JSON display

If the result doesn't have a `content` array, render as we do now (JSON/text).

## MCP Tool Result Content Types

According to the [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result), tool results can contain multiple content items in a `content` array:

### Text Content
```json
{
  "type": "text",
  "text": "Tool result text with **markdown** support"
}
```

### Image Content
```json
{
  "type": "image",
  "data": "base64-encoded-data",
  "mimeType": "image/png"
}
```

### Audio Content
```json
{
  "type": "audio",
  "data": "base64-encoded-audio-data",
  "mimeType": "audio/wav"
}
```

### Resource Link
```json
{
  "type": "resource_link",
  "uri": "file:///project/src/main.rs",
  "name": "main.rs",
  "description": "Primary application entry point",
  "mimeType": "text/x-rust"
}
```

### Embedded Resource
```json
{
  "type": "resource",
  "resource": {
    "uri": "file:///project/src/main.rs",
    "mimeType": "text/x-rust",
    "text": "fn main() { ... }"
  }
}
```

## Implementation Plan

### Step 1: Add Markdown Rendering Library

Install `react-markdown` and optionally `remark-gfm` for GitHub Flavored Markdown support.

```bash
npm install react-markdown remark-gfm
```

**Verification:** Run `npm ls react-markdown` to confirm installation.

### Step 2: Define TypeScript Types for MCP Content

Create type definitions for the MCP content types we'll handle.

**File:** `src/react/components/ResultDisplay/types.ts`

```typescript
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string;  // base64-encoded
  mimeType: string;
}

export type McpContentItem = 
  | TextContent 
  | ImageContent 
  | { type: string; [key: string]: unknown };  // fallback for unknown types

export interface McpToolResult {
  content: McpContentItem[];
  isError?: boolean;
  structuredContent?: unknown;
}

export function isMcpToolResult(value: unknown): value is McpToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    Array.isArray((value as McpToolResult).content)
  );
}
```

**Verification:** TypeScript compiles without errors (`npm run build:client` or check in IDE).

### Step 3: Create Content Renderers

Create individual renderer components for each content type.

**File:** `src/react/components/ResultDisplay/ContentRenderer.tsx`

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { McpContentItem } from './types';

interface ContentRendererProps {
  item: McpContentItem;
  index: number;
}

export function ContentRenderer({ item, index }: ContentRendererProps) {
  switch (item.type) {
    case 'text':
      return <TextRenderer text={item.text} />;
    
    case 'image':
      return <ImageRenderer data={item.data} mimeType={item.mimeType} />;
    
    default:
      return <FallbackRenderer item={item} index={index} />;
  }
}

function TextRenderer({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ImageRenderer({ data, mimeType }: { data: string; mimeType: string }) {
  const src = `data:${mimeType};base64,${data}`;
  return (
    <div className="my-4">
      <img 
        src={src} 
        alt="Tool result image" 
        className="max-w-full h-auto rounded-lg border border-gray-200"
      />
    </div>
  );
}

function FallbackRenderer({ item, index }: { item: McpContentItem; index: number }) {
  return (
    <div className="my-2">
      <pre className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono overflow-x-auto">
        {JSON.stringify(item, null, 2)}
      </pre>
    </div>
  );
}
```

**Verification:** Component renders without errors. Test each content type visually.

### Step 4: Update ResultDisplay Component

Modify the main `ResultDisplay` component to detect MCP format and use the new renderers.

**File:** `src/react/components/ResultDisplay/ResultDisplay.tsx`

Key changes:
1. Import the type guard and content renderer
2. Check if result matches MCP format using `isMcpToolResult()`
3. If MCP format, map over `content` array and render each item with `ContentRenderer`
4. If not MCP format, use existing JSON/text rendering logic

**Verification:** 
- Existing non-MCP results still render correctly
- MCP text results render as markdown
- MCP image results display as images

### Step 5: Add Tailwind Typography Plugin (for prose styles)

The `prose` class used in `TextRenderer` requires `@tailwindcss/typography`.

```bash
npm install @tailwindcss/typography
```

Update `tailwind.config.js`:
```javascript
module.exports = {
  // ...
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
```

**Verification:** Markdown renders with proper typography styles (headings, lists, code blocks, etc.).

### Step 6: Handle Edge Cases

Add handling for:
1. Empty content arrays → show "No content returned"
2. `isError: true` in MCP result → show error styling
3. Mixed content (text + images) → render all items in order

**Verification:** Test each edge case scenario.

## File Structure After Implementation

```
src/react/components/ResultDisplay/
├── ResultDisplay.tsx      # Main component (updated)
├── ContentRenderer.tsx    # New: renders individual content items
├── types.ts               # New: TypeScript types for MCP content
└── index.ts               # Exports (if needed)
```

## Testing Checklist

- [ ] Non-MCP results (plain JSON) render as before
- [ ] Text content renders as markdown
- [ ] Headers, bold, italic, lists render correctly
- [ ] Code blocks render with proper formatting
- [ ] Image content displays as `<img>` with base64 data URL
- [ ] Unknown content types fall back to JSON display
- [ ] Error results (`isError: true`) show error styling
- [ ] Empty content array shows appropriate message
- [ ] Multiple content items render in order

## Future Enhancements

The following content types are defined in the MCP specification but not implemented in this iteration:

### Audio Content Renderer
Support for `{type: "audio", data: "<base64>", mimeType: "audio/wav"}` with HTML5 audio player.

### Resource Link Renderer  
Support for `{type: "resource_link", uri: "...", name: "...", description: "..."}` with clickable links.

### Embedded Resource Renderer
Support for `{type: "resource", resource: {uri: "...", text: "...", blob: "..."}}` with inline content display.

### Syntax Highlighting for Code Blocks
Add `react-syntax-highlighter` for code blocks in markdown content.

## Questions

1. Should we add a "copy to clipboard" button for text content blocks?

No

2. For very long markdown content, should we add a collapsible "Show more" feature, or is scrolling sufficient?

No, scrolling is fine.

3. Are there specific tools in this project that return MCP content format that we should test with, or should we create mock data for testing?

None righ tnow. 