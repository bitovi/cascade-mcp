/**
 * Annotation Associator Tests
 * 
 * Tests for comment and note association with frames.
 * Uses dependency injection to avoid mocking frameworks.
 */

import {
  calculateRectangleDistance,
  associateNotesWithFrames,
  extractNoteText,
  fetchAndAssociateAnnotations,
} from './annotation-associator.js';
import type { FigmaNodeMetadata } from '../figma-helpers.js';

describe('annotation-associator', () => {
  // ============================================================================
  // calculateRectangleDistance
  // ============================================================================
  
  describe('calculateRectangleDistance', () => {
    it('should return 0 for overlapping rectangles', () => {
      const result = calculateRectangleDistance(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 50, width: 100, height: 100 }
      );
      expect(result).toBe(0);
    });
    
    it('should return 0 for fully contained rectangle', () => {
      const result = calculateRectangleDistance(
        { x: 0, y: 0, width: 200, height: 200 },
        { x: 50, y: 50, width: 50, height: 50 }
      );
      expect(result).toBe(0);
    });
    
    it('should calculate horizontal edge-to-edge distance', () => {
      const result = calculateRectangleDistance(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 200, y: 0, width: 100, height: 100 }
      );
      expect(result).toBe(100);
    });
    
    it('should calculate vertical edge-to-edge distance', () => {
      const result = calculateRectangleDistance(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 200, width: 100, height: 100 }
      );
      expect(result).toBe(100);
    });
    
    it('should calculate diagonal distance', () => {
      const result = calculateRectangleDistance(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 200, y: 200, width: 100, height: 100 }
      );
      // Gap is 100px horizontal and 100px vertical
      expect(result).toBeCloseTo(Math.sqrt(100 * 100 + 100 * 100));
    });
    
    it('should handle adjacent rectangles (touching edges)', () => {
      const result = calculateRectangleDistance(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 100, y: 0, width: 100, height: 100 }
      );
      expect(result).toBe(0); // Touching = 0 distance
    });
  });
  
  // ============================================================================
  // extractNoteText
  // ============================================================================
  
  describe('extractNoteText', () => {
    it('should extract text from first TEXT child', () => {
      const note: FigmaNodeMetadata = {
        id: '1:1',
        name: 'Note',
        type: 'INSTANCE',
        visible: true,
        locked: false,
        absoluteBoundingBox: null,
        children: [
          {
            type: 'TEXT',
            name: 'Text Layer',
            characters: 'This is the note content',
          },
        ],
      };
      
      const result = extractNoteText(note);
      expect(result).toBe('This is the note content');
    });
    
    it('should fall back to node name if no TEXT child', () => {
      const note: FigmaNodeMetadata = {
        id: '1:1',
        name: 'Important Note',
        type: 'INSTANCE',
        visible: true,
        locked: false,
        absoluteBoundingBox: null,
        children: [],
      };
      
      const result = extractNoteText(note);
      expect(result).toBe('Important Note');
    });
    
    it('should search nested children for text', () => {
      const note: FigmaNodeMetadata = {
        id: '1:1',
        name: 'Note',
        type: 'INSTANCE',
        visible: true,
        locked: false,
        absoluteBoundingBox: null,
        children: [
          {
            type: 'FRAME',
            name: 'Container',
            children: [
              {
                type: 'TEXT',
                name: 'Nested Text',
                characters: 'Deeply nested content',
              },
            ],
          },
        ],
      };
      
      const result = extractNoteText(note);
      expect(result).toBe('Deeply nested content');
    });
  });
  
  // ============================================================================
  // associateNotesWithFrames
  // ============================================================================
  
  describe('associateNotesWithFrames', () => {
    it('should associate note with closest frame', () => {
      const frames: FigmaNodeMetadata[] = [
        {
          id: 'frame1',
          name: 'Frame 1',
          type: 'FRAME',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
        {
          id: 'frame2',
          name: 'Frame 2',
          type: 'FRAME',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 200, y: 0, width: 100, height: 100 },
        },
      ];
      
      const notes: FigmaNodeMetadata[] = [
        {
          id: 'note1',
          name: 'Note near Frame 1',
          type: 'INSTANCE',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 50, y: 110, width: 20, height: 20 },
          children: [
            { type: 'TEXT', name: 'Text', characters: 'Note for frame 1' },
          ],
        },
      ];
      
      const result = associateNotesWithFrames(frames, notes);
      
      expect(result.matchedNotes).toBe(1);
      expect(result.frameNotes.get('frame1')).toEqual(['Note for frame 1']);
      expect(result.unassociatedNotes).toHaveLength(0);
    });
    
    it('should not associate note beyond max distance', () => {
      const frames: FigmaNodeMetadata[] = [
        {
          id: 'frame1',
          name: 'Frame 1',
          type: 'FRAME',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
      ];
      
      const notes: FigmaNodeMetadata[] = [
        {
          id: 'note1',
          name: 'Far away note',
          type: 'INSTANCE',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 1000, y: 1000, width: 20, height: 20 },
          children: [
            { type: 'TEXT', name: 'Text', characters: 'Too far' },
          ],
        },
      ];
      
      const result = associateNotesWithFrames(frames, notes, 500);
      
      expect(result.matchedNotes).toBe(0);
      expect(result.unassociatedNotes).toEqual(['Too far']);
    });
    
    it('should associate multiple notes with same frame', () => {
      const frames: FigmaNodeMetadata[] = [
        {
          id: 'frame1',
          name: 'Frame 1',
          type: 'FRAME',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
      ];
      
      const notes: FigmaNodeMetadata[] = [
        {
          id: 'note1',
          name: 'Note 1',
          type: 'INSTANCE',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 0, y: 110, width: 20, height: 20 },
          children: [{ type: 'TEXT', characters: 'First note' }],
        },
        {
          id: 'note2',
          name: 'Note 2',
          type: 'INSTANCE',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 110, y: 0, width: 20, height: 20 },
          children: [{ type: 'TEXT', characters: 'Second note' }],
        },
      ];
      
      const result = associateNotesWithFrames(frames, notes);
      
      expect(result.matchedNotes).toBe(2);
      expect(result.frameNotes.get('frame1')).toEqual(['First note', 'Second note']);
    });
    
    it('should handle notes without bounding box', () => {
      const frames: FigmaNodeMetadata[] = [
        {
          id: 'frame1',
          name: 'Frame 1',
          type: 'FRAME',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
      ];
      
      const notes: FigmaNodeMetadata[] = [
        {
          id: 'note1',
          name: 'No position',
          type: 'INSTANCE',
          visible: true,
          locked: false,
          absoluteBoundingBox: null, // No position
          children: [{ type: 'TEXT', characters: 'Orphan note' }],
        },
      ];
      
      const result = associateNotesWithFrames(frames, notes);
      
      expect(result.matchedNotes).toBe(0);
      expect(result.unassociatedNotes).toEqual(['Orphan note']);
    });
  });
  
  // ============================================================================
  // fetchAndAssociateAnnotations
  // ============================================================================
  
  describe('fetchAndAssociateAnnotations', () => {
    const mockFigmaClient = {} as any;
    
    it('should fetch comments and associate with frames', async () => {
      const mockFetchComments = jest.fn().mockResolvedValue([
        {
          id: 'c1',
          message: 'Comment 1',
          client_meta: { node_id: 'frame1' },
          user: { handle: 'user1' },
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);
      
      const mockGroupComments = jest.fn().mockReturnValue([
        {
          parent: {
            id: 'c1',
            message: 'Comment 1',
            client_meta: { node_id: 'frame1' },
            user: { handle: 'user1' },
            created_at: '2024-01-01T00:00:00Z',
          },
          replies: [],
          isResolved: false,
        },
      ]);
      
      const mockFormatComments = jest.fn().mockReturnValue({
        contexts: [
          { screenId: 'frame1', screenName: 'Frame 1', markdown: '- **@user1**: Comment 1' },
        ],
        matchedThreadCount: 1,
        unmatchedThreadCount: 0,
      });
      
      const frames: FigmaNodeMetadata[] = [
        {
          id: 'frame1',
          name: 'Frame 1',
          type: 'FRAME',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
      ];
      
      const notes: FigmaNodeMetadata[] = [
        {
          id: 'note1',
          name: 'Note',
          type: 'INSTANCE',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 50, y: 110, width: 20, height: 20 },
          children: [{ type: 'TEXT', characters: 'Design note' }],
        },
      ];
      
      const result = await fetchAndAssociateAnnotations(
        mockFigmaClient,
        'fileKey',
        frames,
        notes,
        undefined, // documentTree
        {
          fetchCommentsForFile: mockFetchComments,
          groupCommentsIntoThreads: mockGroupComments,
          formatCommentsForContext: mockFormatComments,
        }
      );
      
      expect(mockFetchComments).toHaveBeenCalledWith(mockFigmaClient, 'fileKey');
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].annotations).toHaveLength(2); // 1 comment + 1 note
      expect(result.frames[0].annotations[0].type).toBe('comment');
      expect(result.frames[0].annotations[1].type).toBe('note');
      expect(result.stats.matchedCommentThreads).toBe(1);
      expect(result.stats.matchedNotes).toBe(1);
    });
    
    it('should handle frames with no annotations', async () => {
      const mockFetchComments = jest.fn().mockResolvedValue([]);
      const mockGroupComments = jest.fn().mockReturnValue([]);
      const mockFormatComments = jest.fn().mockReturnValue({
        contexts: [],
        matchedThreadCount: 0,
        unmatchedThreadCount: 0,
      });
      
      const frames: FigmaNodeMetadata[] = [
        {
          id: 'frame1',
          name: 'Frame 1',
          type: 'FRAME',
          visible: true,
          locked: false,
          absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        },
      ];
      
      const result = await fetchAndAssociateAnnotations(
        mockFigmaClient,
        'fileKey',
        frames,
        [], // No notes
        undefined,
        {
          fetchCommentsForFile: mockFetchComments,
          groupCommentsIntoThreads: mockGroupComments,
          formatCommentsForContext: mockFormatComments,
        }
      );
      
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].annotations).toHaveLength(0);
    });
    
    it('should build correct Figma URLs for frames', async () => {
      const mockFetchComments = jest.fn().mockResolvedValue([]);
      const mockGroupComments = jest.fn().mockReturnValue([]);
      const mockFormatComments = jest.fn().mockReturnValue({
        contexts: [],
        matchedThreadCount: 0,
        unmatchedThreadCount: 0,
      });
      
      const frames: FigmaNodeMetadata[] = [
        {
          id: '123:456',
          name: 'Frame',
          type: 'FRAME',
          visible: true,
          locked: false,
          absoluteBoundingBox: null,
        },
      ];
      
      const result = await fetchAndAssociateAnnotations(
        mockFigmaClient,
        'abc123',
        frames,
        [],
        undefined,
        {
          fetchCommentsForFile: mockFetchComments,
          groupCommentsIntoThreads: mockGroupComments,
          formatCommentsForContext: mockFormatComments,
        }
      );
      
      expect(result.frames[0].url).toBe('https://www.figma.com/design/abc123?node-id=123-456');
    });
  });
});
