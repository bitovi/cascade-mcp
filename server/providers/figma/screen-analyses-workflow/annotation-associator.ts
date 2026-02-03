/**
 * Annotation Associator
 * 
 * Associates Figma comments and sticky notes with frames based on spatial proximity.
 * Fetches comments from Figma and matches them to frames using position data.
 */

import {
  fetchCommentsForFile as defaultFetchCommentsForFile,
  groupCommentsIntoThreads as defaultGroupCommentsIntoThreads,
  formatCommentsForContext as defaultFormatCommentsForContext,
  type FrameMetadata,
} from '../tools/figma-review-design/figma-comment-utils.js';
import type { CommentThread } from '../figma-comment-types.js';
import type { FigmaClient } from '../figma-api-client.js';
import type { FigmaNodeMetadata } from '../figma-helpers.js';
import { toKebabCase } from '../figma-helpers.js';
import type { AnalyzedFrame, FrameAnnotation } from './types.js';
import { buildFigmaUrl } from './url-processor.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Dependencies for annotation association
 * All dependencies have sensible defaults for production use.
 * Override in tests to inject mock implementations.
 */
export interface AnnotationAssociatorDeps {
  fetchCommentsForFile?: typeof defaultFetchCommentsForFile;
  groupCommentsIntoThreads?: typeof defaultGroupCommentsIntoThreads;
  formatCommentsForContext?: typeof defaultFormatCommentsForContext;
}

/**
 * Result of annotation association
 */
export interface AnnotationResult {
  /** Frames with annotations populated */
  frames: AnalyzedFrame[];
  
  /** Notes that couldn't be associated with any frame */
  unassociatedNotes: string[];
  
  /** Frame node IDs that were invalidated due to new comments */
  invalidatedFrames?: string[];
  
