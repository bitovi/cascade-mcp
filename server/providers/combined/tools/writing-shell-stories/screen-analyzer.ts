/**
 * Screen Analyzer
 * 
 * Spatial analysis utilities for associating notes with frames based on proximity.
 */

import type { FigmaNodeMetadata } from '../../../figma/figma-helpers.js';
import { generateScreenFilename } from '../../../figma/figma-helpers.js';

/**
 * Calculate Euclidean distance between two points
 */
export function calculateDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Calculate edge-to-edge distance between two rectangles
 * Returns 0 if rectangles overlap, otherwise the minimum distance between their edges
 */
export function calculateRectangleDistance(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): number {
  // Calculate horizontal distance
  const horizontalDistance = Math.max(
    0,
    Math.max(rect1.x - (rect2.x + rect2.width), rect2.x - (rect1.x + rect1.width))
  );
  
  // Calculate vertical distance
  const verticalDistance = Math.max(
    0,
    Math.max(rect1.y - (rect2.y + rect2.height), rect2.y - (rect1.y + rect1.height))
  );
  
  // Euclidean distance between closest points
  return Math.sqrt(horizontalDistance * horizontalDistance + verticalDistance * verticalDistance);
}

/**
 * Screen with associated notes
 */
export interface Screen {
  name: string;           // Node ID (existing)
  url: string;            // Figma URL (existing)
  notes: string[];        // Associated notes (existing)
  
  // New fields for enhanced metadata
  frameName?: string;     // Human-readable frame name
  sectionName?: string;   // Parent SECTION name if applicable
  sectionId?: string;     // Parent SECTION ID if applicable
  filename?: string;      // Filename without extension for .analysis.md and .png files
}

/**
 * Result of note-to-frame association
 */
export interface AssociationResult {
  screens: Screen[];
  unassociatedNotes: string[];
}

/**
 * Associate notes with frames based on spatial proximity
 * 
 * Each note is assigned to its closest frame (if within maxDistance).
 * Uses edge-to-edge distance calculation to handle large frames correctly.
 * 
 * @param frames - Array of FRAME nodes
 * @param notes - Array of note nodes (INSTANCE with name "Note")
 * @param baseUrl - Base Figma URL for constructing node URLs
 * @param maxDistance - Maximum distance threshold (default 500px)
 * @returns Object with screens array and unassociated notes
 */
export function associateNotesWithFrames(
  frames: FigmaNodeMetadata[],
  notes: FigmaNodeMetadata[],
  baseUrl: string,
  maxDistance: number = 500
): AssociationResult {
  console.log(`  Associating ${notes.length} notes with ${frames.length} frames (max distance: ${maxDistance}px)...`);
  
  const assignedNotes = new Set<string>();
  
  // Sort frames by position (top-to-bottom, left-to-right)
  const sortedFrames = [...frames].sort((a, b) => {
    if (!a.absoluteBoundingBox || !b.absoluteBoundingBox) return 0;
    
    // Primary sort by Y (top-to-bottom)
    const yDiff = a.absoluteBoundingBox.y - b.absoluteBoundingBox.y;
    if (Math.abs(yDiff) > 50) return yDiff; // Allow 50px tolerance for same row
    
    // Secondary sort by X (left-to-right)
    return a.absoluteBoundingBox.x - b.absoluteBoundingBox.x;
  });
  
  // For each note, find the closest frame
  const noteAssignments: Map<string, { frameId: string; distance: number }> = new Map();
  
  for (const note of notes) {
    if (!note.absoluteBoundingBox) continue;
    
    let closestFrame: FigmaNodeMetadata | null = null;
    let minDistance = Infinity;
    
    for (const frame of frames) {
      if (!frame.absoluteBoundingBox) continue;
      
      // Calculate edge-to-edge distance between rectangles
      const distance = calculateRectangleDistance(
        frame.absoluteBoundingBox,
        note.absoluteBoundingBox
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestFrame = frame;
      }
    }
    
    // Only assign if closest frame is within threshold
    if (closestFrame && minDistance <= maxDistance) {
      noteAssignments.set(note.id, {
        frameId: closestFrame.id,
        distance: minDistance
      });
      assignedNotes.add(note.id);
    }
  }
  
  // Build screens array with assigned notes
  const screens: Screen[] = [];
  
  for (const frame of sortedFrames) {
    if (!frame.absoluteBoundingBox) continue;
    
    // Find all notes assigned to this frame
    const frameNotes = notes.filter(note => 
      noteAssignments.get(note.id)?.frameId === frame.id
    );
    
    // Sort notes by distance (closest first)
    frameNotes.sort((a, b) => {
      const distA = noteAssignments.get(a.id)?.distance || Infinity;
      const distB = noteAssignments.get(b.id)?.distance || Infinity;
      return distA - distB;
    });
    
    const assignedNoteUrls = frameNotes.map(note =>
      `${baseUrl}?node-id=${note.id.replace(/:/g, '-')}`
    );
    
    // Create screen entry with enhanced metadata
    const screenName = frame.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    // Generate filename using new utility
    const filename = generateScreenFilename(frame.name, frame.id);
    
    screens.push({
      name: screenName || `screen-${screens.length + 1}`,
      url: `${baseUrl}?node-id=${frame.id.replace(/:/g, '-')}`,
      notes: assignedNoteUrls,
      frameName: frame.name,
      sectionName: (frame as any).sectionName,
      sectionId: (frame as any).sectionId,
      filename: filename,
    });
  }
  
  // Find unassociated notes
  const unassociatedNotes = notes
    .filter(note => !assignedNotes.has(note.id))
    .map(note => `${baseUrl}?node-id=${note.id.replace(/:/g, '-')}`);
  
  console.log(`  Associated ${assignedNotes.size}/${notes.length} notes with frames`);
  console.log(`  Unassociated notes: ${unassociatedNotes.length}`);
  
  return { screens, unassociatedNotes };
}
