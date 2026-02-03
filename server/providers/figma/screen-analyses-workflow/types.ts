/**
 * Screen Analyses Workflow Types
 * 
 * Unified types for the consolidated Figma screen analysis workflow.
 * These types are used across all modules in this workflow.
 */

/**
 * An annotation associated with a Figma frame - either a sticky note
 * placed near the frame or a comment thread on the frame.
 */
export interface FrameAnnotation {
  /** The annotation text content */
  content: string;
  
  /** Type of annotation - sticky note or comment */
  type: 'note' | 'comment';
  
  /** Who wrote it (comments have authors, notes may not) */
  author?: string;
  
  /** Figma node ID of the annotation itself */
  nodeId?: string;
  
  /** When the annotation was created (ISO timestamp, for comments) */
  createdAt?: string;
}

/**
 * A Figma frame that will be (or has been) analyzed by the AI.
 * 
 * Represents a single design artifact - typically a screen, component,
 * or state variant - that gets documented as part of the workflow.
 * 
 * Lifecycle:
 * 1. Created during URL processing with identity fields populated
 * 2. Annotations associated during spatial matching
 * 3. Analysis populated by AI (or loaded from cache)
 */
export interface AnalyzedFrame {
  // Identity (always present)
  /** Sanitized kebab-case name for caching/referencing */
  name: string;
  
  /** Figma node ID (e.g., "1234:5678") */
  nodeId: string;
  
  /** Full Figma URL to this frame */
  url: string;
  
  // Annotations (populated during setup)
  /** Sticky notes and comments associated with this frame */
  annotations: FrameAnnotation[];
  
  // Analysis (populated after AI analysis or cache load)
  /** AI-generated documentation */
  analysis?: string;
  
  /** True if loaded from cache, false if freshly generated */
  cached?: boolean;
  
  // Figma hierarchy context (optional, for enhanced analysis)
  /** Original Figma frame name (before sanitization) */
  frameName?: string;
  
  /** Parent SECTION name (if frame is in a section) */
  sectionName?: string;
  
  /** Parent SECTION node ID */
  sectionId?: string;
  
  // Spatial positioning (optional, for ordering context)
  /** Bounding box from Figma absoluteBoundingBox */
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  /** Calculated order index (top-to-bottom, left-to-right) */
  order?: number;
  
  // Internal (used by caching system)
  /** Cache filename without extension (e.g., "login-screen_1234-5678") */
  cacheFilename?: string;
}

/**
 * Result of the frame analysis workflow
 */
export interface FrameAnalysisResult {
  /** Analyzed frames with their annotations and analysis content */
  frames: AnalyzedFrame[];
  
  /** Base URL to the Figma file */
  figmaFileUrl: string;
}

// ============================================================================
// Helper Functions for deriving stats (callers use as needed)
// ============================================================================

/**
 * Count frames that were freshly analyzed (not from cache)
 * 
 * @param frames - Array of analyzed frames
 * @returns Number of frames where cached === false
 */
export function countAnalyzedFrames(frames: AnalyzedFrame[]): number {
  return frames.filter(f => f.cached === false).length;
}

/**
 * Count frames that were loaded from cache
 * 
 * @param frames - Array of analyzed frames
 * @returns Number of frames where cached === true
 */
export function countCachedFrames(frames: AnalyzedFrame[]): number {
  return frames.filter(f => f.cached === true).length;
}

/**
 * Count total annotations across all frames
 * 
 * @param frames - Array of analyzed frames
 * @returns Sum of all annotations
 */
export function countTotalAnnotations(frames: AnalyzedFrame[]): number {
  return frames.reduce((sum, f) => sum + f.annotations.length, 0);
}

// ============================================================================
// Frame Ordering Utilities
// ============================================================================

/** Y-axis tolerance for grouping frames into rows (pixels) */
const ROW_TOLERANCE_PX = 50;

/**
 * Calculate spatial order for frames based on position
 * 
 * Orders frames top-to-bottom (primary) and left-to-right (secondary)
 * using Figma's absoluteBoundingBox coordinates. Frames within 50px
 * vertical distance are considered the same row.
 * 
 * @param frames - Array of frames with position data
 * @returns Frames with order field populated
 */
export function calculateFrameOrder(frames: AnalyzedFrame[]): AnalyzedFrame[] {
  // Filter to frames with position data
  const framesWithPosition = frames.filter(f => f.position);
  const framesWithoutPosition = frames.filter(f => !f.position);
  
  // Sort by Y (with tolerance) then X
  const sorted = [...framesWithPosition].sort((a, b) => {
    const posA = a.position!;
    const posB = b.position!;
    
    // If Y difference is within tolerance, treat as same row
    const yDiff = Math.abs(posA.y - posB.y);
    if (yDiff <= ROW_TOLERANCE_PX) {
      // Same row - sort by X
      return posA.x - posB.x;
    }
    
    // Different rows - sort by Y
    return posA.y - posB.y;
  });
  
  // Assign order numbers
  const orderedFrames = sorted.map((frame, index) => ({
    ...frame,
    order: index + 1
  }));
  
  // Append frames without position at the end (unordered)
  const maxOrder = orderedFrames.length;
  const unorderedFrames = framesWithoutPosition.map((frame, index) => ({
    ...frame,
    order: maxOrder + index + 1
  }));
  
  return [...orderedFrames, ...unorderedFrames];
}

/**
 * Generate a screen position string (e.g., "3 of 7")
 * 
 * @param frame - Frame with order field
 * @param totalFrames - Total number of frames in the set
 * @returns Position string for display
 */
export function formatFramePosition(frame: AnalyzedFrame, totalFrames: number): string {
  const order = frame.order ?? 0;
  return `${order} of ${totalFrames}`;
}