  /** Statistics about the association */
  stats: {
    totalCommentThreads: number;
    matchedCommentThreads: number;
    totalNotes: number;
    matchedNotes: number;
  };
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Fetch comments and associate both comments and notes with frames
 * 
 * This function:
 * 1. Fetches all comments from the Figma file
 * 2. Groups comments into threads
 * 3. Associates comment threads with frames by position
 * 4. Associates sticky notes with frames by position
 * 5. Merges both into FrameAnnotation[] on each frame
 * 
 * @param figmaClient - Authenticated Figma API client
 * @param fileKey - Figma file key
 * @param frames - Frame metadata from expansion step
 * @param notes - Note metadata from expansion step
 * @param documentTree - Optional full document tree for child node lookups
 * @param deps - Optional dependency overrides for testing
 * @returns Frames with annotations and association statistics
 */
export async function fetchAndAssociateAnnotations(
  figmaClient: FigmaClient,
  fileKey: string,
  frames: FigmaNodeMetadata[],
  notes: FigmaNodeMetadata[],
  documentTree?: any,
  {
    fetchCommentsForFile = defaultFetchCommentsForFile,
    groupCommentsIntoThreads = defaultGroupCommentsIntoThreads,
    formatCommentsForContext = defaultFormatCommentsForContext,
  }: AnnotationAssociatorDeps = {}
): Promise<AnnotationResult> {
  console.log(`  Fetching comments for file ${fileKey}...`);
  
  // Step 1: Fetch comments from Figma
  const comments = await fetchCommentsForFile(figmaClient, fileKey);
  
  // Step 2: Group comments into threads
  const threads = groupCommentsIntoThreads(comments);
  console.log(`  Grouped ${comments.length} comments into ${threads.length} threads`);
  
  // Step 3: Convert FigmaNodeMetadata to FrameMetadata for comment association
  const frameMetadata: FrameMetadata[] = frames.map(frame => ({
    fileKey,
    nodeId: frame.id,
    name: frame.name,
    url: buildFigmaUrl(fileKey, frame.id),
    x: frame.absoluteBoundingBox?.x,
    y: frame.absoluteBoundingBox?.y,
    width: frame.absoluteBoundingBox?.width,
    height: frame.absoluteBoundingBox?.height,
  }));
  
  // Step 4: Associate comments with frames
  const commentResult = formatCommentsForContext(threads, frameMetadata, documentTree);
  console.log(`  Associated ${commentResult.matchedThreadCount}/${threads.length} comment threads with frames`);
  
  // Step 5: Associate notes with frames
  const noteResult = associateNotesWithFrames(frames, notes);
  console.log(`  Associated ${noteResult.matchedNotes}/${notes.length} notes with frames`);
  
  // Step 6: Merge comments and notes into AnalyzedFrame format
  const analyzedFrames = mergeAnnotationsIntoFrames(
    frames,
    fileKey,
    commentResult.contexts,
    noteResult.frameNotes,
    threads
  );
  
  return {
    frames: analyzedFrames,
    unassociatedNotes: noteResult.unassociatedNotes,
    stats: {
      totalCommentThreads: threads.length,
      matchedCommentThreads: commentResult.matchedThreadCount,
      totalNotes: notes.length,
      matchedNotes: noteResult.matchedNotes,
    },
  };
}

// ============================================================================
// Pure Helper Functions (no external dependencies - easily testable)
// ============================================================================

/**
 * Calculate distance between two rectangles
 * 
 * Returns 0 if rectangles overlap, otherwise returns the minimum
 * edge-to-edge distance.
 * 
 * @param rect1 - First rectangle with x, y, width, height
 * @param rect2 - Second rectangle with x, y, width, height
 * @returns Distance in pixels (0 if overlapping)
 */
export function calculateRectangleDistance(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): number {
  // Calculate rectangle edges
  const left1 = rect1.x;
  const right1 = rect1.x + rect1.width;
  const top1 = rect1.y;
  const bottom1 = rect1.y + rect1.height;
  
  const left2 = rect2.x;
  const right2 = rect2.x + rect2.width;
  const top2 = rect2.y;
  const bottom2 = rect2.y + rect2.height;
  
  // Check if overlapping
  if (left1 < right2 && right1 > left2 && top1 < bottom2 && bottom1 > top2) {
    return 0; // Overlapping
  }
  
  // Calculate horizontal and vertical gaps
  const horizontalGap = Math.max(0, left2 - right1, left1 - right2);
  const verticalGap = Math.max(0, top2 - bottom1, top1 - bottom2);
  
  // Return Euclidean distance through the gap
  return Math.sqrt(horizontalGap * horizontalGap + verticalGap * verticalGap);
}

/**
 * Associate sticky notes with their closest frames
 * 
 * Notes are associated with the nearest frame within the maximum distance.
 * Uses edge-to-edge distance between bounding boxes.
 * 
 * @param frames - Array of frame metadata with bounding boxes
 * @param notes - Array of note metadata with bounding boxes
 * @param maxDistance - Maximum distance in pixels for association (default: 500)
 * @returns Map of frame IDs to note contents, plus unassociated notes
 */
export function associateNotesWithFrames(
  frames: FigmaNodeMetadata[],
  notes: FigmaNodeMetadata[],
  maxDistance: number = 500
): {
  frameNotes: Map<string, string[]>;
  unassociatedNotes: string[];
  matchedNotes: number;
} {
  const frameNotes = new Map<string, string[]>();
  const unassociatedNotes: string[] = [];
  let matchedNotes = 0;
  
  // Filter to frames and notes with valid bounding boxes
  const framesWithBounds = frames.filter(f => f.absoluteBoundingBox);
  
  for (const note of notes) {
    if (!note.absoluteBoundingBox) {
      // Note has no position - can't associate
      unassociatedNotes.push(extractNoteText(note));
      continue;
    }
    
    let closestFrame: FigmaNodeMetadata | null = null;
    let closestDistance = Infinity;
    
    // Find closest frame
    for (const frame of framesWithBounds) {
      const distance = calculateRectangleDistance(
        note.absoluteBoundingBox!,
        frame.absoluteBoundingBox!
      );
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestFrame = frame;
      }
    }
    
    // Associate if within max distance
    if (closestFrame && closestDistance <= maxDistance) {
      const existing = frameNotes.get(closestFrame.id) || [];
      existing.push(extractNoteText(note));
      frameNotes.set(closestFrame.id, existing);
      matchedNotes++;
    } else {
      unassociatedNotes.push(extractNoteText(note));
    }
  }
  
  return { frameNotes, unassociatedNotes, matchedNotes };
}

/**
 * Extract text content from a Figma note node
 * 
 * Looks for text in:
 * 1. Node's characters property (if TEXT type)
 * 2. First TEXT child node
 * 3. Falls back to node name
 * 
 * @param note - Figma node metadata
 * @returns Extracted text content
 */
export function extractNoteText(note: FigmaNodeMetadata): string {
  // If the note has children, look for TEXT nodes
  if (note.children && Array.isArray(note.children)) {
    for (const child of note.children) {
      if (child.type === 'TEXT' && child.characters) {
        return child.characters;
      }
      // Recursively search children
      if (child.children) {
        const childText = extractNoteText(child);
        if (childText !== child.name) {
          return childText;
        }
      }
    }
  }
  
  // Fallback to name
  return note.name || 'Note';
}

