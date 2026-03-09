/**
 * Helper utilities for building MCP tool responses with embedded prompts
 * 
 * Uses MCP's multi-part response pattern with EmbeddedResource to include
 * workflow instructions alongside data.
 */

/**
 * Content block types from MCP spec
 */
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
  };
}

export interface EmbeddedResource {
  type: 'resource';
  resource: {
    uri: string;
    mimeType: string;
    text: string;
  };
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
  };
}

export type ContentBlock = TextContent | ImageContent | EmbeddedResource;

/**
 * Tool response with multi-part content
 */
export interface ToolResponse {
  content: ContentBlock[];
  isError?: boolean;
}

/**
 * Build a multi-part tool response with primary data and embedded prompt
 * 
 * @param data - Primary data object (will be JSON.stringify'd)
 * @param prompt - Prompt text (markdown or plain text)
 * @param options - Additional options
 * @returns MCP-compliant tool response
 */
export function buildContextResponse(
  data: Record<string, any>,
  prompt: string,
  options: {
    promptUri?: string;
    promptMimeType?: string;
    workflowMetadata?: Record<string, any>;
  } = {}
): ToolResponse {
  const content: ContentBlock[] = [];

  // 1. Primary data as JSON
  content.push({
    type: 'text',
    text: JSON.stringify(data, null, 2),
  });

  // 2. Embedded prompt resource
  content.push({
    type: 'resource',
    resource: {
      uri: options.promptUri || 'prompt://next-step',
      mimeType: options.promptMimeType || 'text/markdown',
      text: prompt,
    },
    annotations: {
      audience: ['assistant'],
      priority: 1,
    },
  });

  // 3. Optional workflow metadata
  if (options.workflowMetadata) {
    content.push({
      type: 'resource',
      resource: {
        uri: 'workflow://metadata',
        mimeType: 'application/json',
        text: JSON.stringify(options.workflowMetadata, null, 2),
      },
      annotations: {
        audience: ['assistant'],
        priority: 0,
      },
    });
  }

  return { content };
}

/**
 * Build an error response
 */
export function buildErrorResponse(errorMessage: string): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: errorMessage }),
      },
    ],
    isError: true,
  };
}

/**
 * Extract prompt from tool response (for testing/debugging)
 */
export function extractEmbeddedPrompt(response: ToolResponse): string | null {
  const promptResource = response.content.find(
    (block): block is EmbeddedResource =>
      block.type === 'resource' && block.resource.uri.startsWith('prompt://')
  );
  return promptResource?.resource.text || null;
}

/**
 * Extract workflow metadata from tool response (for testing/debugging)
 */
export function extractWorkflowMetadata(response: ToolResponse): Record<string, any> | null {
  const metadataResource = response.content.find(
    (block): block is EmbeddedResource =>
      block.type === 'resource' && block.resource.uri === 'workflow://metadata'
  );
  
  if (!metadataResource) return null;
  
  try {
    return JSON.parse(metadataResource.resource.text);
  } catch {
    return null;
  }
}
