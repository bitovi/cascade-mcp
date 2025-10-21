/**
 * Figma Helper Functions
 * 
 * Shared utilities for working with Figma API across different tools.
 * Extracted from existing Figma tools to enable reuse.
 */

import { logger } from '../../observability/logger.js';

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
 * Fetch Figma file data from the API
 * 
 * @param fileKey - Figma file key
 * @param token - Figma access token
 * @param timeoutMs - Request timeout in milliseconds (default 60000)
 * @returns Figma file data
 * @throws Error if request fails
 */
export async function fetchFigmaFile(
  fileKey: string,
  token: string,
  timeoutMs: number = 60000
): Promise<any> {
  const figmaApiUrl = `https://api.figma.com/v1/files/${fileKey}`;
  console.log('  Fetching Figma file:', fileKey);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(figmaApiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    console.log('  Figma API response:', { status: response.status, ok: response.ok });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Figma API error response', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`Figma API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('  Figma file data received successfully');
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
 * Fetch specific Figma node(s) using the /nodes endpoint (more efficient than fetching full file)
 * 
 * By default, this returns the node AND all its children (full subtree).
 * This is more efficient than fetchFigmaFile() when you only need a specific node.
 * 
 * @param fileKey - Figma file key
 * @param nodeId - Node ID in API format (e.g., "123:456")
 * @param token - Figma access token
 * @param timeoutMs - Request timeout in milliseconds (default 60000)
 * @returns Figma node data with full subtree
 * @throws Error if request fails or node not found
 */
export async function fetchFigmaNode(
  fileKey: string,
  nodeId: string,
  token: string,
  timeoutMs: number = 60000
): Promise<any> {
  const figmaApiUrl = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`;
  console.log('  Fetching Figma node:', { fileKey, nodeId });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(figmaApiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    console.log('  Figma nodes API response:', { status: response.status, ok: response.ok });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Figma API error response', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`Figma API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // The /nodes endpoint returns { nodes: { "nodeId": { document: {...} } } }
    const nodeData = (data as any).nodes?.[nodeId];
    
    if (!nodeData) {
      throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
    }
    
    console.log('  Figma node data received successfully');
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
 * Get metadata for a specific Figma layer/node
 * 
 * This is a convenience function that combines parsing, fetching, and finding.
 * 
 * @param url - Figma URL
 * @param nodeId - Node ID in URL format (e.g., "123-456")
 * @param token - Figma access token
 * @returns Node metadata
 * @throws Error if URL is invalid, file can't be fetched, or node not found
 */
export async function getNodeMetadata(
  url: string,
  nodeId: string,
  token: string
): Promise<FigmaNodeMetadata> {
  // Parse URL
  const urlInfo = parseFigmaUrl(url);
  if (!urlInfo) {
    throw new Error('Invalid Figma URL format');
  }
  
  // Fetch file data
  const fileData = await fetchFigmaFile(urlInfo.fileKey, token);
  
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
export function getFramesAndNotesForNode(
  fileData: any,
  nodeId?: string
): FigmaNodeMetadata[] {
  // If no nodeId provided, find all frames and notes in document
  if (!nodeId) {
    return extractFramesAndNotes(fileData);
  }
  
  // Find the target node
  const targetNode = findNodeInDocument(fileData.document, nodeId);
  
  if (!targetNode) {
    console.log(`  Node ${nodeId} not found in document`);
    return [];
  }
  
  console.log(`  Found node type: ${targetNode.type}, name: ${targetNode.name}`);
  
  // Check if this is a CANVAS (page)
  if (targetNode.type === 'CANVAS') {
    console.log('  Node is CANVAS - collecting first-level frames and notes');
    
    // Get only first-level children that are frames or notes
    const results: FigmaNodeMetadata[] = [];
    
    if (targetNode.children && Array.isArray(targetNode.children)) {
      for (const child of targetNode.children) {
        // Frames are type === "FRAME"
        if (child.type === 'FRAME') {
          const metadata = extractNodeMetadata(child);
          results.push(metadata);
        }
        // Sticky notes are type === "INSTANCE" and name === "Note"
        else if (child.type === 'INSTANCE' && child.name === 'Note') {
          const metadata = extractNodeMetadata(child);
          results.push(metadata);
        }
      }
    }
    
    console.log(`  Collected ${results.length} first-level frames/notes from CANVAS`);
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
  
  console.log(`  Node type ${targetNode.type} is not a CANVAS, FRAME, or Note - returning empty`);
  return [];
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
 * @param fileKey - Figma file key
 * @param nodeId - Node ID in API format (e.g., "123:456")
 * @param token - Figma access token
 * @param options - Download options (format, scale)
 * @returns Image data as base64 with metadata
 * @throws Error if download fails
 */
export async function downloadFigmaImage(
  fileKey: string,
  nodeId: string,
  token: string,
  options: FigmaImageDownloadOptions = {}
): Promise<FigmaImageDownloadResult> {
  const { format = 'png', scale = 1 } = options;
  
  console.log(`  Downloading Figma image: ${nodeId} (${format}, ${scale}x)`);
  
  // Step 1: Get image URL from Figma API
  const figmaApiUrl = `https://api.figma.com/v1/images/${fileKey}`;
  const params = new URLSearchParams({
    ids: nodeId,
    format,
    scale: scale.toString(),
  });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
  
  try {
    const response = await fetch(`${figmaApiUrl}?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
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
    
    console.log(`    Got image URL from Figma API`);
    
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

