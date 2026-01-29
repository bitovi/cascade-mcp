/**
 * Figma Helper Functions
 * 
 * Shared utilities for working with Figma API across different tools.
 * Extracted from existing Figma tools to enable reuse.
 */

import { logger } from '../../observability/logger.js';
import type { FigmaClient } from './figma-api-client.js';

/**
 * Custom error for unrecoverable Figma API errors
 * These should be immediately re-thrown and not retried
 */
export class FigmaUnrecoverableError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'FigmaUnrecoverableError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FigmaUnrecoverableError);
    }
  }
}

/**
 * Figma user info from /v1/me endpoint
 */
export interface FigmaUserInfo {
  id: string;
  email: string;
  handle: string;
  img_url?: string;
}

/**
 * Fetch current Figma user information
 * Shared helper extracted from figma-get-user tool
 * 
 * **Note:** This endpoint only works with OAuth tokens, not Personal Access Tokens (PATs)
 * 
 * @param client - Figma API client
 * @returns User info including email and handle
 * @throws Error if request fails or token is a PAT
 */
export async function fetchFigmaUserInfo(client: FigmaClient): Promise<FigmaUserInfo> {
  const apiUrl = `${client.getBaseUrl()}/me`;
  
  try {
    const response = await client.fetch(apiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Figma /v1/me API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return await response.json() as FigmaUserInfo;
  } catch (error: any) {
    throw new Error(`Failed to fetch Figma user info: ${error.message}`);
  }
}

/**
 * Create a user-friendly 403 Forbidden error message
 * 
 * @param url - The Figma API URL that was called
 * @param response - The fetch Response object
 * @param client - Figma API client (not used but kept for API compatibility)
 * @returns Formatted error message
 */
export async function create403ErrorMessage(
  url: string,
  response: Response,
  client: FigmaClient
): Promise<string> {
  return `Figma API access denied (403 Forbidden) for ${url}.

This means the authenticated Figma user doesn't have the required permission level to view this file.

Common causes:
- File is not shared with your Figma account
- You need "Can view" or higher access level
- File is in a private workspace/team you're not a member of
- Your access level was recently changed or revoked

Solution: Ask the file owner to share it with your Figma account with at least "Can view" permissions.`;
}

/**
 * Create a user-friendly rate limit error message
 * @param url - The Figma API URL that was called
 * @param response - The fetch Response object
 * @param errorText - Error text from response body
 * @returns Formatted error message
 */
export async function createRateLimitErrorMessage(
  url: string,
  response: Response,
  errorText: string
): Promise<string> {
  const retryAfterHeader = response.headers.get('retry-after');
  const rateLimitType = response.headers.get('x-figma-rate-limit-type');
  const planTier = response.headers.get('x-figma-plan-tier');
  
  const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
  
  let waitTime = '5-15 minutes';
  
  if (retryAfterSeconds) {
    const hours = Math.floor(retryAfterSeconds / 3600);
    const minutes = Math.floor((retryAfterSeconds % 3600) / 60);
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      waitTime = `~${days} day${days > 1 ? 's' : ''} (${hours} hours)`;
    } else if (hours > 0) {
      waitTime = `~${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 15) {
      waitTime = `~${minutes} minutes`;
    }
  }
  
  let seatInfo = '';
  if (rateLimitType) {
    const seatType = rateLimitType === 'low' 
      ? 'View or Collab seat'
      : 'Dev or Full seat';
    seatInfo = `\n- Your seat type: "${rateLimitType}" - ${seatType}`;
  }
  
  let planInfo = '';
  if (planTier) {
    planInfo = `\n- Your plan tier: ${planTier}`;
  }
  
  return `Figma API rate limit exceeded. Your account/token has hit this limit.
Figma responded that you have to wait ${waitTime} to make requests again.
${seatInfo}${planInfo}.

See https://developers.figma.com/docs/rest-api/rate-limits/ for more information. 
Technical details: ${errorText}`;
}

/**
 * Parsed Figma URL information
 */
export interface FigmaUrlInfo {
  fileKey: string;
  nodeId?: string; // Optional - some URLs may not have a node ID
}

/**
 * Figma layer/node metadata
 */
export interface FigmaNodeMetadata {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  absoluteBoundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  children?: any[];
}

/**
 * Metadata returned from Figma /meta endpoint (Tier 3)
 * Used for cache validation via file-level timestamps
 */
export interface FigmaFileMetadata {
  fileKey: string;
  name: string;
  lastTouchedAt: string;  // ISO 8601 timestamp
  version: string;
  lastTouchedBy?: {
    id: string;
    handle: string;
    img_url: string;
  };
}

/**
 * Metadata stored in cache for validation
 * Stored in cache/figma-files/{fileKey}/.figma-metadata.json
 */
export interface FigmaMetadata {
  fileKey: string;
  lastTouchedAt: string;  // ISO 8601 timestamp from Figma /meta endpoint
  cachedAt: string;       // ISO 8601 timestamp when we cached
  version?: string;       // Optional: Figma version string
  lastTouchedBy?: {       // Optional: User who made last change (for debugging)
    id: string;
    handle: string;
    img_url: string;
  };
}

/**
 * Parse a Figma URL to extract file key and optional node ID
 * 
 * Supports formats:
 * - https://www.figma.com/design/FILEID
 * - https://www.figma.com/file/FILEID
 * - https://www.figma.com/design/FILEID?node-id=123-456
 * 
 * @param url - Figma URL to parse
 * @returns Parsed URL info or null if invalid
 */
export function parseFigmaUrl(url: string): FigmaUrlInfo | null {
  // Extract file key
  const fileKeyMatch = url.match(/\/(file|design)\/([a-zA-Z0-9]+)/);
  if (!fileKeyMatch || !fileKeyMatch[2]) {
    logger.error('Invalid Figma URL format', { url });
    return null;
  }
  
  const fileKey = fileKeyMatch[2];
  
  // Extract optional node ID from query parameter
  const nodeIdMatch = url.match(/node-id=([0-9]+-[0-9]+)/);
  const nodeId = nodeIdMatch ? nodeIdMatch[1] : undefined;
  
  return { fileKey, nodeId };
}

/**
 * Convert node ID from URL format (123-456) to API format (123:456)
 * 
 * @param urlNodeId - Node ID in URL format
 * @returns Node ID in API format
 */
export function convertNodeIdToApiFormat(urlNodeId: string): string {
  return urlNodeId.replace(/-/g, ':');
}

/**
 * Fetch lightweight metadata about a Figma file (Tier 3 endpoint)
 * 
 * Use this for cache validation - it's a lightweight request that only
 * returns metadata without node data, and uses the more generous Tier 3
 * rate limit quota (100/min vs 15/min for Tier 1).
 * 
 * @param client - Figma API client
 * @param fileKey - The Figma file key
 * @returns File metadata including last_touched_at timestamp
 */
export async function fetchFigmaFileMetadata(
  client: FigmaClient,
  fileKey: string
): Promise<FigmaFileMetadata> {
  const figmaApiUrl = `${client.getBaseUrl()}/files/${fileKey}/meta`;
  
  console.log(`  🎨 ${figmaApiUrl}`);
  
  try {
    const response = await client.fetch(figmaApiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle rate limiting
      if (response.status === 429) {
        const message = await createRateLimitErrorMessage(figmaApiUrl, response, errorText);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      // Handle 403 Forbidden
      if (response.status === 403) {
        const message = await create403ErrorMessage(figmaApiUrl, response, client);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      throw new Error(`Figma API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    console.log(`  🎨 ${figmaApiUrl} (${response.status})`);
    
    const data = await response.json() as any;
    
    // Extract metadata from response: { file: { last_touched_at, version, ... } }
    if (!data.file) {
      throw new Error('Invalid response from Figma /meta endpoint - missing file object');
    }
    
    return {
      fileKey,
      name: data.file.name,
      lastTouchedAt: data.file.last_touched_at,
      version: data.file.version,
      lastTouchedBy: data.file.last_touched_by
    };
    
  } catch (error: any) {
    // Re-throw FigmaUnrecoverableError as-is
    if (error instanceof FigmaUnrecoverableError) {
      throw error;
    }
    
    throw new Error(`Failed to fetch Figma file metadata: ${error.message}`);
  }
}

/**
 * Fetch Figma file data from the API
 * 
 * @param fileKey - Figma file key
 * @param token - Figma access token
 * @param timeoutMs - Request timeout in milliseconds (default 60000)
 * @returns Figma file data
 * @throws Error if request fails
 */
export async function fetchFigmaFile(
  client: FigmaClient,
  fileKey: string,
  timeoutMs: number = 60000
): Promise<any> {
  const figmaApiUrl = `${client.getBaseUrl()}/files/${fileKey}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await client.fetch(figmaApiUrl, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Extract all response headers for debugging
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      // Special handling for 403 Forbidden errors - log to console for visibility
      if (response.status === 403) {
        console.error('\n🚨 FIGMA 403 FORBIDDEN ERROR');
        console.error('  Function: fetchFigmaFile');
        console.error('  File Key:', fileKey);
        console.error('  URL:', figmaApiUrl);
        console.error('  Status:', response.status, response.statusText);
        console.error('  Response Body:', errorText);
        console.error('  Response Headers:', JSON.stringify(headers, null, 2));
        console.error('');
      }
      
      logger.error('Figma API error response', {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
        body: errorText,
      });
      
      // Handle rate limiting with user-friendly message
      if (response.status === 429) {
        const message = await createRateLimitErrorMessage(figmaApiUrl, response, errorText);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      // Handle 403 Forbidden as unrecoverable (authentication/permission issue)
      if (response.status === 403) {
        const message = await create403ErrorMessage(figmaApiUrl, response, client);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      throw new Error(`Figma API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`    🎨 ${figmaApiUrl} (${response.status})`);
    return data;
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      logger.error('Figma API request timed out');
      throw new Error(`Figma API request timed out after ${timeoutMs}ms`);
    }
    
    throw error;
  }
}

