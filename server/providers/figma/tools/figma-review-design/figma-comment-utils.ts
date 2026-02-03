/**
 * Figma Comment Utilities
 *
 * Helper functions for fetching, grouping, formatting, and posting
 * Figma comments. These utilities support the analyze-figma-scope tool's
 * workflow of reading existing comments as context and posting new
 * questions as comments.
 *
 * Key features:
 * - Fetch comments from Figma files
 * - Group comments into threads (parent + replies)
 * - Format comments as markdown context for AI analysis
 * - Post questions to Figma with rate limit handling
 * - Consolidation fallback for high question counts
 * - Debug cache output for development
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { FigmaClient } from '../../../figma/figma-api-client.js';
import type {
  FigmaComment,
  CommentThread,
  PostCommentResult,
  GeneratedQuestion,
} from '../../../figma/figma-comment-types.js';
import { isFrameOffset } from '../../../figma/figma-comment-types.js';
import type { ScreenAnnotation } from '../../../combined/tools/shared/screen-annotation.js';
import { getFigmaFileCachePath } from '../../screen-analyses-workflow/figma-cache.js';

// ============================================================================
// Constants
// ============================================================================

/** Rate limit for Figma comment API - 25 requests per minute */
const RATE_LIMIT_PER_MINUTE = 25;

/** Delay between comment posts to stay within rate limits (ms) */
const POST_DELAY_MS = 2500; // ~24 per minute, leaves buffer

/** Left edge offset from frame boundary (pixels) */
const LEFT_EDGE_OFFSET = -50;

/** Top/bottom padding from frame edges when distributing comments (pixels) */
const VERTICAL_PADDING = 50;

/** Maximum retries for rate-limited requests */
const MAX_RETRIES = 3;

/** Cascade bot prefix for posted comments */
const CASCADE_PREFIX = 'Cascade🤖:';

/** Cascade bot prefix for consolidated comments */
const CASCADE_CONSOLIDATED_PREFIX = 'Cascade🤖 Questions:';

// ============================================================================
// Debug Cache Utilities
// ============================================================================

/**
 * Check if debug cache is enabled via environment variable
 */
function isDebugCacheEnabled(): boolean {
  const envValue = process.env.SAVE_FIGMA_COMMENTS_TO_CACHE;
  return envValue === 'true' || envValue === '1';
}

/**
 * Format comments as a comprehensive markdown document for debugging
 *
 * @param fileKey - Figma file key
 * @param comments - Raw comments from Figma API
 * @param threads - Organized comment threads
 * @returns Markdown string with full comment details
 */
export function formatCommentsAsDebugMarkdown(
  fileKey: string,
  comments: FigmaComment[],
  threads: CommentThread[]
): string {
  // Summary by user
  const userCounts = new Map<string, number>();
  for (const comment of comments) {
    const handle = comment.user.handle;
    userCounts.set(handle, (userCounts.get(handle) || 0) + 1);
  }

  const userSummary = Array.from(userCounts.entries())
    .map(([handle, count]) => `- **@${handle}**: ${count} comments`)
    .join('\n');

  // Format each thread
  const threadSections = threads.map((thread, i) => {
    const status = thread.isResolved ? '✅ RESOLVED' : '💬 OPEN';
    const position = thread.parent.client_meta;
    
    let positionInfo = 'No position data';
    if (position) {
      if (isFrameOffset(position)) {
        const offset = position.node_offset;
        positionInfo = offset
          ? `Frame: ${position.node_id}, Offset: (${offset.x.toFixed(0)}, ${offset.y.toFixed(0)})`
          : `Frame: ${position.node_id}`;
      } else {
        positionInfo = `Vector: (${position.x.toFixed(0)}, ${position.y.toFixed(0)})`;
      }
    }

    const resolvedLine = thread.resolvedAt ? `- **Resolved At**: ${thread.resolvedAt}\n` : '';
    
    const repliesSection = thread.replies.length > 0
      ? `**Replies:**\n\n${thread.replies.map(reply => 
          `- **@${reply.user.handle}** (${reply.created_at}):\n  > ${reply.message.split('\n').join('\n  > ')}`
        ).join('\n\n')}\n\n`
      : '';

    return `### Thread ${i + 1}: ${status}

- **ID**: ${thread.parent.id}
- **Created**: ${thread.parent.created_at}
- **Position**: ${positionInfo}
${resolvedLine}
**@${thread.parent.user.handle}**:

> ${thread.parent.message.split('\n').join('\n> ')}

${repliesSection}---`;
  }).join('\n\n');

  return `# Figma Comments Debug Output

**File Key**: ${fileKey}
**Fetched At**: ${new Date().toISOString()}
**Total Comments**: ${comments.length}
**Total Threads**: ${threads.length}
**Open Threads**: ${threads.filter((t) => !t.isResolved).length}
**Resolved Threads**: ${threads.filter((t) => t.isResolved).length}

---

## Comments by User

${userSummary}

---

## Comment Threads

${threadSections}`;
}

