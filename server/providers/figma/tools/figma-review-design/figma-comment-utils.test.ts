/**
 * Tests for figma-comment-utils.ts
 * 
 * Focuses on unattached comment detection and separation.
 */

import { describe, it, expect } from '@jest/globals';
import { 
  formatCommentsForContext, 
  isUnattachedComment, 
  groupCommentsIntoThreads,
  type FrameMetadata 
} from './figma-comment-utils.js';
import type { CommentThread } from '../../figma-comment-types.js';
import type { FigmaComment } from '../../figma-comment-types.js';

// Helper to create a mock FigmaComment
function createMockComment(
  id: string, 
  message: string, 
  clientMeta?: { x: number; y: number } | { node_id: string; node_offset?: { x: number; y: number } }
): FigmaComment {
  return {
    id,
    message,
    created_at: '2024-01-01T00:00:00Z',
    user: { handle: 'testuser', img_url: '' },
    client_meta: clientMeta,
    parent_id: undefined,
    resolved_at: undefined,
    order_id: 1,
  };
}

// Helper to create a mock CommentThread
function createMockThread(
  id: string, 
  message: string, 
  clientMeta?: { x: number; y: number } | { node_id: string; node_offset?: { x: number; y: number } }
): CommentThread {
  return {
    parent: createMockComment(id, message, clientMeta),
    replies: [],
    isResolved: false,
    resolvedAt: undefined,
  };
}