/**
 * Fetch a specific node from a Figma file (with all children/frames)
 * @param client - Figma API client
 * @param fileKey - The Figma file key
 * @param nodeId - The node ID to fetch (in API format with colon)
 * @param timeoutMs - Timeout in milliseconds
 * @returns Figma node data with full subtree
 * @throws Error if request fails or node not found
 */
export async function fetchFigmaNode(
  client: FigmaClient,
  fileKey: string,
  nodeId: string,
  timeoutMs: number = 60000
): Promise<any> {
  const figmaApiUrl = `${client.getBaseUrl()}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await client.fetch(figmaApiUrl, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Extract all response headers for debugging
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      // Special handling for 403 Forbidden errors - log to console for visibility
      if (response.status === 403) {
        console.error('\n🚨 FIGMA 403 FORBIDDEN ERROR');
        console.error('  Function: fetchFigmaNode');
        console.error('  File Key:', fileKey);
        console.error('  Node ID:', nodeId);
        console.error('  URL:', figmaApiUrl);
        console.error('  Status:', response.status, response.statusText);
        console.error('  Response Body:', errorText);
        console.error('  Response Headers:', JSON.stringify(headers, null, 2));
        console.error('');
      }
      
      logger.error('Figma API error response', {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
        body: errorText,
      });
      
      // Handle rate limiting with user-friendly message
      if (response.status === 429) {
        const message = await createRateLimitErrorMessage(figmaApiUrl, response, errorText);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      // Handle 403 Forbidden as unrecoverable (authentication/permission issue)
      if (response.status === 403) {
        const message = await create403ErrorMessage(figmaApiUrl, response, client);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      throw new Error(`Figma API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // The /nodes endpoint returns { nodes: { "nodeId": { document: {...} } } }
    const nodeData = (data as any).nodes?.[nodeId];
    
    if (!nodeData) {
      throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
    }
    
    console.log(`    🎨 ${figmaApiUrl} (${response.status})`);
    return nodeData.document;
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      logger.error('Figma API request timed out');
      throw new Error(`Figma API request timed out after ${timeoutMs}ms`);
    }
    
    throw error;
  }
}