/**
 * Save comments to debug cache file
 *
 * @param fileKey - Figma file key
 * @param comments - Raw comments from Figma API
 * @param threads - Organized comment threads
 */
async function saveCommentsToCache(
  fileKey: string,
  comments: FigmaComment[],
  threads: CommentThread[]
): Promise<void> {
  try {
    const cacheDir = getFigmaFileCachePath(fileKey);
    await fs.mkdir(cacheDir, { recursive: true });

    const markdown = formatCommentsAsDebugMarkdown(fileKey, comments, threads);
    const cachePath = path.join(cacheDir, 'comments.md');

    await fs.writeFile(cachePath, markdown, 'utf-8');
    console.log(`  📁 Saved comments debug output to ${cachePath}`);
  } catch (error: any) {
    console.warn(`  ⚠️ Failed to save comments to cache: ${error.message}`);
    // Don't throw - this is optional debug functionality
  }
}


// ============================================================================
// Comment Fetching
// ============================================================================

/**
 * Fetch comments from a Figma file
 *
 * @param figmaClient - Authenticated Figma API client
 * @param fileKey - Figma file key
 * @returns Array of comments from the file
 */
export async function fetchCommentsForFile(
  figmaClient: FigmaClient,
  fileKey: string
): Promise<FigmaComment[]> {
  try {
    const comments = await figmaClient.fetchComments(fileKey);
    console.log(`  📝 Fetched ${comments.length} comments from file ${fileKey}`);

    // Save to debug cache if enabled
    if (isDebugCacheEnabled() && comments.length > 0) {
      const threads = groupCommentsIntoThreads(comments);
      await saveCommentsToCache(fileKey, comments, threads);
    }

    return comments;
  } catch (error: any) {
    console.error(`  ❌ Failed to fetch comments from ${fileKey}:`, error.message);
    throw error;
  }
}

// ============================================================================
// Comment Threading
// ============================================================================

/**
 * Group flat comment array into threaded conversations
 *
 * Creates thread structures where each thread has a parent comment
 * and its replies, ordered by creation time.
 *
 * @param comments - Flat array of comments from Figma API
 * @returns Array of comment threads
 */
export function groupCommentsIntoThreads(comments: FigmaComment[]): CommentThread[] {
  // Separate parent comments (no parent_id) from replies
  const parentComments = comments.filter((c) => !c.parent_id);
  const repliesByParent = new Map<string, FigmaComment[]>();

  // Group replies by parent_id
  for (const comment of comments) {
    if (comment.parent_id) {
      const existing = repliesByParent.get(comment.parent_id) || [];
      existing.push(comment);
      repliesByParent.set(comment.parent_id, existing);
    }
  }

  // Build threads
  const threads: CommentThread[] = [];

  for (const parent of parentComments) {
    const replies = repliesByParent.get(parent.id) || [];

    // Sort replies by creation time
    replies.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    threads.push({
      parent,
      replies,
      isResolved: !!parent.resolved_at,
      resolvedAt: parent.resolved_at,
    });
  }

  // Sort threads by creation time (newest first for context priority)
  threads.sort(
    (a, b) =>
      new Date(b.parent.created_at).getTime() - new Date(a.parent.created_at).getTime()
  );

  return threads;
}

// ============================================================================
// Comment Formatting for AI Context
// ============================================================================

/**
 * Frame metadata for comment association
 */
