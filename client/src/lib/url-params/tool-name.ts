/**
 * Tool lookup utilities
 * Tools from MCP server are already in kebab-case format (e.g., 'atlassian-get-issue')
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Find tool by name from available tools list
 * @param toolName - Tool name from URL (already in kebab-case)
 * @param tools - Available tools from MCP server
 * @returns Matching tool or undefined if not found
 * 
 * @example
 * findToolByKebabName("atlassian-get-issue", tools) // Tool { name: "atlassian-get-issue", ... }
 */
export function findToolByKebabName(toolName: string, tools: Tool[]): Tool | undefined {
  return tools.find(tool => tool.name === toolName);
}
