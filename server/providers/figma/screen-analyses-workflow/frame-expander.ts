/**
 * Frame Expander
 * 
 * Expands CANVAS, SECTION, and other container nodes to individual frames.
 * Extracts sticky notes from the container for annotation association.
 */

import {
  getFramesAndNotesForNode as defaultGetFramesAndNotesForNode,
  extractNodeMetadata as defaultExtractNodeMetadata,
  type FigmaNodeMetadata,
} from '../figma-helpers.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Dependencies for frame expansion
 * All dependencies have sensible defaults for production use.
 * Override in tests to inject mock implementations.
 */
export interface FrameExpanderDeps {
  getFramesAndNotesForNode?: typeof defaultGetFramesAndNotesForNode;
  extractNodeMetadata?: typeof defaultExtractNodeMetadata;
}

/**
 * Result of expanding nodes to frames
 */
export interface ExpandedFrames {
  /** Individual FRAME nodes found */
  frames: FigmaNodeMetadata[];
  
  /** Note nodes (INSTANCE with name "Note") found */
  notes: FigmaNodeMetadata[];
  
  /** Updated node data map with child node data included */
  nodesDataMap: Map<string, any>;
  
  /** Parent SECTION context if applicable */
  sectionContext?: {
    sectionName: string;
    sectionId: string;
  };
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Expand a node to its constituent frames and notes
 * 
 * Handles different node types:
 * - CANVAS (page): Returns first-level child frames and notes
 * - SECTION: Returns child frames with section context
 * - FRAME: Returns the single frame
 * - Note (INSTANCE): Returns the single note
 * 
 * @param nodeData - Full node data from Figma API (with children)
 * @param nodeId - Node ID being expanded (for logging)
 * @param deps - Optional dependency overrides for testing
 * @returns Expanded frames and notes with section context
 */
export function expandNode(
  nodeData: any,
  nodeId: string,
  {
    extractNodeMetadata = defaultExtractNodeMetadata,
  }: Pick<FrameExpanderDeps, 'extractNodeMetadata'> = {}
): ExpandedFrames {
  const emptyNodesDataMap = new Map<string, any>();
  
  if (!nodeData) {
    console.log(`  Node ${nodeId} has no data`);
    return { frames: [], notes: [], nodesDataMap: emptyNodesDataMap };
  }
  
  const nodeType = nodeData.type;
  const nodeName = nodeData.name || 'Unnamed';
  
  console.log(`  Expanding node: ${nodeName} (${nodeType})`);
  
  // Handle CANVAS (page level)
  if (nodeType === 'CANVAS') {
    return expandCanvasNode(nodeData, extractNodeMetadata);
  }
  
  // Handle SECTION
  if (nodeType === 'SECTION') {
    return expandSectionNode(nodeData, extractNodeMetadata);
  }
  
  // Handle FRAME
  if (nodeType === 'FRAME') {
    const metadata = extractNodeMetadata(nodeData);
    const nodesMap = new Map([[nodeData.id, nodeData]]);
    return { frames: [metadata], notes: [], nodesDataMap: nodesMap };
  }
  
  // Handle Note (INSTANCE with name "Note")
  if (nodeType === 'INSTANCE' && nodeData.name === 'Note') {
    const metadata = extractNodeMetadata(nodeData);
    const nodesMap = new Map([[nodeData.id, nodeData]]);
    return { frames: [], notes: [metadata], nodesDataMap: nodesMap };
  }
  
  console.log(`  Node type ${nodeType} is not expandable - returning empty`);
  return { frames: [], notes: [], nodesDataMap: emptyNodesDataMap };
}

/**
 * Expand multiple nodes and deduplicate results
 * 
 * Combines frames and notes from all nodes, deduplicating by node ID.
 * Also builds an updated nodesDataMap that includes child node data
 * for all expanded frames.
 * 
 * @param nodesDataMap - Map of nodeId -> node data
 * @param deps - Optional dependency overrides for testing
 * @returns Combined and deduplicated frames, notes, and updated nodesDataMap
 */
export function expandNodes(
  nodesDataMap: Map<string, any>,
  deps: Pick<FrameExpanderDeps, 'extractNodeMetadata'> = {}
): ExpandedFrames {
  const allFrames: FigmaNodeMetadata[] = [];
  const allNotes: FigmaNodeMetadata[] = [];
  const seenFrameIds = new Set<string>();
  const seenNoteIds = new Set<string>();
  
  // Start with a copy of the original nodesDataMap
  const updatedNodesDataMap = new Map(nodesDataMap);
  
  for (const [nodeId, nodeData] of nodesDataMap.entries()) {
    const expanded = expandNode(nodeData, nodeId, deps);
    
    // Add child node data to the map for expanded frames
    if (nodeData.children && Array.isArray(nodeData.children)) {
      for (const child of nodeData.children) {
        if (child.id) {
          updatedNodesDataMap.set(child.id, child);
        }
      }
    }
    
    // Add frames (dedupe by ID)
    for (const frame of expanded.frames) {
      if (!seenFrameIds.has(frame.id)) {
        seenFrameIds.add(frame.id);
        allFrames.push(frame);
      }
    }
    
    // Add notes (dedupe by ID)
    for (const note of expanded.notes) {
      if (!seenNoteIds.has(note.id)) {
        seenNoteIds.add(note.id);
        allNotes.push(note);
      }
    }
  }
  
  console.log(`  Expansion complete: ${allFrames.length} frames, ${allNotes.length} notes`);
  
  return { frames: allFrames, notes: allNotes, nodesDataMap: updatedNodesDataMap };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Expand CANVAS node to first-level frames and notes
 */
function expandCanvasNode(
  nodeData: any,
  extractNodeMetadata: typeof defaultExtractNodeMetadata
): ExpandedFrames {
  const frames: FigmaNodeMetadata[] = [];
  const notes: FigmaNodeMetadata[] = [];
  const nodesMap = new Map<string, any>();
  
  if (!nodeData.children || !Array.isArray(nodeData.children)) {
    return { frames, notes, nodesDataMap: nodesMap };
  }
  
  for (const child of nodeData.children) {
    // Add child to nodesMap
    if (child.id) {
      nodesMap.set(child.id, child);
    }
    
    // Frames
    if (child.type === 'FRAME') {
      frames.push(extractNodeMetadata(child));
    }
    // Notes
    else if (child.type === 'INSTANCE' && child.name === 'Note') {
      notes.push(extractNodeMetadata(child));
    }
    // Expand SECTIONs automatically
    else if (child.type === 'SECTION') {
      console.log(`    Found SECTION: "${child.name}" - expanding child frames`);
      const sectionResult = expandSectionNode(child, extractNodeMetadata);
      frames.push(...sectionResult.frames);
      notes.push(...sectionResult.notes);
      // Merge section's nodesMap into our nodesMap
      for (const [id, data] of sectionResult.nodesDataMap.entries()) {
        nodesMap.set(id, data);
      }
    }
  }
  
  console.log(`    Expanded CANVAS to ${frames.length} frames, ${notes.length} notes`);
  return { frames, notes, nodesDataMap: nodesMap };
}

/**
 * Expand SECTION node to child frames with section context
 */
function expandSectionNode(
  nodeData: any,
  extractNodeMetadata: typeof defaultExtractNodeMetadata
): ExpandedFrames {
  const frames: FigmaNodeMetadata[] = [];
  const notes: FigmaNodeMetadata[] = [];
  const nodesMap = new Map<string, any>();
  
  const sectionContext = {
    sectionName: nodeData.name || 'Unnamed Section',
    sectionId: nodeData.id,
  };
  
  if (!nodeData.children || !Array.isArray(nodeData.children)) {
    return { frames, notes, nodesDataMap: nodesMap, sectionContext };
  }
  
  for (const child of nodeData.children) {
    // Add child to nodesMap
    if (child.id) {
      nodesMap.set(child.id, child);
    }
    
    // Frames
    if (child.type === 'FRAME') {
      const metadata = extractNodeMetadata(child);
      // Inject section context into the metadata (via children prop hack for now)
      // The orchestrator should handle this properly
      frames.push(metadata);
    }
    // Notes
    else if (child.type === 'INSTANCE' && child.name === 'Note') {
      notes.push(extractNodeMetadata(child));
    }
  }
  
  console.log(`    Expanded SECTION "${sectionContext.sectionName}" to ${frames.length} frames, ${notes.length} notes`);
  return { frames, notes, nodesDataMap: nodesMap, sectionContext };
}

/**
 * Separate frames and notes from mixed metadata array
 * 
 * Useful when processing legacy data that mixes frames and notes.
 * 
 * @param metadata - Array of node metadata
 * @returns Separated frames and notes
 */
export function separateFramesAndNotes(
  metadata: FigmaNodeMetadata[]
): { frames: FigmaNodeMetadata[]; notes: FigmaNodeMetadata[] } {
  const frames: FigmaNodeMetadata[] = [];
  const notes: FigmaNodeMetadata[] = [];
  
  for (const node of metadata) {
    if (node.type === 'INSTANCE' && node.name === 'Note') {
      notes.push(node);
    } else if (node.type === 'FRAME') {
      frames.push(node);
    }
  }
  
  return { frames, notes };
}

/**
 * Deduplicate frames by node ID
 * 
 * @param frames - Array of frame metadata (may have duplicates)
 * @returns Deduplicated array
 */
export function deduplicateFrames(
  frames: FigmaNodeMetadata[]
): FigmaNodeMetadata[] {
  const seen = new Set<string>();
  return frames.filter(frame => {
    if (seen.has(frame.id)) {
      return false;
    }
    seen.add(frame.id);
    return true;
  });
}
