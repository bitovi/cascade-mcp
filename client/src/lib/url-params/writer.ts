/**
 * Write URL query parameters for form state sharing
 * Uses history.replaceState to avoid creating new history entries
 */

/**
 * Update URL with tool parameter
 * Uses history.replaceState to avoid polluting browser history
 * Note: Tool names from MCP server are already in kebab-case format
 * @param toolName - Tool name (already in kebab-case from server)
 * 
 * @example
 * updateUrlWithTool("atlassian-get-issue") // URL becomes ?tool=atlassian-get-issue
 */
export function updateUrlWithTool(toolName: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('tool', toolName);
  window.history.replaceState({}, '', url);
}