/**
 * Check comments for cache invalidation
 * 
 * Compares comment timestamps with cache timestamp to detect new comments
 * that should trigger frame re-analysis.
 * 
 * @param frames - Frames with annotations
 * @param cacheMetadata - Cache metadata with cachedAt timestamp
 * @returns Array of frame node IDs that need re-analysis
 */
export function checkCommentsForInvalidation(
  frames: AnalyzedFrame[],
  cacheMetadata: { cachedAt: string }
): { invalidatedFrames: string[]; reason: Map<string, string> } {
  const cachedAt = new Date(cacheMetadata.cachedAt);
  const invalidatedFrames: string[] = [];
  const reason = new Map<string, string>();
  
  for (const frame of frames) {
    for (const annotation of frame.annotations) {
      if (annotation.type === 'comment' && annotation.createdAt) {
        const commentDate = new Date(annotation.createdAt);
        if (commentDate > cachedAt) {
          invalidatedFrames.push(frame.nodeId);
          reason.set(frame.nodeId, `new comment from ${annotation.createdAt}`);
          break; // One newer comment is enough to invalidate
        }
      }
    }
  }
  
  if (invalidatedFrames.length > 0) {
    console.log(`  💬 Checking comments for cache invalidation...`);
    for (const [nodeId, reasonText] of reason.entries()) {
      console.log(`     Frame "${nodeId}": ${reasonText}`);
    }
    console.log(`  🗑️  Invalidated ${invalidatedFrames.length} frame analysis (will re-analyze)`);
  }
  
  return { invalidatedFrames, reason };
}


// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Merge comment and note annotations into AnalyzedFrame format
 * 
 * @param frames - Frame metadata
 * @param fileKey - Figma file key
 * @param commentContexts - Comment contexts from formatCommentsForContext
 * @param frameNotes - Notes associated with frames
 * @param threads - Raw comment threads (for timestamp extraction)
 */
function mergeAnnotationsIntoFrames(
  frames: FigmaNodeMetadata[],
  fileKey: string,
  commentContexts: Array<{ screenId: string; screenName: string; markdown: string }>,
  frameNotes: Map<string, string[]>,
  threads: CommentThread[]
): AnalyzedFrame[] {
  // Create lookup for comment contexts by frame ID
  const commentsByFrameId = new Map<string, string>();
  for (const context of commentContexts) {
    commentsByFrameId.set(context.screenId, context.markdown);
  }
  
  // Create lookup for thread timestamps by frame ID
  // Use the most recent comment in each thread associated with a frame
  const threadsByFrameId = new Map<string, CommentThread[]>();
  for (const thread of threads) {
    const position = thread.parent.client_meta;
    if (position && 'node_id' in position) {
      const nodeId = position.node_id;
      const existing = threadsByFrameId.get(nodeId) || [];
      existing.push(thread);
      threadsByFrameId.set(nodeId, existing);
    }
  }
  
  return frames.map(frame => {
    const annotations: FrameAnnotation[] = [];
    
    // Add comment annotations with timestamps
    const commentMarkdown = commentsByFrameId.get(frame.id);
    if (commentMarkdown) {
      // Get the most recent comment timestamp for this frame
      const frameThreads = threadsByFrameId.get(frame.id) || [];
      const mostRecentTimestamp = frameThreads.reduce((latest, thread) => {
        // Check all comments in the thread (parent + replies)
        const allComments = [thread.parent, ...thread.replies];
        for (const comment of allComments) {
          const commentTime = new Date(comment.created_at).getTime();
          if (commentTime > latest) {
            latest = commentTime;
          }
        }
        return latest;
      }, 0);
      
      annotations.push({
        content: commentMarkdown,
        type: 'comment',
        createdAt: mostRecentTimestamp > 0 ? new Date(mostRecentTimestamp).toISOString() : undefined,
      });
    }
    
    // Add note annotations
    const notes = frameNotes.get(frame.id);
    if (notes) {
      for (const noteText of notes) {
        annotations.push({
          content: noteText,
          type: 'note',
        });
      }
    }
    
    return {
      name: frame.name,
      nodeId: frame.id,
      url: buildFigmaUrl(fileKey, frame.id),
      annotations,
      frameName: frame.name,
      cacheFilename: `${toKebabCase(frame.name)}_${frame.id.replace(/:/g, '-')}`,
      position: frame.absoluteBoundingBox ? {
        x: frame.absoluteBoundingBox.x,
        y: frame.absoluteBoundingBox.y,
        width: frame.absoluteBoundingBox.width,
        height: frame.absoluteBoundingBox.height,
      } : undefined,
    };
  });
}