/**
 * Recursively search for a node in the Figma document tree
 * 
 * @param node - Current node to search
 * @param targetNodeId - Node ID to find (in API format: "123:456")
 * @returns Found node or null
 */
export function findNodeInDocument(node: any, targetNodeId: string): any {
  // Check if current node matches
  if (node.id === targetNodeId) {
    return node;
  }
  
  // Search in children if they exist
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findNodeInDocument(child, targetNodeId);
      if (found) {
        return found;
      }
    }
  }
  
  return null;
}

/**
 * Extract core metadata from a Figma node
 * 
 * @param node - Figma node object
 * @returns Extracted metadata
 */
export function extractNodeMetadata(node: any): FigmaNodeMetadata {
  return {
    id: node.id,
    name: node.name || 'Unnamed Layer',
    type: node.type || 'UNKNOWN',
    visible: node.visible !== false,
    locked: node.locked === true,
    absoluteBoundingBox: node.absoluteBoundingBox || null,
    children: node.children,
  };
}

/**
 * Get metadata for a specific node by fetching the file
 * @param client - Figma API client
 * @param url - Figma file URL
 * @param nodeId - Node ID to extract metadata for (in URL format with dashes)
 * @returns Node metadata
 * @throws Error if URL is invalid, file can't be fetched, or node not found
 */
