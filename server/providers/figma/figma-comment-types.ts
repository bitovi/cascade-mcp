/**
 * Figma Comments Type Definitions
 *
 * Type definitions for Figma comment integration including reading comments
 * as context and posting questions as comments.
 *
 * @see https://www.figma.com/developers/api#comments
 */

// ============================================================================
// Comment Position Types
// ============================================================================

/**
 * Comment pinned to a specific frame with optional offset
 */
export interface FigmaFrameOffset {
  /** The node ID of the frame this comment is attached to */
  node_id: string;
  /** Offset within the frame (relative to frame origin) */
  node_offset?: { x: number; y: number };
}

/**
 * Comment at absolute page coordinates
 */
export interface FigmaVector {
  /** Absolute X coordinate on the page */
  x: number;
  /** Absolute Y coordinate on the page */
  y: number;
}

/**
 * Position metadata for a Figma comment
 *
 * FrameOffset: Comment is pinned to a specific frame/node
 * Vector: Comment is at absolute page coordinates
 */
export type FigmaCommentPosition = FigmaFrameOffset | FigmaVector;

/**
 * Type guard to check if position is FrameOffset
 */
export function isFrameOffset(
  pos: FigmaCommentPosition | undefined
): pos is FigmaFrameOffset {
  return pos !== undefined && 'node_id' in pos;
}

/**
 * Type guard to check if position is Vector
 */
export function isVector(
  pos: FigmaCommentPosition | undefined
): pos is FigmaVector {
  return pos !== undefined && 'x' in pos && 'y' in pos && !('node_id' in pos);
}

// ============================================================================
// Comment Entity Types
// ============================================================================

/**
 * A comment from Figma's GET /v1/files/:key/comments response
 */
export interface FigmaComment {
  /** Unique comment identifier */
  id: string;

  /** Comment text content */
  message: string;

  /** ISO timestamp of creation */
  created_at: string;

  /** ISO timestamp if resolved, undefined if still open */
  resolved_at?: string;

  /** Author information */
  user: {
    /** User's @handle */
    handle: string;
    /** Avatar image URL */
    img_url: string;
  };

  /** Parent comment ID if this is a reply */
  parent_id?: string;

  /**
   * Position metadata - either FrameOffset (node_id based) or Vector (absolute coords)
   */
  client_meta?: FigmaCommentPosition;

  /** Ordering hint within file */
  order_id?: number;
}

/**
 * A thread consisting of a parent comment and its replies
 */
export interface CommentThread {
  /** The parent/root comment */
  parent: FigmaComment;

  /** Replies to this comment, ordered by creation time */
  replies: FigmaComment[];

  /** Whether the thread is resolved */
  isResolved: boolean;

  /** ISO timestamp when resolved, if applicable */
  resolvedAt?: string;
}

/**
 * Comments organized by screen/frame
 */
export interface ScreenComments {
  /**
   * Map of frame node_id to comment threads associated with that frame
   * Key: Figma node ID (e.g., "123:456")
   * Value: Array of comment threads on this frame
   */
  byFrame: Map<string, CommentThread[]>;

  /**
   * Comments that couldn't be associated with any frame
   * (Vector positions not near any frame, or no position metadata)
   */
  unassociated: CommentThread[];

  /** Total comment count across all frames */
  totalCount: number;

  /** Count of resolved threads */
  resolvedCount: number;
}

// ============================================================================
// Comment Posting Types
// ============================================================================

/**
 * Request body for POST /v1/files/:file_key/comments
 */
export interface PostCommentRequest {
  /** Comment text content (required) */
  message: string;

  /**
   * Position metadata (optional)
   * If omitted, comment appears at page level
   */
  client_meta?: {
    /** Target frame node ID */
    node_id: string;
    /** Offset within frame, defaults to top-left (0, 0) */
    node_offset?: { x: number; y: number };
  };
}

/**
 * Response from POST /v1/files/:file_key/comments
 */
export interface PostCommentResponse {
  /** The created comment */
  comment: FigmaComment;
}

/**
 * Result of a comment posting attempt
 */
export interface PostCommentResult {
  /** Whether the post succeeded */
  success: boolean;

  /** The question text that was posted */
  question: string;

  /** Target frame node_id (if frame-specific) */
  frameNodeId?: string;

  /** Target frame name (for display) */
  frameName?: string;

  /** Error message if failed */
  error?: string;

  /** Figma comment ID if successful */
  commentId?: string;
}

// ============================================================================
// Tool Input/Output Types
// ============================================================================

/**
 * Input for analyze-figma-scope MCP tool / REST API
 */
export interface AnalyzeFigmaScopeInput {
  /**
   * Figma URLs to analyze
   * Supports file URLs, specific frame URLs, or node URLs
   */
  figmaUrls: string[];

  /**
   * Optional context description to provide additional context
   * for the AI analysis
   */
  contextDescription?: string;
}

/**
 * A question generated by AI analysis
 */
export interface GeneratedQuestion {
  /** The question text */
  text: string;

  /** Frame node_id this question relates to (if any) */
  frameNodeId?: string;

  /** Frame name for display */
  frameName?: string;
}

/**
 * Output from analyze-figma-scope tool
 */
export interface AnalyzeFigmaScopeOutput {
  /** Markdown scope analysis */
  analysis: string;

  /** Questions generated during analysis */
  questions: GeneratedQuestion[];

  /** Results of posting questions to Figma (if attempted) */
  postingResults?: PostCommentResult[];

  /** Summary of posting (e.g., "Posted 5/7 questions") */
  postingSummary?: string;

  /** Any errors encountered */
  errors?: string[];
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from GET /v1/files/:key/comments
 */
export interface FigmaCommentsResponse {
  comments: FigmaComment[];
}
