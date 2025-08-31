/**
 * Shared TypeScript types for MCP (Model Context Protocol) tools
 * These types match the actual MCP SDK interfaces
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Extract the actual types from the MCP SDK
export type { McpServer };

// MCP Content types that match the SDK (with index signatures)
export interface MCPTextContent {
  [x: string]: unknown;
  type: 'text';
  text: string;
  _meta?: { [x: string]: unknown } | undefined;
}

export interface MCPImageContent {
  [x: string]: unknown;
  type: 'image';
  data: string;
  mimeType: string;
  _meta?: { [x: string]: unknown } | undefined;
}

export type MCPContent = MCPTextContent | MCPImageContent;

// MCP Tool Response that matches the SDK
export interface MCPToolResponse {
  [x: string]: unknown;
  content: MCPContent[];
  _meta?: { [x: string]: unknown } | undefined;
  structuredContent?: { [x: string]: unknown } | undefined;
  isError?: boolean | undefined;
}

// Tool handler type that matches the MCP SDK
export type MCPToolHandler = (
  args: { [x: string]: any },
  extra: any // This is RequestHandlerExtra from the SDK
) => MCPToolResponse | Promise<MCPToolResponse>;

// Tool definition interface
export interface MCPToolDefinition {
  title?: string;
  description?: string;
  inputSchema?: any;
  outputSchema?: any;
  annotations?: any;
}
