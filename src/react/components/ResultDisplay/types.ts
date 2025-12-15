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