// Helper to create a mock FrameMetadata
function createMockFrame(
  nodeId: string, 
  name: string, 
  bounds: { x: number; y: number; width: number; height: number }
): FrameMetadata {
  return {
    fileKey: 'test-file',
    nodeId,
    name,
    url: `https://figma.com/file/test-file?node-id=${nodeId}`,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

describe('isUnattachedComment', () => {
  it('should return true for thread with no position data', () => {
    const thread = createMockThread('1', 'Test message', undefined);
    expect(isUnattachedComment(thread)).toBe(true);
  });

  it('should return true for Vector position at exactly (0, 0)', () => {
    const thread = createMockThread('1', 'Test message', { x: 0, y: 0 });
    expect(isUnattachedComment(thread)).toBe(true);
  });

  it('should return false for Vector position at non-zero coordinates', () => {
    const thread = createMockThread('1', 'Test message', { x: 500, y: 300 });
    expect(isUnattachedComment(thread)).toBe(false);
  });

  it('should return false for Vector position with x=0 but y!=0', () => {
    const thread = createMockThread('1', 'Test message', { x: 0, y: 100 });
    expect(isUnattachedComment(thread)).toBe(false);
  });

  it('should return false for Vector position with x!=0 but y=0', () => {
    const thread = createMockThread('1', 'Test message', { x: 100, y: 0 });
    expect(isUnattachedComment(thread)).toBe(false);
  });

  it('should return false for FrameOffset position (has explicit node_id)', () => {
    const thread = createMockThread('1', 'Test message', { 
      node_id: '123:456', 
      node_offset: { x: 0, y: 0 } 
    });
    expect(isUnattachedComment(thread)).toBe(false);
  });

  it('should return false for FrameOffset position even without node_offset', () => {
    const thread = createMockThread('1', 'Test message', { 
      node_id: '123:456'
    });
    expect(isUnattachedComment(thread)).toBe(false);
  });
});

describe('formatCommentsForContext', () => {
  const frameAtOrigin = createMockFrame('frame-1', 'Create New Case - Desktop', { 
    x: 0, y: 0, width: 1440, height: 1024 
  });
  
  const frameAwayFromOrigin = createMockFrame('frame-2', 'Dashboard', { 
    x: 2000, y: 500, width: 1440, height: 1024 
  });

  it('should separate Vector (0,0) comments into unattachedComments array', () => {
    const threads: CommentThread[] = [
      createMockThread('1', 'Unattached comment', { x: 0, y: 0 }),
      createMockThread('2', 'Attached comment', { node_id: 'frame-1' }),
    ];

    const result = formatCommentsForContext(threads, [frameAtOrigin]);

    expect(result.unattachedComments.length).toBe(1);
    expect(result.unattachedComments[0].source).toBe('unattached-comments');
    expect(result.unattachedComments[0].screenId).toBe('file-level');
    expect(result.unattachedComments[0].screenName).toBe('File-Level');
    expect(result.unattachedComments[0].markdown).toContain('Unattached comment');
  });

  it('should NOT match Vector (0,0) comments to frames at origin', () => {
    // This was the bug: Vector (0,0) was matching frames at origin due to proximity
    const threads: CommentThread[] = [
      createMockThread('1', 'Unattached comment at origin', { x: 0, y: 0 }),
    ];

    const result = formatCommentsForContext(threads, [frameAtOrigin]);

    // Should be unattached, not matched to the frame
    expect(result.contexts.length).toBe(0);
    expect(result.matchedThreadCount).toBe(0);
    expect(result.unattachedComments.length).toBe(1);
  });

  it('should match FrameOffset comments to their frames', () => {
    const threads: CommentThread[] = [
      createMockThread('1', 'Frame comment', { node_id: 'frame-1' }),
    ];

    const result = formatCommentsForContext(threads, [frameAtOrigin]);

    expect(result.contexts.length).toBe(1);
    expect(result.contexts[0].screenId).toBe('frame-1');
    expect(result.contexts[0].source).toBe('comments');
    expect(result.matchedThreadCount).toBe(1);
    expect(result.unattachedComments.length).toBe(0);
  });

  it('should match non-zero Vector comments via proximity', () => {
    // Vector comment at (100, 100) should match frame at origin
    const threads: CommentThread[] = [
      createMockThread('1', 'Nearby comment', { x: 100, y: 100 }),
    ];

    const result = formatCommentsForContext(threads, [frameAtOrigin]);

    expect(result.contexts.length).toBe(1);
    expect(result.matchedThreadCount).toBe(1);
    expect(result.unattachedComments.length).toBe(0);
  });

  it('should NOT mark FrameOffset comments as unattached even if node_offset is (0,0)', () => {
    const threads: CommentThread[] = [
      createMockThread('1', 'Frame comment with zero offset', { 
        node_id: 'frame-1', 
        node_offset: { x: 0, y: 0 } 
      }),
    ];

    const result = formatCommentsForContext(threads, [frameAtOrigin]);

    // Should be matched, not unattached (has explicit node_id)
    expect(result.contexts.length).toBe(1);
    expect(result.matchedThreadCount).toBe(1);
    expect(result.unattachedComments.length).toBe(0);
  });

  it('should put unmatched non-zero Vector comments in unmatchedThreadCount', () => {
    // Vector comment far from any frame
    const threads: CommentThread[] = [
      createMockThread('1', 'Far away comment', { x: 5000, y: 5000 }),
    ];

    const result = formatCommentsForContext(threads, [frameAtOrigin]);

    expect(result.contexts.length).toBe(0);
    expect(result.matchedThreadCount).toBe(0);
    expect(result.unmatchedThreadCount).toBe(1);
    expect(result.unattachedComments.length).toBe(0);
  });

  it('should handle mixed comment types correctly', () => {
    const threads: CommentThread[] = [
      createMockThread('1', 'Unattached at origin', { x: 0, y: 0 }),
      createMockThread('2', 'Matched via FrameOffset', { node_id: 'frame-1' }),
      createMockThread('3', 'Matched via proximity', { x: 100, y: 100 }),
      createMockThread('4', 'Unmatched far away', { x: 5000, y: 5000 }),
      createMockThread('5', 'No position', undefined),
    ];

    const result = formatCommentsForContext(threads, [frameAtOrigin]);

    expect(result.matchedThreadCount).toBe(2); // #2 and #3
    expect(result.unmatchedThreadCount).toBe(1); // #4
    expect(result.unattachedComments.length).toBe(1); // #1 and #5 combined
  });
});

describe('groupCommentsIntoThreads', () => {
  it('should group comments with parent_id under their parent', () => {
    const comments: FigmaComment[] = [
      createMockComment('1', 'Parent comment', { x: 100, y: 100 }),
      { ...createMockComment('2', 'Reply 1'), parent_id: '1' },
      { ...createMockComment('3', 'Reply 2'), parent_id: '1' },
    ];

    const threads = groupCommentsIntoThreads(comments);

    expect(threads.length).toBe(1);
    expect(threads[0].parent.id).toBe('1');
    expect(threads[0].replies.length).toBe(2);
  });
});