export interface FrameMetadata {
  fileKey: string;
  nodeId: string;
  name: string;
  url?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Check if a point or bounding box is contained within a frame's bounds
 */
export function isContainedInFrame(
  nodeBbox: { x: number; y: number; width?: number; height?: number },
  frameBbox: { x: number; y: number; width: number; height: number },
  threshold: number = 0
): boolean {
  // For a point (no width/height), check if the point is inside the frame
  const nodeX = nodeBbox.x;
  const nodeY = nodeBbox.y;
  
  // If node has dimensions, check if any part overlaps with frame
  if (nodeBbox.width !== undefined && nodeBbox.height !== undefined) {
    // Check if bounding boxes overlap (node is at least partially inside frame)
    const nodeRight = nodeX + nodeBbox.width;
    const nodeBottom = nodeY + nodeBbox.height;
    const frameRight = frameBbox.x + frameBbox.width + threshold;
    const frameBottom = frameBbox.y + frameBbox.height + threshold;
    
    return (
      nodeX < frameRight &&
      nodeRight > frameBbox.x - threshold &&
      nodeY < frameBottom &&
      nodeBottom > frameBbox.y - threshold
    );
  }
  
  // Point check with threshold
  return (
    nodeX >= frameBbox.x - threshold &&
    nodeX <= frameBbox.x + frameBbox.width + threshold &&
    nodeY >= frameBbox.y - threshold &&
    nodeY <= frameBbox.y + frameBbox.height + threshold
  );
}

/**
 * Find a node by ID in the document tree (recursive search)
 */
function findNodeInTree(node: any, targetId: string): any | null {
  if (!node) return null;
  if (node.id === targetId) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeInTree(child, targetId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Format comment threads as markdown context for AI analysis
 *
 * Associates comments with frames based on:
 * 1. FrameOffset position (node_id matches a frame directly)
 * 2. FrameOffset position on child node (node's bounding box is inside a frame)
 * 3. Vector position proximity (within frame bounds or 50px)
 *
 * @param threads - Array of comment threads
 * @param frames - Array of frame metadata to associate comments with (must include bounding boxes)
 * @param documentTree - Optional Figma document tree for spatial containment checks on child nodes
 * @returns Object with screen annotations and thread statistics
 */
export function formatCommentsForContext(
  threads: CommentThread[],
  frames: FrameMetadata[],
  documentTree?: any
): { contexts: ScreenAnnotation[]; matchedThreadCount: number; unmatchedThreadCount: number } {
  const contexts: ScreenAnnotation[] = [];

  // Build a quick lookup for frames by nodeId
  const framesByNodeId = new Map<string, FrameMetadata>();
  for (const frame of frames) {
    framesByNodeId.set(frame.nodeId, frame);
  }

  // Group threads by frame
  const threadsByFrame = new Map<string, CommentThread[]>();
  const unassociatedThreads: CommentThread[] = [];

  for (const thread of threads) {
    const position = thread.parent.client_meta;

    if (!position) {
      unassociatedThreads.push(thread);
      continue;
    }

    let associatedFrame: FrameMetadata | undefined;

    if (isFrameOffset(position)) {
      // First try direct node_id match
      associatedFrame = framesByNodeId.get(position.node_id);
      
      // If no direct match and we have the document tree, use spatial containment
      if (!associatedFrame && documentTree) {
        // Find the node in the document to get its bounding box
        const commentNode = findNodeInTree(documentTree, position.node_id);
        if (commentNode?.absoluteBoundingBox) {
          // Check if this node is spatially inside any of our frames
          for (const frame of frames) {
            if (
              frame.x !== undefined &&
              frame.y !== undefined &&
              frame.width !== undefined &&
              frame.height !== undefined
            ) {
              if (isContainedInFrame(
                commentNode.absoluteBoundingBox,
                { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
              )) {
                associatedFrame = frame;
                break;
              }
            }
          }
        }
      }
    } else {
      // Vector position - check proximity to frames (within bounds or 50px)
      const PROXIMITY_THRESHOLD = 50;

      for (const frame of frames) {
        if (
          frame.x !== undefined &&
          frame.y !== undefined &&
          frame.width !== undefined &&
          frame.height !== undefined
        ) {
          const inBoundsX =
            position.x >= frame.x - PROXIMITY_THRESHOLD &&
            position.x <= frame.x + frame.width + PROXIMITY_THRESHOLD;
          const inBoundsY =
            position.y >= frame.y - PROXIMITY_THRESHOLD &&
            position.y <= frame.y + frame.height + PROXIMITY_THRESHOLD;

          if (inBoundsX && inBoundsY) {
            associatedFrame = frame;
            break;
          }
        }
      }
    }

    if (associatedFrame) {
      const existing = threadsByFrame.get(associatedFrame.nodeId) || [];
      existing.push(thread);
      threadsByFrame.set(associatedFrame.nodeId, existing);
    } else {
      unassociatedThreads.push(thread);
    }
  }

  // Count matched threads
  let matchedThreadCount = 0;
  for (const frameThreads of threadsByFrame.values()) {
    matchedThreadCount += frameThreads.length;
  }

  // Format contexts for each frame with comments
  for (const frame of frames) {
    const frameThreads = threadsByFrame.get(frame.nodeId);
    if (!frameThreads || frameThreads.length === 0) continue;

    const markdown = formatThreadsAsMarkdown(frameThreads);
    contexts.push({
      screenId: frame.nodeId,
      screenName: frame.name,
      source: 'comments',
      markdown,
    });
  }

  return { contexts, matchedThreadCount, unmatchedThreadCount: unassociatedThreads.length };
}

/**
 * Format threads as markdown for AI context
 */
function formatThreadsAsMarkdown(threads: CommentThread[]): string {
  return threads.map(thread => {
    const status = thread.isResolved ? '✅ RESOLVED' : '💬 OPEN';
    const parentLine = `- **@${thread.parent.user.handle}** (${status}): ${thread.parent.message}`;
    
    const replyLines = thread.replies
      .map(reply => `  - **@${reply.user.handle}**: ${reply.message}`)
      .join('\n');
    
    return replyLines ? `${parentLine}\n${replyLines}` : parentLine;
  }).join('\n');
}

// ============================================================================
// Comment Posting
// ============================================================================

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse Retry-After header value
 *
 * @param retryAfter - Retry-After header value (seconds or HTTP date)
 * @returns Delay in milliseconds, or default if unparseable
 */
function parseRetryAfter(retryAfter: string | null, defaultMs = 60000): number {
  if (!retryAfter) return defaultMs;

  // Try parsing as seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return defaultMs;
}

/**
 * Calculate evenly-distributed positions along the left edge of a frame
 * 
 * @param frameHeight - Height of the frame in pixels
 * @param count - Number of positions to calculate
 * @returns Array of y-offsets from top of frame
 */
function calculateLeftEdgePositions(frameHeight: number, count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [frameHeight / 2]; // Center for single item
  
  // Calculate usable height (excluding padding)
  const usableHeight = frameHeight - (2 * VERTICAL_PADDING);
  
  // Space items evenly within usable height
  const spacing = usableHeight / (count - 1);
  
  return Array.from({ length: count }, (_, i) => 
    VERTICAL_PADDING + (i * spacing)
  );
}

/**
 * Post a single question to Figma with retry logic
 *
 * @param figmaClient - Authenticated Figma API client
 * @param fileKey - Figma file key
 * @param message - Comment message to post
 * @param frameNodeId - Optional frame node ID to pin comment to
 * @param position - Optional position offset within frame (defaults to top-left)
 * @returns Post result
 */
async function postSingleComment(
  figmaClient: FigmaClient,
  fileKey: string,
  message: string,
  frameNodeId?: string,
  position?: { x: number; y: number }
): Promise<{ success: boolean; commentId?: string; error?: string }> {
  let retries = 0;

  while (retries <= MAX_RETRIES) {
    try {
      const request: { message: string; client_meta?: { node_id: string; node_offset: { x: number; y: number } } } = { message };

      if (frameNodeId) {
        request.client_meta = { 
          node_id: frameNodeId,
          node_offset: position || { x: 0, y: 0 }  // Use provided position or top-left corner
        };
      }

      const comment = await figmaClient.postComment(fileKey, request);

      return {
        success: true,
        commentId: comment.id,
      };
    } catch (error: any) {
      // Handle rate limiting (429)
      if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        retries++;

        if (retries > MAX_RETRIES) {
          return {
            success: false,
            error: `Rate limited after ${MAX_RETRIES} retries`,
          };
        }

        // Parse Retry-After if available, otherwise use exponential backoff
        const retryAfter = error.retryAfter || null;
        const delay = retryAfter
          ? parseRetryAfter(retryAfter)
          : Math.min(30000, 5000 * Math.pow(2, retries - 1));

        console.log(`    ⏳ Rate limited, waiting ${delay / 1000}s (retry ${retries}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }

      // Non-retryable error
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  return {
    success: false,
    error: 'Max retries exceeded',
  };
}

/**
 * Post questions to Figma as comments
 *
 * Handles rate limiting and provides consolidation when question count
 * exceeds the rate limit threshold.
 *
 * Rate Limiting Strategy:
 * - If <= 25 questions: Post individually with delays
 * - If > 25 questions: Consolidate into one comment per screen
 *
 * @param questions - Array of generated questions to post
 * @param fileKey - Figma file key to post comments to
 * @param figmaClient - Authenticated Figma API client
 * @param frames - Frame metadata for associating questions with frames
 * @returns Array of post results
 */
export async function postQuestionsToFigma(
  questions: GeneratedQuestion[],
  fileKey: string,
  figmaClient: FigmaClient,
  frames: FrameMetadata[]
): Promise<PostCommentResult[]> {
  const results: PostCommentResult[] = [];

  if (questions.length === 0) {
    return results;
  }

  // Decide posting strategy based on question count
  const needsConsolidation = questions.length > RATE_LIMIT_PER_MINUTE;

  if (needsConsolidation) {
    console.log(`  📦 Consolidating ${questions.length} questions (> ${RATE_LIMIT_PER_MINUTE} rate limit)`);
    return await postConsolidatedQuestions(questions, fileKey, figmaClient, frames);
  }

  // Post individual questions with rate limiting delays
  console.log(`  📤 Posting ${questions.length} questions individually`);

  // Group questions by frame to calculate positions
  const questionsByFrame = new Map<string, GeneratedQuestion[]>();
  for (const question of questions) {
    const frameId = question.frameNodeId || 'general';
    if (!questionsByFrame.has(frameId)) {
      questionsByFrame.set(frameId, []);
    }
    questionsByFrame.get(frameId)!.push(question);
  }

  // Calculate positions for each frame's questions
  const questionPositions = new Map<GeneratedQuestion, { x: number; y: number } | undefined>();
  
  for (const [frameId, frameQuestions] of questionsByFrame) {
    const frame = frames.find((f) => f.nodeId === frameId);
    
    if (frame && frame.height) {
      // Calculate evenly distributed Y positions along left edge
      const yPositions = calculateLeftEdgePositions(frame.height, frameQuestions.length);
      
      console.log(`  📍 Frame "${frame.name}" (height: ${frame.height}px): positioning ${frameQuestions.length} question(s)`);
      
      frameQuestions.forEach((question, index) => {
        const pos = {
          x: LEFT_EDGE_OFFSET,
          y: yPositions[index]
        };
        questionPositions.set(question, pos);
        console.log(`     → Question ${index + 1}: (${pos.x}, ${Math.round(pos.y)})`);
      });
    } else {
      // No dimensions available, position at top-left
      console.log(`  ⚠️ Frame "${frame?.name || frameId}" has no height data - using top-left position`);
      frameQuestions.forEach((question) => {
        questionPositions.set(question, undefined);
      });
    }
  }

  // Post questions with calculated positions
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const message = `${CASCADE_PREFIX} ${question.text}`;
    const position = questionPositions.get(question);

    // Find frame info for this question
    const frame = frames.find((f) => f.nodeId === question.frameNodeId);

    const postResult = await postSingleComment(
      figmaClient,
      fileKey,
      message,
      question.frameNodeId,
      position
    );

    results.push({
      success: postResult.success,
      question: question.text,
      frameNodeId: question.frameNodeId,
      frameName: frame?.name,
      error: postResult.error,
      commentId: postResult.commentId,
    });
  }

  return results;
}

/**
 * Post consolidated questions (one comment per screen)
 *
 * Groups questions by frame and posts one comment per frame with
 * all questions as a bullet list.
 *
 * @param questions - Array of questions to post
 * @param fileKey - Figma file key
 * @param figmaClient - Authenticated Figma client
 * @param frames - Frame metadata
 * @returns Array of post results
 */
async function postConsolidatedQuestions(
  questions: GeneratedQuestion[],
  fileKey: string,
  figmaClient: FigmaClient,
  frames: FrameMetadata[]
): Promise<PostCommentResult[]> {
  const results: PostCommentResult[] = [];

  // Group questions by frame
  const questionsByFrame = new Map<string | undefined, GeneratedQuestion[]>();

  for (const question of questions) {
    const key = question.frameNodeId || '__unassociated__';
    const existing = questionsByFrame.get(key) || [];
    existing.push(question);
    questionsByFrame.set(key, existing);
  }

  // Post one consolidated comment per frame
  const frameKeys = Array.from(questionsByFrame.keys());
  console.log(`  📦 Posting ${frameKeys.length} consolidated comments`);

  for (let i = 0; i < frameKeys.length; i++) {
    const frameKey = frameKeys[i];
    const frameQuestions = questionsByFrame.get(frameKey) || [];
    const frame = frames.find((f) => f.nodeId === frameKey);

    // Build consolidated message
    const messageLines = [
      CASCADE_CONSOLIDATED_PREFIX,
      '',
      ...frameQuestions.map((q) => `• ${q.text}`),
    ];
    const message = messageLines.join('\n');

    console.log(`    📦 Posting consolidated comment ${i + 1}/${frameKeys.length} (${frameQuestions.length} questions)${frame ? ` to "${frame.name}"` : ''}`);

    const postResult = await postSingleComment(
      figmaClient,
      fileKey,
      message,
      frameKey !== '__unassociated__' ? frameKey : undefined
    );

    // Create results for each question in the consolidated comment
    for (const question of frameQuestions) {
      results.push({
        success: postResult.success,
        question: question.text,
        frameNodeId: question.frameNodeId,
        frameName: frame?.name,
        error: postResult.error,
        commentId: postResult.commentId,
      });
    }
  }

  return results;
}