export async function getNodeMetadata(
  client: FigmaClient,
  url: string,
  nodeId: string
): Promise<FigmaNodeMetadata> {
  // Parse URL
  const urlInfo = parseFigmaUrl(url);
  if (!urlInfo) {
    throw new Error('Invalid Figma URL format');
  }
  
  // Fetch file data
  const fileData = await fetchFigmaFile(client, urlInfo.fileKey);
  
  // Convert node ID to API format
  const apiNodeId = convertNodeIdToApiFormat(nodeId);
  
  // Find node in document
  const node = findNodeInDocument(fileData.document, apiNodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  
  // Extract and return metadata
  return extractNodeMetadata(node);
}

/**
 * Get all FRAME and note (INSTANCE with name "Note") nodes from a Figma file
 * 
 * Useful for extracting screens and notes from a design file.
 * 
 * @param fileData - Figma file data (from fetchFigmaFile)
 * @returns Array of frame and note nodes
 */
export function extractFramesAndNotes(fileData: any): FigmaNodeMetadata[] {
  const results: FigmaNodeMetadata[] = [];
  
  function traverse(node: any) {
    if (node.type === 'FRAME' || (node.type === 'INSTANCE' && node.name === 'Note')) {
      results.push(extractNodeMetadata(node));
    }
    
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  
  if (fileData.document) {
    traverse(fileData.document);
  }
  
  return results;
}

/**
 * Get frames and notes for a specific node based on its type
 * 
 * - If node is CANVAS: Returns only first-level children that are frames or notes
 * - If node is FRAME or note (INSTANCE with name "Note"): Returns just that node
 * - Otherwise: Returns empty array
 * 
 * @param fileData - Figma file data (from fetchFigmaFile)
 * @param nodeId - Node ID in API format (e.g., "123:456"), optional
 * @returns Array of frame and note nodes
 */
/**
 * Helper: Extract first-level frames and notes from a container node's children
 * Used by both CANVAS and SECTION handling
 * 
 * Automatically expands SECTION nodes to get their child frames.
 * 
 * @param containerNode - The parent node (CANVAS or SECTION)
 * @returns Array of frame and note metadata
 */
function extractFramesAndNotesFromChildren(
  containerNode: any
): FigmaNodeMetadata[] {
  const results: FigmaNodeMetadata[] = [];
  
  if (containerNode.children && Array.isArray(containerNode.children)) {
    for (const child of containerNode.children) {
      // Frames are type === "FRAME"
      if (child.type === 'FRAME') {
        const metadata = extractNodeMetadata(child);
        results.push(metadata);
      }
      // Notes are type === "INSTANCE" with name === "Note"
      else if (child.type === 'INSTANCE' && child.name === 'Note') {
        const metadata = extractNodeMetadata(child);
        results.push(metadata);
      }
      // SECTION nodes should be automatically expanded to get their child frames
      else if (child.type === 'SECTION') {
        console.log(`  Found SECTION: "${child.name}" - expanding to get child frames`);
        const sectionResults = extractFramesAndNotesFromChildren(child);
        console.log(`    Collected ${sectionResults.length} frames/notes from SECTION`);
        results.push(...sectionResults);
      }
    }
  }
  
  return results;
}

export function getFramesAndNotesForNode(
  fileData: any,
  nodeId?: string
): FigmaNodeMetadata[] {
  // If no nodeId provided, find all frames and notes in document
  if (!nodeId) {
    return extractFramesAndNotes(fileData);
  }
  
  // Handle both full file responses (with .document) and direct node responses
  // fetchFigmaNode returns the node directly, while fetchFigmaFile returns { document: ... }
  const documentRoot = fileData.document || fileData;
  
  // Find the target node
  const targetNode = findNodeInDocument(documentRoot, nodeId);
  
  if (!targetNode) {
    console.log(`  Node ${nodeId} not found in document`);
    return [];
  }
  
  console.log(`  Found node type: ${targetNode.type}, name: ${targetNode.name}`);
  
  // Check if this is a CANVAS (page)
  if (targetNode.type === 'CANVAS') {
    console.log('  Node is CANVAS - collecting first-level frames and notes');
    const results = extractFramesAndNotesFromChildren(targetNode);
    console.log(`  Collected ${results.length} first-level frames/notes from CANVAS`);
    return results;
  }
  
  // Check if this is a SECTION
  if (targetNode.type === 'SECTION') {
    console.log(`  Node is SECTION: "${targetNode.name}" - expanding to child frames`);
    const results = extractFramesAndNotesFromChildren(targetNode);
    console.log(`  Collected ${results.length} frames/notes from SECTION`);
    return results;
  }
  
  // Check if this is a FRAME
  if (targetNode.type === 'FRAME') {
    console.log('  Node is FRAME - returning single node');
    return [extractNodeMetadata(targetNode)];
  }
  
  // Check if this is a note (INSTANCE with name "Note")
  if (targetNode.type === 'INSTANCE' && targetNode.name === 'Note') {
    console.log('  Node is Note (INSTANCE) - returning single node');
    return [extractNodeMetadata(targetNode)];
  }
  
  console.log(`  Node type ${targetNode.type} is not a CANVAS, SECTION, FRAME, or Note - returning empty`);
  return [];
}

/**
 * Convert string to kebab-case slug
 * @param str - Input string
 * @returns Kebab-case slug
 */
export function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')  // Remove special chars except spaces and dashes
    .replace(/\s+/g, '-')       // Spaces to dashes
    .replace(/-+/g, '-')        // Collapse multiple dashes
    .replace(/^-|-$/g, '');     // Trim leading/trailing dashes
}

/**
 * Generate filename for a screen analysis file
 * 
 * Format: {frame-slug}_{node-id}
 * 
 * Examples:
 * - "workshop-grid-1024px_5101-4299"
 * - "dashboard-main_1234-5678"
 * 
 * @param frameName - Name of the frame
 * @param nodeId - Node ID in API format (e.g., "5101:4299")
 * @returns Filename without extension
 */
export function generateScreenFilename(
  frameName: string,
  nodeId: string
): string {
  const frameSlug = toKebabCase(frameName);
  const nodeIdSlug = nodeId.replace(/:/g, '-'); // Convert "5101:4299" to "5101-4299"
  
  return `${frameSlug}_${nodeIdSlug}`;
}

/**
 * Download options for Figma images
 */
export interface FigmaImageDownloadOptions {
  format?: 'png' | 'jpg' | 'svg' | 'pdf';
  scale?: number; // 0.1 to 4
}

/**
 * Result of downloading a Figma image
 */
export interface FigmaImageDownloadResult {
  base64Data: string;
  mimeType: string;
  byteSize: number;
  imageUrl: string;
}

/**
 * Download an image from Figma
 * 
 * This fetches the image URL from Figma API, then downloads the actual image.
 * 
 * @param client - Figma API client
 * @param fileKey - Figma file key
 * @param nodeId - Node ID in API format (e.g., "123:456")
 * @param options - Download options (format, scale)
 * @returns Image data as base64 with metadata
 * @throws Error if download fails
 */
export async function downloadFigmaImage(
  client: FigmaClient,
  fileKey: string,
  nodeId: string,
  options: FigmaImageDownloadOptions = {}
): Promise<FigmaImageDownloadResult> {
  const { format = 'png', scale = 1 } = options;
  
  // Step 1: Get image URL from Figma API
  const figmaApiUrl = `${client.getBaseUrl()}/images/${fileKey}`;
  const params = new URLSearchParams({
    ids: nodeId,
    format,
    scale: scale.toString(),
  });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
  
  try {
    const response = await client.fetch(`${figmaApiUrl}?${params}`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Figma images API error', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      
      // Extract all response headers for debugging
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      // Handle rate limiting with user-friendly message
      if (response.status === 429) {
        const message = await createRateLimitErrorMessage(`${figmaApiUrl}?${params}`, response, errorText);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      // Handle 403 Forbidden as unrecoverable (authentication/permission issue)
      if (response.status === 403) {
        const message = await create403ErrorMessage(`${figmaApiUrl}?${params}`, response, client);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      throw new Error(`Figma images API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    if (data.err) {
      throw new Error(`Figma API error: ${data.err}`);
    }
    
    const imageUrl = data.images?.[nodeId];
    if (!imageUrl) {
      throw new Error(`No image URL returned for node ${nodeId}`);
    }
    
    // Step 2: Download the actual image from Figma CDN
    const imageController = new AbortController();
    const imageTimeoutId = setTimeout(() => imageController.abort(), 30000); // 30 second timeout
    
    try {
      const imageResponse = await fetch(imageUrl, {
        signal: imageController.signal,
      });
      
      clearTimeout(imageTimeoutId);
      
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from CDN: ${imageResponse.status} ${imageResponse.statusText}`);
      }
      
      const imageBlob = await imageResponse.blob();
      console.log(`    Downloaded image: ${Math.round(imageBlob.size / 1024)}KB`);
      
      // Step 3: Convert to base64
      const arrayBuffer = await imageBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Data = buffer.toString('base64');
      
      return {
        base64Data,
        mimeType: imageBlob.type || 'image/png',
        byteSize: imageBlob.size,
        imageUrl,
      };
      
    } catch (error: any) {
      clearTimeout(imageTimeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Image download timed out after 30 seconds');
      }
      
      throw error;
    }
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Figma API request timed out after 60 seconds');
    }
    
    throw error;
  }
}

/**
 * Batch size configuration for chunking large requests
 */
const MAX_BATCH_SIZE = 50;

/**
 * Fetch multiple nodes from a Figma file in a single request (or multiple chunked requests)
 * 
 * This function batches node fetches to reduce API calls and improve rate limit efficiency.
 * For large batches (>50 nodes), automatically chunks into multiple requests.
 * 
 * @param client - Figma API client
 * @param fileKey - The Figma file key
 * @param nodeIds - Array of node IDs to fetch (in API format with colon, e.g., "123:456")
 * @param options - Optional configuration for timeout and batch size
 * @returns Map of node IDs to node data (document property). Nodes not found will have null values.
 * @throws FigmaUnrecoverableError for rate limits (429) or auth issues (403)
 * @throws Error for other failures
 * 
 * @example
 * ```typescript
 * const nodeIds = ["123:456", "789:012", "345:678"];
 * const nodesMap = await fetchFigmaNodesBatch(client, fileKey, nodeIds);
 * 
 * for (const [nodeId, nodeData] of nodesMap.entries()) {
 *   if (nodeData) {
 *     // Process node...
 *   } else {
 *     // Node not found
 *   }
 * }
 * ```
 */
export async function fetchFigmaNodesBatch(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  options: { timeoutMs?: number; maxBatchSize?: number } = {}
): Promise<Map<string, any>> {
  const timeoutMs = options.timeoutMs || 60000;
  const maxBatchSize = options.maxBatchSize || MAX_BATCH_SIZE;
  
  // Handle empty array
  if (nodeIds.length === 0) {
    return new Map();
  }
  
  // Chunk large requests (iterative, not recursive)
  if (nodeIds.length > maxBatchSize) {
    console.log(`  📦 Chunking ${nodeIds.length} nodes into batches of ${maxBatchSize}...`);
    
    const allResults = new Map<string, any>();
    const chunks: string[][] = [];
    
    // Create chunks
    for (let i = 0; i < nodeIds.length; i += maxBatchSize) {
      chunks.push(nodeIds.slice(i, i + maxBatchSize));
    }
    
    console.log(`    Processing ${chunks.length} chunks...`);
    
    // Fetch each chunk sequentially (to avoid overwhelming API)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`    Fetching chunk ${i + 1}/${chunks.length} (${chunk.length} nodes)...`);
      
      // Make single batch request for this chunk
      const chunkResults = await fetchFigmaNodesBatchSingle(client, fileKey, chunk, timeoutMs);
      
      // Merge into combined results
      for (const [nodeId, nodeData] of chunkResults.entries()) {
        allResults.set(nodeId, nodeData);
      }
    }
    
    console.log(`    ✅ Fetched ${allResults.size}/${nodeIds.length} nodes across ${chunks.length} chunks`);
    return allResults;
  }
  
  // Single batch request (no chunking needed)
  return fetchFigmaNodesBatchSingle(client, fileKey, nodeIds, timeoutMs);
}

