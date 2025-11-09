/**
 * Tool Dependencies Interface
 * 
 * Common dependencies for combined tools (write-shell-stories, write-next-story).
 * Uses dependency injection pattern to support both MCP and direct API modes.
 */

import type { AtlassianClient } from '../../atlassian/atlassian-api-client.js';
import type { FigmaClient } from '../../figma/figma-api-client.js';
import type { GenerateTextFn } from '../../../llm-client/types.js';

/**
 * Dependencies required by tool core logic
 * 
 * This interface decouples the tool implementation from authentication concerns.
 * The same core logic can work with:
 * - MCP mode: OAuth tokens wrapped in client objects
 * - API mode: PATs wrapped in client objects
 * 
 * All clients have authentication captured in closures, so core logic
 * never directly handles tokens.
 */
export interface ToolDependencies {
  /**
   * Pre-configured Atlassian API client
   * Token captured in closure
   */
  atlassianClient: AtlassianClient;
  
  /**
   * Pre-configured Figma API client
   * Token captured in closure
   */
  figmaClient: FigmaClient;
  
  /**
   * LLM text generation function
   * Either MCP sampling or Anthropic API, pre-configured
   */
  generateText: GenerateTextFn;
  
  /**
   * Progress notification function
   * - MCP mode: Sends progress via MCP protocol
   * - API mode: No-op function (async () => {})
   * 
   * Always call this - no conditional checks needed!
   */
  notify: (message: string, step?: number) => Promise<void>;
}