/**
 * Internal helper: Fetch a single batch of nodes (no chunking)
 * 
 * @param client - Figma API client
 * @param fileKey - The Figma file key
 * @param nodeIds - Array of node IDs (max 50 recommended)
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Map of node IDs to node data
 */
async function fetchFigmaNodesBatchSingle(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  timeoutMs: number
): Promise<Map<string, any>> {
  const figmaApiUrl = `${client.getBaseUrl()}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeIds.join(','))}`;
  
  console.log(`  Fetching batch of ${nodeIds.length} nodes from ${fileKey}...`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await client.fetch(figmaApiUrl, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Extract headers for debugging
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      // Special handling for 403 Forbidden errors
      if (response.status === 403) {
        console.error('\n🚨 FIGMA 403 FORBIDDEN ERROR');
        console.error('  Function: fetchFigmaNodesBatchSingle');
        console.error('  File Key:', fileKey);
        console.error('  Node IDs:', nodeIds.join(', '));
        console.error('  URL:', figmaApiUrl);
        console.error('  Status:', response.status, response.statusText);
        console.error('  Response Body:', errorText);
        console.error('  Response Headers:', JSON.stringify(headers, null, 2));
        console.error('');
      }
      
      logger.error('Figma API error response', {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
        body: errorText,
      });
      
      // Handle rate limiting
      if (response.status === 429) {
        const message = await createRateLimitErrorMessage(figmaApiUrl, response, errorText);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      // Handle 403 Forbidden
      if (response.status === 403) {
        const message = await create403ErrorMessage(figmaApiUrl, response, client);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      throw new Error(`Figma API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json() as any;
    
    // Parse response: { nodes: { "123:456": { document: {...} }, "789:012": { document: {...} } } }
    const nodesMap = new Map<string, any>();
    
    if (data.nodes) {
      for (const [nodeId, nodeInfo] of Object.entries(data.nodes)) {
        // nodeInfo could be null if node not found
        if (nodeInfo && typeof nodeInfo === 'object' && 'document' in nodeInfo) {
          nodesMap.set(nodeId, (nodeInfo as any).document);
        } else {
          // Node not found or invalid - store null
          nodesMap.set(nodeId, null);
        }
      }
    }
    
    console.log(`  ✅ Batch fetch complete: ${nodesMap.size}/${nodeIds.length} nodes retrieved`);
    return nodesMap;
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      logger.error('Figma API request timed out');
      throw new Error(`Figma API request timed out after ${timeoutMs}ms`);
    }
    
    throw error;
  }
}

/**
 * Download multiple images from Figma in a single API request
 * 
 * This function batches image URL requests to reduce API calls and improve rate limit efficiency.
 * Makes one API request to get all image URLs, then downloads from CDN in parallel.
 * For large batches (>50 images), automatically chunks the API requests.
 * 
 * @param client - Figma API client
 * @param fileKey - Figma file key
 * @param nodeIds - Array of node IDs in API format (e.g., "123:456")
 * @param options - Download options (format, scale)
 * @returns Map of node IDs to image data. Nodes that couldn't be rendered will have null values.
 * @throws FigmaUnrecoverableError for rate limits (429) or auth issues (403)
 * @throws Error for other failures
 * 
 * @example
 * ```typescript
 * const nodeIds = ["123:456", "789:012"];
 * const imagesMap = await downloadFigmaImagesBatch(client, fileKey, nodeIds, { format: 'png', scale: 1 });
 * 
 * for (const [nodeId, imageResult] of imagesMap.entries()) {
 *   if (imageResult) {
 *     // Save or process image...
 *     const buffer = Buffer.from(imageResult.base64Data, 'base64');
 *   }
 * }
 * ```
 */
export async function downloadFigmaImagesBatch(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  options: FigmaImageDownloadOptions = {}
): Promise<Map<string, FigmaImageDownloadResult | null>> {
  const { format = 'png', scale = 1 } = options;
  
  // Handle empty array
  if (nodeIds.length === 0) {
    return new Map();
  }
  
  // Chunk large requests (iterative, not recursive)
  if (nodeIds.length > MAX_BATCH_SIZE) {
    console.log(`  📦 Chunking ${nodeIds.length} image requests into batches of ${MAX_BATCH_SIZE}...`);
    
    const allResults = new Map<string, FigmaImageDownloadResult | null>();
    const chunks: string[][] = [];
    
    // Create chunks
    for (let i = 0; i < nodeIds.length; i += MAX_BATCH_SIZE) {
      chunks.push(nodeIds.slice(i, i + MAX_BATCH_SIZE));
    }
    
    console.log(`    Processing ${chunks.length} chunks...`);
    
    // Fetch each chunk sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`    Fetching chunk ${i + 1}/${chunks.length} (${chunk.length} images)...`);
      
      const chunkResults = await downloadFigmaImagesBatchSingle(client, fileKey, chunk, { format, scale });
      
      // Merge into combined results
      for (const [nodeId, imageData] of chunkResults.entries()) {
        allResults.set(nodeId, imageData);
      }
    }
    
    console.log(`    ✅ Downloaded ${allResults.size}/${nodeIds.length} images across ${chunks.length} chunks`);
    return allResults;
  }
  
  // Single batch request
  return downloadFigmaImagesBatchSingle(client, fileKey, nodeIds, { format, scale });
}

/**
 * Internal helper: Download a single batch of images (no chunking)
 */
async function downloadFigmaImagesBatchSingle(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  options: FigmaImageDownloadOptions
): Promise<Map<string, FigmaImageDownloadResult | null>> {
  const { format = 'png', scale = 1 } = options;
  
  console.log(`  Downloading batch of ${nodeIds.length} images (${format}, ${scale}x)...`);
  
  // Step 1: Get image URLs from Figma API
  const figmaApiUrl = `${client.getBaseUrl()}/images/${fileKey}`;
  const params = new URLSearchParams({
    ids: nodeIds.join(','),
    format,
    scale: scale.toString(),
  });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  
  try {
    const response = await client.fetch(`${figmaApiUrl}?${params}`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Extract headers for debugging
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      logger.error('Figma images API error', {
        status: response.status,
        statusText: response.statusText,
        headers: headers,
        body: errorText,
      });
      
      // Handle rate limiting
      if (response.status === 429) {
        const message = await createRateLimitErrorMessage(`${figmaApiUrl}?${params}`, response, errorText);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      // Handle 403 Forbidden
      if (response.status === 403) {
        const message = await create403ErrorMessage(`${figmaApiUrl}?${params}`, response, client);
        throw new FigmaUnrecoverableError(message, response.status);
      }
      
      throw new Error(`Figma images API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    if (data.err) {
      throw new Error(`Figma API error: ${data.err}`);
    }
    
    if (!data.images) {
      throw new Error('No images field in Figma API response');
    }
    
    console.log(`    🎨 Batch downloading ${nodeIds.length} images (${response.status})`);
    
    // Step 2: Download images from CDN in parallel
    const downloadPromises = nodeIds.map(async (nodeId): Promise<[string, FigmaImageDownloadResult | null]> => {
      const imageUrl = data.images[nodeId];
      
      if (!imageUrl) {
        console.log(`    ⚠️  No image URL for node ${nodeId} (couldn't be rendered)`);
        return [nodeId, null];
      }
      
      try {
        const imageController = new AbortController();
        const imageTimeoutId = setTimeout(() => imageController.abort(), 30000);
        
        const imageResponse = await fetch(imageUrl, {
          signal: imageController.signal,
        });
        
        clearTimeout(imageTimeoutId);
        
        if (!imageResponse.ok) {
          console.log(`    ⚠️  Failed to download image for ${nodeId}: ${imageResponse.status}`);
          return [nodeId, null];
        }
        
        const imageBlob = await imageResponse.blob();
        
        // Convert to base64
        const arrayBuffer = await imageBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Data = buffer.toString('base64');
        
        return [nodeId, {
          base64Data,
          mimeType: imageBlob.type || 'image/png',
          byteSize: imageBlob.size,
          imageUrl,
        }];
        
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log(`    ⚠️  Image download timed out for ${nodeId}`);
        } else {
          console.log(`    ⚠️  Error downloading image for ${nodeId}: ${error.message}`);
        }
        return [nodeId, null];
      }
    });
    
    const results = await Promise.all(downloadPromises);
    const imagesMap = new Map(results);
    
    const successCount = Array.from(imagesMap.values()).filter(v => v !== null).length;
    const totalSize = Array.from(imagesMap.values())
      .filter(v => v !== null)
      .reduce((sum, v) => sum + v!.byteSize, 0);
    
    console.log(`  ✅ Downloaded ${successCount}/${nodeIds.length} images (${Math.round(totalSize / 1024)}KB total)`);
    
    return imagesMap;
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      logger.error('Figma API request timed out');
      throw new Error('Figma images API request timed out after 60 seconds');
    }
    
    throw error;
  }
}

